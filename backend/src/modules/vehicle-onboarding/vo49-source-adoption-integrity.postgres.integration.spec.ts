/**
 * VO-4.9.1 source adoption integrity & proof closure (PostgreSQL).
 */
import {
  BusinessType,
  Prisma,
  PrismaClient,
  ProductSlug,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createVo4ReadinessTestHarness } from './testing/vo4-readiness-test.harness';
import {
  activateForTest,
  dimoOnboardingActor,
  sealCaseReadyForTest,
} from './testing/vehicle-onboarding-test.harness';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';
import { VehicleOnboardingSourceAdoptionService } from './services/vehicle-onboarding-source-adoption.service';
import { VehicleOnboardingSourceAdoptionAuthority } from './source-adoption/vehicle-onboarding-source-adoption.authority';
import { VehicleOnboardingCaptureService } from './services/vehicle-onboarding-capture.service';
import { DEFAULT_TENANT_SOURCE_ADOPTION } from './source-adoption/source-adoption.context';
import { setCaptureMutationTestCoordinator } from './testing/capture-mutation-test-coordinator';
import { setSourceAdoptionMutationTestCoordinator } from './testing/source-adoption-mutation-test-coordinator';
import { technicalBaselineV2BrakePadOnly, technicalBaselineV2HvBattery } from './testing/technical-baseline-test.fixtures';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from './contracts/vo-document-versions';
import { ONBOARDING_SOURCE_SNAPSHOT_VERSION } from './contracts/vo-document-versions';
import { DIMO_PLATFORM_DEVELOPER_LICENSE_SCOPE } from './adapters/connection-scope.constants';
import { buildDimoOnboardingSourceSnapshot } from './adapters/dimo-onboarding-source.adapter';

const run =
  process.env.VO491_SOURCE_ADOPTION_PG === '1' ||
  process.env.VO49_SOURCE_ADOPTION_PG === '1' ||
  process.env.VO4_READINESS_PG === '1';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function createOrg(prisma: PrismaClient) {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO491 ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
}

async function createDimoMirror(prisma: PrismaClient, dimoId: string, externalId: string, vin: string | null = null) {
  await prisma.$executeRaw`
    INSERT INTO dimo_vehicles (id, external_id, vin, make, model, year, fuel_type, connection_status, created_at, updated_at)
    VALUES (${dimoId}, ${externalId}, ${vin}, 'Audi', 'A3', 2021, 'GASOLINE', 'CONNECTED'::"DimoConnectionStatus", NOW(), NOW())
  `;
}

async function createHm(
  prisma: PrismaClient,
  hmId: string,
  organizationId: string | null,
  vin: string,
  clearanceStatus:
    | 'APPROVED'
    | 'DRAFT'
    | 'CLEARANCE_PENDING'
    | 'REJECTED'
    | 'ERROR'
    | 'REVOKING'
    | 'REVOKED'
    | 'CANCELED' = 'APPROVED',
  isActive = true,
) {
  await prisma.highMobilityVehicle.create({
    data: {
      id: hmId,
      organizationId,
      vin,
      brand: 'BMW',
      packageType: 'HEALTH',
      sourceMode: 'HM_ONLY',
      clearanceStatus,
      isActive,
    },
  });
}

function fullHarness(prisma: PrismaClient) {
  const base = createVo4ReadinessTestHarness(prisma);
  let auditCallCount = 0;
  const audit = {
    record: async () => {
      auditCallCount += 1;
      return null;
    },
  };
  const adoption = new VehicleOnboardingSourceAdoptionService(
    prisma as any,
    base.caseService,
    new VehicleOnboardingSourceAdoptionAuthority(),
    audit as any,
  );
  const capture = new VehicleOnboardingCaptureService(prisma as any, base.readinessService, audit as any);
  return {
    ...base,
    adoption,
    capture,
    getAuditCallCount: () => auditCallCount,
    resetAuditCount: () => {
      auditCallCount = 0;
    },
  };
}

