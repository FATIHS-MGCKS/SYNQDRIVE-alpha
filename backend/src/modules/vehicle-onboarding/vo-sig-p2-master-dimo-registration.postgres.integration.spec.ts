/**
 * VO-SIG-01 P2: Master Admin register-from-dimo canonical path (PostgreSQL).
 */
import { BusinessType, PrismaClient, ProductSlug, VehicleRegistryLifecycle } from '@prisma/client';
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

const run = process.env.VO_SIG_P2_MASTER_DIMO_PG === '1' || process.env.VO_SIG_01_CONN_IDENTITY_PG === '1';

const TESLA_RAW = { syntheticDevice: { integration: 'tesla' } };
const R1_RAW = { aftermarketDevice: { serial: 'R1-P2-TEST-001' } };

async function createOrg(prisma: PrismaClient): Promise<string> {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO-SIG-P2 ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
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

    await harness.masterRegistration.register({
      organizationId: orgId,
      stationId: null,
      dimoVehicleId: dimoId,
      actorUserId: null,
    });

    await expect(
      harness.masterRegistration.register({
        organizationId: orgId,
        stationId: null,
        dimoVehicleId: dimoId,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_ALREADY_REGISTERED' });

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
});
