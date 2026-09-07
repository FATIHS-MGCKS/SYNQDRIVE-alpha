import IORedis from 'ioredis';
import { Queue, QueueEvents, Worker, type Job } from 'bullmq';
import { TripDetectionState, VehicleStatus } from '@prisma/client';
import RedisMemoryServer from 'redis-memory-server';

import { RedisService } from '@shared/redis/redis.service';
import { SnapshotWakeHandoffProcessor } from '../processors/snapshot-wake-handoff.processor';
import { SnapshotWakeCoordinatorService } from '../snapshot-wake/snapshot-wake-coordinator.service';
import { SnapshotWakeHandoffDeferError } from '../snapshot-wake/snapshot-wake-handoff-defer.error';
import {
  buildSnapshotWakeContext,
  snapshotJobId,
  snapshotWakeHandoffJobId,
  successorWakeRedisKey,
} from '../snapshot-wake/snapshot-wake.util';
import { QUEUE_NAMES } from '../queues/queue-names';

const LIVE = process.env.RUN_BULLMQ_WAKE_INTEGRATION === '1';
const VEHICLE_ID = 'veh-bullmq-int';
const TOKEN_ID = 99;

function createPrismaMock() {
  return {
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({
        status: VehicleStatus.AVAILABLE,
        dimoVehicle: { connectionStatus: 'CONNECTED', tokenId: TOKEN_ID },
      }),
    },
    vehicleTripDetectionState: {
      findUnique: jest.fn().mockResolvedValue({ state: TripDetectionState.RESTING }),
    },
  };
}

