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
import type { AuditContext } from '@modules/activity-log/audit.service';
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
import { parseValidatedReadinessSnapshotV2 } from './policy/persisted-contract.validation';
import {
  setCaptureMutationTestCoordinator,
} from './testing/capture-mutation-test-coordinator';
import { parseCaseListQuery } from './policy/capture-request.validation';

const run = process.env.VO48_CAPTURE_PG === '1' || process.env.VO4_READINESS_PG === '1';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function technicalBaselineV2TeslaReady(frontPadNominalThicknessMm = 10, capacityKwh = 77) {
  const brake = technicalBaselineV2BrakePadOnly(frontPadNominalThicknessMm);
  const battery = technicalBaselineV2HvBattery(capacityKwh);
  return {
    version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
    brakeReference: brake.brakeReference,
    hvBatteryReference: battery.hvBatteryReference,
  };
}

async function openTeslaCase(
  caseService: ReturnType<typeof captureHarness>['caseService'],
  orgId: string,
) {
  return caseService.openOrResumeManual(
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
}

async function markCaseCompletedForTerminalTest(
  prisma: PrismaClient,
  organizationId: string,
  caseId: string,
) {
  const vehicleId = randomUUID();
  const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, created_at, updated_at
    ) VALUES (
      ${vehicleId},
      ${organizationId},
      ${vin},
      'Volkswagen',
      'Golf',
      2020,
      'GASOLINE'::"FuelType",
      NOW(),
      NOW()
    )
  `;
  await prisma.$executeRawUnsafe(
    `UPDATE vehicle_onboarding_cases SET status = 'COMPLETED'::"OnboardingCaseStatus", vehicle_id = $2, completed_at = NOW() WHERE id = $1`,
    caseId,
    vehicleId,
  );
}

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
  jest.setTimeout(120_000);
  const prisma = new PrismaClient();

  afterEach(() => {
    setCaptureMutationTestCoordinator(null);
  });

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

  it('cross-org station rejected without mutation', async () => {
    const { caseService, capture } = captureHarness(prisma);
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    const stationB = randomUUID();
    await prisma.station.create({
      data: {
        id: stationB,
        organizationId: orgB,
        name: 'B station',
        address: 'x',
        city: 'y',
        country: 'DE',
      },
    });
    const caseRow = await openTeslaCase(caseService, orgA);
    const token = caseRow.concurrencyToken;
    const before = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    await expect(
      capture.updateAdminBaseline({
        organizationId: orgA,
        caseId: caseRow.id,
        actorUserId: null,
        expectedConcurrencyToken: token,
        body: {
          version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
          vehicleName: null,
          licensePlate: null,
          stationId: stationB,
          notes: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'STATION_SCOPE_MISMATCH' });
    const after = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(after.concurrencyToken).toBe(token);
    expect(after.draftAdminBaselineJson).toEqual(before.draftAdminBaselineJson);
  });

  async function prepareReadyCaseForSeal(
    caseService: ReturnType<typeof captureHarness>['caseService'],
    orgId: string,
  ) {
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
    return prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
  }

  it('readiness seal persistence via capture path', async () => {
    const { caseService, capture } = captureHarness(prisma);
    const orgId = await createOrg(prisma);
    const caseRow = await prepareReadyCaseForSeal(caseService, orgId);
    const token = caseRow.concurrencyToken!;
    const sealed = await capture.sealReadiness({
      organizationId: orgId,
      caseId: caseRow.id,
      selectedProduct: ProductSlug.RENTAL,
      actorUserId: 'actor-1',
      expectedConcurrencyToken: token,
    });
    const row = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(row.status).toBe('READY_FOR_ACTIVATION');
    expect(row.readinessSnapshotVersion).toBe(READINESS_SNAPSHOT_VERSION_V2);
    expect(row.readinessProfileVersion).toBeTruthy();
    expect(row.lastActorUserId).toBe('actor-1');
    expect(row.concurrencyToken).not.toBe(token);
    const snap = parseValidatedReadinessSnapshotV2(row);
    expect(snap.readinessInputFingerprint).toBe(sealed.snapshot.readinessInputFingerprint);
  });

  it('terminal matrix blocks admin, technical, and seal', async () => {
    const { caseService, capture } = captureHarness(prisma);
    const orgId = await createOrg(prisma);
    for (const terminal of ['CANCELLED', 'EXPIRED', 'COMPLETED'] as const) {
      const caseRow = await openTeslaCase(caseService, orgId);
      const token = caseRow.concurrencyToken;
      if (terminal === 'COMPLETED') {
        await markCaseCompletedForTerminalTest(prisma, orgId, caseRow.id);
      } else {
        const patch: Prisma.VehicleOnboardingCaseUpdateInput = { status: terminal };
        if (terminal === 'CANCELLED') patch.cancelledAt = new Date();
        if (terminal === 'EXPIRED') patch.expiredAt = new Date();
        await prisma.vehicleOnboardingCase.update({ where: { id: caseRow.id }, data: patch });
      }
      const before = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
      await expect(
        capture.updateAdminBaseline({
          organizationId: orgId,
          caseId: caseRow.id,
          actorUserId: null,
          expectedConcurrencyToken: token,
          body: {
            version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
            vehicleName: 'X',
            licensePlate: null,
            stationId: null,
            notes: null,
          },
        }),
      ).rejects.toMatchObject({ code: 'TERMINAL_CASE_IDEMPOTENCY' });
      await expect(
        capture.updateTechnicalBaseline({
          organizationId: orgId,
          caseId: caseRow.id,
          actorUserId: null,
          expectedConcurrencyToken: token,
          body: technicalBaselineV2BrakePadOnly(10),
        }),
      ).rejects.toMatchObject({ code: 'TERMINAL_CASE_IDEMPOTENCY' });
      await expect(
        capture.sealReadiness({
          organizationId: orgId,
          caseId: caseRow.id,
          selectedProduct: ProductSlug.RENTAL,
          actorUserId: null,
          expectedConcurrencyToken: token,
        }),
      ).rejects.toMatchObject({ code: 'TERMINAL_CASE_IDEMPOTENCY' });
      const after = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
      expect(after.concurrencyToken).toBe(token);
      expect(after.draftTechnicalBaselineJson).toEqual(before.draftTechnicalBaselineJson);
    }
  });

  it('capture does not materialize downstream health rows', async () => {
    const { caseService, capture } = captureHarness(prisma);
    const orgId = await createOrg(prisma);
    const caseRow = await openTeslaCase(caseService, orgId);
    const token = caseRow.concurrencyToken!;
    const countsBefore = {
      vehicles: await prisma.vehicle.count({ where: { organizationId: orgId } }),
      brakes: await prisma.vehicleBrakeReferenceSpec.count(),
      batteries: await prisma.vehicleBatteryReferenceCapacity.count(),
      tires: await prisma.vehicleTireSetup.count(),
    };
    await capture.updateTechnicalBaseline({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      expectedConcurrencyToken: token,
      body: {
        version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
        brakeReference: technicalBaselineV2BrakePadOnly(10).brakeReference,
        hvBatteryReference: technicalBaselineV2HvBattery(77).hvBatteryReference,
        tireReferenceSpec: {
          frontDimension: '225/45R17',
          rearDimension: null,
          loadIndexFront: null,
          speedIndexFront: null,
          loadIndexRear: null,
          speedIndexRear: null,
          recommendedPressureFrontBar: null,
          recommendedPressureRearBar: null,
          referenceProvenance: null,
        },
      },
    });
    expect(await prisma.vehicle.count({ where: { organizationId: orgId } })).toBe(countsBefore.vehicles);
    expect(await prisma.vehicleBrakeReferenceSpec.count()).toBe(countsBefore.brakes);
    expect(await prisma.vehicleBatteryReferenceCapacity.count()).toBe(countsBefore.batteries);
    expect(await prisma.vehicleTireSetup.count()).toBe(countsBefore.tires);
  });

  it('post-seal valid-token edit invalidates seal', async () => {
    const { caseService, capture } = captureHarness(prisma);
    const orgId = await createOrg(prisma);
    const caseRow = await prepareReadyCaseForSeal(caseService, orgId);
    const sealed = await capture.sealReadiness({
      organizationId: orgId,
      caseId: caseRow.id,
      selectedProduct: ProductSlug.RENTAL,
      actorUserId: null,
      expectedConcurrencyToken: caseRow.concurrencyToken,
    });
    await capture.updateTechnicalBaseline({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      expectedConcurrencyToken: sealed.case.concurrencyToken,
      body: technicalBaselineV2BrakePadOnly(11),
    });
    const row = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(row.status).toBe('IN_PROGRESS');
    expect(row.readinessSnapshotVersion).toBe(0);
  });

  it('technical race mutation-first: seal conflicts after mutation wins', async () => {
    const { caseService, capture } = captureHarness(prisma);
    const orgId = await createOrg(prisma);
    const caseRow = await openTeslaCase(caseService, orgId);
    const t0 = caseRow.concurrencyToken!;
    const mutationStarted = deferred<void>();
    const releaseMutation = deferred<void>();
    setCaptureMutationTestCoordinator({
      onMutationLockAcquired: async () => {
        mutationStarted.resolve();
      },
      beforeMutationCommit: async () => {
        await releaseMutation.promise;
      },
    });
    const mutationPromise = capture.updateTechnicalBaseline({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      expectedConcurrencyToken: t0,
      body: technicalBaselineV2BrakePadOnly(10),
    });
    await mutationStarted.promise;
    const sealPromise = capture.sealReadiness({
      organizationId: orgId,
      caseId: caseRow.id,
      selectedProduct: ProductSlug.RENTAL,
      actorUserId: null,
      expectedConcurrencyToken: t0,
    });
    releaseMutation.resolve();
    const outcomes = await Promise.allSettled([mutationPromise, sealPromise]);
    setCaptureMutationTestCoordinator(null);
    const sealOutcome = outcomes[1];
    expect(sealOutcome?.status).toBe('rejected');
    expect((sealOutcome as PromiseRejectedResult).reason.code).toBe('ONBOARDING_CONCURRENCY_CONFLICT');
    const row = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(row.status).toBe('IN_PROGRESS');
    expect(row.concurrencyToken).not.toBe(t0);
  });

  it('technical race seal-first: mutation conflicts after seal wins', async () => {
    const { caseService, capture } = captureHarness(prisma);
    const orgId = await createOrg(prisma);
    const caseRow = await openTeslaCase(caseService, orgId);
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow.id },
      data: {
        draftTechnicalBaselineJson: technicalBaselineV2TeslaReady(10) as unknown as Prisma.InputJsonValue,
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    const t0 = caseRow.concurrencyToken!;
    const sealStarted = deferred<void>();
    const releaseSeal = deferred<void>();
    setCaptureMutationTestCoordinator({
      onSealLockAcquired: async () => {
        sealStarted.resolve();
      },
      beforeSealCommit: async () => {
        await releaseSeal.promise;
      },
    });
    const sealPromise = capture.sealReadiness({
      organizationId: orgId,
      caseId: caseRow.id,
      selectedProduct: ProductSlug.RENTAL,
      actorUserId: null,
      expectedConcurrencyToken: t0,
    });
    await sealStarted.promise;
    const mutationPromise = capture.updateTechnicalBaseline({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      expectedConcurrencyToken: t0,
      body: technicalBaselineV2BrakePadOnly(11),
    });
    releaseSeal.resolve();
    const outcomes = await Promise.allSettled([mutationPromise, sealPromise]);
    setCaptureMutationTestCoordinator(null);
    const mutationOutcome = outcomes[0];
    expect(mutationOutcome?.status).toBe('rejected');
    expect((mutationOutcome as PromiseRejectedResult).reason.code).toBe('ONBOARDING_CONCURRENCY_CONFLICT');
    const row = await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } });
    expect(row.status).toBe('READY_FOR_ACTIVATION');
    const snap = parseValidatedReadinessSnapshotV2(row);
    expect(snap.decision).toBe('READY');
  });

  it('admin race mutation-first and seal-first', async () => {
    const { caseService, capture } = captureHarness(prisma);
    const orgId = await createOrg(prisma);
    const caseRow = await openTeslaCase(caseService, orgId);
    const t0 = caseRow.concurrencyToken!;
    const adminBody = {
      version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
      vehicleName: 'Fleet-A',
      licensePlate: null,
      stationId: null,
      notes: null,
    };
    const mutationStarted = deferred<void>();
    const releaseMutation = deferred<void>();
    setCaptureMutationTestCoordinator({
      onMutationLockAcquired: async () => mutationStarted.resolve(),
      beforeMutationCommit: async () => releaseMutation.promise,
    });
    const adminPromise = capture.updateAdminBaseline({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      expectedConcurrencyToken: t0,
      body: adminBody,
    });
    await mutationStarted.promise;
    const sealPromise = capture.sealReadiness({
      organizationId: orgId,
      caseId: caseRow.id,
      selectedProduct: ProductSlug.RENTAL,
      actorUserId: null,
      expectedConcurrencyToken: t0,
    });
    releaseMutation.resolve();
    const outcomes = await Promise.allSettled([adminPromise, sealPromise]);
    setCaptureMutationTestCoordinator(null);
    expect(outcomes[1]?.status).toBe('rejected');

    const caseRow2 = await openTeslaCase(caseService, orgId);
    await prisma.vehicleOnboardingCase.update({
      where: { id: caseRow2.id },
      data: {
        draftTechnicalBaselineJson: technicalBaselineV2TeslaReady(10) as unknown as Prisma.InputJsonValue,
        draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      },
    });
    const t0b = caseRow2.concurrencyToken!;
    const sealStarted = deferred<void>();
    const releaseSeal = deferred<void>();
    setCaptureMutationTestCoordinator({
      onSealLockAcquired: async () => sealStarted.resolve(),
      beforeSealCommit: async () => releaseSeal.promise,
    });
    const sealPromiseB = capture.sealReadiness({
      organizationId: orgId,
      caseId: caseRow2.id,
      selectedProduct: ProductSlug.RENTAL,
      actorUserId: null,
      expectedConcurrencyToken: t0b,
    });
    await sealStarted.promise;
    const adminPromiseB = capture.updateAdminBaseline({
      organizationId: orgId,
      caseId: caseRow2.id,
      actorUserId: null,
      expectedConcurrencyToken: t0b,
      body: {
        version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
        vehicleName: 'Fleet-B',
        licensePlate: null,
        stationId: null,
        notes: null,
      },
    });
    releaseSeal.resolve();
    const outcomes2 = await Promise.allSettled([adminPromiseB, sealPromiseB]);
    setCaptureMutationTestCoordinator(null);
    expect(outcomes2[0]?.status).toBe('rejected');
  });

  it('audit fires only after successful semantic mutation', async () => {
    const base = createVo4ReadinessTestHarness(prisma);
    let auditCount = 0;
    let lastAudit: AuditContext | undefined;
    const capture = new VehicleOnboardingCaptureService(prisma as any, base.readinessService, {
      record: async (ctx: AuditContext) => {
        auditCount += 1;
        lastAudit = ctx;
        return 'audit-id';
      },
    } as any);
    const orgId = await createOrg(prisma);
    const caseRow = await openTeslaCase(base.caseService, orgId);
    const token = caseRow.concurrencyToken!;
    await expect(
      capture.updateTechnicalBaseline({
        organizationId: orgId,
        caseId: caseRow.id,
        actorUserId: null,
        expectedConcurrencyToken: 'wrong',
        body: technicalBaselineV2BrakePadOnly(10),
      }),
    ).rejects.toMatchObject({ code: 'ONBOARDING_CONCURRENCY_CONFLICT' });
    expect(auditCount).toBe(0);
    await capture.updateTechnicalBaseline({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      expectedConcurrencyToken: token,
      body: technicalBaselineV2BrakePadOnly(10),
    });
    expect(auditCount).toBe(1);
    const noopToken = (await prisma.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseRow.id } }))
      .concurrencyToken!;
    await capture.updateTechnicalBaseline({
      organizationId: orgId,
      caseId: caseRow.id,
      actorUserId: null,
      expectedConcurrencyToken: noopToken,
      body: technicalBaselineV2BrakePadOnly(10),
    });
    expect(auditCount).toBe(1);
    expect(lastAudit).toBeDefined();
    expect(lastAudit!.entity).toBe('ADMIN_OPERATION');
    expect(lastAudit!.entityId).toBe(caseRow.id);
    expect(lastAudit!.metaJson).toMatchObject({
      domain: 'VEHICLE_ONBOARDING',
      resourceType: 'VEHICLE_ONBOARDING_CASE',
      caseId: caseRow.id,
    });
  });

  it('validates list query at boundary', () => {
    expect(() => parseCaseListQuery({ status: 'NOT_A_STATUS' })).toThrow(VehicleOnboardingError);
    expect(() => parseCaseListQuery({ limit: 'NaN' })).toThrow(VehicleOnboardingError);
    expect(parseCaseListQuery({ limit: '25' }).limit).toBe(25);
  });
});
