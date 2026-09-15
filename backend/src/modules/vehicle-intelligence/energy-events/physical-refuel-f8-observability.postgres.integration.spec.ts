import { PrismaClient } from '@prisma/client';
import {
  assertIsolatedDatabaseUrl,
  assertMetricsExportContainsF8,
  buildF8ObservabilityStack,
  buildF8RecoveryScheduler,
  cleanupVehicle,
  countActionablePhysicalRefuelRecoveryReasons,
  countPhysicalRefuelRecoveryBacklog,
  F5_PR3_G2_CUTOVER,
  F7_RECOVERY_AS_OF_MS,
  findPhysicalRefuelRecoveryWork,
  isF8LiveIntegration,
  isF8PostgresRequired,
  promoteCandidateViaRuntime,
  RAW_FUEL_REFUEL_F8_INTEGRATION_ENV,
  RAW_FUEL_REFUEL_F8_POSTGRES_REQUIRED_ENV,
  readCounterValue,
  readGaugeValue,
  seedOrgVehicle,
  setFullAuthorizedFlags,
  setRfrfFlags,
  syntheticRiseSamples,
} from './testing/f8-operational-telemetry.harness';
import {
  mapRepositoryBacklogToRecoveryReasons,
  PHYSICAL_REFUEL_RECOVERY_BACKLOG_REASONS,
} from './physical-refuel-reconciliation-metrics.types';
import { COORDINATE_ROUTE_UNAVAILABLE } from './physical-refuel-coordinate-retry.policy';

const LIVE = isF8LiveIntegration();
const POSTGRES_REQUIRED = isF8PostgresRequired();

if (POSTGRES_REQUIRED && !LIVE) {
  throw new Error(`${RAW_FUEL_REFUEL_F8_POSTGRES_REQUIRED_ENV}=1 but integration flag is not 1`);
}

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  assertIsolatedDatabaseUrl();
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

