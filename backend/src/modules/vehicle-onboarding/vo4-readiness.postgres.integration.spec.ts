/**
 * VO-4 readiness authority (PostgreSQL).
 */
import { PrismaClient, BusinessType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createVo4ReadinessTestHarness } from './testing/vo4-readiness-test.harness';
import { activateForTest } from './testing/vehicle-onboarding-test.harness';
import { DEFAULT_TENANT_SOURCE_ADOPTION } from './source-adoption/source-adoption.context';
import { READINESS_SNAPSHOT_VERSION_V2 } from './contracts/vo-document-versions';

const run = process.env.VO4_READINESS_PG === '1';

async function createOrg(prisma: PrismaClient, businessType: BusinessType = BusinessType.RENTAL) {
  const id = randomUUID();
  await prisma.organization.create({
    data: {
      id,
      companyName: `VO4 ${id.slice(0, 8)}`,
      businessType,
    },
  });
  return id;
}

async function createDimoMirror(prisma: PrismaClient, dimoId: string, externalId: string) {
  await prisma.$executeRaw`
    INSERT INTO dimo_vehicles (id, external_id, vin, make, model, year, fuel_type, connection_status, created_at, updated_at)
    VALUES (${dimoId}, ${externalId}, null, 'Audi', 'A3', 2021, 'GASOLINE', 'CONNECTED'::"DimoConnectionStatus", NOW(), NOW())
  `;
}

async function applyResolvableDimoIdentity(prisma: PrismaClient, caseId: string, vin: string | null = null) {
  await prisma.vehicleOnboardingCase.update({
    where: { id: caseId },
    data: {
      draftIdentityJson: {
        version: 1,
        vin,
        vinProvenance: vin ? 'PROVIDER' : null,
        vinVerificationState: vin ? 'UNVERIFIED' : null,
        make: 'Audi',
        model: 'A3',
        year: 2021,
        fuelType: 'GASOLINE',
        sourceEvidenceRefs: [],
      },
    },
  });
}

