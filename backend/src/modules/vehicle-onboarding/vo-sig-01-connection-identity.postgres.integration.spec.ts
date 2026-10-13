/**
 * VO-SIG-01 connection identity activation certification (PostgreSQL).
 */
import { BusinessType, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  activateForTest,
  createVehicleOnboardingTestHarness,
  dimoOnboardingActor,
  sealCaseReadyForTest,
} from './testing/vehicle-onboarding-test.harness';
import { DEFAULT_TENANT_SOURCE_ADOPTION } from './source-adoption/source-adoption.context';
import { VehicleOnboardingError } from './errors/vehicle-onboarding.errors';
import { readConnectionIdentityFromLinkMetadata } from './connection-identity/source-link-connection-identity.metadata';
import { VehicleConnectionModality } from './connection-identity';

const run = process.env.VO_SIG_01_CONN_IDENTITY_PG === '1' || process.env.VO3_ORCHESTRATOR_PG === '1';

async function createOrg(prisma: PrismaClient): Promise<string> {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO-SIG ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  return id;
}

const R1_RAW = { aftermarketDevice: { serial: 'R1-VO-SIG-TEST-001' } };
const TESLA_RAW = { syntheticDevice: { integration: 'tesla' } };

async function createDimo(
  prisma: PrismaClient,
  input: {
    id: string;
    externalId: string;
    vin?: string | null;
    rawJson: object;
    tokenId?: number | null;
  },
) {
  const raw = JSON.stringify(input.rawJson);
  await prisma.$executeRaw`
    INSERT INTO dimo_vehicles (
      id, external_id, vin, make, model, year, fuel_type, connection_status, raw_json, token_id, created_at, updated_at
    )
    VALUES (
      ${input.id}::uuid,
      ${input.externalId},
      ${input.vin ?? null},
      'Audi',
      'A4',
      2021,
      'DIESEL',
      'CONNECTED'::"DimoConnectionStatus",
      ${raw}::jsonb,
      ${input.tokenId ?? null},
      NOW(),
      NOW()
    )
  `;
}

async function sealDimoCase(prisma: PrismaClient, orgId: string, caseId: string) {
  await prisma.vehicleOnboardingCase.update({
    where: { id: caseId },
    data: {
      draftIdentityJson: {
        version: 1,
        vin: null,
        vinProvenance: null,
        vinVerificationState: null,
        make: 'Audi',
        model: 'A4',
        year: 2021,
        fuelType: 'DIESEL',
        sourceEvidenceRefs: [],
      },
    },
  });
  await sealCaseReadyForTest(prisma, orgId, caseId);
}

