/**
 * VO-4 / VO-4.1 readiness authority (PostgreSQL).
 */
import {
  Prisma,
  PrismaClient,
  BusinessType,
  ProductSlug,
  OrgProductStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createVo4ReadinessTestHarness } from './testing/vo4-readiness-test.harness';
import { activateForTest } from './testing/vehicle-onboarding-test.harness';
import { DEFAULT_TENANT_SOURCE_ADOPTION } from './source-adoption/source-adoption.context';
import { READINESS_SNAPSHOT_VERSION_V2 } from './contracts/vo-document-versions';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';
import {
  parseValidatedReadinessSnapshotV2,
  parseValidatedSourceSnapshot,
} from './policy/persisted-contract.validation';
import {
  ONBOARDING_SOURCE_SNAPSHOT_VERSION,
  VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
} from './contracts/vo-document-versions';
import {
  technicalBaselineV2Empty,
  technicalBaselineV2HvBattery,
} from './testing/technical-baseline-test.fixtures';

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

async function createOrgWithProducts(
  prisma: PrismaClient,
  slugs: ProductSlug[],
  businessType: BusinessType = BusinessType.RENTAL,
) {
  const orgId = await createOrg(prisma, businessType);
  for (const slug of slugs) {
    await ensureOrganizationProductEntitlement(prisma, orgId, slug);
  }
  return orgId;
}

function sealInput(
  organizationId: string,
  onboardingCaseId: string,
  selectedProduct: ProductSlug = ProductSlug.RENTAL,
  actorUserId: string | null = null,
) {
  return { organizationId, onboardingCaseId, selectedProduct, actorUserId };
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

async function assertNoStaleReadySeal(
  prisma: PrismaClient,
  harness: ReturnType<typeof createVo4ReadinessTestHarness>,
  caseId: string,
  organizationId: string,
) {
  const row = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseId } });
  if (row.status !== 'READY_FOR_ACTIVATION') {
    return;
  }
  const snap = parseValidatedReadinessSnapshotV2(row);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const refs = await prisma.vehicleOnboardingCaseSourceRef.findMany({
    where: { onboardingCaseId: caseId },
  });
  const fp = harness.readinessService.computeCurrentInputFingerprint(row, refs, org, {
    selectedProduct: snap.productContext.selectedProductSlug,
    productEntitlementStatus: snap.productContext.productEntitlementStatus,
  });
  expect(fp).toBe(snap.readinessInputFingerprint);
}

