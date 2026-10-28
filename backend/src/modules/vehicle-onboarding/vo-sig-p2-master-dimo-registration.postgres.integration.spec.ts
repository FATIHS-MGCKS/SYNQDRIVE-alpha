/**
 * VO-SIG-01 P2: Master Admin register-from-dimo canonical path (PostgreSQL).
 */
import {
  BusinessType,
  DriveType,
  FuelType,
  PrismaClient,
  ProductSlug,
  VehicleRegistryLifecycle,
  VehicleType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createVo4ReadinessTestHarness } from './testing/vo4-readiness-test.harness';
import { VehicleOnboardingCaptureService } from './services/vehicle-onboarding-capture.service';
import { VehicleOnboardingSourceAdoptionService } from './services/vehicle-onboarding-source-adoption.service';
import { VehicleOnboardingSourceAdoptionAuthority } from './source-adoption/vehicle-onboarding-source-adoption.authority';
import { MasterDimoCanonicalRegistrationService } from './master-dimo/master-dimo-canonical-registration.service';
import { insertDimoMirrorForPostgresTests } from './testing/dimo-mirror-postgres.fixture';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';
import { VehicleOnboardingError } from './errors/vehicle-onboarding.errors';
import { readConnectionIdentityFromLinkMetadata } from './connection-identity/source-link-connection-identity.metadata';
import { VehicleConnectionModality } from './connection-identity';
import { activationOutboxIdempotencyKey } from './services/vehicle-onboarding-activation.service';
import { PLATFORM_TRUSTED_SOURCE_ADOPTION } from './source-adoption/platform-trusted-adoption.context';
import { dimoOnboardingActor } from './testing/vehicle-onboarding-test.harness';
import { buildPostActivationVehiclePatch } from './master-dimo/master-dimo-registration.mapper';
import type { MasterDimoRegistrationInput } from './master-dimo/master-dimo-registration.types';
import { buildMasterDimoActivationFinalizeInput } from './master-dimo/master-dimo-registration-artifacts';
import {
  computeMasterDimoRegistrationPayloadFingerprint,
  readMasterDimoPayloadFingerprintFromReadinessSnapshot,
} from './master-dimo/master-dimo-registration-payload-fingerprint';
import { VEHICLE_ADMIN_BASELINE_DRAFT_VERSION } from './contracts/vo-document-versions';

const run = process.env.VO_SIG_P2_MASTER_DIMO_PG === '1' || process.env.VO_SIG_01_CONN_IDENTITY_PG === '1';

const TESLA_RAW = { syntheticDevice: { integration: 'tesla' } };
const R1_RAW = { aftermarketDevice: { serial: 'R1-P2-TEST-001' } };

async function createOrg(
  prisma: PrismaClient,
  products: ProductSlug[] = [ProductSlug.RENTAL],
): Promise<string> {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO-SIG-P2 ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  for (const slug of products) {
    await ensureOrganizationProductEntitlement(prisma, id, slug);
  }
  return id;
}

function fullMasterExtraData(): MasterDimoRegistrationInput['extraData'] {
  return {
    vehicleName: 'Fleet Unit 7',
    licensePlate: 'M-P2-777',
    mileageKm: 42_500,
    vehicleType: VehicleType.SUV,
    hardwareType: 'UNKNOWN',
    notes: 'parity-test',
    drivetrain: 'AWD',
    curbWeightKg: 2100,
    idleRpm: 800,
    maxRpm: 6500,
    brakeForceFrontPercent: 62.5,
    frontToRearWeightDistribution: 52,
    tankCapacityLiters: 0,
    serviceIntervalManufacturerKm: 30_000,
    serviceIntervalManufacturerMonths: 24,
    oilChangeIntervalKm: 15_000,
    oilChangeIntervalMonths: 12,
  };
}

