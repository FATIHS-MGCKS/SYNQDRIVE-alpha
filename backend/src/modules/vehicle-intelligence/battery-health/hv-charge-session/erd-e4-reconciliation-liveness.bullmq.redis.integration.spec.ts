import IORedis from 'ioredis';
import { Job, Queue, QueueEvents, Worker } from 'bullmq';
import RedisMemoryServer from 'redis-memory-server';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import {
  createBatteryV2JobProducer,
  mockAssessDispatchReservation,
} from '../jobs/battery-v2-job-producer.test-util';
import { buildBatteryV2JobId } from '../jobs/battery-v2-job-queue.util';
import { getBatteryV2JobRetryPolicy } from '../jobs/battery-v2-job.retry-policy';
import { HvRechargeSessionReconcileProducerService } from './hv-recharge-session-reconcile-producer.service';
import { HvRechargeSessionReconcileTrigger } from './hv-recharge-session-reconcile.trigger';
import {
  buildHvRechargePeriodicPeriodBucket,
  buildHvRechargeVehicleReconcileIdempotencyKey,
} from './hv-recharge-session-reconcile.policy';
import { getBatteryV2ReconciliationIntervalMs } from '@config/battery-health-v2.config';
import { ERD_HV_CHARGE_SESSION_AUTHORITY_LOCK_ORDER } from './erd-hv-charge-session-authority.lock';

jest.mock('@config/battery-health-v2.config', () => {
  const actual = jest.requireActual('@config/battery-health-v2.config');
  return {
    ...actual,
    isBatteryV2HvRechargeSessionEnabled: () => true,
    isBatteryV2HvFallbackChargeSessionEnabled: () => true,
  };
});

const LIVE = process.env.ERD_E4_BULLMQ_REDIS_INTEGRATION === '1';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';

type RedisStack = {
  connection: IORedis;
  stop: () => Promise<void>;
};

async function startRedisStack(): Promise<RedisStack> {
  const portEnv = process.env.TEST_REDIS_PORT;
  if (portEnv) {
    const connection = new IORedis({
      host: '127.0.0.1',
      port: Number(portEnv),
      maxRetriesPerRequest: null,
    });
    await connection.ping();
    return {
      connection,
      stop: async () => {
        await connection.quit();
      },
    };
  }

  const memoryServer = new RedisMemoryServer();
  await memoryServer.start();
  const host = await memoryServer.getHost();
  const port = await memoryServer.getPort();
  const connection = new IORedis({
    host,
    port,
    maxRetriesPerRequest: null,
  });
  await connection.ping();
  return {
    connection,
    stop: async () => {
      await connection.quit();
      await memoryServer.stop();
    },
  };
}

function createDeadLetterMock(deadKeys: Set<string>) {
  return {
    isDeadLetter: jest.fn(async (jobType: string, idempotencyKey: string) =>
      deadKeys.has(`${jobType}:${idempotencyKey}`),
    ),
    clearDeadLetter: jest.fn(),
    clearReplayableDeadLetterIfPresent: jest.fn(),
    clearLegacyAssessPersistence54000DeadLetterIfPresent: jest.fn(),
  };
}

function createErdProducerService(
  queue: Queue,
  deadLetters: ReturnType<typeof createDeadLetterMock>,
): HvRechargeSessionReconcileProducerService {
  const jobProducer = createBatteryV2JobProducer(
    queue,
    deadLetters,
    mockAssessDispatchReservation(),
  );
  return new HvRechargeSessionReconcileProducerService(
    {} as never,
    jobProducer,
    deadLetters as never,
  );
}

function periodicEvaluatedAt(bucketIndex: number): Date {
  const intervalMs = getBatteryV2ReconciliationIntervalMs();
  return new Date(bucketIndex * intervalMs);
}

