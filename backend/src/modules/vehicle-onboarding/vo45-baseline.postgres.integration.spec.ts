/**
 * VO-4.5 technical baseline materialization (PostgreSQL).
 */
import {
  BusinessType,
  PrismaClient,
  ProductSlug,
  ReferenceCapacityVerificationStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createVo4ReadinessTestHarness } from './testing/vo4-readiness-test.harness';
import { activateForTest } from './testing/vehicle-onboarding-test.harness';
import {
  technicalBaselineV2BrakePadOnly,
  technicalBaselineV2Empty,
  technicalBaselineV2HvBattery,
} from './testing/technical-baseline-test.fixtures';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from './contracts/vo-document-versions';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';

const run = process.env.VO45_BASELINE_PG === '1' || process.env.VO4_READINESS_PG === '1';

async function createOrgWithProducts(prisma: PrismaClient, slugs: ProductSlug[]) {
  const id = randomUUID();
  await prisma.organization.create({
    data: {
      id,
      companyName: `VO45 ${id.slice(0, 8)}`,
      businessType: slugs.includes(ProductSlug.FLEET) ? BusinessType.FLEET : BusinessType.RENTAL,
    },
  });
  for (const slug of slugs) {
    await ensureOrganizationProductEntitlement(prisma, id, slug);
  }
  return id;
}

function sealInput(orgId: string, caseId: string, product: ProductSlug = ProductSlug.RENTAL) {
  return {
    organizationId: orgId,
    onboardingCaseId: caseId,
    selectedProduct: product,
    actorUserId: null,
  };
}

(run ? describe : describe.skip)('VO-4.5 baseline materialization (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const harness = createVo4ReadinessTestHarness(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('A: ICE rental activates without HV reference row', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const vin = `ICE${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const caseRow = await harness.caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin,
        make: 'VW',
        model: 'Golf',
        year: 2020,
        fuelType: 'GASOLINE',
        vehicleName: null,
        licensePlate: null,
        stationId: null,
        notes: null,
      },
    );
    await harness.readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
    const activated = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    const batteryRows = await prisma.vehicleBatteryReferenceCapacity.count({
      where: { vehicleId: activated.vehicleId },
    });
    expect(batteryRows).toBe(0);
  });

  it('B: BEV rental typed HV reference materializes one capacity row', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const vin = `BEV${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const caseRow = await harness.caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin,
        make: 'Tesla',
        model: 'Model 3',
        year: 2022,
        fuelType: 'ELECTRIC',
        vehicleName: null,
        licensePlate: null,
        stationId: null,
        notes: null,
      },
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftTechnicalBaselineJson: technicalBaselineV2HvBattery(77),
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    const snap = await harness.readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
    expect(snap.decision).toBe('READY');
    const activated = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    const rows = await prisma.vehicleBatteryReferenceCapacity.findMany({
      where: { vehicleId: activated.vehicleId, organizationId: orgId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.capacityKwh).toBe(77);
    expect(rows[0]!.verificationStatus).toBe(ReferenceCapacityVerificationStatus.UNVERIFIED);
  });

  it('C: BEV rental opaque V1 hv id is NOT_READY', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const vin = `BEV${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const caseRow = await harness.caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin,
        make: 'Tesla',
        model: 'Y',
        year: 2023,
        fuelType: 'ELECTRIC',
        vehicleName: null,
        licensePlate: null,
        stationId: null,
        notes: null,
      },
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftTechnicalBaselineVersion: 1,
        draftTechnicalBaselineJson: {
          version: 1,
          referenceInputs: { hvBatteryReferenceId: 'bat-ref-1' },
        },
      },
    });
    const snap = await harness.readinessService.evaluateReadiness({
      ...sealInput(orgId, caseRow.id),
      seal: false,
    });
    expect(snap.decision).toBe('NOT_READY');
  });

  it('D: BEV fleet deferred HV activates without placeholder battery row', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.FLEET]);
    const vin = `FLT${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const caseRow = await harness.caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin,
        make: 'VW',
        model: 'ID.4',
        year: 2021,
        fuelType: 'ELECTRIC',
        vehicleName: null,
        licensePlate: null,
        stationId: null,
        notes: null,
      },
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftTechnicalBaselineJson: technicalBaselineV2Empty(),
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    const snap = await harness.readinessService.evaluateAndSealReadiness(
      sealInput(orgId, caseRow.id, ProductSlug.FLEET),
    );
    expect(snap.decision).toBe('READY');
    const activated = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    const count = await prisma.vehicleBatteryReferenceCapacity.count({
      where: { vehicleId: activated.vehicleId },
    });
    expect(count).toBe(0);
  });

  it('E: brake reference draft creates VehicleBrakeReferenceSpec on activation', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const vin = `BRK${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const caseRow = await harness.caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin,
        make: 'VW',
        model: 'Golf',
        year: 2019,
        fuelType: 'GASOLINE',
        vehicleName: null,
        licensePlate: null,
        stationId: null,
        notes: null,
      },
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftTechnicalBaselineJson: technicalBaselineV2BrakePadOnly(),
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    await harness.readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
    const activated = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    const specs = await prisma.vehicleBrakeReferenceSpec.findMany({
      where: { vehicleId: activated.vehicleId },
    });
    expect(specs).toHaveLength(1);
    expect(specs[0]!.frontPadNominalThicknessMm).toBe(12);
  });

  it('I: baseline materialization failure rolls back activation', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const vin = `RB${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const caseRow = await harness.caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin,
        make: 'Tesla',
        model: 'S',
        year: 2020,
        fuelType: 'ELECTRIC',
        vehicleName: null,
        licensePlate: null,
        stationId: null,
        notes: null,
      },
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftTechnicalBaselineJson: technicalBaselineV2HvBattery(),
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    await harness.readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
        activationTestHooks: { forceTechnicalBaselineMaterializationFailure: true },
      }),
    ).rejects.toBeTruthy();
    const refreshed = await prisma.vehicleOnboardingCase.findUniqueOrThrow({
      where: { id: caseRow.id },
    });
    expect(refreshed.status).not.toBe('COMPLETED');
    expect(refreshed.vehicleId).toBeNull();
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
    expect(
      await prisma.vehicleBatteryReferenceCapacity.count({ where: { organizationId: orgId } }),
    ).toBe(0);
  });

  it('J: idempotent retry does not duplicate baseline rows', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const vin = `IDM${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const caseRow = await harness.caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin,
        make: 'Tesla',
        model: '3',
        year: 2021,
        fuelType: 'ELECTRIC',
        vehicleName: null,
        licensePlate: null,
        stationId: null,
        notes: null,
      },
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftTechnicalBaselineJson: technicalBaselineV2HvBattery(60),
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    await harness.readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
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
    const rows = await prisma.vehicleBatteryReferenceCapacity.count({
      where: { vehicleId: first.vehicleId },
    });
    expect(rows).toBe(1);
  });
});
