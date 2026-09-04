import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { FUEL_STATION_RESOLVER_VERSION } from '../fuel-station-location.types';
import { FuelStationEnrichmentProducerService } from './fuel-station-enrichment-producer.service';
import {
  buildFuelStationEnrichmentInputFingerprint,
  buildFuelStationEnrichmentJobIdempotencyKey,
} from './fuel-station-enrichment-fingerprint.util';
import { FUEL_STATION_ENRICHMENT_JOB_NAME } from './fuel-station-enrichment.types';
import { sanitizeBullMqJobId } from '@shared/queue/bullmq-job-id.sanitizer';

const LIVE = process.env.PHYSICAL_REFUEL_RECONCILIATION_REDIS_INTEGRATION === '1';

function redisConnectionOptions() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number.parseInt(process.env.REDIS_DB || '15', 10),
    maxRetriesPerRequest: null as null,
  };
}

function queuePrefix(): string {
  return process.env.PHYSICAL_REFUEL_TEST_QUEUE_PREFIX || 'refuel-g21d-gate';
}

async function probeRedis(): Promise<boolean> {
  const { default: IORedis } = await import('ioredis');
  const client = new IORedis({ ...redisConnectionOptions(), connectTimeout: 3_000, lazyConnect: true });
  try {
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return pong === 'PONG';
  } catch {
    try {
      await client.quit();
    } catch {
      /* ignore */
    }
    return false;
  }
}

function buildProducerHarness(queue: Queue) {
  const config = {
    enabled: true,
    cutoverAt: new Date('2026-09-01T00:00:00.000Z'),
    cutoverState: 'valid' as const,
    jobAttempts: 3,
    jobBackoffMs: 1_000,
  };

  const prisma = {
    vehicleEnergyEventFuelStationEnrichment: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };

  return new FuelStationEnrichmentProducerService(
    queue as never,
    config as never,
    prisma as never,
  );
}

function postCutoverInput(energyEventId: string) {
  return {
    energyEventId,
    eventStartTime: new Date('2026-09-02T00:00:00.000Z'),
    eventObservedAt: new Date('2026-09-02T00:00:00.000Z'),
    v2OwnershipCutoverAt: new Date('2026-09-01T00:00:00.000Z'),
    startLatitude: 51.32133585,
    startLongitude: 9.51465858,
    coordinateSource: 'physical_refuel_forecourt_dwell_v2',
    physicalRefuelReconciliationV2: true,
  };
}

function deterministicJobId(energyEventId: string): string {
  const fingerprint = buildFuelStationEnrichmentInputFingerprint({
    energyEventId,
    latitude: 51.32133585,
    longitude: 9.51465858,
    resolverVersion: FUEL_STATION_RESOLVER_VERSION,
  });
  const idempotencyKey = buildFuelStationEnrichmentJobIdempotencyKey({
    energyEventId,
    inputFingerprint: fingerprint,
  });
  return sanitizeBullMqJobId({ namespace: 'refuel-station', key: idempotencyKey });
}

