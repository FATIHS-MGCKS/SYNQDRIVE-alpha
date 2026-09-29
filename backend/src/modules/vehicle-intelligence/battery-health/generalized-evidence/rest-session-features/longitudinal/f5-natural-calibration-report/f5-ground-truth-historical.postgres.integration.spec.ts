import { randomUUID } from 'crypto';
import {
  BatteryEvidenceScope,
  BatteryGroundTruthSourceAuthority,
  BatteryGroundTruthType,
  PrismaClient,
} from '@prisma/client';
import { filterAdmissibleGroundTruthAtAsOf } from './f5-ground-truth-correlation.policy';
import { loadGroundTruthRowsForF5Report } from './f5-ground-truth-correlation.queries';
import { assertTransactionReadOnly } from './f5-natural-calibration-report.service';
import { createGtOrgVehicle } from '../../../../ground-truth/ground-truth-postgres.fixture';

const integrationEnabled = process.env.BATTERY_F5_NATURAL_CALIBRATION_REPORT_INTEGRATION === '1';

function stableAdmissibleSnapshot(
  result: ReturnType<typeof filterAdmissibleGroundTruthAtAsOf>,
): string {
  return JSON.stringify({
    admissibleIds: result.admissible.map((r) => r.id),
    rejectedCrossScopeCount: result.rejectedCrossScopeCount,
    replacementBoundaryIds: [...result.replacementBoundariesByVehicle.values()].flatMap((b) =>
      b.map((x) => x.groundTruthEventId),
    ),
  });
}

