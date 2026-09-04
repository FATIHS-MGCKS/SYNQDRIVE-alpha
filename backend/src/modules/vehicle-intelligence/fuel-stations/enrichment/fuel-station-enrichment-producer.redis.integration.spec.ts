import { randomUUID } from 'crypto';
import { Queue, Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { FuelStationEnrichmentProducerService } from './fuel-station-enrichment-producer.service';
import {
  buildFuelStationEnrichmentInputFingerprint,
  buildFuelStationEnrichmentJobIdempotencyKey,
} from './fuel-station-enrichment-fingerprint.util';
import { FUEL_STATION_RESOLVER_VERSION } from '../fuel-station-location.types';
import {
  FUEL_STATION_ENRICHMENT_JOB_NAME,
  type RefuelStationEnrichmentJobData,
} from './fuel-station-enrichment.types';
import { sanitizeBullMqJobId } from '@shared/queue/bullmq-job-id.sanitizer';
import {
  buildG21dFinalDatabaseUrl,
  createFuelEnrichmentConfig,
  createIsolatedTestQueue,
  createProducerService,
  G21D_FINAL_V2_CUTOVER_ISO,
  probePostgresDatabase,
  probeRedis,
  proveIsolatedNonProductionInfra,
  redisConnectionOptions,
  seedLostEnqueueScenario,
  seedStaleEnrichmentScenario,
  cleanupG21dFinalSeed,
  drainTestQueue,
} from '../../energy-events/testing/physical-refuel-g21d-final-integration.harness';

const LIVE = process.env.PHYSICAL_REFUEL_BULLMQ_INTEGRATION === '1';

function postCutoverInput(energyEventId: string) {
  return {
    energyEventId,
    eventStartTime: new Date('2026-09-02T11:55:00.000Z'),
    eventObservedAt: new Date('2026-09-02T12:00:00.000Z'),
    v2OwnershipCutoverAt: new Date(G21D_FINAL_V2_CUTOVER_ISO),
    startLatitude: 51.3305883,
    startLongitude: 9.5126383,
    coordinateSource: 'SELECTED_FORECOURT_DWELL',
    physicalRefuelReconciliationV2: true,
  };
}

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

async function countLogicalJobs(queue: Queue, jobId: string): Promise<number> {
  const job = await queue.getJob(jobId);
  return job ? 1 : 0;
}

async function failJobOnce(queue: Queue, jobId: string, data: RefuelStationEnrichmentJobData): Promise<void> {
  const worker = new Worker(
    queue.name,
    async () => {
      throw new Error('integration-fail');
    },
    { connection: redisConnectionOptions(), prefix: queue.opts.prefix },
  );
  try {
    await queue.add(FUEL_STATION_ENRICHMENT_JOB_NAME, data, { jobId });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const job = await queue.getJob(jobId);
    expect(job).not.toBeNull();
    const state = await job!.getState();
    expect(state).toBe('failed');
  } finally {
    await worker.close();
  }
}

(LIVE ? describe : describe.skip)(
  'Fuel station enrichment producer BullMQ integration (isolated Redis)',
  () => {
    let prisma: PrismaClient;
    let queue: Queue;
    let service: FuelStationEnrichmentProducerService;
    let infraOk = false;

    beforeAll(async () => {
      process.env.DATABASE_URL = process.env.DATABASE_URL ?? buildG21dFinalDatabaseUrl();
      proveIsolatedNonProductionInfra();
      infraOk = (await probePostgresDatabase()) && (await probeRedis());
      if (!infraOk) {
        throw new Error('PHYSICAL_REFUEL_BULLMQ_INTEGRATION=1 requires isolated Postgres and Redis');
      }
      prisma = new PrismaClient();
      RuntimeStatusRegistry.setWorkersEnabled(true);
      queue = createIsolatedTestQueue('producer');
      service = createProducerService(queue, prisma);
    }, 60_000);

    afterAll(async () => {
      if (queue) await drainTestQueue(queue).catch(() => undefined);
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('BQ-REAL-1: WAITING dedupe — second producer call keeps one logical job', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedLostEnqueueScenario(prisma, `bq1-${suffix}`);
      try {
        const input = postCutoverInput(seed.energyEventId);
        const jobId = deterministicJobId(seed.energyEventId);

        const first = await service.enqueueAfterPersistOutcome(input);
        expect(first.status).toBe('enqueued');
        expect(first.jobId).toBe(jobId);

        const second = await service.enqueueAfterPersistOutcome(input);
        expect(second.status).toBe('deduped');
        expect(await countLogicalJobs(queue, jobId)).toBe(1);
      } finally {
        await cleanupG21dFinalSeed(prisma, seed.vehicleId, seed.organizationId);
      }
    });

    it('BQ-REAL-2: DELAYED dedupe — delayed job remains single logical job', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedLostEnqueueScenario(prisma, `bq2-${suffix}`);
      const jobId = deterministicJobId(seed.energyEventId);
      try {
        await queue.add(
          FUEL_STATION_ENRICHMENT_JOB_NAME,
          { energyEventId: seed.energyEventId },
          { jobId, delay: 60_000 },
        );

        const outcome = await service.enqueueAfterPersistOutcome(postCutoverInput(seed.energyEventId));
        expect(outcome.status).toBe('deduped');
        expect(await countLogicalJobs(queue, jobId)).toBe(1);
        const state = await (await queue.getJob(jobId))!.getState();
        expect(state).toBe('delayed');
      } finally {
        await cleanupG21dFinalSeed(prisma, seed.vehicleId, seed.organizationId);
      }
    });

    it('BQ-REAL-3: crash window — waiting job dedupes when enrichmentEnqueuedAt not persisted', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedLostEnqueueScenario(prisma, `bq3-${suffix}`);
      const jobId = deterministicJobId(seed.energyEventId);
      try {
        await queue.add(FUEL_STATION_ENRICHMENT_JOB_NAME, { energyEventId: seed.energyEventId }, { jobId });

        const outcome = await service.enqueueAfterPersistOutcome(postCutoverInput(seed.energyEventId));
        expect(outcome.status).toBe('deduped');
        expect(await countLogicalJobs(queue, jobId)).toBe(1);
      } finally {
        await cleanupG21dFinalSeed(prisma, seed.vehicleId, seed.organizationId);
      }
    });

    it('BQ-REAL-4: FAILED job recovery — remove failed job and re-enqueue deterministically', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedStaleEnrichmentScenario(prisma, `bq4-${suffix}`);
      const jobId = deterministicJobId(seed.energyEventId);
      try {
        await failJobOnce(queue, jobId, { energyEventId: seed.energyEventId });

        const outcome = await service.enqueueAfterPersistOutcome(postCutoverInput(seed.energyEventId));
        expect(outcome.status).toBe('enqueued');
        expect(outcome.jobId).toBe(jobId);
        expect(await countLogicalJobs(queue, jobId)).toBe(1);
        const state = await (await queue.getJob(jobId))!.getState();
        expect(['waiting', 'delayed', 'active', 'prioritized']).toContain(state);
      } finally {
        await cleanupG21dFinalSeed(prisma, seed.vehicleId, seed.organizationId);
      }
    });

    it('BQ-REAL-5: terminal DB FAILED — failed BullMQ job is not resurrected', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedStaleEnrichmentScenario(prisma, `bq5-${suffix}`);
      const jobId = deterministicJobId(seed.energyEventId);
      try {
        await prisma.vehicleEnergyEventFuelStationEnrichment.update({
          where: { energyEventId: seed.energyEventId },
          data: { processingStatus: 'FAILED' },
        });
        await failJobOnce(queue, jobId, { energyEventId: seed.energyEventId });

        const outcome = await service.enqueueAfterPersistOutcome(postCutoverInput(seed.energyEventId));
        expect(outcome.status).toBe('terminal_skip');
        const job = await queue.getJob(jobId);
        expect(job).not.toBeNull();
        expect(await job!.getState()).toBe('failed');
      } finally {
        await cleanupG21dFinalSeed(prisma, seed.vehicleId, seed.organizationId);
      }
    });

    it('BQ-REAL-6: COMPLETED job — terminal completed DB lifecycle is not reprocessed', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedLostEnqueueScenario(prisma, `bq6-${suffix}`);
      const jobId = deterministicJobId(seed.energyEventId);
      const fingerprint = buildFuelStationEnrichmentInputFingerprint({
        energyEventId: seed.energyEventId,
        latitude: 51.3305883,
        longitude: 9.5126383,
      });
      try {
        await prisma.vehicleEnergyEventFuelStationEnrichment.create({
          data: {
            energyEventId: seed.energyEventId,
            processingStatus: 'COMPLETED',
            resolutionStatus: 'MATCHED',
            inputFingerprint: fingerprint,
            resolverVersion: FUEL_STATION_RESOLVER_VERSION,
            inputLatitude: 51.3305883,
            inputLongitude: 9.5126383,
            inputCoordinateSource: 'SELECTED_FORECOURT_DWELL',
          },
        });
        await queue.add(
          FUEL_STATION_ENRICHMENT_JOB_NAME,
          { energyEventId: seed.energyEventId },
          { jobId, removeOnComplete: false },
        );
        const worker = new Worker(
          queue.name,
          async () => undefined,
          { connection: redisConnectionOptions(), prefix: queue.opts.prefix },
        );
        await new Promise((resolve) => setTimeout(resolve, 400));
        await worker.close();

        const outcome = await service.enqueueAfterPersistOutcome(postCutoverInput(seed.energyEventId));
        expect(outcome.status).toBe('terminal_skip');
        expect(await countLogicalJobs(queue, jobId)).toBe(1);
        expect(await (await queue.getJob(jobId))!.getState()).toBe('completed');
      } finally {
        await cleanupG21dFinalSeed(prisma, seed.vehicleId, seed.organizationId);
      }
    });

    it('BQ-REAL-RACE: concurrent failed-job recovery converges to one logical job', async () => {
      const suffix = randomUUID().slice(0, 8);
      const seed = await seedStaleEnrichmentScenario(prisma, `race-${suffix}`);
      const jobId = deterministicJobId(seed.energyEventId);
      try {
        await failJobOnce(queue, jobId, { energyEventId: seed.energyEventId });

        const input = postCutoverInput(seed.energyEventId);
        const [a, b] = await Promise.all([
          service.enqueueAfterPersistOutcome(input),
          service.enqueueAfterPersistOutcome(input),
        ]);

        expect([a.status, b.status]).toEqual(expect.arrayContaining(['enqueued']));
        expect(await countLogicalJobs(queue, jobId)).toBe(1);
        const finalJob = await queue.getJob(jobId);
        expect(finalJob).not.toBeNull();
        expect(['waiting', 'delayed', 'active', 'prioritized']).toContain(await finalJob!.getState());
      } finally {
        await cleanupG21dFinalSeed(prisma, seed.vehicleId, seed.organizationId);
      }
    });
  },
);