(run ? describe : describe.skip)('VO-4 readiness authority', () => {
  const prisma = new PrismaClient();
  const { caseService, readinessService, activationService } = createVo4ReadinessTestHarness(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('DIMO case missing schema field evaluates NOT_READY', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftIdentityJson: {
          version: 1,
          vin: null,
          vinProvenance: null,
          vinVerificationState: null,
          make: 'Audi',
          model: 'A3',
          year: 2021,
          fuelType: null,
          sourceEvidenceRefs: [],
        },
      },
    });
    const snap = await readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    expect(snap.decision).toBe('NOT_READY');
    expect(snap.schemaRequiredFieldsMet).toBe(false);
  });

  it('complete DIMO case seals READY and activates', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    const snap = await readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: 'u1',
    });
    expect(snap.decision).toBe('READY');
    expect(snap.version).toBe(READINESS_SNAPSHOT_VERSION_V2);
    const activated = await activateForTest(
      { caseService, activationService },
      { organizationId: orgId, onboardingCaseId: caseRow.id, actorUserId: 'u1' },
    );
    expect(activated.vehicleId).toBeTruthy();
  });

  it('manual case seals READY when identity and VIN satisfied', async () => {
    const orgId = await createOrg(prisma);
    const vin = `MAN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const caseRow = await caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin,
        make: 'VW',
        model: 'Golf',
        year: 2020,
        fuelType: 'GASOLINE',
        vehicleName: 'Fleet',
        licensePlate: null,
        stationId: null,
        notes: null,
      },
    );
    const snap = await readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    expect(snap.decision).toBe('READY');
  });

  it('HM_ONLY approved case seals READY', async () => {
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
    const caseRow = await caseService.openOrResumeFromHighMobility(
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
        draftTechnicalBaselineJson: {
          version: 1,
          referenceInputs: { hvBatteryReferenceId: 'bat-ref-1' },
        },
      },
    });
    const snap = await readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    expect(snap.decision).toBe('READY');
  });

  it('HM primary with insufficient clearance is NOT_READY', async () => {
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
        clearanceStatus: 'CLEARANCE_PENDING',
      },
    });
    const caseRow = await caseService.openOrResumeFromHighMobility(
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
          fuelType: 'GASOLINE',
          sourceEvidenceRefs: [],
        },
      },
    });
    const snap = await readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    expect(snap.decision).toBe('NOT_READY');
  });

  it('BEV rental without HV battery reference is NOT_READY', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftIdentityJson: {
          version: 1,
          vin: null,
          vinProvenance: null,
          vinVerificationState: null,
          make: 'Tesla',
          model: 'Model 3',
          year: 2022,
          fuelType: 'ELECTRIC',
          sourceEvidenceRefs: [],
        },
        draftTechnicalBaselineJson: { version: 1, referenceInputs: {} },
      },
    });
    const snap = await readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    expect(snap.decision).toBe('NOT_READY');
  });

  it('VIN conflict yields REVIEW_REQUIRED', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftIdentityJson: {
          version: 1,
          vin: 'VIN123',
          vinProvenance: 'PROVIDER',
          vinVerificationState: 'CONFLICT',
          make: 'Audi',
          model: 'A3',
          year: 2021,
          fuelType: 'GASOLINE',
          sourceEvidenceRefs: [],
        },
      },
    });
    const snap = await readinessService.evaluateReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
      seal: false,
    });
    expect(snap.decision).toBe('REVIEW_REQUIRED');
  });

  it('NOT_READY activation rejected', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftIdentityJson: {
          version: 1,
          vin: null,
          vinProvenance: null,
          vinVerificationState: null,
          make: 'Tesla',
          model: 'Model 3',
          year: 2022,
          fuelType: 'ELECTRIC',
          sourceEvidenceRefs: [],
        },
        draftTechnicalBaselineJson: { version: 1, referenceInputs: {} },
      },
    });
    await readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    await expect(
      activateForTest(
        { caseService, activationService },
        { organizationId: orgId, onboardingCaseId: caseRow.id, actorUserId: null },
      ),
    ).rejects.toMatchObject({ code: 'READINESS_NOT_SEALED' });
  });

  it('stale identity draft fails activation with READINESS_SEAL_STALE', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    await readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftIdentityJson: {
          version: 1,
          vin: null,
          vinProvenance: null,
          vinVerificationState: null,
          make: 'Audi',
          model: 'A4',
          year: 2021,
          fuelType: 'GASOLINE',
          sourceEvidenceRefs: [],
        },
      },
    });
    await expect(
      activateForTest(
        { caseService, activationService },
        { organizationId: orgId, onboardingCaseId: caseRow.id, actorUserId: null },
      ),
    ).rejects.toMatchObject({ code: 'READINESS_SEAL_STALE' });
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it('stale source attach invalidates seal and blocks activation', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const dimo2 = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    await createDimoMirror(prisma, dimo2, `ext-${dimo2.slice(0, 8)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    await readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    await caseService.attachDimoSource(
      { organizationId: orgId, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
      caseRow.id,
      dimo2,
      { isPrimary: false },
    );
    const row = await prisma.vehicleOnboardingCase.findUnique({ where: { id: caseRow.id } });
    expect(row?.status).toBe('IN_PROGRESS');
    await expect(
      activateForTest(
        { caseService, activationService },
        { organizationId: orgId, onboardingCaseId: caseRow.id, actorUserId: null },
      ),
    ).rejects.toMatchObject({ code: 'READINESS_NOT_SEALED' });
  });

  it('re-seal after valid change allows activation', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    await readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftAdminBaselineJson: {
          version: 1,
          vehicleName: 'Fleet',
          licensePlate: 'M-AB-1',
          stationId: null,
          notes: null,
        },
      },
    });
    await readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    const result = await activateForTest(
      { caseService, activationService },
      { organizationId: orgId, onboardingCaseId: caseRow.id, actorUserId: null },
    );
    expect(result.vehicleId).toBeTruthy();
  });

  it('REVIEW_REQUIRED decision blocks activation', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftIdentityJson: {
          version: 1,
          vin: 'VINX',
          vinProvenance: 'PROVIDER',
          vinVerificationState: 'CONFLICT',
          make: 'Audi',
          model: 'A3',
          year: 2021,
          fuelType: 'GASOLINE',
          sourceEvidenceRefs: [],
        },
      },
    });
    await readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    await expect(
      activateForTest(
        { caseService, activationService },
        { organizationId: orgId, onboardingCaseId: caseRow.id, actorUserId: null },
      ),
    ).rejects.toMatchObject({ code: 'READINESS_NOT_SEALED' });
  });

  it('stale admin draft fails activation with READINESS_SEAL_STALE', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    await readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftAdminBaselineJson: {
          version: 1,
          vehicleName: null,
          licensePlate: 'NEW-PLATE',
          stationId: null,
          notes: null,
        },
      },
    });
    await expect(
      activateForTest(
        { caseService, activationService },
        { organizationId: orgId, onboardingCaseId: caseRow.id, actorUserId: null },
      ),
    ).rejects.toMatchObject({ code: 'READINESS_SEAL_STALE' });
  });

  it('concurrent readiness seal converges to one authoritative snapshot', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    const input = {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    };
    const snaps = await Promise.all([
      readinessService.evaluateAndSealReadiness(input),
      readinessService.evaluateAndSealReadiness(input),
      readinessService.evaluateAndSealReadiness(input),
    ]);
    const fps = new Set(snaps.map((s) => s.readinessInputFingerprint));
    expect(fps.size).toBe(1);
    const row = await prisma.vehicleOnboardingCase.findUnique({ where: { id: caseRow.id } });
    expect(row?.status).toBe('READY_FOR_ACTIVATION');
    expect(row?.readinessSnapshotVersion).toBe(READINESS_SNAPSHOT_VERSION_V2);
  });
});
