/**
 * VO-4.9.2 activation source identity continuity (PostgreSQL).
 */
import {
  BusinessType,
  HmAppContainerType,
  HmPackageType,
  HmSourceMode,
  Prisma,
  PrismaClient,
  ProductSlug,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createVo4ReadinessTestHarness } from './testing/vo4-readiness-test.harness';
import {
  activateForTest,
  dimoOnboardingActor,
} from './testing/vehicle-onboarding-test.harness';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from './contracts/vo-document-versions';
import { technicalBaselineV2HvBattery } from './testing/technical-baseline-test.fixtures';
import { DEFAULT_TENANT_SOURCE_ADOPTION } from './source-adoption/source-adoption.context';

const run =
  process.env.VO492_SOURCE_IDENTITY_PG === '1' ||
  process.env.VO49_SOURCE_ADOPTION_PG === '1' ||
  process.env.VO4_READINESS_PG === '1';

async function createOrg(prisma: PrismaClient) {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO492 ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
}

async function createDimoMirror(
  prisma: PrismaClient,
  dimoId: string,
  externalId: string,
  vin: string | null,
) {
  await prisma.$executeRaw`
    INSERT INTO dimo_vehicles (id, external_id, vin, make, model, year, fuel_type, connection_status, created_at, updated_at)
    VALUES (${dimoId}, ${externalId}, ${vin}, 'Audi', 'A3', 2021, 'GASOLINE', 'CONNECTED'::"DimoConnectionStatus", NOW(), NOW())
  `;
}

async function createHm(
  prisma: PrismaClient,
  hmId: string,
  organizationId: string,
  vin: string,
  overrides: Partial<{
    sourceMode: HmSourceMode;
    packageType: HmPackageType;
    appContainerType: HmAppContainerType | null;
  }> = {},
) {
  await prisma.highMobilityVehicle.create({
    data: {
      id: hmId,
      organizationId,
      vin,
      brand: 'BMW',
      packageType: overrides.packageType ?? HmPackageType.HEALTH,
      sourceMode: overrides.sourceMode ?? HmSourceMode.HM_ONLY,
      appContainerType: overrides.appContainerType ?? null,
      clearanceStatus: 'APPROVED',
      isActive: true,
    },
  });
}

async function activationMaterializationCounts(prisma: PrismaClient, orgId: string) {
  return {
    vehicles: await prisma.vehicle.count({ where: { organizationId: orgId } }),
    consents: await prisma.vehicleProviderConsent.count({ where: { organizationId: orgId } }),
    links: await prisma.vehicleDataSourceLink.count({
      where: { vehicle: { organizationId: orgId } },
    }),
    outbox: await prisma.vehicleRegistryLifecycleOutbox.count({
      where: { organizationId: orgId },
    }),
  };
}

