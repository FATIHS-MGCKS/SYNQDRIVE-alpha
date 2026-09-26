import { randomUUID } from 'crypto';
import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { ChargingStationLocationResolverService } from '../charging-station-location-resolver.service';
import { RECHARGE_STATION_ENRICHMENT_JOB_NAME } from './charging-station-enrichment.types';
import {
  bootstrapE6_3PostgresOrchestrator,
  buildChargingStationEnrichmentInputFingerprint,
  cleanupOrgVehicle,
  createCanonicalRechargeEvent,
  createE6_3EnrichmentConfig,
  createE6_3IsolatedQueue,
  createE6_3Processor,
  createE6_3Producer,
  createE6_3Worker,
  deriveCanonicalChargingStationEnrichmentCoordinate,
  deterministicRechargeJobId,
  drainQueue,
  E6_3_MATCH_LAT,
  E6_3_MATCH_LON,
  enableWorkersForQueueTests,
  seedOrgVehicle,
  startE6_3RedisStack,
  waitForJobState,
  CHARGING_STATION_RESOLVER_VERSION,
} from '../testing/erd-e6-3-charging-enrichment.integration.harness';
import { buildChargingStationEnrichmentJobIdempotencyKey } from './charging-station-enrichment-fingerprint.util';

const LIVE = process.env.ERD_E6_3_BULLMQ_REDIS_INTEGRATION === '1';