(run ? describe : describe.skip)('VO-SIG-01 connection identity (postgres)', () => {
  const prisma = new PrismaClient();
  const harness = createVehicleOnboardingTestHarness(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('activates DIMO Ruptela with mirror-aligned device binding and persists link metadata', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const externalId = `ext-${dimoId.slice(0, 8)}`;
    await createDimo(prisma, {
      id: dimoId,
      externalId,
      rawJson: R1_RAW,
      tokenId: Math.floor(Math.random() * 1_000_000) + 2_000_000,
    });
    const caseRow = await harness.caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await sealDimoCase(prisma, orgId, caseRow.id);

    const result = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    expect(result.created).toBe(true);

    const link = await prisma.vehicleDataSourceLink.findFirst({
      where: { vehicleId: result.vehicleId, sourceType: 'DIMO', isActive: true },
    });
    expect(link).toBeTruthy();
    const ci = readConnectionIdentityFromLinkMetadata(link!.metadata);
    expect(ci?.providerSourceLinkId).toBe(link!.id);
    expect(ci?.verifiedModality).toBe(VehicleConnectionModality.HARDWARE_DEVICE);
    expect(ci?.deviceBindingAssurance).toBe('PROVIDER_SERIAL_MIRROR_TOKEN_SCOPED');
    expect(ci?.preActivationProviderSourceRefId).not.toBe(link!.id);
  });

  it('rejects DIMO hardware activation when rawJson lacks R1 serial', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimo(prisma, { id: dimoId, externalId: `ext-${dimoId.slice(0, 8)}`, rawJson: {} });
    const caseRow = await harness.caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await sealDimoCase(prisma, orgId, caseRow.id);
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'ACTIVATION_PRECONDITION_FAILED' });
  });

  it('rejects HM activation when mirror org drifts after readiness seal', async () => {
    const orgId = await createOrg(prisma);
    const otherOrg = await createOrg(prisma);
    const hmId = randomUUID();
    const vin = `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await prisma.highMobilityVehicle.create({
      data: {
        id: hmId,
        organizationId: orgId,
        vin,
        brand: 'BMW',
        packageType: 'HEALTH',
        sourceMode: 'HM_ONLY',
        clearanceStatus: 'APPROVED',
        hmVehicleReference: `hm-ref-${hmId.slice(0, 8)}`,
      },
    });
    const caseRow = await harness.caseService.openOrResumeFromHighMobility(
      dimoOnboardingActor(orgId),
      hmId,
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftIdentityJson: {
          version: 1,
          vin,
          vinProvenance: 'PROVIDER',
          vinVerificationState: 'UNVERIFIED',
          make: 'BMW',
          model: 'i3',
          year: 2020,
          fuelType: 'ELECTRIC',
          sourceEvidenceRefs: [],
        },
      },
    });
    await sealCaseReadyForTest(prisma, orgId, caseRow.id);
    await prisma.highMobilityVehicle.update({
      where: { id: hmId },
      data: { organizationId: otherOrg },
    });
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'ACTIVATION_PRECONDITION_FAILED' });
  });

  it('activates DIMO software + HM composite with distinct link identities', async () => {
    const orgId = await createOrg(prisma);
    const sharedVin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const dimoId = randomUUID();
    const hmId = randomUUID();
    await createDimo(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: sharedVin,
      rawJson: TESLA_RAW,
    });
    await prisma.highMobilityVehicle.create({
      data: {
        id: hmId,
        organizationId: orgId,
        vin: sharedVin,
        brand: 'Tesla',
        packageType: 'HEALTH',
        sourceMode: 'HM_ONLY',
        clearanceStatus: 'APPROVED',
        hmVehicleReference: `hm-ref-${hmId.slice(0, 8)}`,
      },
    });
    const caseRow = await harness.caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftIdentityJson: {
          version: 1,
          vin: sharedVin,
          vinProvenance: 'PROVIDER',
          vinVerificationState: 'UNVERIFIED',
          make: 'Tesla',
          model: 'Model 3',
          year: 2024,
          fuelType: 'ELECTRIC',
          sourceEvidenceRefs: [],
        },
      },
    });
    await harness.caseService.attachHighMobilitySource(
      { organizationId: orgId, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
      caseRow.id,
      hmId,
    );
    await sealCaseReadyForTest(prisma, orgId, caseRow.id);

    const { vehicleId } = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });

    const links = await prisma.vehicleDataSourceLink.findMany({
      where: { vehicleId, isActive: true },
      orderBy: { sourceType: 'asc' },
    });
    expect(links.length).toBe(2);
    const dimoCi = readConnectionIdentityFromLinkMetadata(
      links.find((l) => l.sourceType === 'DIMO')!.metadata,
    );
    const hmCi = readConnectionIdentityFromLinkMetadata(
      links.find((l) => l.sourceType === 'HIGH_MOBILITY')!.metadata,
    );
    expect(dimoCi?.verifiedModality).toBe(VehicleConnectionModality.SOFTWARE_INTEGRATION);
    expect(hmCi?.verifiedModality).toBe(VehicleConnectionModality.OEM_CLOUD);
    expect(dimoCi?.providerSourceLinkId).not.toBe(hmCi?.providerSourceLinkId);
  });

  it('rejects stale modality when mirror evidence drifts after seal', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimo(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      rawJson: TESLA_RAW,
    });
    const caseRow = await harness.caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await sealDimoCase(prisma, orgId, caseRow.id);
    await prisma.dimoVehicle.update({
      where: { id: dimoId },
      data: { rawJson: R1_RAW },
    });
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'READINESS_SEAL_STALE' });
  });

  it('idempotent activation returns existing vehicle', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimo(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      rawJson: TESLA_RAW,
    });
    const caseRow = await harness.caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await sealDimoCase(prisma, orgId, caseRow.id);
    const first = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    const second = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    expect(second.created).toBe(false);
    expect(second.vehicleId).toBe(first.vehicleId);
  });

  it('manual non-telemetry activation remains compatible', async () => {
    const orgId = await createOrg(prisma);
    const caseRow = await harness.caseService.openOrResumeManual(dimoOnboardingActor(orgId), {
      make: 'Fleet',
      model: 'Trailer',
      year: 2019,
      fuelType: 'NONE',
      vehicleName: 'Manual fleet',
      licensePlate: 'MAN-1',
      stationId: null,
      notes: null,
    });
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftIdentityJson: {
          version: 1,
          vin: null,
          vinProvenance: null,
          vinVerificationState: null,
          make: 'Fleet',
          model: 'Trailer',
          year: 2019,
          fuelType: 'NONE',
          sourceEvidenceRefs: [],
        },
      },
    });
    await sealCaseReadyForTest(prisma, orgId, caseRow.id);
    const result = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    expect(result.created).toBe(true);
    const links = await prisma.vehicleDataSourceLink.count({ where: { vehicleId: result.vehicleId } });
    expect(links).toBe(0);
  });

  it('rolls back when activation faults before link metadata persistence', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimo(prisma, {
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      rawJson: TESLA_RAW,
    });
    const caseRow = await harness.caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await sealDimoCase(prisma, orgId, caseRow.id);
    const vehiclesBefore = await prisma.vehicle.count({ where: { organizationId: orgId } });
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
        faultAfterStage: 'BEFORE_OUTBOX',
      }),
    ).rejects.toThrow('VO3_FAULT_INJECTION');
    const vehiclesAfter = await prisma.vehicle.count({ where: { organizationId: orgId } });
    expect(vehiclesAfter).toBe(vehiclesBefore);
    const caseAfter = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(caseAfter.status).not.toBe('COMPLETED');
  });
});