async function sealHmPrimaryReady(
  harness: ReturnType<typeof fullHarness>,
  prisma: PrismaClient,
  orgId: string,
  caseId: string,
  vin: string,
) {
  await prisma.vehicleOnboardingCase.update({
    where: { id: caseId },
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
      draftTechnicalBaselineJson: technicalBaselineV2HvBattery() as unknown as Prisma.InputJsonValue,
      draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
    },
  });
  await harness.readinessService.evaluateAndSealReadiness({
    organizationId: orgId,
    onboardingCaseId: caseId,
    selectedProduct: ProductSlug.RENTAL,
    actorUserId: null,
  });
}

async function sealDimoHmCompositeReady(
  harness: ReturnType<typeof fullHarness>,
  prisma: PrismaClient,
  orgId: string,
  caseId: string,
  vin: string,
) {
  await prisma.vehicleOnboardingCase.update({
    where: { id: caseId },
    data: {
      draftIdentityJson: {
        version: 1,
        vin,
        vinProvenance: 'PROVIDER',
        vinVerificationState: 'UNVERIFIED',
        make: 'Audi',
        model: 'A3',
        year: 2021,
        fuelType: 'GASOLINE',
        sourceEvidenceRefs: [],
      },
      draftTechnicalBaselineJson: technicalBaselineV2HvBattery() as unknown as Prisma.InputJsonValue,
      draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
    },
  });
  await harness.readinessService.evaluateAndSealReadiness({
    organizationId: orgId,
    onboardingCaseId: caseId,
    selectedProduct: ProductSlug.RENTAL,
    actorUserId: null,
  });
}

async function activationCounts(prisma: PrismaClient, orgId: string, caseId: string) {
  return {
    vehicles: await prisma.vehicle.count({ where: { organizationId: orgId } }),
    consents: await prisma.vehicleProviderConsent.count({
      where: { organizationId: orgId },
    }),
    links: await prisma.vehicleDataSourceLink.count({
      where: { vehicle: { organizationId: orgId } },
    }),
    outbox: await prisma.vehicleRegistryLifecycleOutbox.count({
      where: { organizationId: orgId },
    }),
    caseStatus: (
      await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseId } })
    ).status,
  };
}