async function sealHmPrimary(
  harness: ReturnType<typeof createVo4ReadinessTestHarness>,
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

async function sealDimoPrimary(
  harness: ReturnType<typeof createVo4ReadinessTestHarness>,
  prisma: PrismaClient,
  orgId: string,
  caseId: string,
  vin: string | null,
) {
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
  await harness.readinessService.evaluateAndSealReadiness({
    organizationId: orgId,
    onboardingCaseId: caseId,
    selectedProduct: ProductSlug.RENTAL,
    actorUserId: null,
  });
}

async function sealDimoHmComposite(
  harness: ReturnType<typeof createVo4ReadinessTestHarness>,
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

(run ? describe : describe.skip)('VO-4.9.2 activation source identity continuity (PostgreSQL)', () => {
  jest.setTimeout(180_000);
  const prisma = new PrismaClient();
  const harness = createVo4ReadinessTestHarness(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('DIMO_VIN_DRIFT_AFTER_SEAL_TEST', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const vinA = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const vinB = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, vinA);
    const caseRow = await harness.caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await sealDimoPrimary(harness, prisma, orgId, caseRow.id, vinA);
    const before = await activationMaterializationCounts(prisma, orgId);
    await prisma.$executeRaw`UPDATE dimo_vehicles SET vin = ${vinB} WHERE id = ${dimoId}`;
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'IDENTITY_REVIEW_REQUIRED' });
    const after = await activationMaterializationCounts(prisma, orgId);
    expect(after).toEqual(before);
    const row = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(row.status).not.toBe('COMPLETED');
  });

  it('HM_PRIMARY_VIN_DRIFT_AFTER_SEAL_TEST', async () => {
    const orgId = await createOrg(prisma);
    const hmId = randomUUID();
    const vinA = `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const vinB = `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createHm(prisma, hmId, orgId, vinA);
    const caseRow = await harness.caseService.openOrResumeFromHighMobility(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      hmId,
    );
    await sealHmPrimary(harness, prisma, orgId, caseRow.id, vinA);
    const before = await activationMaterializationCounts(prisma, orgId);
    await prisma.highMobilityVehicle.update({ where: { id: hmId }, data: { vin: vinB } });
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'IDENTITY_REVIEW_REQUIRED' });
    expect(await activationMaterializationCounts(prisma, orgId)).toEqual(before);
  });

  it('HM_SECONDARY_VIN_DRIFT_AFTER_SEAL_TEST', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const hmId = randomUUID();
    const vinA = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const vinB = `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, vinA);
    await createHm(prisma, hmId, orgId, vinA);
    const caseRow = await harness.caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await harness.caseService.attachHighMobilitySource(
      { organizationId: orgId, sourceAdoption: DEFAULT_TENANT_SOURCE_ADOPTION },
      caseRow.id,
      hmId,
    );
    await sealDimoHmComposite(harness, prisma, orgId, caseRow.id, vinA);
    const before = await activationMaterializationCounts(prisma, orgId);
    await prisma.highMobilityVehicle.update({ where: { id: hmId }, data: { vin: vinB } });
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'IDENTITY_REVIEW_REQUIRED' });
    expect(await activationMaterializationCounts(prisma, orgId)).toEqual(before);
  });

  it('HM_SOURCE_MODE_DRIFT_AFTER_SEAL_TEST', async () => {
    const orgId = await createOrg(prisma);
    const hmId = randomUUID();
    const vin = `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createHm(prisma, hmId, orgId, vin, { sourceMode: HmSourceMode.HM_ONLY });
    const caseRow = await harness.caseService.openOrResumeFromHighMobility(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      hmId,
    );
    await sealHmPrimary(harness, prisma, orgId, caseRow.id, vin);
    await prisma.highMobilityVehicle.update({
      where: { id: hmId },
      data: { sourceMode: HmSourceMode.DIMO_PLUS_HM },
    });
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'READINESS_SEAL_STALE' });
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it('HM_PACKAGE_TYPE_DRIFT_AFTER_SEAL_TEST', async () => {
    const orgId = await createOrg(prisma);
    const hmId = randomUUID();
    const vin = `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createHm(prisma, hmId, orgId, vin, { packageType: HmPackageType.HEALTH });
    const caseRow = await harness.caseService.openOrResumeFromHighMobility(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      hmId,
    );
    await sealHmPrimary(harness, prisma, orgId, caseRow.id, vin);
    await prisma.highMobilityVehicle.update({
      where: { id: hmId },
      data: { packageType: HmPackageType.FULL_TELEMETRY },
    });
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'READINESS_SEAL_STALE' });
  });

  it('HM_APP_CONTAINER_DRIFT_AFTER_SEAL_TEST', async () => {
    const orgId = await createOrg(prisma);
    const hmId = randomUUID();
    const vin = `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createHm(prisma, hmId, orgId, vin, {
      appContainerType: HmAppContainerType.HM_HEALTH_APP,
    });
    const caseRow = await harness.caseService.openOrResumeFromHighMobility(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      hmId,
    );
    await sealHmPrimary(harness, prisma, orgId, caseRow.id, vin);
    await prisma.highMobilityVehicle.update({
      where: { id: hmId },
      data: { appContainerType: HmAppContainerType.HM_TELEMETRY_APP },
    });
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'READINESS_SEAL_STALE' });
  });

  it('HM_REFERENCE_ONLY_CHANGE_TEST', async () => {
    const orgId = await createOrg(prisma);
    const hmId = randomUUID();
    const vin = `HM${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createHm(prisma, hmId, orgId, vin);
    const caseRow = await harness.caseService.openOrResumeFromHighMobility(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      hmId,
    );
    await sealHmPrimary(harness, prisma, orgId, caseRow.id, vin);
    await prisma.highMobilityVehicle.update({
      where: { id: hmId },
      data: { hmVehicleReference: `hm-ref-${randomUUID().slice(0, 8)}` },
    });
    const result = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    expect(result.created).toBe(true);
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(1);
  });

  it('VIN_NULL_ENRICHMENT: snapshot null + current VIN present does not fail activation', async () => {
    const orgId = await createOrg(prisma);
    const dimoId = randomUUID();
    const enrichedVin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await createDimoMirror(prisma, dimoId, `ext-${dimoId.slice(0, 8)}`, null);
    const caseRow = await harness.caseService.openOrResumeFromDimo(dimoOnboardingActor(orgId), dimoId);
    await sealDimoPrimary(harness, prisma, orgId, caseRow.id, null);
    await prisma.$executeRaw`UPDATE dimo_vehicles SET vin = ${enrichedVin} WHERE id = ${dimoId}`;
    const result = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    expect(result.created).toBe(true);
  });
});
