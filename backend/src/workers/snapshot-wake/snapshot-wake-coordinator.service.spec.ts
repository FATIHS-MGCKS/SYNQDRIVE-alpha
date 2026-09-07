import { TripDetectionState } from '@prisma/client';

import { SnapshotWakeCoordinatorService } from './snapshot-wake-coordinator.service';
import { createSnapshotWakeRedisTestHarness } from './snapshot-wake-redis.test-harness';
import { SnapshotWakeHandoffDeferError } from './snapshot-wake-handoff-defer.error';
import {
  buildSnapshotWakeContext,
  pendingWakeRedisKey,
  snapshotJobId,
  successorWakeRedisKey,
} from './snapshot-wake.util';

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
  let redis: ReturnType<typeof createSnapshotWakeRedisTestHarness>;
  let queueAdd: jest.Mock;
  let queueGetJob: jest.Mock;
  let handoffAdd: jest.Mock;
  let handoffGetJob: jest.Mock;

  beforeEach(() => {
    redis = createSnapshotWakeRedisTestHarness();
    queueAdd = jest.fn().mockResolvedValue(undefined);
    queueGetJob = jest.fn().mockResolvedValue(null);
    handoffAdd = jest.fn().mockResolvedValue(undefined);
    handoffGetJob = jest.fn().mockResolvedValue(null);

    coordinator = new SnapshotWakeCoordinatorService(
      { add: queueAdd, getJob: queueGetJob } as never,
      { add: handoffAdd, getJob: handoffGetJob } as never,
      redis as never,
      {
        vehicle: {
          findUnique: jest.fn().mockResolvedValue({
            status: 'AVAILABLE',
            dimoVehicle: { connectionStatus: 'CONNECTED', tokenId: TOKEN_ID },
          }),
        },
        vehicleTripDetectionState: { findUnique: jest.fn() },
      } as never,
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
    expect(redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
  });

  it('does not destructively consume pending wake at claim time', async () => {
    const wake = makeWake();
    await coordinator.savePendingWake(VEHICLE_ID, TOKEN_ID, wake);

    const claimed = await coordinator.claimPendingWakeForRun(VEHICLE_ID);
    expect(claimed?.record.wakeContext.reason).toBe('SPEED_MOVEMENT');
    expect(redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
  });

  it('ACK deletes only the exact pending wake version', async () => {
    const wake = makeWake();
    await coordinator.savePendingWake(VEHICLE_ID, TOKEN_ID, wake);
    const claimed = await coordinator.claimPendingWakeForRun(VEHICLE_ID);
    expect(claimed).not.toBeNull();

    const acked = await coordinator.acknowledgePendingWake(VEHICLE_ID, claimed!.version);
    expect(acked).toBe(true);
    expect(redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(false);
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
    expect(redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
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
    expect(redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
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
    expect(redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
    expect(handoffAdd).toHaveBeenCalled();
  });

  it('dispatchSuccessorHandoff enqueues canonical snapshot after terminal job', async () => {
    queueGetJob.mockResolvedValue(null);
    const probe = makeWake(1);
    await coordinator.persistSuccessorHandoffAtomic({
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
    expect(redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(false);
  });

  it('dispatchSuccessorHandoff defers while canonical snapshot job is active', async () => {
    queueGetJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('active'),
    });
    const wake = makeWake(1);
    await coordinator.persistSuccessorHandoffAtomic({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'WAKE_PROBE',
      wakeContext: wake,
      notBeforeMs: Date.now() - 1,
    });

    await expect(coordinator.dispatchSuccessorHandoff(VEHICLE_ID)).rejects.toBeInstanceOf(
      SnapshotWakeHandoffDeferError,
    );

    expect(queueAdd).not.toHaveBeenCalled();
    expect(handoffAdd).not.toHaveBeenCalled();
    expect(redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
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
    expect(redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(false);
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
    expect(redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(false);
  });
});