(run ? describe : describe.skip)('VO-4.9.1 source adoption integrity (PostgreSQL)', () => {
  jest.setTimeout(180_000);
  const prisma = new PrismaClient();

  afterEach(() => {
    setCaptureMutationTestCoordinator(null);
    setSourceAdoptionMutationTestCoordinator(null);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('PRIMARY_RESUME_SECONDARY_CLAIM_TEST: adopt HM secondary blocked, adopt DIMO primary resumes', async () => {
    const { adoption, caseService } = fullHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const hmId = randomUUID();
    const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, vin);
    await createHm(prisma, hmId, orgId, vin);
    const caseA = await caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await caseService.attachHighMobilitySource(
      { organizationId: orgId, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
      caseA.id,
      hmId,
    );
    await expect(
      adoption.adoptProviderSource({
        organizationId: orgId,
        actorUserId: null,
        provider: 'HIGH_MOBILITY',
        sourceMirrorId: hmId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_ALREADY_CLAIMED' });
    const resumed = await adoption.adoptProviderSource({
      organizationId: orgId,
      actorUserId: null,
      provider: 'DIMO',
      sourceMirrorId: dimoId,
      idempotencyKey: randomUUID(),
    });
    expect(resumed.id).toBe(caseA.id);
  });

  it('MULTIPLE_ACTIVE_HOLDER_INTEGRITY_TEST: two active cases same mirror → integrity conflict', async () => {
    const { adoption } = fullHarness(prisma);
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    const case1 = randomUUID();
    const case2 = randomUUID();
    const snap = buildDimoOnboardingSourceSnapshot({
      id: dimoId,
      externalId: `ext-${dimoId.slice(0, 8)}`,
      vin: null,
      make: 'Audi',
      model: 'A3',
      year: 2021,
      fuelType: 'GASOLINE',
      updatedAt: new Date(),
    });
    const scopeKey = DIMO_PLATFORM_DEVELOPER_LICENSE_SCOPE ?? '';
    for (const [orgId, caseId] of [[orgA, case1], [orgB, case2]] as const) {
      await prisma.vehicleOnboardingCase.create({
        data: {
          id: caseId,
          organizationId: orgId,
          sourceMode: 'DIMO',
          status: 'OPEN',
          primarySourceProvider: 'DIMO',
          primarySourceScopeKey: scopeKey,
          primarySourceExternalId: snap.externalVehicleIdentity,
          idempotencyKey: randomUUID(),
          concurrencyToken: randomUUID(),
          sourceRefs: {
            create: {
              id: randomUUID(),
              provider: 'DIMO',
              connectionScope: DIMO_PLATFORM_DEVELOPER_LICENSE_SCOPE,
              connectionScopeKey: scopeKey,
              externalVehicleIdentity: snap.externalVehicleIdentity,
              sourceMirrorId: dimoId,
              isPrimary: true,
              snapshotMetadataJson: snap as unknown as Prisma.InputJsonValue,
              snapshotMetadataVersion: ONBOARDING_SOURCE_SNAPSHOT_VERSION,
            },
          },
        },
      });
    }
    await expect(
      adoption.adoptProviderSource({
        organizationId: orgA,
        actorUserId: null,
        provider: 'DIMO',
        sourceMirrorId: dimoId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_CLAIM_INTEGRITY_CONFLICT' });
  });

  it('SAME_MIRROR_CHANGED_EXTERNAL_IDENTITY_TEST: hmVehicleReference change → attach noop', async () => {
    const { adoption, caseService } = fullHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const hmId = randomUUID();
    const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, vin);
    await createHm(prisma, hmId, orgId, vin);
    const caseRow = await caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await caseService.attachHighMobilitySource(
      { organizationId: orgId, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
      caseRow.id,
      hmId,
    );
    await sealCaseReadyForTest(prisma, orgId, caseRow.id);
    const ready = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    await prisma.highMobilityVehicle.update({
      where: { id: hmId },
      data: { hmVehicleReference: `hm-ref-${randomUUID().slice(0, 8)}` },
    });
    const projected = await adoption.attachProviderSource({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      provider: 'HIGH_MOBILITY',
      sourceMirrorId: hmId,
      expectedConcurrencyToken: ready.concurrencyToken,
    });
    expect(
      await prisma.vehicleOnboardingCaseSourceRef.count({
        where: { onboardingCaseId: caseRow.id, sourceMirrorId: hmId },
      }),
    ).toBe(1);
    expect(projected.concurrencyToken).toBe(ready.concurrencyToken);
    expect(projected.status).toBe('READY_FOR_ACTIVATION');
  });

  it('TARGET_ORGANIZATION_VALIDATED_INSIDE_CLAIM_TX: missing org in adopt tx', async () => {
    const { adoption } = fullHarness(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    await expect(
      adoption.adoptProviderSource({
        organizationId: randomUUID(),
        actorUserId: null,
        provider: 'DIMO',
        sourceMirrorId: dimoId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' });
  });

  it('HM_PRIMARY_REVOKED_AFTER_SEAL_ACTIVATION_BLOCKED', async () => {
    const harness = fullHarness(prisma);
    const orgId = await createOrg(prisma);
    const hmId = randomUUID();
    const vin = `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createHm(prisma, hmId, orgId, vin);
    const caseRow = await harness.caseService.openOrResumeFromHighMobility(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      hmId,
    );
    await sealHmPrimaryReady(harness, prisma, orgId, caseRow.id, vin);
    const before = await activationCounts(prisma, orgId, caseRow.id);
    await prisma.highMobilityVehicle.update({
      where: { id: hmId },
      data: { clearanceStatus: 'REVOKED' },
    });
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'ACTIVATION_PRECONDITION_FAILED' });
    const after = await activationCounts(prisma, orgId, caseRow.id);
    expect(after.vehicles).toBe(before.vehicles);
    expect(after.consents).toBe(before.consents);
    expect(after.links).toBe(before.links);
    expect(after.outbox).toBe(before.outbox);
    expect(after.caseStatus).not.toBe('COMPLETED');
  });

  it('HM_SECONDARY_REVOKED_AFTER_SEAL_ACTIVATION_BLOCKED', async () => {
    const harness = fullHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const hmId = randomUUID();
    const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, vin);
    await createHm(prisma, hmId, orgId, vin);
    const caseRow = await harness.caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await harness.caseService.attachHighMobilitySource(
      { organizationId: orgId, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
      caseRow.id,
      hmId,
    );
    await sealDimoHmCompositeReady(harness, prisma, orgId, caseRow.id, vin);
    const before = await activationCounts(prisma, orgId, caseRow.id);
    await prisma.highMobilityVehicle.update({
      where: { id: hmId },
      data: { clearanceStatus: 'REVOKED' },
    });
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'ACTIVATION_PRECONDITION_FAILED' });
    const after = await activationCounts(prisma, orgId, caseRow.id);
    expect(after.vehicles).toBe(before.vehicles);
    expect(after.links).toBe(before.links);
  });

  it('HM_SECONDARY_INACTIVE_AFTER_SEAL_ACTIVATION_BLOCKED', async () => {
    const harness = fullHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const hmId = randomUUID();
    const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, vin);
    await createHm(prisma, hmId, orgId, vin);
    const caseRow = await harness.caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await harness.caseService.attachHighMobilitySource(
      { organizationId: orgId, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
      caseRow.id,
      hmId,
    );
    await sealDimoHmCompositeReady(harness, prisma, orgId, caseRow.id, vin);
    await prisma.highMobilityVehicle.update({
      where: { id: hmId },
      data: { isActive: false },
    });
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'ACTIVATION_PRECONDITION_FAILED' });
  });

  it('CANONICAL_SOURCE_SUPPRESSION_TEST matrix', async () => {
    const { adoption } = fullHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const hmId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    await createHm(prisma, hmId, orgId, `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`);

    const vehicleId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO vehicles (id, organization_id, vin, make, model, year, fuel_type, dimo_vehicle_id, registry_lifecycle, created_at, updated_at)
      VALUES (${vehicleId}, ${orgId}, ${`VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`}, 'Audi', 'A3', 2021, 'GASOLINE'::"FuelType", ${dimoId}, 'OFFBOARDED'::"VehicleRegistryLifecycle", NOW(), NOW())
    `;
    await expect(
      adoption.adoptProviderSource({
        organizationId: orgId,
        actorUserId: null,
        provider: 'DIMO',
        sourceMirrorId: dimoId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_ALREADY_REGISTERED' });

    const dimo2 = randomUUID();
    await createDimoMirror(prisma, dimo2, `ext-${dimo2.slice(0, 8)}`);
    const v2 = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO vehicles (id, organization_id, vin, make, model, year, fuel_type, created_at, updated_at)
      VALUES (${v2}, ${orgId}, ${`VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`}, 'Audi', 'A3', 2021, 'GASOLINE'::"FuelType", NOW(), NOW())
    `;
    await prisma.vehicleDataSourceLink.create({
      data: {
        vehicleId: v2,
        provider: 'DIMO',
        sourceType: 'DIMO',
        dimoVehicleId: dimo2,
        isActive: false,
      },
    });
    await expect(
      adoption.adoptProviderSource({
        organizationId: orgId,
        actorUserId: null,
        provider: 'DIMO',
        sourceMirrorId: dimo2,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_ALREADY_REGISTERED' });

    await prisma.highMobilityVehicle.update({
      where: { id: hmId },
      data: { synqdriveVehicleId: v2, registrationState: 'REGISTERED' },
    });
    await expect(
      adoption.adoptProviderSource({
        organizationId: orgId,
        actorUserId: null,
        provider: 'HIGH_MOBILITY',
        sourceMirrorId: hmId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_ALREADY_REGISTERED' });
  });

  it('HM_ADOPTION_ELIGIBILITY_MATRIX', async () => {
    const { adoption } = fullHarness(prisma);
    const orgId = await createOrg(prisma);
    const blocked: Array<
      'DRAFT' | 'CLEARANCE_PENDING' | 'REJECTED' | 'ERROR' | 'REVOKING' | 'REVOKED' | 'CANCELED'
    > = ['DRAFT', 'CLEARANCE_PENDING', 'REJECTED', 'ERROR', 'REVOKING', 'REVOKED', 'CANCELED'];
    for (const status of blocked) {
      const hmId = randomUUID();
      await createHm(prisma, hmId, orgId, `HM${randomUUID().replace(/-/g, '').slice(0, 12)}`, status);
      await expect(
        adoption.adoptProviderSource({
          organizationId: orgId,
          actorUserId: null,
          provider: 'HIGH_MOBILITY',
          sourceMirrorId: hmId,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'SOURCE_NOT_AVAILABLE' });
    }
    const inactiveId = randomUUID();
    await createHm(
      prisma,
      inactiveId,
      orgId,
      `HM${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      'APPROVED',
      false,
    );
    await expect(
      adoption.adoptProviderSource({
        organizationId: orgId,
        actorUserId: null,
        provider: 'HIGH_MOBILITY',
        sourceMirrorId: inactiveId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_NOT_AVAILABLE' });
  });

  it('CANCELLED_CASE_SOURCE_READOPTION_TEST and TERMINAL_IDEMPOTENCY_KEY_REUSE_BLOCKED', async () => {
    const { adoption } = fullHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    const oldKey = randomUUID();
    const cancelledCase = await adoption.adoptProviderSource({
      organizationId: orgId,
      actorUserId: null,
      provider: 'DIMO',
      sourceMirrorId: dimoId,
      idempotencyKey: oldKey,
    });
    await prisma.vehicleOnboardingCase.update({
      where: { id: cancelledCase.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    const newCase = await adoption.adoptProviderSource({
      organizationId: orgId,
      actorUserId: null,
      provider: 'DIMO',
      sourceMirrorId: dimoId,
      idempotencyKey: randomUUID(),
    });
    expect(newCase.id).not.toBe(cancelledCase.id);
    await expect(
      adoption.adoptProviderSource({
        organizationId: orgId,
        actorUserId: null,
        provider: 'DIMO',
        sourceMirrorId: dimoId,
        idempotencyKey: oldKey,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_REQUEST' });
  });

  it('SOURCE_ATTACH_CAPTURE_RACE_SAFE attach-first vs technical capture', async () => {
    const { adoption, capture, caseService } = fullHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const hmId = randomUUID();
    const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, vin);
    await createHm(prisma, hmId, orgId, vin);
    const caseRow = await caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    const t0 = caseRow.concurrencyToken!;
    const attachStarted = deferred<void>();
    const releaseAttach = deferred<void>();
    setSourceAdoptionMutationTestCoordinator({
      onAttachLocksAcquired: async () => attachStarted.resolve(),
      beforeAttachCommit: async () => releaseAttach.promise,
    });
    const attachPromise = adoption.attachProviderSource({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      provider: 'HIGH_MOBILITY',
      sourceMirrorId: hmId,
      expectedConcurrencyToken: t0,
    });
    await attachStarted.promise;
    const capturePromise = capture.updateTechnicalBaseline({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      expectedConcurrencyToken: t0,
      body: technicalBaselineV2BrakePadOnly(10),
    });
    releaseAttach.resolve();
    const outcomes = await Promise.allSettled([attachPromise, capturePromise]);
    setSourceAdoptionMutationTestCoordinator(null);
    const rejected = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.code).toBe('ONBOARDING_CONCURRENCY_CONFLICT');
    const row = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(row.concurrencyToken).not.toBe(t0);
  });

  it('SOURCE_ATTACH_SEAL_RACE_SAFE seal-first then attach stale token', async () => {
    const { adoption, capture, caseService, readinessService } = fullHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const hmId = randomUUID();
    const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, vin);
    await createHm(prisma, hmId, orgId, vin);
    const caseRow = await caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftIdentityJson: {
          version: 1,
          vin,
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
    const t0 = caseRow.concurrencyToken!;
    const sealStarted = deferred<void>();
    const releaseSeal = deferred<void>();
    setCaptureMutationTestCoordinator({
      onSealLockAcquired: async () => sealStarted.resolve(),
      beforeSealCommit: async () => releaseSeal.promise,
    });
    const sealPromise = capture.sealReadiness({
      organizationId: orgId,
      caseId: caseRow.id,
      selectedProduct: ProductSlug.RENTAL,
      actorUserId: null,
      expectedConcurrencyToken: t0,
    });
    await sealStarted.promise;
    const attachPromise = adoption.attachProviderSource({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      provider: 'HIGH_MOBILITY',
      sourceMirrorId: hmId,
      expectedConcurrencyToken: t0,
    });
    releaseSeal.resolve();
    const outcomes = await Promise.allSettled([sealPromise, attachPromise]);
    setCaptureMutationTestCoordinator(null);
    const attachOutcome = outcomes[1];
    expect(attachOutcome?.status).toBe('rejected');
    expect((attachOutcome as PromiseRejectedResult).reason.code).toBe('ONBOARDING_CONCURRENCY_CONFLICT');
    const row = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(row.concurrencyToken).not.toBe(t0);
    expect(row.status).toBe('READY_FOR_ACTIVATION');
  });

  it('SOURCE_ATTACH_POSTGRES_MATRIX: cross-org case and terminal cases blocked', async () => {
    const { adoption, caseService } = fullHarness(prisma);
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    const caseA = await caseService.openOrResumeFromDimo(dimoOnboardingActor(orgA), dimoId);
    const dimoB = randomUUID();
    await createDimoMirror(prisma, dimoB, `ext-${dimoB.slice(0, 8)}`);
    await expect(
      adoption.attachProviderSource({
        organizationId: orgB,
        caseId: caseA.id,
        actorUserId: null,
        provider: 'DIMO',
        sourceMirrorId: dimoB,
        expectedConcurrencyToken: null,
      }),
    ).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' });

    for (const status of ['COMPLETED', 'CANCELLED', 'EXPIRED'] as const) {
      const orgId = await createOrg(prisma);
      const dId = randomUUID();
      await createDimoMirror(prisma, dId, `ext-${dId.slice(0, 8)}`);
      const row = await caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dId);
      const hmId = randomUUID();
      await createHm(prisma, hmId, orgId, `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`);
      if (status === 'COMPLETED') {
        const vehicleId = randomUUID();
        const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
        await prisma.$executeRaw`
          INSERT INTO vehicles (id, organization_id, vin, make, model, year, fuel_type, created_at, updated_at)
          VALUES (${vehicleId}, ${orgId}, ${vin}, 'Audi', 'A3', 2021, 'GASOLINE'::"FuelType", NOW(), NOW())
        `;
        await prisma.$executeRawUnsafe(
          `UPDATE vehicle_onboarding_cases SET status = 'COMPLETED'::"OnboardingCaseStatus", vehicle_id = $2, completed_at = NOW() WHERE id = $1`,
          row.id,
          vehicleId,
        );
      } else {
        await prisma.vehicleOnboardingCase.update({
          where: { id: row.id },
          data: {
            status,
            ...(status === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
            ...(status === 'EXPIRED' ? { expiredAt: new Date() } : {}),
          },
        });
      }
      await expect(
        adoption.attachProviderSource({
          organizationId: orgId,
          caseId: row.id,
          actorUserId: null,
          provider: 'HIGH_MOBILITY',
          sourceMirrorId: hmId,
          expectedConcurrencyToken: row.concurrencyToken,
        }),
      ).rejects.toMatchObject({ code: 'TERMINAL_CASE_IDEMPOTENCY' });
    }
  });

  it('EXPIRED_CASE_SOURCE_READOPTION_TEST', async () => {
    const { adoption } = fullHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    const expired = await adoption.adoptProviderSource({
      organizationId: orgId,
      actorUserId: null,
      provider: 'DIMO',
      sourceMirrorId: dimoId,
      idempotencyKey: randomUUID(),
    });
    await prisma.vehicleOnboardingCase.update({
      where: { id: expired.id },
      data: { status: 'EXPIRED', expiredAt: new Date() },
    });
    const reopened = await adoption.adoptProviderSource({
      organizationId: orgId,
      actorUserId: null,
      provider: 'DIMO',
      sourceMirrorId: dimoId,
      idempotencyKey: randomUUID(),
    });
    expect(reopened.id).not.toBe(expired.id);
  });

  it('SOURCE_ADOPTION_RESUME_FALSE_MUTATION_AUDIT: resume does not audit adopt', async () => {
    const harness = fullHarness(prisma);
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    const key = randomUUID();
    harness.resetAuditCount();
    await harness.adoption.adoptProviderSource({
      organizationId: orgId,
      actorUserId: 'ma',
      provider: 'DIMO',
      sourceMirrorId: dimoId,
      idempotencyKey: key,
    });
    expect(harness.getAuditCallCount()).toBe(1);
    await harness.adoption.adoptProviderSource({
      organizationId: orgId,
      actorUserId: 'ma',
      provider: 'DIMO',
      sourceMirrorId: dimoId,
      idempotencyKey: key,
    });
    expect(harness.getAuditCallCount()).toBe(1);
  });
});