(run ? describe : describe.skip)('VO-4 readiness authority', () => {
  const prisma = new PrismaClient();
  const harness = createVo4ReadinessTestHarness(prisma);
  const { caseService, readinessService, activationService } = harness;

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('DIMO case missing schema field evaluates NOT_READY', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
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
    const snap = await readinessService.evaluateAndSealReadiness(
      sealInput(orgId, caseRow.id),
    );
    expect(snap.decision).toBe('NOT_READY');
    expect(snap.schemaRequiredFieldsMet).toBe(false);
    expect(snap.productContext.selectedProductSlug).toBe(ProductSlug.RENTAL);
  });

  it('complete DIMO case seals READY and activates', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    const snap = await readinessService.evaluateAndSealReadiness(
      sealInput(orgId, caseRow.id, ProductSlug.RENTAL, 'u1'),
    );
    expect(snap.decision).toBe('READY');
    expect(snap.version).toBe(READINESS_SNAPSHOT_VERSION_V2);
    const activated = await activateForTest(
      { caseService, activationService },
      { organizationId: orgId, onboardingCaseId: caseRow.id, actorUserId: 'u1' },
    );
    expect(activated.vehicleId).toBeTruthy();
  });

  it('manual case seals READY when identity and VIN satisfied', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
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
    const snap = await readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
    expect(snap.decision).toBe('READY');
  });

  it('HM_ONLY approved case seals READY', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
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
        draftTechnicalBaselineJson: technicalBaselineV2HvBattery(),
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    const snap = await readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
    expect(snap.decision).toBe('READY');
  });

  it('HM primary with insufficient clearance is NOT_READY', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
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
    const snap = await readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
    expect(snap.decision).toBe('NOT_READY');
  });

  it('BEV rental without HV battery reference is NOT_READY', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
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
        draftTechnicalBaselineJson: technicalBaselineV2Empty(),
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    const snap = await readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
    expect(snap.decision).toBe('NOT_READY');
  });

  it('VIN conflict yields REVIEW_REQUIRED', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
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
      ...sealInput(orgId, caseRow.id),
      seal: false,
    });
    expect(snap.decision).toBe('REVIEW_REQUIRED');
  });

  it('NOT_READY activation rejected', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
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
        draftTechnicalBaselineJson: technicalBaselineV2Empty(),
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    await readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
    await expect(
      activateForTest(
        { caseService, activationService },
        { organizationId: orgId, onboardingCaseId: caseRow.id, actorUserId: null },
      ),
    ).rejects.toMatchObject({ code: 'READINESS_NOT_SEALED' });
  });

  it('stale identity draft fails activation with READINESS_SEAL_STALE', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    await readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
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
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const dimoId = randomUUID();
    const dimo2 = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    await createDimoMirror(prisma, dimo2, `ext-${dimo2.slice(0, 8)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    await readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
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
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    await readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
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
    await readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
    const result = await activateForTest(
      { caseService, activationService },
      { organizationId: orgId, onboardingCaseId: caseRow.id, actorUserId: null },
    );
    expect(result.vehicleId).toBeTruthy();
  });

  it('REVIEW_REQUIRED decision blocks activation', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
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
    await readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
    await expect(
      activateForTest(
        { caseService, activationService },
        { organizationId: orgId, onboardingCaseId: caseRow.id, actorUserId: null },
      ),
    ).rejects.toMatchObject({ code: 'READINESS_NOT_SEALED' });
  });

  it('stale admin draft fails activation with READINESS_SEAL_STALE', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    await readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
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
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    const input = sealInput(orgId, caseRow.id);
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

  it('fails closed when selected product is not entitled', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    await expect(
      readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id)),
    ).rejects.toMatchObject({ code: 'PRODUCT_ENTITLEMENT_NOT_ACTIVE' });
  });

  it('fails closed when product entitlement is suspended', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    await ensureOrganizationProductEntitlement(
      prisma,
      orgId,
      ProductSlug.RENTAL,
      OrgProductStatus.CANCELLED,
    );
    await expect(
      readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id)),
    ).rejects.toMatchObject({ code: 'PRODUCT_ENTITLEMENT_NOT_ACTIVE' });
  });

  it('multi-product org can seal Rental and Fleet explicitly', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL, ProductSlug.FLEET]);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    const rental = await readinessService.evaluateAndSealReadiness(
      sealInput(orgId, caseRow.id, ProductSlug.RENTAL),
    );
    expect(rental.productContext.profileId).toBe('rental-onboarding-v1');
    const fleet = await readinessService.evaluateAndSealReadiness(
      sealInput(orgId, caseRow.id, ProductSlug.FLEET),
    );
    expect(fleet.productContext.profileId).toBe('fleet-onboarding-v1');
    expect(fleet.productContext.selectedProductSlug).toBe(ProductSlug.FLEET);
  });

  it('TAXI product fails closed with READINESS_PROFILE_UNSUPPORTED', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.TAXI]);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    await expect(
      readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id, ProductSlug.TAXI)),
    ).rejects.toMatchObject({ code: 'READINESS_PROFILE_UNSUPPORTED' });
  });

  it('product entitlement revoked after READY rejects activation', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const dimoId = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 6)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    await readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
    await ensureOrganizationProductEntitlement(
      prisma,
      orgId,
      ProductSlug.RENTAL,
      OrgProductStatus.CANCELLED,
    );
    await expect(
      activateForTest(
        { caseService, activationService },
        { organizationId: orgId, onboardingCaseId: caseRow.id, actorUserId: null },
      ),
    ).rejects.toMatchObject({ code: 'PRODUCT_ENTITLEMENT_NOT_ACTIVE' });
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it('HM clearance evidence change after seal yields READINESS_SEAL_STALE on activation', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
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
        draftTechnicalBaselineJson: technicalBaselineV2HvBattery(),
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    await readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
    const ref = await prisma.vehicleOnboardingCaseSourceRef.findFirstOrThrow({
      where: { onboardingCaseId: caseRow.id, provider: 'HIGH_MOBILITY' },
    });
    const snap = parseValidatedSourceSnapshot(ref);
    const mutated = {
      ...snap,
      sourceEvidence: { ...snap.sourceEvidence, clearanceStatus: 'CLEARANCE_PENDING' },
    };
    await prisma.vehicleOnboardingCaseSourceRef.update({
      where: { id: ref.id },
      data: {
        snapshotMetadataJson: mutated as unknown as Prisma.InputJsonValue,
        snapshotMetadataVersion: ONBOARDING_SOURCE_SNAPSHOT_VERSION,
      },
    });
    await expect(
      activateForTest(
        { caseService, activationService },
        { organizationId: orgId, onboardingCaseId: caseRow.id, actorUserId: null },
      ),
    ).rejects.toMatchObject({ code: 'READINESS_SEAL_STALE' });
    const reeval = await readinessService.evaluateReadiness({
      ...sealInput(orgId, caseRow.id),
      seal: false,
    });
    expect(reeval.decision).toBe('NOT_READY');
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it('HM pending mirror refresh to approved enables READY re-evaluation', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
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
          fuelType: 'ELECTRIC',
          sourceEvidenceRefs: [],
        },
        draftTechnicalBaselineJson: technicalBaselineV2HvBattery(),
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    const pending = await readinessService.evaluateReadiness({
      ...sealInput(orgId, caseRow.id),
      seal: false,
    });
    expect(pending.decision).toBe('NOT_READY');
    await prisma.highMobilityVehicle.update({
      where: { id: hmId },
      data: { clearanceStatus: 'APPROVED' },
    });
    await caseService.refreshHighMobilitySourceEvidence(
      { organizationId: orgId, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
      caseRow.id,
      hmId,
    );
    const ready = await readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
    expect(ready.decision).toBe('READY');
  });

  it('seal vs source attach race cannot leave stale READY seal', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const dimoId = randomUUID();
    const dimo2 = randomUUID();
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`);
    await createDimoMirror(prisma, dimo2, `ext-${dimo2.slice(0, 8)}`);
    const caseRow = await caseService.openOrResumeFromDimo(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      dimoId,
    );
    await applyResolvableDimoIdentity(prisma, caseRow.id);
    await Promise.all([
      readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id)),
      caseService.attachDimoSource(
        { organizationId: orgId, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
        caseRow.id,
        dimo2,
        { isPrimary: false },
      ),
    ]);
    await assertNoStaleReadySeal(prisma, harness, caseRow.id, orgId);
  });

  it('seal vs HM source refresh race cannot leave stale READY seal', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
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
        draftTechnicalBaselineJson: technicalBaselineV2HvBattery(),
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    await prisma.highMobilityVehicle.update({
      where: { id: hmId },
      data: { clearanceStatus: 'CLEARANCE_PENDING' },
    });
    await Promise.all([
      readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id)),
      caseService.refreshHighMobilitySourceEvidence(
        { organizationId: orgId, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
        caseRow.id,
        hmId,
      ),
    ]);
    await assertNoStaleReadySeal(prisma, harness, caseRow.id, orgId);
  });
});