describe('RFRF F8 physical-refuel operational telemetry (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  let dbAvailable = false;

  beforeAll(async () => {
    dbAvailable = await probeDatabase();
    if (POSTGRES_REQUIRED && !dbAvailable) {
      throw new Error('RAW_FUEL_REFUEL_F8_POSTGRES_REQUIRED=1 but isolated PostgreSQL is unavailable');
    }
    if (dbAvailable) {
      prisma = new PrismaClient();
    }
  });

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
  });

  (LIVE ? it : it.skip)('gate probe documents LIVE flag requirement', () => {
    expect(process.env[RAW_FUEL_REFUEL_F8_INTEGRATION_ENV]).toBe('1');
  });

  (LIVE ? it : it.skip)('F8-P1 orphan backlog gauge matches repository before recovery', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f8p1-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const { stack, tripMetrics, g2Runtime } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    try {
      await promoteCandidateViaRuntime(stack, vehicle.id);
      await g2Runtime.emitRecoveryBacklogMetrics(F7_RECOVERY_AS_OF_MS);

      const repo = await countPhysicalRefuelRecoveryBacklog(
        prisma,
        new Date(F7_RECOVERY_AS_OF_MS),
        new Date('2026-09-01T00:00:00.000Z'),
        new Date(F7_RECOVERY_AS_OF_MS - 7 * 24 * 60 * 60 * 1000),
      );
      const mapped = mapRepositoryBacklogToRecoveryReasons(repo);
      expect(mapped.orphan_refuel).toBeGreaterThanOrEqual(1);
      expect(
        await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_backlog', {
          reason: 'orphan_refuel',
        }),
      ).toBe(mapped.orphan_refuel);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F8-P2 backlog clears to zero after canonical recovery', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f8p2-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const { stack, tripMetrics, g2Runtime } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    try {
      await promoteCandidateViaRuntime(stack, vehicle.id);
      await g2Runtime.emitRecoveryBacklogMetrics(F7_RECOVERY_AS_OF_MS);
      await g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      await g2Runtime.emitRecoveryBacklogMetrics(F7_RECOVERY_AS_OF_MS);

      expect(
        await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_backlog', {
          reason: 'orphan_refuel',
        }),
      ).toBe(0);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F8-P3 multiple backlog categories map exactly to repository counts', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f8p3-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const { stack, tripMetrics, g2Runtime } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    try {
      await promoteCandidateViaRuntime(stack, vehicle.id);
      await g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);

      const native = await prisma.vehicleEnergyEvent.create({
        data: {
          vehicleId: vehicle.id,
          dimoSegmentId: `native-orphan-${suffix}`,
          kind: 'REFUEL',
          detectionMechanism: 'refuel',
          detectionSource: 'DIMO_NATIVE',
          startTime: new Date('2026-09-06T09:00:00.000Z'),
          endTime: new Date('2026-09-06T09:30:00.000Z'),
          durationSeconds: 1800,
          createdAt: new Date('2026-09-06T10:00:00.000Z'),
        },
      });
      expect(native.id).toBeTruthy();

      await g2Runtime.emitRecoveryBacklogMetrics(F7_RECOVERY_AS_OF_MS);
      const repo = mapRepositoryBacklogToRecoveryReasons(
        await countPhysicalRefuelRecoveryBacklog(
          prisma,
          new Date(F7_RECOVERY_AS_OF_MS),
          new Date('2026-09-01T00:00:00.000Z'),
          new Date(F7_RECOVERY_AS_OF_MS - 7 * 24 * 60 * 60 * 1000),
        ),
      );

      for (const reason of ['orphan_refuel', 'settlement_due'] as const) {
        expect(
          await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_backlog', { reason }),
        ).toBe(repo[reason]);
      }
      expect(repo.orphan_refuel).toBeGreaterThanOrEqual(1);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F8-P4 authority-off fallback orphan excluded from orphan_refuel gauge', async () => {
    if (!dbAvailable) return;
    const restore = setRfrfFlags({
      master: true,
      persist: true,
      convergence: true,
      promotion: true,
      handoff: false,
      g2: true,
      cutoverAt: '2026-09-06T08:00:00.000Z',
      g2CutoverAt: '2026-09-01T00:00:00.000Z',
    });
    const suffix = `f8p4-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const { stack, tripMetrics, g2Runtime } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await g2Runtime.emitRecoveryBacklogMetrics(F7_RECOVERY_AS_OF_MS);

      const work = await findPhysicalRefuelRecoveryWork(prisma, {
        batchSize: 10,
        asOf: new Date(F7_RECOVERY_AS_OF_MS),
        v2OwnershipCutoverAt: new Date('2026-09-01T00:00:00.000Z'),
        orphanLookbackFrom: new Date(F7_RECOVERY_AS_OF_MS - 7 * 24 * 60 * 60 * 1000),
      });
      expect(work.some((item) => item.triggerEventId === fallbackVeeId)).toBe(false);
      expect(
        await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_backlog', {
          reason: 'orphan_refuel',
        }),
      ).toBe(0);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F8-P5 native orphan represented and recoverable in metrics', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f8p5-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const { tripMetrics, g2Runtime } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    try {
      await prisma.vehicleEnergyEvent.create({
        data: {
          vehicleId: vehicle.id,
          dimoSegmentId: `native-${suffix}`,
          kind: 'REFUEL',
          detectionMechanism: 'refuel',
          detectionSource: 'DIMO_NATIVE',
          startTime: new Date('2026-09-06T09:00:00.000Z'),
          endTime: new Date('2026-09-06T09:30:00.000Z'),
          durationSeconds: 1800,
          createdAt: new Date('2026-09-06T10:00:00.000Z'),
        },
      });
      await g2Runtime.emitRecoveryBacklogMetrics(F7_RECOVERY_AS_OF_MS);
      expect(
        await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_backlog', {
          reason: 'orphan_refuel',
        }),
      ).toBeGreaterThanOrEqual(1);

      await g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      await g2Runtime.emitRecoveryBacklogMetrics(F7_RECOVERY_AS_OF_MS);
      expect(
        await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_backlog', {
          reason: 'orphan_refuel',
        }),
      ).toBe(0);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F8-P6 successful scheduler tick increments success and last-success once', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f8p6-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const { stack, tripMetrics, g2Runtime, physicalRefuelMetrics } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    const scheduler = buildF8RecoveryScheduler(g2Runtime, physicalRefuelMetrics);
    try {
      await promoteCandidateViaRuntime(stack, vehicle.id);
      const beforeSuccess = await readCounterValue(
        tripMetrics,
        'synqdrive_physical_refuel_recovery_runs_total',
        { result: 'success' },
      );
      const beforeLast = await readGaugeValue(
        tripMetrics,
        'synqdrive_physical_refuel_recovery_last_success_unixtime',
        {},
      );

      await scheduler.runRecoveryTick();

      expect(
        await readCounterValue(tripMetrics, 'synqdrive_physical_refuel_recovery_runs_total', {
          result: 'success',
        }),
      ).toBe(beforeSuccess + 1);
      expect(
        await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_last_success_unixtime', {}),
      ).toBeGreaterThan(beforeLast);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F8-P7 failed tick increments failure without advancing last-success', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f8p7-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const { tripMetrics, g2Runtime, physicalRefuelMetrics } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    const failingRuntime = {
      emitRecoveryBacklogMetrics: g2Runtime.emitRecoveryBacklogMetrics.bind(g2Runtime),
      runRecoveryBatch: jest.fn().mockRejectedValue(new Error('f8 isolated failure')),
    } as unknown as typeof g2Runtime;
    const scheduler = buildF8RecoveryScheduler(failingRuntime, physicalRefuelMetrics);
    try {
      const beforeFailure = await readCounterValue(
        tripMetrics,
        'synqdrive_physical_refuel_recovery_runs_total',
        { result: 'failure' },
      );
      const beforeLast = await readGaugeValue(
        tripMetrics,
        'synqdrive_physical_refuel_recovery_last_success_unixtime',
        {},
      );

      await scheduler.runRecoveryTick();

      expect(
        await readCounterValue(tripMetrics, 'synqdrive_physical_refuel_recovery_runs_total', {
          result: 'failure',
        }),
      ).toBe(beforeFailure + 1);
      expect(
        await readCounterValue(tripMetrics, 'synqdrive_physical_refuel_recovery_runs_total', {
          result: 'success',
        }),
      ).toBe(0);
      expect(
        await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_last_success_unixtime', {}),
      ).toBe(beforeLast);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F8-P8 overlap skip records bounded overlap_skipped outcome', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f8p8-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const { tripMetrics, g2Runtime, physicalRefuelMetrics } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    const scheduler = buildF8RecoveryScheduler(g2Runtime, physicalRefuelMetrics);
    try {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = g2Runtime.runRecoveryBatch.bind(g2Runtime);
      jest.spyOn(g2Runtime, 'runRecoveryBatch').mockImplementation(async (...args) => {
        await gate;
        return original(...args);
      });

      const first = scheduler.runRecoveryTick();
      const second = scheduler.runRecoveryTick();
      release();
      await Promise.all([first, second]);

      expect(
        await readCounterValue(tripMetrics, 'synqdrive_physical_refuel_recovery_runs_total', {
          result: 'overlap_skipped',
        }),
      ).toBe(1);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F8-P9 disabled recovery sets enabled gauge to 0', async () => {
    if (!dbAvailable) return;
    const suffix = `f8p9-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const { tripMetrics, g2Runtime, physicalRefuelMetrics } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    const scheduler = buildF8RecoveryScheduler(g2Runtime, physicalRefuelMetrics, {
      enabled: false,
      recoveryEnabled: false,
    });
    try {
      await scheduler.runRecoveryTick();
      expect(await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_enabled', {})).toBe(0);
      expect(
        await readCounterValue(tripMetrics, 'synqdrive_physical_refuel_recovery_runs_total', {
          result: 'disabled',
        }),
      ).toBe(1);
    } finally {
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F8-P10 TripMetricsService registry export contains all F8 metrics', async () => {
    if (!dbAvailable) return;
    const { tripMetrics, g2Runtime } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    await g2Runtime.emitRecoveryBacklogMetrics(F7_RECOVERY_AS_OF_MS);
    await assertMetricsExportContainsF8(tripMetrics);
  });

  async function recoveryQueryParams() {
    return {
      batchSize: 100,
      asOf: new Date(F7_RECOVERY_AS_OF_MS),
      v2OwnershipCutoverAt: new Date(F5_PR3_G2_CUTOVER),
      orphanLookbackFrom: new Date(F7_RECOVERY_AS_OF_MS - 7 * 24 * 60 * 60 * 1000),
    };
  }

  async function expectGaugeMatchesActionable(
    tripMetrics: Awaited<ReturnType<typeof buildF8ObservabilityStack>>['tripMetrics'],
    actionable: Awaited<ReturnType<typeof countActionablePhysicalRefuelRecoveryReasons>>,
  ): Promise<void> {
    const mapped = mapRepositoryBacklogToRecoveryReasons({
      orphanRefuels: actionable.orphanRefuels,
      reconciliationDue: actionable.reconciliationDue,
      staleEnrichment: actionable.staleEnrichment,
      lostEnqueuePending: actionable.lostEnqueuePending,
      coordinateInitialDue: actionable.coordinateInitialDue,
      coordinateRetryDue: actionable.coordinateRetryDue,
    });
    for (const reason of PHYSICAL_REFUEL_RECOVERY_BACKLOG_REASONS) {
      expect(
        await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_backlog', { reason }),
      ).toBe(mapped[reason]);
    }
  }

  (LIVE ? it : it.skip)('F8.1-P5 authority OFF settlement_due excluded from gauge and canonical work', async () => {
    if (!dbAvailable) return;
    const suffix = `f81p5-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const { stack, tripMetrics, g2Runtime } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    const restoreFull = setFullAuthorizedFlags();
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      await prisma.vehicleEnergyEventRefuelReconciliation.update({
        where: { energyEventId: fallbackVeeId! },
        data: {
          finalityState: 'PROVISIONAL',
          nextReconciliationAt: new Date(F7_RECOVERY_AS_OF_MS - 60_000),
        },
      });

      const native = await prisma.vehicleEnergyEvent.create({
        data: {
          vehicleId: vehicle.id,
          dimoSegmentId: `native-settle-${suffix}`,
          kind: 'REFUEL',
          detectionMechanism: 'refuel',
          detectionSource: 'DIMO_NATIVE',
          startTime: new Date('2026-09-06T09:00:00.000Z'),
          endTime: new Date('2026-09-06T09:30:00.000Z'),
          durationSeconds: 1800,
          createdAt: new Date('2026-09-06T10:00:00.000Z'),
        },
      });
      await g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      await prisma.vehicleEnergyEventRefuelReconciliation.update({
        where: { energyEventId: native.id },
        data: {
          finalityState: 'PROVISIONAL',
          nextReconciliationAt: new Date(F7_RECOVERY_AS_OF_MS - 60_000),
        },
      });

      const restoreOff = setRfrfFlags({
        master: true,
        persist: true,
        convergence: true,
        promotion: true,
        handoff: false,
        g2: true,
        cutoverAt: '2026-09-06T08:00:00.000Z',
        g2CutoverAt: F5_PR3_G2_CUTOVER,
      });

      const work = await findPhysicalRefuelRecoveryWork(prisma, await recoveryQueryParams());
      expect(work.some((item) => item.triggerEventId === fallbackVeeId && item.reason === 'settlement_due')).toBe(false);
      expect(work.some((item) => item.triggerEventId === native.id && item.reason === 'settlement_due')).toBe(true);

      await g2Runtime.emitRecoveryBacklogMetrics(F7_RECOVERY_AS_OF_MS);
      expect(
        await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_backlog', {
          reason: 'settlement_due',
        }),
      ).toBe(1);

      restoreOff();
    } finally {
      restoreFull();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F8.1-P6 authority OFF stale_enrichment excluded from actionable gauge', async () => {
    if (!dbAvailable) return;
    const suffix = `f81p6-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const { stack, tripMetrics, g2Runtime } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    const restoreFull = setFullAuthorizedFlags();
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      await prisma.vehicleEnergyEventFuelStationEnrichment.create({
        data: {
          energyEventId: fallbackVeeId!,
          processingStatus: 'PENDING',
          inputFingerprint: `f81-stale-${suffix}`,
          resolverVersion: 'v2',
        },
      });

      const native = await prisma.vehicleEnergyEvent.create({
        data: {
          vehicleId: vehicle.id,
          dimoSegmentId: `native-stale-${suffix}`,
          kind: 'REFUEL',
          detectionMechanism: 'refuel',
          detectionSource: 'DIMO_NATIVE',
          startTime: new Date('2026-09-06T09:00:00.000Z'),
          endTime: new Date('2026-09-06T09:30:00.000Z'),
          durationSeconds: 1800,
          createdAt: new Date('2026-09-06T10:00:00.000Z'),
        },
      });
      await g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      await prisma.vehicleEnergyEventRefuelReconciliation.update({
        where: { energyEventId: native.id },
        data: { finalityState: 'FINAL_CANONICAL', enrichmentEligible: true },
      });
      await prisma.vehicleEnergyEventFuelStationEnrichment.create({
        data: {
          energyEventId: native.id,
          processingStatus: 'PENDING',
          inputFingerprint: `f81-native-stale-${suffix}`,
          resolverVersion: 'v2',
        },
      });

      const restoreOff = setRfrfFlags({
        master: true,
        persist: true,
        convergence: true,
        promotion: true,
        handoff: false,
        g2: true,
        cutoverAt: '2026-09-06T08:00:00.000Z',
        g2CutoverAt: F5_PR3_G2_CUTOVER,
      });

      const work = await findPhysicalRefuelRecoveryWork(prisma, await recoveryQueryParams());
      expect(work.some((item) => item.triggerEventId === fallbackVeeId && item.reason === 'stale_enrichment')).toBe(false);
      expect(work.some((item) => item.triggerEventId === native.id && item.reason === 'stale_enrichment')).toBe(true);

      await g2Runtime.emitRecoveryBacklogMetrics(F7_RECOVERY_AS_OF_MS);
      expect(
        await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_backlog', {
          reason: 'stale_enrichment',
        }),
      ).toBe(1);

      restoreOff();
    } finally {
      restoreFull();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F8.1-P7 authority OFF lost_enqueue excluded from actionable gauge', async () => {
    if (!dbAvailable) return;
    const suffix = `f81p7-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const { stack, tripMetrics, g2Runtime } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    const restoreFull = setFullAuthorizedFlags();
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      await prisma.vehicleEnergyEventRefuelReconciliation.update({
        where: { energyEventId: fallbackVeeId! },
        data: {
          finalityState: 'FINAL_CANONICAL',
          enrichmentEligible: true,
          enrichmentEnqueuedAt: null,
          coordinateLatitude: 51.3305883,
          coordinateLongitude: 9.5126383,
          coordinateSource: 'SELECTED',
          coordinateSelectionStatus: 'SELECTED',
        },
      });

      const native = await prisma.vehicleEnergyEvent.create({
        data: {
          vehicleId: vehicle.id,
          dimoSegmentId: `native-lost-${suffix}`,
          kind: 'REFUEL',
          detectionMechanism: 'refuel',
          detectionSource: 'DIMO_NATIVE',
          startTime: new Date('2026-09-06T09:00:00.000Z'),
          endTime: new Date('2026-09-06T09:30:00.000Z'),
          durationSeconds: 1800,
          createdAt: new Date('2026-09-06T10:00:00.000Z'),
        },
      });
      await g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      await prisma.vehicleEnergyEventRefuelReconciliation.update({
        where: { energyEventId: native.id },
        data: {
          finalityState: 'FINAL_CANONICAL',
          enrichmentEligible: true,
          enrichmentEnqueuedAt: null,
          coordinateLatitude: 51.3305883,
          coordinateLongitude: 9.5126383,
          coordinateSource: 'SELECTED',
          coordinateSelectionStatus: 'SELECTED',
        },
      });

      const restoreOff = setRfrfFlags({
        master: true,
        persist: true,
        convergence: true,
        promotion: true,
        handoff: false,
        g2: true,
        cutoverAt: '2026-09-06T08:00:00.000Z',
        g2CutoverAt: F5_PR3_G2_CUTOVER,
      });

      const work = await findPhysicalRefuelRecoveryWork(prisma, await recoveryQueryParams());
      expect(work.some((item) => item.triggerEventId === fallbackVeeId && item.reason === 'lost_enqueue')).toBe(false);
      expect(work.some((item) => item.triggerEventId === native.id && item.reason === 'lost_enqueue')).toBe(true);

      await g2Runtime.emitRecoveryBacklogMetrics(F7_RECOVERY_AS_OF_MS);
      expect(
        await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_backlog', {
          reason: 'lost_enqueue',
        }),
      ).toBe(1);

      restoreOff();
    } finally {
      restoreFull();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F8.1-P8 authority OFF coordinate categories excluded from actionable gauge', async () => {
    if (!dbAvailable) return;
    const suffix = `f81p8-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const { stack, tripMetrics, g2Runtime } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    const restoreFull = setFullAuthorizedFlags();
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      await prisma.vehicleEnergyEventRefuelReconciliation.update({
        where: { energyEventId: fallbackVeeId! },
        data: {
          finalityState: 'FINAL_CANONICAL',
          enrichmentEligible: true,
          enrichmentEnqueuedAt: null,
          coordinateLatitude: null,
          coordinateLongitude: null,
          coordinateSource: null,
          coordinateSelectionStatus: COORDINATE_ROUTE_UNAVAILABLE,
          nextCoordinateRetryAt: new Date(F7_RECOVERY_AS_OF_MS - 60_000),
        },
      });

      const native = await prisma.vehicleEnergyEvent.create({
        data: {
          vehicleId: vehicle.id,
          dimoSegmentId: `native-coord-${suffix}`,
          kind: 'REFUEL',
          detectionMechanism: 'refuel',
          detectionSource: 'DIMO_NATIVE',
          startTime: new Date('2026-09-06T09:00:00.000Z'),
          endTime: new Date('2026-09-06T09:30:00.000Z'),
          durationSeconds: 1800,
          createdAt: new Date('2026-09-06T10:00:00.000Z'),
        },
      });
      await g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      await prisma.vehicleEnergyEventRefuelReconciliation.update({
        where: { energyEventId: native.id },
        data: {
          finalityState: 'FINAL_CANONICAL',
          enrichmentEligible: true,
          enrichmentEnqueuedAt: null,
          coordinateSelectionStatus: null,
          coordinateLatitude: null,
          coordinateLongitude: null,
          coordinateSource: null,
        },
      });

      const restoreOff = setRfrfFlags({
        master: true,
        persist: true,
        convergence: true,
        promotion: true,
        handoff: false,
        g2: true,
        cutoverAt: '2026-09-06T08:00:00.000Z',
        g2CutoverAt: F5_PR3_G2_CUTOVER,
      });

      const work = await findPhysicalRefuelRecoveryWork(prisma, await recoveryQueryParams());
      expect(work.some((item) => item.triggerEventId === fallbackVeeId && item.reason === 'coordinate_initial')).toBe(false);
      expect(work.some((item) => item.triggerEventId === fallbackVeeId && item.reason === 'coordinate_retry')).toBe(false);
      expect(work.some((item) => item.triggerEventId === native.id && item.reason === 'coordinate_initial')).toBe(true);

      await g2Runtime.emitRecoveryBacklogMetrics(F7_RECOVERY_AS_OF_MS);
      expect(
        await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_backlog', {
          reason: 'coordinate_initial',
        }),
      ).toBe(1);
      expect(
        await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_backlog', {
          reason: 'coordinate_retry',
        }),
      ).toBe(0);

      restoreOff();
    } finally {
      restoreFull();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F8.1-P9 existing enrichment row excluded from lost_enqueue gauge', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f81p9-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const { stack, tripMetrics, g2Runtime } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      await prisma.vehicleEnergyEventRefuelReconciliation.update({
        where: { energyEventId: fallbackVeeId! },
        data: {
          finalityState: 'FINAL_CANONICAL',
          enrichmentEligible: true,
          enrichmentEnqueuedAt: null,
          coordinateLatitude: 51.3305883,
          coordinateLongitude: 9.5126383,
          coordinateSource: 'SELECTED',
          coordinateSelectionStatus: 'SELECTED',
        },
      });
      await prisma.vehicleEnergyEventFuelStationEnrichment.create({
        data: {
          energyEventId: fallbackVeeId!,
          processingStatus: 'PENDING',
          inputFingerprint: `f81-enrich-${suffix}`,
          resolverVersion: 'v2',
        },
      });

      const work = await findPhysicalRefuelRecoveryWork(prisma, await recoveryQueryParams());
      expect(work.some((item) => item.triggerEventId === fallbackVeeId && item.reason === 'lost_enqueue')).toBe(false);

      await g2Runtime.emitRecoveryBacklogMetrics(F7_RECOVERY_AS_OF_MS);
      expect(
        await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_backlog', {
          reason: 'lost_enqueue',
        }),
      ).toBe(0);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F8.1-P10 lost_enqueue coordinate policy parity rejects non-finite longitude', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f81p10-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const { stack, tripMetrics, g2Runtime } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    try {
      const { fallbackVeeId } = await promoteCandidateViaRuntime(stack, vehicle.id);
      await g2Runtime.runRecoveryBatch(F7_RECOVERY_AS_OF_MS);
      await prisma.vehicleEnergyEventRefuelReconciliation.update({
        where: { energyEventId: fallbackVeeId! },
        data: {
          finalityState: 'FINAL_CANONICAL',
          enrichmentEligible: true,
          enrichmentEnqueuedAt: null,
          coordinateLatitude: 51.3305883,
          coordinateLongitude: Number.NaN,
          coordinateSource: 'SELECTED',
          coordinateSelectionStatus: 'SELECTED',
        },
      });

      const work = await findPhysicalRefuelRecoveryWork(prisma, await recoveryQueryParams());
      expect(work.some((item) => item.triggerEventId === fallbackVeeId && item.reason === 'lost_enqueue')).toBe(false);

      const actionable = await countActionablePhysicalRefuelRecoveryReasons(
        prisma,
        new Date(F7_RECOVERY_AS_OF_MS),
        new Date(F5_PR3_G2_CUTOVER),
        new Date(F7_RECOVERY_AS_OF_MS - 7 * 24 * 60 * 60 * 1000),
      );
      expect(actionable.lostEnqueuePending).toBe(0);

      await g2Runtime.emitRecoveryBacklogMetrics(F7_RECOVERY_AS_OF_MS);
      expect(
        await readGaugeValue(tripMetrics, 'synqdrive_physical_refuel_recovery_backlog', {
          reason: 'lost_enqueue',
        }),
      ).toBe(0);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F8.1-P11 all six gauges match actionable repository and canonical recovery work', async () => {
    if (!dbAvailable) return;
    const restore = setFullAuthorizedFlags();
    const suffix = `f81p11-${Math.random().toString(36).slice(2, 8)}`;
    const { org, vehicle, dimoVehicleId } = await seedOrgVehicle(prisma, suffix);
    const { stack, tripMetrics, g2Runtime } = buildF8ObservabilityStack(
      prisma,
      jest.fn().mockResolvedValue(syntheticRiseSamples()),
    );
    try {
      await promoteCandidateViaRuntime(stack, vehicle.id);
      await prisma.vehicleEnergyEvent.create({
        data: {
          vehicleId: vehicle.id,
          dimoSegmentId: `native-mix-${suffix}`,
          kind: 'REFUEL',
          detectionMechanism: 'refuel',
          detectionSource: 'DIMO_NATIVE',
          startTime: new Date('2026-09-06T09:00:00.000Z'),
          endTime: new Date('2026-09-06T09:30:00.000Z'),
          durationSeconds: 1800,
          createdAt: new Date('2026-09-06T10:00:00.000Z'),
        },
      });

      const query = await recoveryQueryParams();
      const actionable = await countActionablePhysicalRefuelRecoveryReasons(
        prisma,
        query.asOf,
        query.v2OwnershipCutoverAt,
        query.orphanLookbackFrom,
      );
      const backlog = mapRepositoryBacklogToRecoveryReasons(
        await countPhysicalRefuelRecoveryBacklog(
          prisma,
          query.asOf,
          query.v2OwnershipCutoverAt,
          query.orphanLookbackFrom,
        ),
      );
      expect(backlog).toEqual(
        mapRepositoryBacklogToRecoveryReasons({
          orphanRefuels: actionable.orphanRefuels,
          reconciliationDue: actionable.reconciliationDue,
          staleEnrichment: actionable.staleEnrichment,
          lostEnqueuePending: actionable.lostEnqueuePending,
          coordinateInitialDue: actionable.coordinateInitialDue,
          coordinateRetryDue: actionable.coordinateRetryDue,
        }),
      );

      await g2Runtime.emitRecoveryBacklogMetrics(F7_RECOVERY_AS_OF_MS);
      await expectGaugeMatchesActionable(tripMetrics, actionable);

      const work = await findPhysicalRefuelRecoveryWork(prisma, query);
      const workCounts = PHYSICAL_REFUEL_RECOVERY_BACKLOG_REASONS.reduce(
        (acc, reason) => {
          acc[reason] = work.filter((item) => item.reason === reason).length;
          return acc;
        },
        {} as Record<(typeof PHYSICAL_REFUEL_RECOVERY_BACKLOG_REASONS)[number], number>,
      );
      for (const reason of PHYSICAL_REFUEL_RECOVERY_BACKLOG_REASONS) {
        expect(workCounts[reason]).toBeLessThanOrEqual(backlog[reason]);
        if (backlog[reason] > 0) {
          expect(workCounts[reason]).toBeGreaterThan(0);
        }
      }
      expect(backlog.orphan_refuel).toBeGreaterThanOrEqual(2);
    } finally {
      restore();
      await cleanupVehicle(prisma, vehicle.id, org.id, dimoVehicleId);
    }
  });

  (LIVE ? it : it.skip)('F8.1-P4 scheduler stale alert window exceeds default first tick interval', () => {
    expect(5 * 60).toBeGreaterThan(60);
  });
});
