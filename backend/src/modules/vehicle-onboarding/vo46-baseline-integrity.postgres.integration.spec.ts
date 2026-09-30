/**
 * VO-4.6 baseline integrity seal (PostgreSQL).
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
  technicalBaselineV2HvBattery,
} from './testing/technical-baseline-test.fixtures';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from './contracts/vo-document-versions';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';
import {
  assertZeroBaselineHealthAndMeasurementArtifacts,
  countBaselineHealthAndMeasurementArtifacts,
} from './testing/baseline-integrity-test.helpers';
import { activationOutboxIdempotencyKey } from './services/vehicle-onboarding-activation.service';

const run = process.env.VO46_BASELINE_PG === '1' || process.env.VO4_READINESS_PG === '1';

async function createOrgWithProducts(prisma: PrismaClient, slugs: ProductSlug[]) {
  const id = randomUUID();
  await prisma.organization.create({
    data: {
      id,
      companyName: `VO46 ${id.slice(0, 8)}`,
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

(run ? describe : describe.skip)('VO-4.6 baseline integrity (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const harness = createVo4ReadinessTestHarness(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('concurrent activation converges to one vehicle and one baseline set', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const vin = `CON${randomUUID().replace(/-/g, '').slice(0, 14)}`;
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
        draftTechnicalBaselineJson: {
          version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
          hvBatteryReference: technicalBaselineV2HvBattery(82).hvBatteryReference,
          brakeReference: technicalBaselineV2BrakePadOnly(11).brakeReference,
        },
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    await harness.readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));

    const concurrentCalls = 3;
    const results = await Promise.all(
      Array.from({ length: concurrentCalls }, () =>
        activateForTest(harness, {
          organizationId: orgId,
          onboardingCaseId: caseRow.id,
          actorUserId: null,
        }),
      ),
    );
    const vehicleIds = new Set(results.map((r) => r.vehicleId));
    expect(vehicleIds.size).toBe(1);

    const vehicleId = results[0]!.vehicleId;
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(1);
    expect(
      await prisma.vehicleBatteryReferenceCapacity.count({
        where: { vehicleId, organizationId: orgId },
      }),
    ).toBe(1);
    expect(
      await prisma.vehicleBatteryReferenceCapacity.count({
        where: { vehicleId, isActive: true, supersededById: null },
      }),
    ).toBe(1);
    expect(
      await prisma.vehicleBatteryReferenceCapacityChange.count({
        where: { vehicleId, action: 'CREATED' },
      }),
    ).toBe(1);
    expect(await prisma.vehicleBrakeReferenceSpec.count({ where: { vehicleId } })).toBe(1);
    expect(
      await prisma.vehicleOrganizationAssignment.count({
        where: { vehicleId, organizationId: orgId, validTo: null },
      }),
    ).toBe(1);
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { vehicleId, eventType: 'VEHICLE_ACTIVATED' },
      }),
    ).toBe(1);

    const completed = await prisma.vehicleOnboardingCase.findUniqueOrThrow({
      where: { id: caseRow.id },
    });
    expect(completed.status).toBe('COMPLETED');
    expect(completed.vehicleId).toBe(vehicleId);
  });

  it('full rollback leaves no activation artifacts on materialization failure', async () => {
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
        licensePlate: 'RB-VO46',
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

    const caseAfter = await prisma.vehicleOnboardingCase.findUniqueOrThrow({
      where: { id: caseRow.id },
    });
    expect(caseAfter.status).not.toBe('COMPLETED');
    expect(caseAfter.vehicleId).toBeNull();
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(0);
    expect(
      await prisma.vehicleOrganizationAssignment.count({ where: { organizationId: orgId } }),
    ).toBe(0);
    expect(
      await prisma.vehicleLicensePlateAssignment.count({
        where: { vehicle: { organizationId: orgId } },
      }),
    ).toBe(0);
    expect(
      await prisma.vehicleDataSourceLink.count({
        where: { vehicle: { organizationId: orgId } },
      }),
    ).toBe(0);
    expect(await prisma.vehicleProviderConsent.count({ where: { organizationId: orgId } })).toBe(0);
    expect(
      await prisma.vehicleBrakeReferenceSpec.count({
        where: { vehicle: { organizationId: orgId } },
      }),
    ).toBe(0);
    expect(await prisma.vehicleBatteryReferenceCapacity.count({ where: { organizationId: orgId } })).toBe(0);
    expect(
      await prisma.vehicleBatteryReferenceCapacityChange.count({ where: { organizationId: orgId } }),
    ).toBe(0);
    expect(
      await prisma.vehicleTireSetup.count({
        where: { vehicle: { organizationId: orgId } },
      }),
    ).toBe(0);
    expect(
      await prisma.vehicleRegistryLifecycleOutbox.count({
        where: { idempotencyKey: activationOutboxIdempotencyKey(caseRow.id) },
      }),
    ).toBe(0);
  });

  it('successful activation does not create health/measurement/service-event rows', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const vin = `HW${randomUUID().replace(/-/g, '').slice(0, 14)}`;
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
        draftTechnicalBaselineJson: technicalBaselineV2HvBattery(70),
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    await harness.readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
    const activated = await activateForTest(harness, {
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      actorUserId: null,
    });
    const before = await countBaselineHealthAndMeasurementArtifacts(prisma, activated.vehicleId);
    for (const value of Object.values(before)) {
      expect(value).toBe(0);
    }
    await assertZeroBaselineHealthAndMeasurementArtifacts(prisma, activated.vehicleId);
    const battery = await prisma.vehicleBatteryReferenceCapacity.findFirst({
      where: { vehicleId: activated.vehicleId },
    });
    expect(battery?.verificationStatus).toBe(ReferenceCapacityVerificationStatus.UNVERIFIED);
  });

  it('brake spec failing vehicle-fit cannot seal READY', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const vin = `BF${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const caseRow = await harness.caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin,
        make: 'Audi',
        model: 'A4',
        year: 2022,
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
        draftTechnicalBaselineJson: {
          version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
          brakeReference: {
            frontPadNominalThicknessMm: 12,
            sourceType: 'catalog',
            sourcePartNumber: 'rear-pads-xyz',
            sourceProvider: 'oem-catalog 2010',
          },
        },
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    const snap = await harness.readinessService.evaluateReadiness({
      ...sealInput(orgId, caseRow.id),
      seal: false,
    });
    expect(snap.decision).toBe('NOT_READY');
    const sealed = await harness.readinessService.evaluateReadiness({
      ...sealInput(orgId, caseRow.id),
      seal: true,
    });
    expect(sealed.decision).not.toBe('READY');
  });

  it('rejects HV draft with serviceEventId at readiness', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const vin = `SE${randomUUID().replace(/-/g, '').slice(0, 14)}`;
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
        draftTechnicalBaselineJson: {
          version: 2,
          hvBatteryReference: {
            capacityKwh: 60,
            capacityType: 'USABLE',
            source: 'MANUAL_VERIFIED',
            serviceEventId: randomUUID(),
          },
        },
        draftTechnicalBaselineVersion: 2,
      },
    });
    const snap = await harness.readinessService.evaluateReadiness({
      ...sealInput(orgId, caseRow.id),
      seal: false,
    });
    expect(snap.decision).toBe('NOT_READY');
  });

  it('blocks cross-tenant documentId on activation', async () => {
    const orgId = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const otherOrg = await createOrgWithProducts(prisma, [ProductSlug.RENTAL]);
    const docId = randomUUID();
    await prisma.vehicleDocumentExtraction.create({
      data: {
        id: docId,
        organizationId: otherOrg,
        status: 'APPLIED',
        effectiveDocumentType: 'BATTERY',
        contentSha256: `sha-${docId.slice(0, 8)}`,
      },
    });
    const vin = `DOC${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const caseRow = await harness.caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin,
        make: 'Tesla',
        model: 'X',
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
        draftTechnicalBaselineJson: {
          version: 2,
          hvBatteryReference: {
            capacityKwh: 75,
            capacityType: 'USABLE',
            source: 'MANUAL_VERIFIED',
            documentId: docId,
          },
        },
        draftTechnicalBaselineVersion: 2,
      },
    });
    await harness.readinessService.evaluateAndSealReadiness(sealInput(orgId, caseRow.id));
    await expect(
      activateForTest(harness, {
        organizationId: orgId,
        onboardingCaseId: caseRow.id,
        actorUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'TECHNICAL_BASELINE_EVIDENCE_SCOPE_MISMATCH' });
  });
});
