/**
 * VO-4.2 activation serialization races (PostgreSQL).
 */
import {
  BusinessType,
  OrgProductStatus,
  PrismaClient,
  ProductSlug,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createVo4ReadinessTestHarness } from './testing/vo4-readiness-test.harness';
import { activateForTest, dimoOnboardingActor } from './testing/vehicle-onboarding-test.harness';
import { DEFAULT_TENANT_SOURCE_ADOPTION } from './source-adoption/source-adoption.context';
import { PLATFORM_TRUSTED_SOURCE_ADOPTION } from './source-adoption/platform-trusted-adoption.context';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';
import { lockActiveOrganizationProductEntitlementRow } from './readiness/product-entitlement.authority';
import { VehicleOnboardingError } from './errors/vehicle-onboarding.errors';
import {
  parseValidatedReadinessSnapshotV2,
} from './policy/persisted-contract.validation';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from './contracts/vo-document-versions';
import { technicalBaselineV2HvBattery } from './testing/technical-baseline-test.fixtures';

const run = process.env.VO4_ACTIVATION_RACE_PG === '1' || process.env.VO4_READINESS_PG === '1';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function createOrgWithRental(prisma: PrismaClient) {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO42 ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
}

async function createDimoMirror(prisma: PrismaClient, dimoId: string, externalId: string) {
  await prisma.$executeRaw`
    INSERT INTO dimo_vehicles (id, external_id, vin, make, model, year, fuel_type, connection_status, created_at, updated_at)
    VALUES (${dimoId}, ${externalId}, null, 'Audi', 'A3', 2021, 'GASOLINE', 'CONNECTED'::"DimoConnectionStatus", NOW(), NOW())
  `;
}

async function sealReadyDimoCase(
  harness: ReturnType<typeof createVo4ReadinessTestHarness>,
  prisma: PrismaClient,
  orgId: string,
) {
  const dimoId = randomUUID();
  await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
  const caseRow = await harness.caseService.openOrResumeFromDimo(
    dimoOnboardingActor(orgId),
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
        fuelType: 'GASOLINE',
        sourceEvidenceRefs: [],
      },
    },
  });
  await harness.readinessService.evaluateAndSealReadiness({
    organizationId: orgId,
    onboardingCaseId: caseRow.id,
    selectedProduct: ProductSlug.RENTAL,
    actorUserId: null,
  });
  return { caseRow, dimoId };
}

async function assertActivationRaceOutcome(prisma: PrismaClient, orgId: string, caseId: string) {
  const vehicleCount = await prisma.vehicle.count({ where: { organizationId: orgId } });
  const row = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseId } });
  if (vehicleCount === 1) {
    expect(row.status).toBe('COMPLETED');
    expect(row.vehicleId).toBeTruthy();
    return;
  }
  expect(vehicleCount).toBe(0);
  if (row.status === 'READY_FOR_ACTIVATION') {
    const snap = parseValidatedReadinessSnapshotV2(row);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const refs = await prisma.vehicleOnboardingCaseSourceRef.findMany({
      where: { onboardingCaseId: caseId },
    });
    const harness = createVo4ReadinessTestHarness(prisma);
    const fp = harness.readinessService.computeCurrentInputFingerprint(row, refs, org, {
      selectedProduct: snap.productContext.selectedProductSlug,
      productEntitlementStatus: snap.productContext.productEntitlementStatus,
    });
    expect(fp).toBe(snap.readinessInputFingerprint);
  }
}