(LIVE ? describe : describe.skip)(
  'ERD E4 reconciliation liveness — real BullMQ + Redis',
  () => {
    let redisStack: RedisStack;
    let connection: IORedis;
    let queue: Queue;
    let queueEvents: QueueEvents;
    let deadKeys: Set<string>;
    let deadLetters: ReturnType<typeof createDeadLetterMock>;

    beforeAll(async () => {
      redisStack = await startRedisStack();
      connection = redisStack.connection;
      queue = new Queue(QUEUE_NAMES.BATTERY_V2, { connection });
      queueEvents = new QueueEvents(QUEUE_NAMES.BATTERY_V2, { connection });
      jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
    }, 120_000);

    afterAll(async () => {
      await queueEvents?.close();
      await queue?.close();
      await redisStack?.stop();
    }, 30_000);

    beforeEach(async () => {
      deadKeys = new Set<string>();
      deadLetters = createDeadLetterMock(deadKeys);
      await queue.obliterate({ force: true });
    });

    it('duplicate PERIODIC enqueue from independent producers shares one BullMQ job identity', async () => {
      const producerA = createBatteryV2JobProducer(
        queue,
        deadLetters,
        mockAssessDispatchReservation(),
      );
      const producerB = createBatteryV2JobProducer(
        queue,
        deadLetters,
        mockAssessDispatchReservation(),
      );
      const svcA = new HvRechargeSessionReconcileProducerService(
        {} as never,
        producerA,
        deadLetters as never,
      );
      const svcB = new HvRechargeSessionReconcileProducerService(
        {} as never,
        producerB,
        deadLetters as never,
      );

      const evaluatedAt = periodicEvaluatedAt(10_000);
      const periodBucket = buildHvRechargePeriodicPeriodBucket(evaluatedAt);
      const input = {
        organizationId: ORG,
        vehicleId: VEH,
        trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
        periodBucket,
        evaluatedAt,
      };

      const jobIdA = await svcA.enqueue(input);
      const jobIdB = await svcB.enqueue(input);

      expect(jobIdA).toBeTruthy();
      expect(jobIdB).toBe(jobIdA);

      const idempotencyKey = buildHvRechargeVehicleReconcileIdempotencyKey({
        vehicleId: VEH,
        trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
        periodBucket,
      });
      expect(buildBatteryV2JobId(idempotencyKey)).toBe(jobIdA);

      const waiting = await queue.getJobs(['waiting', 'delayed', 'active', 'prioritized']);
      const sameIdentity = waiting.filter((job) => job.id === jobIdA);
      expect(sameIdentity).toHaveLength(1);
    });

    it('next period bucket enqueues after prior bucket idempotency is dead-letter blocked', async () => {
      const svc = createErdProducerService(queue, deadLetters);
      const bucketN = periodicEvaluatedAt(20_001);
      const bucketNPlus1 = periodicEvaluatedAt(20_002);
      const periodBucketN = buildHvRechargePeriodicPeriodBucket(bucketN);
      const periodBucketN1 = buildHvRechargePeriodicPeriodBucket(bucketNPlus1);

      const keyN = buildHvRechargeVehicleReconcileIdempotencyKey({
        vehicleId: VEH,
        trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
        periodBucket: periodBucketN,
      });

      const jobN = await svc.enqueue({
        organizationId: ORG,
        vehicleId: VEH,
        trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
        periodBucket: periodBucketN,
        evaluatedAt: bucketN,
      });
      expect(jobN).toBeTruthy();

      deadKeys.add(`HV_RECHARGE_SESSION_RECONCILE:${keyN}`);

      const replaySameBucket = await svc.enqueue({
        organizationId: ORG,
        vehicleId: VEH,
        trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
        periodBucket: periodBucketN,
        evaluatedAt: bucketN,
      });
      expect(replaySameBucket).toBeNull();

      const jobN1 = await svc.enqueue({
        organizationId: ORG,
        vehicleId: VEH,
        trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
        periodBucket: periodBucketN1,
        evaluatedAt: bucketNPlus1,
      });
      expect(jobN1).toBeTruthy();
      expect(jobN1).not.toBe(jobN);
    });

    it('lost Bull job before completion allows re-enqueue for same periodic identity', async () => {
      const svc = createErdProducerService(queue, deadLetters);
      const evaluatedAt = periodicEvaluatedAt(30_000);
      const periodBucket = buildHvRechargePeriodicPeriodBucket(evaluatedAt);

      const jobId = await svc.enqueue({
        organizationId: ORG,
        vehicleId: VEH,
        trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
        periodBucket,
        evaluatedAt,
      });
      expect(jobId).toBeTruthy();

      const live = await queue.getJob(jobId!);
      expect(live).toBeTruthy();
      await live!.remove();

      const rediscovered = await svc.enqueue({
        organizationId: ORG,
        vehicleId: VEH,
        trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
        periodBucket,
        evaluatedAt,
      });
      expect(rediscovered).toBe(jobId);

      const after = await queue.getJob(jobId!);
      expect(after).toBeTruthy();
      expect(await after!.getState()).toMatch(/waiting|delayed|prioritized/);
    });

    it('BullMQ retry transitions: fail once then succeed on real Worker + Redis', async () => {
      const policy = getBatteryV2JobRetryPolicy('HV_RECHARGE_SESSION_RECONCILE');
      let attempts = 0;
      const worker = new Worker(
        QUEUE_NAMES.BATTERY_V2,
        async (job: Job) => {
          if (job.name !== 'HV_RECHARGE_SESSION_RECONCILE') return;
          attempts += 1;
          if (attempts === 1) {
            throw new Error('erd_e4_test_transient_failure');
          }
        },
        { connection, concurrency: 1 },
      );

      const producer = createBatteryV2JobProducer(
        queue,
        deadLetters,
        mockAssessDispatchReservation(),
      );
      const evaluatedAt = periodicEvaluatedAt(40_000);
      const periodBucket = buildHvRechargePeriodicPeriodBucket(evaluatedAt);
      const idempotencyKey = buildHvRechargeVehicleReconcileIdempotencyKey({
        vehicleId: VEH,
        trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
        periodBucket,
      });

      const completed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('timed out waiting for BullMQ completion')),
          120_000,
        );
        queueEvents.on('completed', ({ jobId }) => {
          if (jobId === buildBatteryV2JobId(idempotencyKey)) {
            clearTimeout(timer);
            resolve();
          }
        });
      });

      const jobId = await producer.enqueue('HV_RECHARGE_SESSION_RECONCILE', {
        organizationId: ORG,
        vehicleId: VEH,
        idempotencyKey,
        reconcileTrigger: HvRechargeSessionReconcileTrigger.PERIODIC,
        segmentFingerprint: null,
      });

      expect(jobId).toBeTruthy();
      await completed;
      expect(attempts).toBeGreaterThanOrEqual(2);
      expect(attempts).toBeLessThanOrEqual(policy.attempts);

      await worker.close();
    }, 130_000);

    it('documents E3 pg_advisory_xact_lock as physical write authority (Redis schedules only)', () => {
      expect(ERD_HV_CHARGE_SESSION_AUTHORITY_LOCK_ORDER).toBe(
        'VEHICLE_ADVISORY_THEN_SESSION_READ_WRITE',
      );
    });
  },
);