(LIVE ? describe : describe.skip)('ERD E6.3 charging enrichment BullMQ + Redis (Q1–Q10)', () => {
  let prisma: PrismaClient;
  let orchestrator: Awaited<ReturnType<typeof bootstrapE6_3PostgresOrchestrator>>['orchestrator'];
  let resolver: ChargingStationLocationResolverService;
  let redisStack: Awaited<ReturnType<typeof startE6_3RedisStack>>;
  let queue: ReturnType<typeof createE6_3IsolatedQueue>;
  let producer: ReturnType<typeof createE6_3Producer>;
  let processor: ReturnType<typeof createE6_3Processor>;
  let worker: Worker | undefined;

  beforeAll(async () => {
    const boot = await bootstrapE6_3PostgresOrchestrator();
    prisma = boot.prisma;
    orchestrator = boot.orchestrator;
    resolver = boot.resolver;
    redisStack = await startE6_3RedisStack();
    enableWorkersForQueueTests();
    queue = createE6_3IsolatedQueue(redisStack.connection, 'q-gate');
    producer = createE6_3Producer(queue, prisma);
    processor = createE6_3Processor(orchestrator);
    worker = createE6_3Worker(queue, processor);
  }, 180_000);

  afterAll(async () => {
    await worker?.close().catch(() => undefined);
    if (queue) await drainQueue(queue);
    await redisStack?.stop().catch(() => undefined);
    await prisma?.$disconnect().catch(() => undefined);
  });

  async function seedEvent(withCoords = true) {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(
      prisma,
      vehicle.id,
      withCoords
        ? { startLatitude: E6_3_MATCH_LAT, startLongitude: E6_3_MATCH_LON }
        : {},
    );
    return { org, vehicle, event };
  }

  it('Q1: enqueue → worker → durable MATCHED enrichment', async () => {
    const { org, vehicle, event } = await seedEvent();
    const jobId = deterministicRechargeJobId(event);
    try {
      const outcome = await producer.enqueueForEventOutcome(event);
      expect(outcome.status).toBe('enqueued');
      await waitForJobState(queue, jobId, 'completed', 20_000);
      const row = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
        where: { energyEventId: event.id },
      });
      expect(row?.resolutionStatus).toBe('MATCHED');
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('Q2: duplicate enqueue while waiting dedupes logical work', async () => {
    const { org, vehicle, event } = await seedEvent();
    const jobId = deterministicRechargeJobId(event);
    try {
      await queue.add(RECHARGE_STATION_ENRICHMENT_JOB_NAME, { energyEventId: event.id }, { jobId });
      const second = await producer.enqueueForEventOutcome(event);
      expect(second.status).toBe('deduped');
      expect(await queue.getJob(jobId)).not.toBeNull();
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('Q3: completed BullMQ job dedupes re-enqueue (terminal DB row present)', async () => {
    const { org, vehicle, event } = await seedEvent();
    const jobId = deterministicRechargeJobId(event);
    try {
      await producer.enqueueForEventOutcome(event);
      await waitForJobState(queue, jobId, 'completed', 20_000);
      const again = await producer.enqueueForEventOutcome(event);
      expect(again.status).toBe('deduped');
      await (await queue.getJob(jobId))?.remove();
      const refreshed = await prisma.vehicleEnergyEvent.findUniqueOrThrow({
        where: { id: event.id },
        include: { chargingStationEnrichment: true },
      });
      const afterCompletedRemoved = await producer.enqueueForEventOutcome(refreshed);
      expect(afterCompletedRemoved.status).toBe('terminal_skip');
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('Q4/Q5: failed job retries then terminal FAILED after max attempts', async () => {
    const failQueue = createE6_3IsolatedQueue(redisStack.connection, `q4-${randomUUID().slice(0, 6)}`);
    const failProducer = createE6_3Producer(
      failQueue,
      prisma,
      createE6_3EnrichmentConfig({ jobAttempts: 2, jobBackoffMs: 100 }),
    );
    const failProcessor = createE6_3Processor(
      orchestrator,
      createE6_3EnrichmentConfig({ jobAttempts: 2, jobBackoffMs: 100 }),
    );
    const spy = jest.spyOn(resolver, 'resolve').mockRejectedValue(new Error('integration-resolver-fail'));
    const failWorker = createE6_3Worker(failQueue, failProcessor);
    const { org, vehicle, event } = await seedEvent();
    const jobId = deterministicRechargeJobId(event);
    try {
      await failProducer.enqueueForEventOutcome(event);
      await waitForJobState(failQueue, jobId, 'failed', 25_000);
      const row = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
        where: { energyEventId: event.id },
      });
      expect(row?.processingStatus).toBe('FAILED');
    } finally {
      spy.mockRestore();
      await failWorker.close();
      await drainQueue(failQueue);
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('Q6: changed fingerprint creates new semantic enqueue after terminal NO_COORDINATES', async () => {
    const { org, vehicle, event } = await seedEvent(false);
    try {
      await orchestrator.processEnergyEvent(event.id);
      expect(
        (
          await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
            where: { energyEventId: event.id },
          })
        )?.resolutionStatus,
      ).toBe('NO_COORDINATES');
      await prisma.vehicleEnergyEvent.update({
        where: { id: event.id },
        data: { startLatitude: E6_3_MATCH_LAT, startLongitude: E6_3_MATCH_LON },
      });
      const refreshed = await prisma.vehicleEnergyEvent.findUniqueOrThrow({ where: { id: event.id } });
      const outcome = await producer.enqueueForEventOutcome(refreshed);
      expect(outcome.status).toBe('enqueued');
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('Q7: concurrent producers converge to one deterministic job id', async () => {
    const { org, vehicle, event } = await seedEvent();
    const jobId = deterministicRechargeJobId(event);
    try {
      const [a, b] = await Promise.all([
        producer.enqueueForEventOutcome(event),
        producer.enqueueForEventOutcome(event),
      ]);
      expect([a.status, b.status]).toEqual(expect.arrayContaining(['enqueued']));
      expect(await queue.getJob(jobId)).not.toBeNull();
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('Q8: queue unavailable returns deferred without throwing (fail-open to recovery)', async () => {
    const { org, vehicle, event } = await seedEvent();
    try {
      RuntimeStatusRegistry.setWorkersEnabled(false);
      const outcome = await producer.enqueueForEventOutcome(event);
      expect(outcome.status).toBe('deferred_queue_unavailable');
      expect(outcome.jobId).toBeNull();
    } finally {
      enableWorkersForQueueTests();
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('Q9: job options include attempts and exponential backoff', async () => {
    const { org, vehicle, event } = await seedEvent();
    const jobId = deterministicRechargeJobId(event);
    try {
      await producer.enqueueForEventOutcome(event);
      const job = await queue.getJob(jobId);
      expect(job?.opts.attempts).toBe(3);
      expect(job?.opts.backoff).toMatchObject({ type: 'exponential' });
    } finally {
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('Q10: disabled feature flag skips worker processing', async () => {
    const disabledProcessor = createE6_3Processor(
      orchestrator,
      createE6_3EnrichmentConfig({ enabled: false }),
    );
    const disabledQueue = createE6_3IsolatedQueue(redisStack.connection, 'q10');
    const disabledWorker = createE6_3Worker(disabledQueue, disabledProcessor);
    const { org, vehicle, event } = await seedEvent();
    try {
      await disabledQueue.add(RECHARGE_STATION_ENRICHMENT_JOB_NAME, { energyEventId: event.id });
      await new Promise((r) => setTimeout(r, 400));
      expect(
        await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
          where: { energyEventId: event.id },
        }),
      ).toBeNull();
    } finally {
      await disabledWorker.close();
      await drainQueue(disabledQueue);
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('Q-TRANSIENT: resolver failure can complete successfully on a later attempt', async () => {
    const transientQueue = createE6_3IsolatedQueue(redisStack.connection, `q-tr-${randomUUID().slice(0, 6)}`);
    const transientProducer = createE6_3Producer(transientQueue, prisma, createE6_3EnrichmentConfig({ jobAttempts: 3 }));
    const transientProcessor = createE6_3Processor(orchestrator, createE6_3EnrichmentConfig({ jobAttempts: 3 }));
    const originalResolve = resolver.resolve.bind(resolver);
    let resolveCalls = 0;
    const spy = jest.spyOn(resolver, 'resolve').mockImplementation((input) => {
      resolveCalls += 1;
      if (resolveCalls === 1) return Promise.reject(new Error('transient'));
      return originalResolve(input);
    });
    const transientWorker = createE6_3Worker(transientQueue, transientProcessor);
    const { org, vehicle, event } = await seedEvent();
    const jobId = deterministicRechargeJobId(event);
    try {
      await transientProducer.enqueueForEventOutcome(event);
      await waitForJobState(transientQueue, jobId, 'completed', 30_000);
      const row = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
        where: { energyEventId: event.id },
      });
      expect(row?.resolutionStatus).toBe('MATCHED');
    } finally {
      spy.mockRestore();
      await transientWorker.close();
      await drainQueue(transientQueue);
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('Q-FAILED-REMOVE: failed BullMQ job removed before re-enqueue when lifecycle permits', async () => {
    const failQueue = createE6_3IsolatedQueue(redisStack.connection, `q-fr-${randomUUID().slice(0, 6)}`);
    const failProducer = createE6_3Producer(failQueue, prisma);
    const { org, vehicle, event } = await seedEvent();
    const jobId = deterministicRechargeJobId(event);
    const failWorker = new Worker(
      failQueue.name,
      async () => {
        throw new Error('fail-once');
      },
      { connection: failQueue.opts.connection as never, prefix: failQueue.opts.prefix },
    );
    try {
      await failQueue.add(
        RECHARGE_STATION_ENRICHMENT_JOB_NAME,
        { energyEventId: event.id },
        { jobId, attempts: 1 },
      );
      await waitForJobState(failQueue, jobId, 'failed', 15_000);
      await failWorker.close();
      const outcome = await failProducer.enqueueForEventOutcome(event);
      expect(outcome.status).toBe('enqueued');
    } finally {
      await drainQueue(failQueue);
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('Q-FINGERPRINT-JOBID: deterministic idempotency key stable for same input', () => {
    const eventId = randomUUID();
    const outcome = deriveCanonicalChargingStationEnrichmentCoordinate({
      startLatitude: E6_3_MATCH_LAT,
      startLongitude: E6_3_MATCH_LON,
      endLatitude: null,
      endLongitude: null,
    } as never);
    const fp = buildChargingStationEnrichmentInputFingerprint({
      energyEventId: eventId,
      coordinateOutcome: outcome,
    });
    const key = buildChargingStationEnrichmentJobIdempotencyKey({
      energyEventId: eventId,
      inputFingerprint: fp,
    });
    const fp2 = buildChargingStationEnrichmentInputFingerprint({
      energyEventId: eventId,
      coordinateOutcome: outcome,
    });
    expect(key).toContain(eventId);
    expect(fp).toBe(fp2);
    expect(fp.length).toBeGreaterThan(10);
    expect(CHARGING_STATION_RESOLVER_VERSION).toBe('charging-station-resolver-v1');
  });
});