(integrationEnabled ? describe : describe.skip)('F5 ground-truth historical asOf postgres G3.1', () => {
  let prisma: PrismaClient;
  const createdOrganizationIds: string[] = [];

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterEach(async () => {
    for (const organizationId of createdOrganizationIds) {
      await prisma.batteryGroundTruthRevocation.deleteMany({ where: { organizationId } });
      await prisma.batteryGroundTruthEvent.deleteMany({ where: { organizationId } });
      await prisma.vehicle.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    createdOrganizationIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createIsolatedOrgVehicle() {
    const ref = await createGtOrgVehicle(prisma);
    createdOrganizationIds.push(ref.organizationId);
    return ref;
  }

  async function loadF5LifecycleRows(
    asOf: Date,
    cohortVehicles: { organizationId: string; vehicleId: string }[],
  ) {
    return prisma.$transaction(async (tx) => {
      await assertTransactionReadOnly(tx as never);
      return loadGroundTruthRowsForF5Report(tx as never, { asOf, cohortVehicles });
    });
  }

  it('G3.1-A1/A2 — revocation after asOf visible at asOf; revocation before later asOf excludes row', async () => {
    const { organizationId, vehicleId } = await createIsolatedOrgVehicle();
    const gtId = randomUUID();
    const fingerprint = randomUUID().replace(/-/g, '');
    await prisma.batteryGroundTruthEvent.create({
      data: {
        id: gtId,
        organizationId,
        vehicleId,
        groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
        batteryScope: BatteryEvidenceScope.LV,
        effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
        verificationStatus: 'CONFIRMED',
        sourceContentFingerprint: fingerprint,
      },
    });

    const cohort = [{ organizationId, vehicleId }];
    const vehicleKeys = new Set([`${organizationId}::${vehicleId}`]);

    const june15 = new Date('2026-06-15T00:00:00.000Z');
    expect(
      filterAdmissibleGroundTruthAtAsOf(await loadF5LifecycleRows(june15, cohort), june15, vehicleKeys)
        .admissible,
    ).toHaveLength(1);

    await prisma.batteryGroundTruthRevocation.create({
      data: {
        organizationId,
        groundTruthEventId: gtId,
        reasonCode: 'OPERATOR_REVOKE',
        revokedAt: new Date('2026-06-20T00:00:00.000Z'),
      },
    });
    await prisma.batteryGroundTruthEvent.update({
      where: { id: gtId },
      data: { verificationStatus: 'REVOKED' },
    });

    expect(
      filterAdmissibleGroundTruthAtAsOf(await loadF5LifecycleRows(june15, cohort), june15, vehicleKeys)
        .admissible,
    ).toHaveLength(1);

    const june25 = new Date('2026-06-25T00:00:00.000Z');
    expect(
      filterAdmissibleGroundTruthAtAsOf(await loadF5LifecycleRows(june25, cohort), june25, vehicleKeys)
        .admissible,
    ).toHaveLength(0);
  });

  it('G3.1-A3/A4 — supersession after asOf leaves prior admissible; before later asOf excludes prior', async () => {
    const { organizationId, vehicleId } = await createIsolatedOrgVehicle();
    const priorId = randomUUID();
    const fp1 = randomUUID().replace(/-/g, '');
    await prisma.batteryGroundTruthEvent.create({
      data: {
        id: priorId,
        organizationId,
        vehicleId,
        groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
        batteryScope: BatteryEvidenceScope.LV,
        effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
        verificationStatus: 'CONFIRMED',
        sourceContentFingerprint: fp1,
      },
    });

    const cohort = [{ organizationId, vehicleId }];
    const vehicleKeys = new Set([`${organizationId}::${vehicleId}`]);

    const june15 = new Date('2026-06-15T00:00:00.000Z');
    expect(
      filterAdmissibleGroundTruthAtAsOf(await loadF5LifecycleRows(june15, cohort), june15, vehicleKeys)
        .admissible.map((r) => r.id),
    ).toEqual([priorId]);

    const successorId = randomUUID();
    await prisma.batteryGroundTruthEvent.create({
      data: {
        id: successorId,
        organizationId,
        vehicleId,
        groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
        batteryScope: BatteryEvidenceScope.LV,
        effectiveAt: new Date('2026-06-20T00:00:00.000Z'),
        createdAt: new Date('2026-06-20T00:00:00.000Z'),
        sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
        verificationStatus: 'CONFIRMED',
        sourceContentFingerprint: randomUUID().replace(/-/g, ''),
        supersedesGroundTruthEventId: priorId,
      },
    });
    await prisma.batteryGroundTruthEvent.update({
      where: { id: priorId },
      data: { verificationStatus: 'SUPERSEDED' },
    });

    expect(
      filterAdmissibleGroundTruthAtAsOf(await loadF5LifecycleRows(june15, cohort), june15, vehicleKeys)
        .admissible.map((r) => r.id),
    ).toEqual([priorId]);

    const june25 = new Date('2026-06-25T00:00:00.000Z');
    const admissible = filterAdmissibleGroundTruthAtAsOf(
      await loadF5LifecycleRows(june25, cohort),
      june25,
      vehicleKeys,
    ).admissible;
    expect(admissible.map((r) => r.id)).toEqual([successorId]);
  });

  it('G3.1-A5 — loadGroundTruthRowsForF5Report + filter yields deterministic admissible snapshot', async () => {
    const { organizationId, vehicleId } = await createIsolatedOrgVehicle();
    const gtId = randomUUID();
    await prisma.batteryGroundTruthEvent.create({
      data: {
        id: gtId,
        organizationId,
        vehicleId,
        groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
        batteryScope: BatteryEvidenceScope.LV,
        effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
        verificationStatus: 'CONFIRMED',
        sourceContentFingerprint: randomUUID().replace(/-/g, ''),
      },
    });
    const cohort = [{ organizationId, vehicleId }];
    const vehicleKeys = new Set([`${organizationId}::${vehicleId}`]);
    const asOf = new Date('2026-06-15T00:00:00.000Z');

    const rowsOnce = await loadF5LifecycleRows(asOf, cohort);
    const rowsTwice = await loadF5LifecycleRows(asOf, cohort);
    const snapOnce = stableAdmissibleSnapshot(
      filterAdmissibleGroundTruthAtAsOf(rowsOnce, asOf, vehicleKeys),
    );
    const snapTwice = stableAdmissibleSnapshot(
      filterAdmissibleGroundTruthAtAsOf(rowsTwice, asOf, vehicleKeys),
    );
    expect(snapTwice).toBe(snapOnce);
    expect(JSON.parse(snapOnce).admissibleIds).toEqual([gtId]);
  });

  it('G3.1-A6 — future-effective successor visible in lifecycle; neither GT admissible until effectiveAt', async () => {
    const { organizationId, vehicleId } = await createIsolatedOrgVehicle();
    const priorId = randomUUID();
    await prisma.batteryGroundTruthEvent.create({
      data: {
        id: priorId,
        organizationId,
        vehicleId,
        groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
        batteryScope: BatteryEvidenceScope.LV,
        effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
        verificationStatus: 'CONFIRMED',
        sourceContentFingerprint: randomUUID().replace(/-/g, ''),
      },
    });
    const successorId = randomUUID();
    await prisma.batteryGroundTruthEvent.create({
      data: {
        id: successorId,
        organizationId,
        vehicleId,
        groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
        batteryScope: BatteryEvidenceScope.LV,
        effectiveAt: new Date('2026-07-01T00:00:00.000Z'),
        createdAt: new Date('2026-06-20T00:00:00.000Z'),
        sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
        verificationStatus: 'CONFIRMED',
        sourceContentFingerprint: randomUUID().replace(/-/g, ''),
        supersedesGroundTruthEventId: priorId,
      },
    });
    await prisma.batteryGroundTruthEvent.update({
      where: { id: priorId },
      data: { verificationStatus: 'SUPERSEDED' },
    });

    const cohort = [{ organizationId, vehicleId }];
    const vehicleKeys = new Set([`${organizationId}::${vehicleId}`]);
    const asOf = new Date('2026-06-25T00:00:00.000Z');
    const lifecycleRows = await loadF5LifecycleRows(asOf, cohort);
    expect(lifecycleRows.map((r) => r.id).sort()).toEqual([priorId, successorId].sort());

    const mid = filterAdmissibleGroundTruthAtAsOf(lifecycleRows, asOf, vehicleKeys);
    expect(mid.admissible).toHaveLength(0);

    const afterEffective = new Date('2026-07-05T00:00:00.000Z');
    const laterRows = await loadF5LifecycleRows(afterEffective, cohort);
    const later = filterAdmissibleGroundTruthAtAsOf(laterRows, afterEffective, vehicleKeys);
    expect(later.admissible.map((r) => r.id)).toEqual([successorId]);
  });
});