(LIVE ? describe : describe.skip)(
  'Fuel station enrichment producer — BullMQ live integration (isolated Redis)',
  () => {
    let queue: Queue;

    beforeAll(async () => {
      const ok = await probeRedis();
      if (!ok) {
        throw new Error(
          'PHYSICAL_REFUEL_RECONCILIATION_REDIS_INTEGRATION=1 requires reachable Redis',
        );
      }
      queue = new Queue(QUEUE_NAMES.ENERGY_REFUEL_STATION_ENRICH, {
        connection: redisConnectionOptions(),
        prefix: queuePrefix(),
      });
    }, 30_000);

    afterAll(async () => {
      await queue?.close();
    });

    beforeEach(() => {
      jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
    });

    afterEach(async () => {
      jest.restoreAllMocks();
    });

    async function removeJobIfExists(jobId: string): Promise<void> {
      const existing = await queue.getJob(jobId);
      if (existing) await existing.remove();
    }

    it('BQ1 WAITING — same deterministic ID dedupes second enqueue', async () => {
      const energyEventId = `evt-bq1-${randomUUID().slice(0, 8)}`;
      const jobId = deterministicJobId(energyEventId);
      await removeJobIfExists(jobId);

      const service = buildProducerHarness(queue);
      const first = await service.enqueueAfterPersistOutcome(postCutoverInput(energyEventId));
      expect(first.status).toBe('enqueued');

      const second = await service.enqueueAfterPersistOutcome(postCutoverInput(energyEventId));
      expect(second.status).toBe('deduped');

      const jobs = await queue.getJobs(['waiting', 'delayed', 'active', 'prioritized']);
      const matching = jobs.filter((j) => j.id === jobId);
      expect(matching.length).toBe(1);

      await removeJobIfExists(jobId);
    }, 20_000);

    it('BQ3 FAILED — remove failed job and re-add when DB allows retry', async () => {
      const energyEventId = `evt-bq3-${randomUUID().slice(0, 8)}`;
      const jobId = deterministicJobId(energyEventId);
      await removeJobIfExists(jobId);

      await queue.add(
        FUEL_STATION_ENRICHMENT_JOB_NAME,
        { energyEventId },
        { jobId, attempts: 1 },
      );
      const seeded = await queue.getJob(jobId);
      await seeded?.moveToFailed(new Error('gate-test-failure'), '0', true);

      const prisma = {
        vehicleEnergyEventFuelStationEnrichment: {
          findUnique: jest.fn().mockResolvedValue({
            processingStatus: 'PROCESSING',
            lastAttemptAt: new Date('2026-09-01T00:00:00.000Z'),
            inputFingerprint: buildFuelStationEnrichmentInputFingerprint({
              energyEventId,
              latitude: 51.32133585,
              longitude: 9.51465858,
            }),
            resolverVersion: FUEL_STATION_RESOLVER_VERSION,
          }),
        },
      };
      const service = new FuelStationEnrichmentProducerService(
        queue as never,
        {
          enabled: true,
          cutoverAt: new Date('2026-09-01T00:00:00.000Z'),
          cutoverState: 'valid',
          jobAttempts: 3,
          jobBackoffMs: 1_000,
        } as never,
        prisma as never,
      );

      const outcome = await service.enqueueAfterPersistOutcome(postCutoverInput(energyEventId));
      expect(outcome.status).toBe('enqueued');

      const after = await queue.getJob(jobId);
      expect(after).not.toBeNull();
      const state = await after!.getState();
      expect(['waiting', 'delayed', 'prioritized']).toContain(state);

      await removeJobIfExists(jobId);
    }, 20_000);

    it('BQ4 terminal DB FAILED — does not resurrect failed BullMQ job', async () => {
      const energyEventId = `evt-bq4-${randomUUID().slice(0, 8)}`;
      const jobId = deterministicJobId(energyEventId);
      await removeJobIfExists(jobId);

      await queue.add(FUEL_STATION_ENRICHMENT_JOB_NAME, { energyEventId }, { jobId, attempts: 1 });
      const seeded = await queue.getJob(jobId);
      await seeded?.moveToFailed(new Error('terminal'), '0', true);

      const prisma = {
        vehicleEnergyEventFuelStationEnrichment: {
          findUnique: jest.fn().mockResolvedValue({
            processingStatus: 'FAILED',
            inputFingerprint: buildFuelStationEnrichmentInputFingerprint({
              energyEventId,
              latitude: 51.32133585,
              longitude: 9.51465858,
            }),
            resolverVersion: FUEL_STATION_RESOLVER_VERSION,
          }),
        },
      };
      const service = new FuelStationEnrichmentProducerService(
        queue as never,
        {
          enabled: true,
          cutoverAt: new Date('2026-09-01T00:00:00.000Z'),
          cutoverState: 'valid',
          jobAttempts: 3,
          jobBackoffMs: 1_000,
        } as never,
        prisma as never,
      );

      const outcome = await service.enqueueAfterPersistOutcome(postCutoverInput(energyEventId));
      expect(outcome.status).toBe('terminal_skip');

      const failed = await queue.getJob(jobId);
      expect(failed).not.toBeNull();
      expect(await failed!.getState()).toBe('failed');

      await removeJobIfExists(jobId);
    }, 20_000);

    it('BQ6 missing job — adds deterministic job', async () => {
      const energyEventId = `evt-bq6-${randomUUID().slice(0, 8)}`;
      const jobId = deterministicJobId(energyEventId);
      await removeJobIfExists(jobId);

      const service = buildProducerHarness(queue);
      const outcome = await service.enqueueAfterPersistOutcome(postCutoverInput(energyEventId));
      expect(outcome.status).toBe('enqueued');
      expect(outcome.jobId).toBe(jobId);

      await removeJobIfExists(jobId);
    }, 20_000);

    it('BQ7 concurrent FAILED recovery — two producers converge to one logical job', async () => {
      const energyEventId = `evt-bq7-${randomUUID().slice(0, 8)}`;
      const jobId = deterministicJobId(energyEventId);
      await removeJobIfExists(jobId);

      await queue.add(FUEL_STATION_ENRICHMENT_JOB_NAME, { energyEventId }, { jobId, attempts: 1 });
      const seeded = await queue.getJob(jobId);
      await seeded?.moveToFailed(new Error('race-test'), '0', true);

      const prisma = {
        vehicleEnergyEventFuelStationEnrichment: {
          findUnique: jest.fn().mockResolvedValue({
            processingStatus: 'PROCESSING',
            lastAttemptAt: new Date('2026-09-01T00:00:00.000Z'),
            inputFingerprint: buildFuelStationEnrichmentInputFingerprint({
              energyEventId,
              latitude: 51.32133585,
              longitude: 9.51465858,
            }),
            resolverVersion: FUEL_STATION_RESOLVER_VERSION,
          }),
        },
      };
      const config = {
        enabled: true,
        cutoverAt: new Date('2026-09-01T00:00:00.000Z'),
        cutoverState: 'valid' as const,
        jobAttempts: 3,
        jobBackoffMs: 1_000,
      };
      const producerA = new FuelStationEnrichmentProducerService(
        queue as never,
        config as never,
        prisma as never,
      );
      const producerB = new FuelStationEnrichmentProducerService(
        queue as never,
        config as never,
        prisma as never,
      );

      const [outA, outB] = await Promise.all([
        producerA.enqueueAfterPersistOutcome(postCutoverInput(energyEventId)),
        producerB.enqueueAfterPersistOutcome(postCutoverInput(energyEventId)),
      ]);

      const enqueued = [outA, outB].filter((o) => o.status === 'enqueued');
      const deduped = [outA, outB].filter((o) => o.status === 'deduped');
      expect(enqueued.length + deduped.length).toBe(2);
      expect(enqueued.length).toBeGreaterThanOrEqual(1);

      const jobs = await queue.getJobs(['waiting', 'delayed', 'active', 'prioritized', 'failed']);
      const matching = jobs.filter((j) => j.id === jobId);
      expect(matching.length).toBeLessThanOrEqual(1);

      const finalJob = await queue.getJob(jobId);
      expect(finalJob).not.toBeNull();
      const finalState = await finalJob!.getState();
      expect(['waiting', 'delayed', 'prioritized', 'active']).toContain(finalState);

      await removeJobIfExists(jobId);
    }, 25_000);
  },
);
