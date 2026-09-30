/**
 * VO-4.8 authenticated capture API (PostgreSQL).
 */
import {
  BusinessType,
  Prisma,
  PrismaClient,
  ProductSlug,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createVo4ReadinessTestHarness } from './testing/vo4-readiness-test.harness';
import { VehicleOnboardingCaptureService } from './services/vehicle-onboarding-capture.service';
import { VehicleOnboardingError } from './errors/vehicle-onboarding.errors';
import { VEHICLE_ADMIN_BASELINE_DRAFT_VERSION } from './contracts/vo-document-versions';
import {
  technicalBaselineV2BrakePadOnly,
  technicalBaselineV2Empty,
  technicalBaselineV2HvBattery,
} from './testing/technical-baseline-test.fixtures';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from './contracts/vo-document-versions';
import { ensureOrganizationProductEntitlement } from './testing/org-product-test.harness';
import { READINESS_SNAPSHOT_VERSION_V2 } from './contracts/vo-document-versions';

const run = process.env.VO48_CAPTURE_PG === '1' || process.env.VO4_READINESS_PG === '1';

async function createOrg(prisma: PrismaClient) {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `VO48 ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
}

function captureHarness(prisma: PrismaClient) {
  const base = createVo4ReadinessTestHarness(prisma);
  const capture = new VehicleOnboardingCaptureService(prisma as any, base.readinessService, {
    record: async () => null,
  } as any);
  return { ...base, capture };
}

(run ? describe : describe.skip)('VO-4.8 capture API (PostgreSQL)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('saves valid technical V2 and rotates concurrency token', async () => {
    const { caseService, capture } = captureHarness(prisma);
    const orgId = await createOrg(prisma);
    const caseRow = await caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
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
    const token = caseRow.concurrencyToken;
    expect(token).toBeTruthy();
    const vehiclesBefore = await prisma.vehicle.count({ where: { organizationId: orgId } });
    const brakeSpecsBefore = await prisma.vehicleBrakeReferenceSpec.count({
      where: { vehicle: { organizationId: orgId } },
    });
    const result = await capture.updateTechnicalBaseline({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: 'user-1',
      expectedConcurrencyToken: token,
      body: technicalBaselineV2BrakePadOnly(10),
    });
    expect(result.semanticNoop).toBe(false);
    expect(result.case.concurrencyToken).not.toBe(token);
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(vehiclesBefore);
    expect(
      await prisma.vehicleBrakeReferenceSpec.count({
        where: { vehicle: { organizationId: orgId } },
      }),
    ).toBe(brakeSpecsBefore);
  });

  it('concurrent writers: one winner one conflict', async () => {
    const { caseService, capture } = captureHarness(prisma);
    const orgId = await createOrg(prisma);
    const caseRow = await caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        make: 'Audi',
        model: 'A3',
        year: 2021,
        fuelType: 'GASOLINE',
        vehicleName: null,
        licensePlate: null,
        stationId: null,
        notes: null,
      },
    );
    const token = caseRow.concurrencyToken!;
    const results = await Promise.allSettled([
      capture.updateTechnicalBaseline({
        organizationId: orgId,
        caseId: caseRow.id,
        actorUserId: null,
        expectedConcurrencyToken: token,
        body: technicalBaselineV2BrakePadOnly(10),
      }),
      capture.updateTechnicalBaseline({
        organizationId: orgId,
        caseId: caseRow.id,
        actorUserId: null,
        expectedConcurrencyToken: token,
        body: technicalBaselineV2BrakePadOnly(11),
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(VehicleOnboardingError);
    expect((rejected[0] as PromiseRejectedResult).reason.code).toBe('ONBOARDING_CONCURRENCY_CONFLICT');
    const finalRow = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(finalRow.concurrencyToken).not.toBe(token);
  });

  it('legacy null token concurrent writers resolve to single winner', async () => {
    const { caseService, capture } = captureHarness(prisma);
    const orgId = await createOrg(prisma);
    const caseRow = await caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        make: 'Audi',
        model: 'A3',
        year: 2021,
        fuelType: 'GASOLINE',
        vehicleName: null,
        licensePlate: null,
        stationId: null,
        notes: null,
      },
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: { concurrencyToken: null },
    });
    const results = await Promise.allSettled([
      capture.updateAdminBaseline({
        organizationId: orgId,
        caseId: caseRow.id,
        actorUserId: null,
        expectedConcurrencyToken: null,
        body: {
          version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
          vehicleName: 'A',
          licensePlate: null,
          stationId: null,
          notes: null,
        },
      }),
      capture.updateAdminBaseline({
        organizationId: orgId,
        caseId: caseRow.id,
        actorUserId: null,
        expectedConcurrencyToken: null,
        body: {
          version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
          vehicleName: 'B',
          licensePlate: null,
          stationId: null,
          notes: null,
        },
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    expect(results.filter((r) => r.status === 'rejected').length).toBe(1);
  });

  it('READY technical change invalidates seal', async () => {
    const { caseService, capture, readinessService } = captureHarness(prisma);
    const orgId = await createOrg(prisma);
    const caseRow = await caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        make: 'Audi',
        model: 'A3',
        year: 2021,
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
        draftTechnicalBaselineJson: technicalBaselineV2BrakePadOnly(10) as unknown as Prisma.InputJsonValue,
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    await readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      selectedProduct: ProductSlug.RENTAL,
      actorUserId: null,
    });
    const ready = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    await capture.updateTechnicalBaseline({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      expectedConcurrencyToken: ready.concurrencyToken,
      body: technicalBaselineV2BrakePadOnly(12),
    });
    const after = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(after.status).toBe('IN_PROGRESS');
    expect(after.readinessSnapshotVersion).toBe(0);
    expect(after.readinessProfileVersion).toBeNull();
  });

  it('semantic no-op preserves READY seal', async () => {
    const { caseService, capture, readinessService } = captureHarness(prisma);
    const orgId = await createOrg(prisma);
    const caseRow = await caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        make: 'Audi',
        model: 'A3',
        year: 2021,
        fuelType: 'GASOLINE',
        vehicleName: null,
        licensePlate: null,
        stationId: null,
        notes: null,
      },
    );
    const baseline = technicalBaselineV2BrakePadOnly(10);
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftTechnicalBaselineJson: baseline as unknown as Prisma.InputJsonValue,
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    await readinessService.evaluateAndSealReadiness({
      organizationId: orgId,
      onboardingCaseId: caseRow.id,
      selectedProduct: ProductSlug.RENTAL,
      actorUserId: null,
    });
    const before = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    const noop = await capture.updateTechnicalBaseline({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      expectedConcurrencyToken: before.concurrencyToken,
      body: baseline,
    });
    expect(noop.semanticNoop).toBe(true);
    const after = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(after.status).toBe('READY_FOR_ACTIVATION');
    expect(after.readinessSnapshotVersion).toBe(READINESS_SNAPSHOT_VERSION_V2);
    expect(after.concurrencyToken).toBe(before.concurrencyToken);
  });

  it('capture vs seal race: seal first then mutation invalidates READY', async () => {
    const { caseService, capture, readinessService } = captureHarness(prisma);
    const orgId = await createOrg(prisma);
    const caseRow = await caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        make: 'Audi',
        model: 'A3',
        year: 2021,
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
        draftTechnicalBaselineJson: technicalBaselineV2BrakePadOnly(10) as unknown as Prisma.InputJsonValue,
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    const sealed = await capture.sealReadiness({
      organizationId: orgId,
      caseId: caseRow.id,
      selectedProduct: ProductSlug.RENTAL,
      actorUserId: null,
      expectedConcurrencyToken: caseRow.concurrencyToken,
    });
    expect(sealed.case.status).toBe('READY_FOR_ACTIVATION');
    await capture.updateTechnicalBaseline({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      expectedConcurrencyToken: sealed.case.concurrencyToken,
      body: technicalBaselineV2BrakePadOnly(11),
    });
    const after = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(after.status).toBe('IN_PROGRESS');
  });

  it('cross-org case access returns not found', async () => {
    const { caseService, capture } = captureHarness(prisma);
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const caseRow = await caseService.openOrResumeManual(
      { organizationId: orgA, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        make: 'Audi',
        model: 'A3',
        year: 2021,
        fuelType: 'GASOLINE',
        vehicleName: null,
        licensePlate: null,
        stationId: null,
        notes: null,
      },
    );
    await expect(capture.getCase(orgB, caseRow.id)).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' });
  });

  it('rejects cross-org battery document and vehicle-bound document', async () => {
    const { caseService, capture } = captureHarness(prisma);
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const caseRow = await caseService.openOrResumeManual(
      { organizationId: orgA, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        make: 'Audi',
        model: 'A3',
        year: 2021,
        fuelType: 'GASOLINE',
        vehicleName: null,
        licensePlate: null,
        stationId: null,
        notes: null,
      },
    );
    const docOtherOrg = randomUUID();
    await prisma.vehicleDocumentExtraction.create({
      data: {
        id: docOtherOrg,
        organizationId: orgB,
        status: 'APPLIED',
        effectiveDocumentType: 'BATTERY',
        contentSha256: `sha-${docOtherOrg.slice(0, 8)}`,
      },
    });
    await expect(
      capture.updateTechnicalBaseline({
        organizationId: orgA,
        caseId: caseRow.id,
        actorUserId: null,
        expectedConcurrencyToken: caseRow.concurrencyToken,
        body: {
          ...technicalBaselineV2HvBattery(75),
          hvBatteryReference: {
            ...technicalBaselineV2HvBattery(75).hvBatteryReference,
            documentId: docOtherOrg,
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'TECHNICAL_BASELINE_EVIDENCE_SCOPE_MISMATCH' });

    const vehicleId = randomUUID();
    const vin = `V${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await prisma.$executeRaw`
      INSERT INTO vehicles (id, organization_id, vin, make, model, year, fuel_type, created_at, updated_at)
      VALUES (${vehicleId}::uuid, ${orgA}::uuid, ${vin}, 'Audi', 'A3', 2021, 'GASOLINE'::"FuelType", NOW(), NOW())
    `;
    const docBound = randomUUID();
    await prisma.vehicleDocumentExtraction.create({
      data: {
        id: docBound,
        organizationId: orgA,
        vehicleId,
        status: 'APPLIED',
        effectiveDocumentType: 'BATTERY',
        contentSha256: `sha-${docBound.slice(0, 8)}`,
      },
    });
    await expect(
      capture.updateTechnicalBaseline({
        organizationId: orgA,
        caseId: caseRow.id,
        actorUserId: null,
        expectedConcurrencyToken: caseRow.concurrencyToken,
        body: {
          ...technicalBaselineV2HvBattery(75),
          hvBatteryReference: {
            ...technicalBaselineV2HvBattery(75).hvBatteryReference,
            documentId: docBound,
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'TECHNICAL_BASELINE_EVIDENCE_SCOPE_MISMATCH' });
  });

  it('evaluate readiness does not persist seal', async () => {
    const { caseService, capture } = captureHarness(prisma);
    const orgId = await createOrg(prisma);
    const caseRow = await caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        make: 'Audi',
        model: 'A3',
        year: 2021,
        fuelType: 'GASOLINE',
        vehicleName: null,
        licensePlate: null,
        stationId: null,
        notes: null,
      },
    );
    await capture.evaluateReadinessPreview({
      organizationId: orgId,
      caseId: caseRow.id,
      selectedProduct: ProductSlug.RENTAL,
      actorUserId: null,
    });
    const row = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(row.readinessSnapshotVersion).toBe(0);
    expect(row.status).toBe('OPEN');
  });

  it('terminal case mutation blocked', async () => {
    const { caseService, capture } = captureHarness(prisma);
    const orgId = await createOrg(prisma);
    const caseRow = await caseService.openOrResumeManual(
      { organizationId: orgId, actorUserId: null, idempotencyKey: randomUUID() },
      {
        vin: `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
        make: 'Audi',
        model: 'A3',
        year: 2021,
        fuelType: 'GASOLINE',
        vehicleName: null,
        licensePlate: null,
        stationId: null,
        notes: null,
      },
    );
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await expect(
      capture.updateTechnicalBaseline({
        organizationId: orgId,
        caseId: caseRow.id,
        actorUserId: null,
        expectedConcurrencyToken: caseRow.concurrencyToken,
        body: technicalBaselineV2Empty(),
      }),
    ).rejects.toMatchObject({ code: 'TERMINAL_CASE_IDEMPOTENCY' });
  });
});