(LIVE ? describe : describe.skip)(
  'Snapshot wake handoff — real BullMQ + Redis integration',
  () => {
    let memoryServer: RedisMemoryServer;
    let redis: RedisService;
    let connection: IORedis;
    let canonicalState = 'active';
    let snapshotQueueAdd: jest.Mock;
    let snapshotQueue: { add: jest.Mock; getJob: jest.Mock };
    let handoffQueue: Queue;
    let queueEvents: QueueEvents;
    let worker: Worker;
    let coordinator: SnapshotWakeCoordinatorService;
    let processor: SnapshotWakeHandoffProcessor;

    beforeAll(async () => {
      memoryServer = new RedisMemoryServer();
      await memoryServer.start();
      const host = await memoryServer.getHost();
      const port = await memoryServer.getPort();

      connection = new IORedis({
        host,
        port,
        maxRetriesPerRequest: null,
      });
      await connection.ping();

      redis = new RedisService({
        host,
        port,
        password: undefined,
        db: 0,
      } as never);

      snapshotQueueAdd = jest.fn().mockResolvedValue(undefined);
      snapshotQueue = {
        add: snapshotQueueAdd,
        getJob: jest.fn(async (jobId: string) => {
          if (jobId !== snapshotJobId(VEHICLE_ID)) return undefined;
          return {
            getState: async () => canonicalState,
            remove: async () => undefined,
          };
        }),
      };

      coordinator = new SnapshotWakeCoordinatorService(
        snapshotQueue as never,
        null as never,
        redis,
        createPrismaMock() as never,
        undefined,
      );

      handoffQueue = new Queue(QUEUE_NAMES.SNAPSHOT_WAKE_HANDOFF, { connection });
      queueEvents = new QueueEvents(QUEUE_NAMES.SNAPSHOT_WAKE_HANDOFF, { connection });

      coordinator.enqueueHandoffJob = async (vehicleId, notBeforeMs) => {
        const delayMs = Math.max(0, notBeforeMs - Date.now());
        await handoffQueue.add(
          'dispatch',
          { vehicleId },
          {
            jobId: snapshotWakeHandoffJobId(vehicleId),
            delay: delayMs > 0 ? delayMs : undefined,
            removeOnComplete: true,
            attempts: 20,
          },
        );
      };

      processor = new SnapshotWakeHandoffProcessor(coordinator);
      worker = new Worker(
        QUEUE_NAMES.SNAPSHOT_WAKE_HANDOFF,
        async (job: Job<{ vehicleId: string }>) => processor.process(job),
        { connection, concurrency: 1 },
      );
    }, 120_000);

    afterAll(async () => {
      await worker?.close();
      await queueEvents?.close();
      await handoffQueue?.close();
      await redis?.quit();
      await connection?.quit();
      await memoryServer?.stop();
    }, 30_000);

    beforeEach(async () => {
      canonicalState = 'active';
      snapshotQueueAdd.mockClear();
      const keys = await connection.keys('synqdrive:snapshot-wake:*');
      if (keys.length > 0) {
        await connection.del(...keys);
      }
      await handoffQueue.obliterate({ force: true });
    });

    it('moveToDelayed + DelayedError leaves handoff DELAYED then dispatches after terminal', async () => {
      await coordinator.persistSuccessorHandoffAtomic({
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        origin: 'WAKE_PROBE',
        wakeContext: buildSnapshotWakeContext({
          reason: 'IGNITION_ON',
          signalName: 'isIgnitionOn',
          providerObservedAt: new Date('2026-09-07T14:00:20.000Z'),
          receivedAt: new Date('2026-09-07T14:00:21.000Z'),
          probeGeneration: 1,
        }),
        notBeforeMs: Date.now() - 1,
      });
      await coordinator.enqueueHandoffJob(VEHICLE_ID, Date.now() - 1);

      const jobId = snapshotWakeHandoffJobId(VEHICLE_ID);
      const delayedPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('handoff job never entered delayed')),
          15_000,
        );
        queueEvents.on('delayed', ({ jobId: id }) => {
          if (id === jobId) {
            clearTimeout(timer);
            resolve();
          }
        });
      });

      await delayedPromise;
      const job = await handoffQueue.getJob(jobId);
      expect(job).not.toBeNull();
      expect(await job!.getState()).toBe('delayed');
      expect(snapshotQueueAdd).not.toHaveBeenCalled();

      canonicalState = 'completed';
      await job!.promote();
      await job!.updateProgress(0);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('handoff never completed after terminal')),
          15_000,
        );
        queueEvents.on('completed', ({ jobId: id }) => {
          if (id === jobId) {
            clearTimeout(timer);
            resolve();
          }
        });
      });

      expect(snapshotQueueAdd).toHaveBeenCalledTimes(1);
      expect(await redis.get(successorWakeRedisKey(VEHICLE_ID))).toBeNull();
    }, 45_000);

    it('transient successor Redis read error defers without false completion', async () => {
      await coordinator.persistSuccessorHandoffAtomic({
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        origin: 'WAKE_PROBE',
        wakeContext: buildSnapshotWakeContext({
          reason: 'IGNITION_ON',
          signalName: 'isIgnitionOn',
          providerObservedAt: new Date('2026-09-07T14:00:20.000Z'),
          receivedAt: new Date('2026-09-07T14:00:21.000Z'),
          probeGeneration: 1,
        }),
        notBeforeMs: Date.now() - 1,
      });

      const originalGet = redis.get.bind(redis);
      let failOnce = true;
      jest.spyOn(redis, 'get').mockImplementation(async (key: string) => {
        if (failOnce && key === successorWakeRedisKey(VEHICLE_ID)) {
          failOnce = false;
          throw new Error('transient redis read');
        }
        return originalGet(key);
      });

      canonicalState = 'completed';
      await expect(coordinator.dispatchSuccessorHandoff(VEHICLE_ID)).rejects.toBeInstanceOf(
        SnapshotWakeHandoffDeferError,
      );
      expect(snapshotQueueAdd).not.toHaveBeenCalled();

      await coordinator.dispatchSuccessorHandoff(VEHICLE_ID);
      expect(snapshotQueueAdd).toHaveBeenCalledTimes(1);
    });
  },
);
