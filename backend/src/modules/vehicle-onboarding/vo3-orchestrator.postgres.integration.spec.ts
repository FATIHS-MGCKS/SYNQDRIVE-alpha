/**
 * VO-3 / VO-3.1 orchestrator + activation (PostgreSQL).
 */
import { PrismaClient, BusinessType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { VehicleOnboardingError } from './errors/vehicle-onboarding.errors';
import {
  createVehicleOnboardingTestHarness,
  sealCaseReadyForTest,
  activateForTest,
} from './testing/vehicle-onboarding-test.harness';
import { ProductionFailClosedReadinessAuthority } from './readiness/vehicle-onboarding-readiness-authority';
import { VehicleOnboardingActivationService } from './services/vehicle-onboarding-activation.service';
import { DimoVehicleDataSourceLinkService } from '@modules/dimo/dimo-vehicle-data-source-link.service';
import { buildDimoOnboardingSourceSnapshot } from './adapters/dimo-onboarding-source.adapter';
import { buildHmOnboardingSourceSnapshot } from './adapters/high-mobility-onboarding-source.adapter';
import { activationOutboxIdempotencyKey } from './services/vehicle-onboarding-activation.service';
import type { Vo3ActivationFaultStage } from './services/vehicle-onboarding-activation.service';

const run = process.env.VO3_ORCHESTRATOR_PG === '1';

async function createOrg(prisma: PrismaClient): Promise<string> {
  const id = randomUUID();
  await prisma.organization.create({
    data: {
      id,
      companyName: `VO3 ${id.slice(0, 8)}`,
      businessType: BusinessType.RENTAL,
    },
  });
  return id;
}

async function createDimoMirror(
  prisma: PrismaClient,
  dimoId: string,
  externalId: string,
  vin: string | null,
  make = 'Audi',
  model = 'A3',
) {
  await prisma.$executeRaw`
    INSERT INTO dimo_vehicles (id, external_id, vin, make, model, year, fuel_type, connection_status, created_at, updated_at)
    VALUES (
      ${dimoId},
      ${externalId},
      ${vin},
      ${make},
      ${model},
      2021,
      'GASOLINE',
      'CONNECTED'::"DimoConnectionStatus",
      NOW(),
      NOW()
    )
  `;
}

async function assertNoActivationArtifacts(
  prisma: PrismaClient,
  orgId: string,
  caseId: string,
  hmId?: string,
) {
  const caseRow = await prisma.vehicleOnboardingCase.findUnique({ where: { id: caseId } });
  expect(caseRow?.status).not.toBe('COMPLETED');
  const vehicles = await prisma.vehicle.count({ where: { organizationId: orgId } });
  expect(vehicles).toBe(0);
  const outbox = await prisma.vehicleRegistryLifecycleOutbox.count({
    where: { idempotencyKey: activationOutboxIdempotencyKey(caseId) },
  });
  expect(outbox).toBe(0);
  if (hmId) {
    const hm = await prisma.highMobilityVehicle.findUnique({ where: { id: hmId } });
    expect(hm?.registrationState).not.toBe('REGISTERED');
  }
}

(run ? describe : describe.skip)('VO-3 vehicle onboarding orchestrator', () => {
  const prisma = new PrismaClient();
  const harness = createVehicleOnboardingTestHarness(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('HM org A source open by org A passes', async () => {
    const orgA = await createOrg(prisma);
    const hmId = randomUUID();
    await prisma.highMobilityVehicle.create({
      data: {
        id: hmId,
        organizationId: orgA,
        vin: `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        brand: 'BMW',
        packageType: 'HEALTH',
        sourceMode: 'HM_ONLY',
        clearanceStatus: 'APPROVED',
      },
    });
    const caseRow = await harness.caseService.openOrResumeFromHighMobility(
      { organizationId: orgA, actorUserId: null, idempotencyKey: randomUUID() },
      hmId,
    );
    expect(caseRow.organizationId).toBe(orgA);
  });

  it('HM org A source open by org B is rejected non-disclosing', async () => {
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const hmId = randomUUID();
    await prisma.highMobilityVehicle.create({
      data: {
        id: hmId,
        organizationId: orgA,
        vin: `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        brand: 'BMW',
        packageType: 'HEALTH',
        sourceMode: 'HM_ONLY',
        clearanceStatus: 'APPROVED',
      },
    });
    await expect(
      harness.caseService.openOrResumeFromHighMobility(
        { organizationId: orgB, actorUserId: null, idempotencyKey: randomUUID() },
        hmId,
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_NOT_AVAILABLE' });
  });

  it('composite VIN A + VIN B fails activation with no side effects', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const hmId = randomUUID();
    const vinA = `VINA${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    const vinB = `VINB${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, vinA);
    await prisma.highMobilityVehicle.create({
      data: {
        id: hmId,
        organizationId: orgId,
        vin: vinB,
        brand: 'BMW',
        packageType: 'HEALTH',
        sourceMode: 'HM_ONLY',
        clearanceStatus: 'APPROVED',
        hmVehicleReference: `hm-${hmId.slice(0, 8)}`,
      },
    });
    const caseRow = await harness.caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    const hmSnap = buildHmOnboardingSourceSnapshot(
      await prisma.highMobilityVehicle.findUniqueOrThrow({ where: { id: hmId } }),
      orgId,
    );
    await harness.caseService.attachSourceRef(orgId, caseRow.id, hmSnap, { isPrimary: false });
    await sealCaseReadyForTest(prisma, orgId, caseRow.id);
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'IDENTITY_REVIEW_REQUIRED' });
    await assertNoActivationArtifacts(prisma, orgId, caseRow.id, hmId);
  });

  it('composite DIMO + HM happy path activates once', async () => {
    const orgId = await createOrg(prisma);
    const sharedVin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const dimoId = randomUUID();
    const hmId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, sharedVin);
    await prisma.highMobilityVehicle.create({
      data: {
        id: hmId,
        organizationId: orgId,
        vin: sharedVin,
        brand: 'BMW',
        packageType: 'HEALTH',
        sourceMode: 'HM_ONLY',
        clearanceStatus: 'APPROVED',
        hmVehicleReference: `hm-${hmId.slice(0, 8)}`,
      },
    });
    let caseRow = await harness.caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftIdentityJson: {
          version: 1,
          vin: sharedVin,
          vinProvenance: 'PROVIDER',
          vinVerificationState: 'UNVERIFIED',
          make: 'Audi',
          model: 'A3',
          year: 2021,
          fuelType: 'GASOLINE',
          sourceEvidenceRefs: [],
        },
      },
    });
    const hmSnap = buildHmOnboardingSourceSnapshot(
      await prisma.highMobilityVehicle.findUniqueOrThrow({ where: { id: hmId } }),
      orgId,
    );
    await harness.caseService.attachSourceRef(orgId, caseRow.id, hmSnap);
    await sealCaseReadyForTest(prisma, orgId, caseRow.id);
    const first = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: 'u1',
    });
    const second = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: 'u1',
    });
    expect(second.created).toBe(false);
    expect(second.vehicleId).toBe(first.vehicleId);
    const vehicle = await prisma.vehicle.findUnique({ where: { id: first.vehicleId } });
    expect(vehicle?.dimoVehicleId).toBe(dimoId);
    const dimoLink = await prisma.vehicleDataSourceLink.findFirst({
      where: { vehicleId: first.vehicleId, provider: 'DIMO', isActive: true },
    });
    const hmLink = await prisma.vehicleDataSourceLink.findFirst({
      where: { vehicleId: first.vehicleId, sourceType: 'HIGH_MOBILITY', isActive: true },
    });
    expect(dimoLink).toBeTruthy();
    expect(hmLink?.consentId).toBeTruthy();
    const hm = await prisma.highMobilityVehicle.findUnique({ where: { id: hmId } });
    expect(hm?.synqdriveVehicleId).toBe(first.vehicleId);
    const history = await prisma.highMobilityStatusHistory.count({
      where: { highMobilityVehicleId: hmId, eventType: 'CANONICAL_ONBOARDING_REGISTERED' },
    });
    expect(history).toBe(1);
    const outbox = await prisma.vehicleRegistryLifecycleOutbox.count({
      where: { idempotencyKey: activationOutboxIdempotencyKey(caseRow.id) },
    });
    expect(outbox).toBe(1);
  });

  it('HM activation binds consentId on data source link', async () => {
    const orgId = await createOrg(prisma);
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
      },
    });
    const caseRow = await harness.caseService.openOrResumeFromHighMobility(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
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
    const result = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    const link = await prisma.vehicleDataSourceLink.findFirst({
      where: { vehicleId: result.vehicleId, sourceSubtype: 'HM_ONLY', isActive: true },
    });
    const consent = await prisma.vehicleProviderConsent.findFirst({
      where: { vehicleId: result.vehicleId, provider: 'HIGH_MOBILITY', status: 'ACTIVE' },
    });
    expect(link?.consentId).toBe(consent?.id);
  });

  it('production activation service rejects TEST_FIXTURE readiness', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
    const caseRow = await harness.caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await sealCaseReadyForTest(prisma, orgId, caseRow.id);
    const prodActivation = new VehicleOnboardingActivationService(
      prisma as any,
      new DimoVehicleDataSourceLinkService(prisma as any),
      new ProductionFailClosedReadinessAuthority(),
    );
    await expect(
      prodActivation.activateVehicle({
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'READINESS_NOT_SEALED' });
  });

  const faultStages: Vo3ActivationFaultStage[] = [
    'AFTER_VEHICLE_CREATE',
    'AFTER_ORG_ASSIGNMENT',
    'AFTER_PROVIDER_LINK',
    'AFTER_MIRROR_UPDATE',
    'BEFORE_OUTBOX',
  ];

  for (const stage of faultStages) {
    it(`rolls back completely on fault ${stage}`, async () => {
      const orgId = await createOrg(prisma);
      const dimoId = randomUUID();
      await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
      const caseRow = await harness.caseService.openOrResumeFromDimo(
        { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
        dimoId,
      );
      await sealCaseReadyForTest(prisma, orgId, caseRow.id);
      await expect(
        activateForTest(harness, {
          organizationId: orgId,
          onboardingCaseId: caseRow.id,
          actorUserId: null,
          faultAfterStage: stage,
        }),
      ).rejects.toThrow('VO3_FAULT_INJECTION');
      await assertNoActivationArtifacts(prisma, orgId, caseRow.id);
    });
  }

  it('idempotency key mismatch blocks unrelated case reuse', async () => {
    const orgId = await createOrg(prisma);
    const dimo1 = randomUUID();
    const dimo2 = randomUUID();
    await createDimoMirror(prisma, dimo1, `ext-a`, null);
    await createDimoMirror(prisma, dimo2, `ext-b`, null);
    const key = randomUUID();
    await harness.caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: key },
      dimo1,
    );
    await expect(
      harness.caseService.openOrResumeFromDimo(
        { organizationId: orgId, actorUserId: null, idempotencyKey: key },
        dimo2,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_REQUEST' });
  });

  it('second primary source attachment conflicts', async () => {
    const orgId = await createOrg(prisma);
    const dimo1 = randomUUID();
    const dimo2 = randomUUID();
    await createDimoMirror(prisma, dimo1, `ext-1`, null);
    await createDimoMirror(prisma, dimo2, `ext-2`, null);
    const caseRow = await harness.caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimo1,
    );
    const snap2 = buildDimoOnboardingSourceSnapshot(
      await prisma.dimoVehicle.findUniqueOrThrow({ where: { id: dimo2 } }),
    );
    await expect(
      harness.caseService.attachSourceRef(orgId, caseRow.id, snap2, { isPrimary: true }),
    ).rejects.toMatchObject({ code: 'PRIMARY_SOURCE_CONFLICT' });
  });

  it('outbox idempotency mismatch fails closed', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
    const caseRow = await harness.caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await prisma.vehicleRegistryLifecycleOutbox.create({
      data: {
        id: randomUUID(),
        eventId: randomUUID(),
        eventType: 'VEHICLE_ACTIVATED',
        vehicleId: randomUUID(),
        organizationId: orgId,
        payloadVersion: 1,
        payload: {
          version: 1,
          vehicleId: randomUUID(),
          organizationId: orgId,
          onboardingCaseId: caseRow.id,
          registryLifecycle: 'ACTIVE',
          activatedAt: new Date().toISOString(),
          sourceProviders: ['DIMO'],
        },
        occurredAt: new Date(),
        idempotencyKey: activationOutboxIdempotencyKey(caseRow.id),
      },
    });
    await sealCaseReadyForTest(prisma, orgId, caseRow.id);
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'OUTBOX_IDEMPOTENCY_CONFLICT' });
  });
});
