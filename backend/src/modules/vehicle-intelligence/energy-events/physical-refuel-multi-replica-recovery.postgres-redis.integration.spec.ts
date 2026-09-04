import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import {
  buildFuelStationEnrichmentInputFingerprint,
  buildFuelStationEnrichmentJobIdempotencyKey,
} from '../fuel-stations/enrichment/fuel-station-enrichment-fingerprint.util';
import { sanitizeBullMqJobId } from '@shared/queue/bullmq-job-id.sanitizer';
import { PhysicalRefuelReconciliationRecoveryScheduler } from '@workers/schedulers/physical-refuel-reconciliation-recovery.scheduler';
import {
  buildG21dFinalDatabaseUrl,
  cleanupG21dFinalSeed,
  createIsolatedTestQueue,
  createPhysicalRefuelConfig,
  createProducerService,
  createRuntimeService,
  drainTestQueue,
  probePostgresDatabase,
  probeRedis,
  proveIsolatedNonProductionInfra,
  seedLostEnqueueScenario,
} from './testing/physical-refuel-g21d-final-integration.harness';

const LIVE = process.env.PHYSICAL_REFUEL_MULTI_REPLICA_INTEGRATION === '1';

function deterministicJobId(energyEventId: string): string {
  const fingerprint = buildFuelStationEnrichmentInputFingerprint({
    energyEventId,
    latitude: 51.3305883,
    longitude: 9.5126383,
  });
  const idempotencyKey = buildFuelStationEnrichmentJobIdempotencyKey({
    energyEventId,
    inputFingerprint: fingerprint,
  });
  return sanitizeBullMqJobId({ namespace: 'refuel-station', key: idempotencyKey });
}

(LIVE ? describe : describe.skip)(
  'Physical refuel multi-replica recovery integration (isolated Postgres + Redis)',
  () => {
    let prisma: PrismaClient;
    let queue: Queue;
    let infraOk = false;

    beforeAll(async () => {
      process.env.DATABASE_URL = process.env.DATABASE_URL ?? buildG21dFinalDatabaseUrl();
      proveIsolatedNonProductionInfra();
      infraOk = (await probePostgresDatabase()) && (await probeRedis());
      if (!infraOk) {
        throw new Error(
          'PHYSICAL_REFUEL_MULTI_REPLICA_INTEGRATION=1 requires isolated Postgres and Redis',
        );
      }
      prisma = new PrismaClient();
      RuntimeStatusRegistry.setWorkersEnabled(true);
      queue = createIsolatedTestQueue('multi-replica');
    }, 60_000);

    afterAll(async () => {
      if (queue) await drainTestQueue(queue).catch(() => undefined);
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('FULL_MULTI_REPLICA_RECOVERY_E2E: same vehicle converges to one logical BullMQ job', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedLostEnqueueScenario(prisma, `e2e-${suffix}`);
      const jobId = deterministicJobId(seed.energyEventId);

      const producerA = createProducerService(queue, prisma);
      const producerB = createProducerService(queue, prisma);
      const runtimeA = createRuntimeService(prisma, producerA);
      const runtimeB = createRuntimeService(prisma, producerB);

      try {
        const [resultA, resultB] = await Promise.all([
          runtimeA.runRecoveryBatch(Date.parse('2026-09-03T00:00:00.000Z')),
          runtimeB.runRecoveryBatch(Date.parse('2026-09-03T00:00:00.000Z')),
        ]);

        const allEnqueued = [...resultA.enqueuedEventIds, ...resultB.enqueuedEventIds];
        expect(allEnqueued.filter((id) => id === seed.energyEventId).length).toBeLessThanOrEqual(1);
        expect(allEnqueued.length).toBeLessThanOrEqual(1);

        const reconciliation = await prisma.vehicleEnergyEventRefuelReconciliation.findUnique({
          where: { energyEventId: seed.energyEventId },
        });
        expect(reconciliation?.enrichmentEnqueuedAt).not.toBeNull();

        const job = await queue.getJob(jobId);
        expect(job).not.toBeNull();
        expect(await job!.getState()).not.toBe('failed');

        const jobCount = (await queue.getJobs(['waiting', 'delayed', 'active', 'prioritized', 'completed'])).filter(
          (row) => row.id === jobId,
        ).length;
        expect(jobCount).toBe(1);
      } finally {
        await cleanupG21dFinalSeed(prisma, seed.vehicleId, seed.organizationId);
      }
    });

    it('MULTI_REPLICA_RECOVERY: different vehicles progress independently', async () => {
      const suffixA = randomUUID().slice(0, 8);
      const suffixB = randomUUID().slice(0, 8);
      const seedA = await seedLostEnqueueScenario(prisma, `veh-a-${suffixA}`);
      const seedB = await seedLostEnqueueScenario(prisma, `veh-b-${suffixB}`);

      const runtime = createRuntimeService(prisma, createProducerService(queue, prisma));

      try {
        const result = await runtime.runRecoveryBatch(Date.parse('2026-09-03T00:00:00.000Z'));
        expect(result.processedVehicles).toBeGreaterThanOrEqual(2);
        expect(result.enqueuedEventIds).toEqual(
          expect.arrayContaining([seedA.energyEventId, seedB.energyEventId]),
        );

        const jobA = await queue.getJob(deterministicJobId(seedA.energyEventId));
        const jobB = await queue.getJob(deterministicJobId(seedB.energyEventId));
        expect(jobA).not.toBeNull();
        expect(jobB).not.toBeNull();
      } finally {
        await cleanupG21dFinalSeed(prisma, seedA.vehicleId, seedA.organizationId);
        await cleanupG21dFinalSeed(prisma, seedB.vehicleId, seedB.organizationId);
      }
    });

    it('MULTI_REPLICA_SCHEDULER: two scheduler instances scan same vehicle without duplicate enqueue', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedLostEnqueueScenario(prisma, `sched-${suffix}`);
      const producer = createProducerService(queue, prisma);
      const runtime = createRuntimeService(prisma, producer);
      const config = createPhysicalRefuelConfig();

      const schedulerA = new PhysicalRefuelReconciliationRecoveryScheduler(
        config as never,
        runtime,
      );
      const schedulerB = new PhysicalRefuelReconciliationRecoveryScheduler(
        config as never,
        runtime,
      );

      try {
        const [tickA, tickB] = await Promise.all([
          schedulerA.runRecoveryTick(),
          schedulerB.runRecoveryTick(),
        ]);

        expect(tickA + tickB).toBeGreaterThanOrEqual(1);

        const job = await queue.getJob(deterministicJobId(seed.energyEventId));
        expect(job).not.toBeNull();

        const reconciliation = await prisma.vehicleEnergyEventRefuelReconciliation.findUnique({
          where: { energyEventId: seed.energyEventId },
        });
        expect(reconciliation?.enrichmentEnqueuedAt).not.toBeNull();
      } finally {
        await cleanupG21dFinalSeed(prisma, seed.vehicleId, seed.organizationId);
      }
    });
  },
);