function masterDimoHarness(prisma: PrismaClient) {
  const base = createVo4ReadinessTestHarness(prisma);
  const capture = new VehicleOnboardingCaptureService(prisma as never, base.readinessService, {
    record: async () => null,
  } as never);
  const sourceAdoptionAuthority = new VehicleOnboardingSourceAdoptionAuthority();
  const sourceAdoption = new VehicleOnboardingSourceAdoptionService(
    prisma as never,
    base.caseService,
    sourceAdoptionAuthority,
    { record: async () => null } as never,
  );
  const masterRegistration = new MasterDimoCanonicalRegistrationService(
    prisma as never,
    sourceAdoption,
    capture,
    base.readinessService,
    base.activationService,
  );
  return { ...base, capture, sourceAdoption, masterRegistration };
}

(run ? describe : describe.skip)('VO-SIG P2 master DIMO canonical registration (postgres)', () => {
  jest.setTimeout(120_000);
  const prisma = new PrismaClient();
  const harness = masterDimoHarness(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('registers DIMO Tesla software integration with connection identity and registry outbox', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });

    const result = await harness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      extraData: { mileageKm: 12_000, hardwareType: 'UNKNOWN' },
      actorUserId: null,
    });

    expect(result.vehicle.organizationId).toBe(orgId);
    expect(result.vehicle.dimoVehicleId).toBe(dimoId);
    expect(result.vehicle.mileageKm).toBe(12_000);

    const link = await prisma.vehicleDataSourceLink.findFirst({
      where: { vehicleId: result.vehicle.id, sourceType: 'DIMO', isActive: true },
    });
    const ci = readConnectionIdentityFromLinkMetadata(link!.metadata);
    expect(ci?.verifiedModality).toBe(VehicleConnectionModality.SOFTWARE_INTEGRATION);

    const caseRow = await prisma.vehicleOnboardingCase.findFirst({
      where: { vehicleId: result.vehicle.id, status: 'COMPLETED' },
    });
    expect(caseRow).toBeTruthy();
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { idempotencyKey: activationOutboxIdempotencyKey(caseRow!.id) },
      }),
    ).toBe(1);
  });

  it('registers DIMO Ruptela R1 hardware when mirror serial is present', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: R1_RAW,
    });

    const result = await harness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      extraData: { hardwareType: 'LTE_R1' },
      actorUserId: null,
    });

    const link = await prisma.vehicleDataSourceLink.findFirst({
      where: { vehicleId: result.vehicle.id, sourceType: 'DIMO', isActive: true },
    });
    const ci = readConnectionIdentityFromLinkMetadata(link!.metadata);
    expect(ci?.verifiedModality).toBe(VehicleConnectionModality.HARDWARE_DEVICE);
    expect(ci?.physicalDeviceReference).toBe('R1-P2-TEST-001');
  });

  it('fail-closed for unverified DIMO connection (no partial vehicle)', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: {},
    });

    const vehicleCountBefore = await prisma.vehicle.count({ where: { organizationId: orgId } });
    await expect(
      harness.masterRegistration.register({
        organizationId: orgId,
        stationId: null,
        dimoVehicleId: dimoId,
        actorUserId: null,
      }),
    ).rejects.toBeInstanceOf(VehicleOnboardingError);

    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(vehicleCountBefore);
  });

  it('blocks duplicate registration and OFFBOARDED reappearance', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });

    const first = await harness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      actorUserId: null,
    });

    const retry = await harness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      actorUserId: null,
    });
    expect(retry.vehicle.id).toBe(first.vehicle.id);
    expect(await prisma.vehicle.count({ where: { dimoVehicleId: dimoId } })).toBe(1);

    const offboardedId = randomUUID();
    const offDimo = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: offDimo,
      externalId: `ext-off-${offDimo.slice(0, 6)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    const offVin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await prisma.$executeRaw`
      INSERT INTO vehicles (
        id, organization_id, dimo_vehicle_id, vin, make, model, year, fuel_type, registry_lifecycle, created_at, updated_at
      ) VALUES (
        ${offboardedId},
        ${orgId},
        ${offDimo},
        ${offVin},
        'Tesla',
        'M3',
        2022,
        'ELECTRIC'::"FuelType",
        ${VehicleRegistryLifecycle.OFFBOARDED}::"VehicleRegistryLifecycle",
        NOW(),
        NOW()
      )
    `;

    await expect(
      harness.masterRegistration.register({
        organizationId: orgId,
        stationId: null,
        dimoVehicleId: offDimo,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_ALREADY_REGISTERED' });
  });

  it('preserves technical baseline brake draft from master manual specs', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });

    const result = await harness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      manualSpecs: { brakes: { frontPadThickness: 11, rearPadThickness: 10 } },
      actorUserId: null,
    });

    const spec = await prisma.vehicleBrakeReferenceSpec.findFirst({
      where: { vehicleId: result.vehicle.id },
    });
    expect(spec?.frontPadNominalThicknessMm).toBe(11);
  });

  it('rejects activation when DIMO mirror drifts after readiness seal (stale snapshot)', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    const caseRow = await harness.caseService.openOrResumeFromDimo(
      dimoOnboardingActor(orgId, `master-register-from-dimo:v1:${orgId}:${dimoId}`),
      dimoId,
    );
    await harness.readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      selectedProduct: ProductSlug.RENTAL,
      actorUserId: null,
    });
    await prisma.$executeRaw`
      UPDATE dimo_vehicles SET raw_json = '{}'::jsonb, updated_at = NOW() WHERE id = ${dimoId}
    `;
    const vehicleCountBefore = await prisma.vehicle.count({ where: { organizationId: orgId } });
    await expect(
      harness.activationService.activateVehicle({
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'ACTIVATION_PRECONDITION_FAILED' });
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(vehicleCountBefore);
  });

  it('serializes eight parallel master registrations to one vehicle and one outbox', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    const input = {
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      extraData: { mileageKm: 11_111 },
      actorUserId: null,
    };
    const firstWave = await Promise.allSettled(
      Array.from({ length: 8 }, () => harness.masterRegistration.register(input)),
    );
    expect(firstWave.some((o) => o.status === 'fulfilled')).toBe(true);
    for (const outcome of firstWave) {
      if (outcome.status === 'rejected') {
        await harness.masterRegistration.register(input);
      }
    }
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { dimoVehicleId: dimoId } });
    expect(await prisma.vehicle.count({ where: { dimoVehicleId: dimoId } })).toBe(1);
    expect(vehicle.mileageKm).toBe(11_111);
    const vehicleId = vehicle.id;
    const caseRow = await prisma.vehicleOnboardingCase.findFirstOrThrow({
      where: { vehicleId, status: 'COMPLETED' },
    });
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: {
          vehicleId,
          eventType: 'VEHICLE_ACTIVATED',
          idempotencyKey: activationOutboxIdempotencyKey(caseRow.id),
        },
      }),
    ).toBe(1);
  });

  it('idempotent retry returns existing vehicle without applying payload mutations', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    const first = await harness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      extraData: { mileageKm: 9000 },
      actorUserId: null,
    });
    const retry = await harness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      extraData: { mileageKm: 9000 },
      actorUserId: null,
    });
    expect(retry.vehicle.id).toBe(first.vehicle.id);
    expect(retry.vehicle.mileageKm).toBe(9000);
    const caseRow = await prisma.vehicleOnboardingCase.findFirstOrThrow({
      where: { vehicleId: first.vehicle.id, status: 'COMPLETED' },
    });
    const expectedFp = computeMasterDimoRegistrationPayloadFingerprint({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      extraData: { mileageKm: 9000 },
      actorUserId: null,
    });
    expect(
      readMasterDimoPayloadFingerprintFromReadinessSnapshot(caseRow.readinessSnapshotJson),
    ).toBe(expectedFp);
  });

  it('rejects idempotent retry when completed case lacks payload fingerprint', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    const input = {
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      extraData: { mileageKm: 5000 },
      actorUserId: null,
    };
    await harness.masterRegistration.register(input);
    const caseRow = await prisma.vehicleOnboardingCase.findFirstOrThrow({
      where: { organizationId: orgId, status: 'COMPLETED' },
    });
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        readinessSnapshotJson: { decision: 'READY', blockingFailureCount: 0 },
      },
    });
    await expect(harness.masterRegistration.register(input)).rejects.toMatchObject({
      code: 'MASTER_DIMO_REGISTRATION_FINGERPRINT_MISSING',
    });
  });

  it('rejects retry with changed payload after successful registration', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    await harness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      extraData: { mileageKm: 1000 },
      actorUserId: null,
    });
    await expect(
      harness.masterRegistration.register({
        organizationId: orgId,
        stationId: null,
        dimoVehicleId: dimoId,
        extraData: { mileageKm: 999_999 },
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'MASTER_DIMO_REGISTRATION_PAYLOAD_MISMATCH' });
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { dimoVehicleId: dimoId } });
    expect(vehicle.mileageKm).toBe(1000);
  });

  it('persists engine displacement and cylinder count on register-from-dimo', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    const result = await harness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      extraData: { engineDisplacementCc: 1998, cylinderCount: 4 },
      actorUserId: null,
    });
    expect(result.vehicle.engineDisplacementCc).toBe(1998);
    expect(result.vehicle.cylinderCount).toBe(4);
    const row = await prisma.vehicle.findFirstOrThrow({ where: { id: result.vehicle.id } });
    expect(row.engineDisplacementCc).toBe(1998);
    expect(row.cylinderCount).toBe(4);
  });

  it('persists full master form scalar parity inside activation transaction', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    const extra = fullMasterExtraData();
    const result = await harness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      extraData: extra,
      manualSpecs: {
        battery: { batteryType: 'AGM', batteryAmpere: 70, batteryVolt: 12 },
      },
      actorUserId: 'user-parity',
    });
    const patch = buildPostActivationVehiclePatch({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      extraData: extra,
      actorUserId: 'user-parity',
    });
    expect(result.vehicle.mileageKm).toBe(patch.mileageKm);
    expect(result.vehicle.curbWeightKg).toBe(extra!.curbWeightKg);
    expect(result.vehicle.driveType).toBe(DriveType.AWD);
    expect(result.vehicle.createdByUserId).toBe('user-parity');
    expect(
      await prisma.vehicleBatterySpec.count({ where: { vehicleId: result.vehicle.id } }),
    ).toBe(1);
  });

  it('returns a full Prisma Vehicle row (registry + operational status fields)', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    const { vehicle } = await harness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      actorUserId: null,
    });
    expect(vehicle.status).toBe('AVAILABLE');
    expect(vehicle.registryLifecycle).toBe('ACTIVE');
    expect(vehicle.healthStatus).toBeDefined();
    expect(vehicle.cleaningStatus).toBeDefined();
    expect(vehicle.createdAt).toBeInstanceOf(Date);
    expect(vehicle.updatedAt).toBeInstanceOf(Date);
  });

  it('writes provider consent and a single VEHICLE_ACTIVATED outbox event (billing idempotency key)', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    const { vehicle } = await harness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      actorUserId: null,
    });
    const caseRow = await prisma.vehicleOnboardingCase.findFirstOrThrow({
      where: { vehicleId: vehicle.id, status: 'COMPLETED' },
    });
    expect(
      await prisma.vehicleProviderConsent.count({
        where: { organizationId: orgId, vehicleId: vehicle.id },
      }),
    ).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: {
          vehicleId: vehicle.id,
          eventType: 'VEHICLE_ACTIVATED',
          idempotencyKey: activationOutboxIdempotencyKey(caseRow.id),
        },
      }),
    ).toBe(1);
  });

  it('blocks ARCHIVED registry lifecycle rediscovery', async () => {
    const orgId = await createOrg(prisma);
    const archivedDimo = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: archivedDimo,
      externalId: `ext-arch-${archivedDimo.slice(0, 6)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    const vehicleId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO vehicles (
        id, organization_id, dimo_vehicle_id, vin, make, model, year, fuel_type, registry_lifecycle, created_at, updated_at
      ) VALUES (
        ${vehicleId},
        ${orgId},
        ${archivedDimo},
        ${`VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`},
        'Tesla',
        'M3',
        2022,
        'ELECTRIC'::"FuelType",
        ${VehicleRegistryLifecycle.ARCHIVED}::"VehicleRegistryLifecycle",
        NOW(),
        NOW()
      )
    `;
    await expect(
      harness.masterRegistration.register({
        organizationId: orgId,
        stationId: null,
        dimoVehicleId: archivedDimo,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_ALREADY_REGISTERED' });
  });

  it('rolls back activation when fault occurs after master finalize (no ACTIVE vehicle)', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    const caseRow = await harness.caseService.openOrResumeFromDimo(
      dimoOnboardingActor(orgId, `master-register-from-dimo:v1:${orgId}:${dimoId}`),
      dimoId,
    );
    await harness.capture.updateAdminBaseline({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      body: {
        version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
        vehicleName: null,
        licensePlate: null,
        stationId: null,
        notes: null,
      },
      expectedConcurrencyToken: caseRow.concurrencyToken,
    });
    await harness.readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      selectedProduct: ProductSlug.RENTAL,
      actorUserId: null,
    });
    const vehicleCountBefore = await prisma.vehicle.count({ where: { organizationId: orgId } });
    await expect(
      harness.activationService.activateVehicle({
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
        faultAfterStage: 'AFTER_TECHNICAL_BASELINE',
        masterRegistrationFinalize: buildMasterDimoActivationFinalizeInput({
          organizationId: orgId,
          stationId: null,
          dimoVehicleId: dimoId,
          extraData: { mileageKm: 1000 },
          actorUserId: null,
        }),
      }),
    ).rejects.toThrow('VO3_FAULT_INJECTION');
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(
      vehicleCountBefore,
    );
    const caseAfter = await prisma.vehicleOnboardingCase.findUniqueOrThrow({
      where: { id: caseRow.id },
    });
    expect(caseAfter.status).not.toBe('COMPLETED');
    expect(
      readMasterDimoPayloadFingerprintFromReadinessSnapshot(caseAfter.readinessSnapshotJson),
    ).toBeNull();
  });

  it('does not duplicate VEHICLE_ACTIVATED outbox on idempotent retry', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    const first = await harness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      actorUserId: null,
    });
    await harness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      actorUserId: null,
    });
    const caseRow = await prisma.vehicleOnboardingCase.findFirstOrThrow({
      where: { vehicleId: first.vehicle.id, status: 'COMPLETED' },
    });
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: {
          vehicleId: first.vehicle.id,
          eventType: 'VEHICLE_ACTIVATED',
          idempotencyKey: activationOutboxIdempotencyKey(caseRow.id),
        },
      }),
    ).toBe(1);
  });

  it('seals readiness for FLEET-only entitled organizations', async () => {
    const orgId = await createOrg(prisma, [ProductSlug.FLEET]);
    const dimoId = randomUUID();
    await insertDimoMirrorForPostgresTests(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      rawJson: TESLA_RAW,
    });
    const { vehicle } = await harness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      actorUserId: null,
    });
    expect(vehicle.organizationId).toBe(orgId);
    const caseRow = await prisma.vehicleOnboardingCase.findFirstOrThrow({
      where: { vehicleId: vehicle.id },
    });
    const snap = caseRow.readinessSnapshotJson as { productContext?: { selectedProductSlug?: string } };
    expect(snap.productContext?.selectedProductSlug).toBe(ProductSlug.FLEET);
  });
});
