import { PrismaClient } from '@prisma/client';
import {
  assertIsolatedDatabaseUrl,
  assertMetricsExportContainsF8,
  buildF8ObservabilityStack,
  buildF8RecoveryScheduler,
  cleanupVehicle,
  countPhysicalRefuelRecoveryBacklog,
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
import { mapRepositoryBacklogToRecoveryReasons } from './physical-refuel-reconciliation-metrics.types';

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
});