(run ? describe : describe.skip)('VO-4.2 activation serialization races', () => {
  const prisma = new PrismaClient();
  const harness = createVo4ReadinessTestHarness(prisma);
  const prismaB = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
    await prismaB.$disconnect();
  });

  it('activation vs source attach race', async () => {
    const orgId = await createOrgWithRental(prisma);
    const { caseRow, dimoId } = await sealReadyDimoCase(harness, prisma, orgId);
    const dimo2 = randomUUID();
    await createDimoMirror(prisma, dimo2, `ext-${dimo2.slice(0, 8)}`);

    const attachBarrier = deferred<void>();
    const attachStarted = deferred<void>();

    const attachPromise = (async () => {
      attachStarted.resolve();
      await attachBarrier.promise;
      return harness.caseService.attachDimoSource(
        { organizationId: orgId, sourceAdoption: PLATFORM_TRUSTED_SOURCE_ADOPTION },
        caseRow.id,
        dimo2,
        { isPrimary: false },
      );
    })();

    const activatePromise = (async () => {
      await attachStarted.promise;
      attachBarrier.resolve();
      return activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: 'race',
      });
    })();

    await Promise.allSettled([activatePromise, attachPromise]);
    await assertActivationRaceOutcome(prisma, orgId, caseRow.id);
  });

  it('activation vs HM evidence refresh race', async () => {
    const orgId = await createOrgWithRental(prisma);
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
        draftTechnicalBaselineJson: technicalBaselineV2HvBattery(),
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    await harness.readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      selectedProduct: ProductSlug.RENTAL,
      actorUserId: null,
    });
    await prisma.highMobilityVehicle.update({
      where: { id: hmId },
      data: { clearanceStatus: 'CLEARANCE_PENDING' },
    });

    await Promise.allSettled([
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
      harness.caseService.refreshHighMobilitySourceEvidence(
        { organizationId: orgId, actorUserId: null, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
        caseRow.id,
        hmId,
      ),
    ]);
    await assertActivationRaceOutcome(prisma, orgId, caseRow.id);
  });

  it('product revocation before activation fails closed (REVOCATION_FIRST)', async () => {
    const orgId = await createOrgWithRental(prisma);
    const { caseRow } = await sealReadyDimoCase(harness, prisma, orgId);
    const product = await prisma.product.findUniqueOrThrow({ where: { slug: ProductSlug.RENTAL } });

    const revokeGate = deferred<void>();
    const revokeTask = prismaB.$transaction(async (tx) => {
      const locked = await lockActiveOrganizationProductEntitlementRow(tx, orgId, ProductSlug.RENTAL);
      expect(locked).toBeTruthy();
      revokeGate.resolve();
      await new Promise((r) => setTimeout(r, 200));
      await tx.organizationProduct.update({
        where: {
          organizationId_productId: { organizationId: orgId, productId: product.id },
        },
        data: { status: OrgProductStatus.CANCELLED },
      });
    });

    await revokeGate.promise;
    let activateError: unknown;
    try {
      await harness.activationService.activateVehicle({
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      });
    } catch (e) {
      activateError = e;
    }
    await revokeTask;

    expect(activateError).toBeInstanceOf(VehicleOnboardingError);
    expect((activateError as VehicleOnboardingError).code).toBe('PRODUCT_ENTITLEMENT_NOT_ACTIVE');
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it('activation holds entitlement lock through commit (ACTIVATION_FIRST)', async () => {
    const orgId = await createOrgWithRental(prisma);
    const { caseRow } = await sealReadyDimoCase(harness, prisma, orgId);
    const product = await prisma.product.findUniqueOrThrow({ where: { slug: ProductSlug.RENTAL } });

    const pastEntitlement = deferred<void>();
    const activateTask = harness.activationService.activateVehicle({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: 'race',
      activationTestHooks: {
        afterEntitlementRowLock: () => pastEntitlement.resolve(),
      },
    });

    await pastEntitlement.promise;
    const revokeTask = prismaB.$transaction(async (tx) => {
      await tx.organizationProduct.update({
        where: {
          organizationId_productId: { organizationId: orgId, productId: product.id },
        },
        data: { status: OrgProductStatus.CANCELLED },
      });
    });

    const [activateResult] = await Promise.allSettled([activateTask, revokeTask]);
    expect(activateResult.status).toBe('fulfilled');
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(1);
  });

  it('concurrent activation still converges to one vehicle', async () => {
    const orgId = await createOrgWithRental(prisma);
    const { caseRow } = await sealReadyDimoCase(harness, prisma, orgId);
    const results = await Promise.allSettled([
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: 'a',
      }),
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: 'b',
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(1);
  });

  it('lock-order stress without deadlock', async () => {
    const orgId = await createOrgWithRental(prisma);
    const { caseRow, dimoId } = await sealReadyDimoCase(harness, prisma, orgId);
    const dimo2 = randomUUID();
    await createDimoMirror(prisma, dimo2, `ext-${dimo2.slice(0, 8)}`);

    for (let i = 0; i < 5; i += 1) {
      await Promise.race([
        Promise.allSettled([
          harness.activationService.activateVehicle({
            organizationId: orgId,
            onboardingCaseId: caseRow.id,
            actorUserId: null,
          }),
          harness.caseService.attachDimoSource(
            { organizationId: orgId, sourceAdoption: PLATFORM_TRUSTED_SOURCE_ADOPTION },
            caseRow.id,
            dimo2,
            { isPrimary: false },
          ),
        ]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('deadlock timeout')), 15_000),
        ),
      ]);
    }
    const row = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    if (row.status === 'COMPLETED') {
      expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(1);
    }
  }, 90_000);
});
