import { TripDetectionState, VehicleStatus } from '@prisma/client';

import { SnapshotWakeCoordinatorService } from './snapshot-wake-coordinator.service';
import {
  buildSnapshotWakeContext,
  pendingWakeRedisKey,
  snapshotJobId,
  successorWakeRedisKey,
} from './snapshot-wake.util';
import type { PendingSnapshotWakeRecord } from './snapshot-wake.types';

const VEHICLE_ID = 'veh-1';
const TOKEN_ID = 42;

function makeWake(probeGeneration: 0 | 1 = 0) {
  return buildSnapshotWakeContext({
    reason: 'SPEED_MOVEMENT',
    signalName: 'speed',
    providerObservedAt: new Date('2026-09-07T14:00:20.000Z'),
    receivedAt: new Date('2026-09-07T14:00:21.000Z'),
    probeGeneration,
  });
}

describe('SnapshotWakeCoordinatorService — R9A durable mailbox/handoff', () => {
  let coordinator: SnapshotWakeCoordinatorService;
  let redisStore: Map<string, string>;
  let queueAdd: jest.Mock;
  let queueGetJob: jest.Mock;
  let handoffAdd: jest.Mock;
  let handoffGetJob: jest.Mock;
  let prismaFindUnique: jest.Mock;

  beforeEach(() => {
    redisStore = new Map();
    queueAdd = jest.fn().mockResolvedValue(undefined);
    queueGetJob = jest.fn().mockResolvedValue(null);
    handoffAdd = jest.fn().mockResolvedValue(undefined);
    handoffGetJob = jest.fn().mockResolvedValue(null);
    prismaFindUnique = jest.fn().mockResolvedValue({
      status: VehicleStatus.AVAILABLE,
      dimoVehicle: { connectionStatus: 'CONNECTED', tokenId: TOKEN_ID },
    });

    const redis = {
      get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => {
        redisStore.set(key, value);
        return 'OK';
      }),
      del: jest.fn(async (key: string) => {
        redisStore.delete(key);
        return 1;
      }),
      eval: jest.fn(async (_script: string, _numKeys: number, key: string, version: string) => {
        const raw = redisStore.get(key);
        if (!raw) return 0;
        const record = JSON.parse(raw) as PendingSnapshotWakeRecord;
        if (record.version === Number(version)) {
          redisStore.delete(key);
          return 1;
        }
        return 0;
      }),
    };

    coordinator = new SnapshotWakeCoordinatorService(
      { add: queueAdd, getJob: queueGetJob } as never,
      { add: handoffAdd, getJob: handoffGetJob } as never,
      redis as never,
      { vehicle: { findUnique: prismaFindUnique }, vehicleTripDetectionState: { findUnique: jest.fn() } } as never,
      undefined,
    );
  });

  it('persists pending wake before coalescing with queued job', async () => {
    queueGetJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('waiting'),
    });

    const wake = makeWake();
    const outcome = await coordinator.requestSnapshot({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: wake,
    });

    expect(outcome).toBe('COALESCED');
    expect(redisStore.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
  });

  it('does not destructively consume pending wake at claim time', async () => {
    const wake = makeWake();
    await coordinator.savePendingWake(VEHICLE_ID, TOKEN_ID, wake);

    const claimed = await coordinator.claimPendingWakeForRun(VEHICLE_ID);
    expect(claimed?.record.wakeContext.reason).toBe('SPEED_MOVEMENT');
    expect(redisStore.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
  });

  it('ACK deletes only the exact pending wake version', async () => {
    const wake = makeWake();
    await coordinator.savePendingWake(VEHICLE_ID, TOKEN_ID, wake);
    const claimed = await coordinator.claimPendingWakeForRun(VEHICLE_ID);
    expect(claimed).not.toBeNull();

    const acked = await coordinator.acknowledgePendingWake(VEHICLE_ID, claimed!.version);
    expect(acked).toBe(true);
    expect(redisStore.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(false);
  });

  it('older ACK does not delete newer pending wake', async () => {
    const wake = makeWake();
    await coordinator.savePendingWake(VEHICLE_ID, TOKEN_ID, wake);
    const oldClaim = await coordinator.claimPendingWakeForRun(VEHICLE_ID);
    await coordinator.savePendingWake(VEHICLE_ID, TOKEN_ID, {
      ...wake,
      providerObservedAt: new Date('2026-09-07T14:00:30.000Z').toISOString(),
    });

    const acked = await coordinator.acknowledgePendingWake(VEHICLE_ID, oldClaim!.version);
    expect(acked).toBe(false);
    expect(redisStore.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
  });

  it('queue enqueue failure retains durable pending wake', async () => {
    queueAdd.mockRejectedValue(new Error('redis down'));
    const wake = makeWake();

    const outcome = await coordinator.requestSnapshot({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: wake,
    });

    expect(outcome).toBe('QUEUE_FAILED');
    expect(redisStore.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
  });

  it('afterSnapshotJob schedules durable successor handoff instead of self-coalescing', async () => {
    queueGetJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('active'),
    });

    const wake = makeWake();
    await coordinator.afterSnapshotJob({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      jobData: { vehicleId: VEHICLE_ID, dimoTokenId: TOKEN_ID, origin: 'SCHEDULED', wakeContext: wake },
      claimedPendingWake: null,
      effectiveWakeContext: wake,
      snapshotSourceTimestamp: new Date('2026-09-07T14:00:10.000Z'),
      staleMonotonicSkipped: false,
      tripStartEvalError: false,
      possibleStartCreated: false,
      providerFetchFailed: false,
      fsmState: TripDetectionState.RESTING,
    });

    expect(queueAdd).not.toHaveBeenCalled();
    expect(redisStore.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
    expect(handoffAdd).toHaveBeenCalled();
  });

  it('dispatchSuccessorHandoff enqueues canonical snapshot after terminal job', async () => {
    queueGetJob.mockResolvedValue(null);
    const probe = makeWake(1);
    await coordinator.persistSuccessorHandoff({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'WAKE_PROBE',
      wakeContext: probe,
      notBeforeMs: Date.now() - 1,
    });

    await coordinator.dispatchSuccessorHandoff(VEHICLE_ID);

    expect(queueAdd).toHaveBeenCalledWith(
      'snapshot',
      expect.objectContaining({
        vehicleId: VEHICLE_ID,
        origin: 'WAKE_PROBE',
      }),
      expect.objectContaining({ jobId: snapshotJobId(VEHICLE_ID) }),
    );
    expect(redisStore.has(successorWakeRedisKey(VEHICLE_ID))).toBe(false);
  });

  it('dispatchSuccessorHandoff waits while canonical snapshot job is active', async () => {
    queueGetJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('active'),
    });
    const wake = makeWake(1);
    await coordinator.persistSuccessorHandoff({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'WAKE_PROBE',
      wakeContext: wake,
      notBeforeMs: Date.now() - 1,
    });

    await coordinator.dispatchSuccessorHandoff(VEHICLE_ID);

    expect(queueAdd).not.toHaveBeenCalled();
    expect(handoffAdd).toHaveBeenCalled();
    expect(redisStore.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
  });

  it('generation 1 probe never schedules generation 2 successor', async () => {
    const gen1 = makeWake(1);
    await coordinator.afterSnapshotJob({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      jobData: {
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        origin: 'WAKE_PROBE',
        wakeContext: gen1,
      },
      claimedPendingWake: null,
      effectiveWakeContext: gen1,
      snapshotSourceTimestamp: new Date('2026-09-07T14:00:10.000Z'),
      staleMonotonicSkipped: true,
      tripStartEvalError: false,
      possibleStartCreated: false,
      providerFetchFailed: false,
      fsmState: TripDetectionState.RESTING,
    });

    expect(handoffAdd).not.toHaveBeenCalled();
    expect(redisStore.has(successorWakeRedisKey(VEHICLE_ID))).toBe(false);
  });

  it('covered wake ACKs pending mailbox without successor', async () => {
    const wake = makeWake();
    await coordinator.savePendingWake(VEHICLE_ID, TOKEN_ID, wake);
    const claimed = await coordinator.claimPendingWakeForRun(VEHICLE_ID);

    await coordinator.afterSnapshotJob({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      jobData: { vehicleId: VEHICLE_ID, dimoTokenId: TOKEN_ID, origin: 'SCHEDULED', wakeContext: wake },
      claimedPendingWake: claimed,
      effectiveWakeContext: wake,
      snapshotSourceTimestamp: new Date('2026-09-07T14:00:25.000Z'),
      staleMonotonicSkipped: false,
      tripStartEvalError: false,
      possibleStartCreated: false,
      providerFetchFailed: false,
      fsmState: TripDetectionState.RESTING,
    });

    expect(handoffAdd).not.toHaveBeenCalled();
    expect(redisStore.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(false);
  });
});
