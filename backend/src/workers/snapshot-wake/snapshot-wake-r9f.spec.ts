import { TripDetectionState, VehicleStatus } from '@prisma/client';

import { SnapshotWakeCoordinatorService } from './snapshot-wake-coordinator.service';
import { createSnapshotWakeRedisTestHarness } from './snapshot-wake-redis.test-harness';
import {
  buildSnapshotWakeContext,
  pendingWakeRedisKey,
  snapshotJobId,
  snapshotWakeHandoffJobId,
  successorWakeRedisKey,
  wakeProbeDelayMs,
} from './snapshot-wake.util';
import { loadSnapshotPollingTierConfig } from '../schedulers/snapshot-polling/snapshot-polling-tier.config';
import { UNKNOWN_CONTINUATION_RETRY_MS } from './snapshot-wake-retirement.util';

const VEHICLE_ID = 'veh-r9f';
const TOKEN_ID = 42;
const PROBE_DELAY_MS = wakeProbeDelayMs(loadSnapshotPollingTierConfig());

function makeWake(
  probeGeneration: 0 | 1 = 0,
  providerObservedAt: string | null = '2026-09-07T14:00:20.000Z',
) {
  return buildSnapshotWakeContext({
    reason: 'IGNITION_ON',
    signalName: 'isIgnitionOn',
    providerObservedAt: providerObservedAt
      ? new Date(providerObservedAt)
      : null,
    receivedAt: new Date('2026-09-07T14:00:21.000Z'),
    probeGeneration,
  });
}

function createHarness(fsmState: TripDetectionState = TripDetectionState.RESTING) {
  const redis = createSnapshotWakeRedisTestHarness();
  const queueAdd = jest.fn().mockResolvedValue(undefined);
  let canonicalState = 'completed';
  let handoffState: string | null = null;
  const queueGetJob = jest.fn(async (jobId: string) => {
    if (jobId !== snapshotJobId(VEHICLE_ID)) return null;
    if (canonicalState === 'none') return null;
    return {
      getState: async () => canonicalState,
      remove: async () => {
        canonicalState = 'none';
      },
    };
  });
  const handoffAdd = jest.fn().mockImplementation(async () => {
    handoffState = 'waiting';
  });
  const handoffGetJob = jest.fn(async (jobId: string) => {
    if (jobId !== snapshotWakeHandoffJobId(VEHICLE_ID) || !handoffState) {
      return null;
    }
    return {
      getState: async () => handoffState,
      changeDelay: jest.fn(),
      remove: async () => {
        handoffState = null;
      },
    };
  });

  const prisma = {
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({
        status: VehicleStatus.AVAILABLE,
        dimoVehicle: { connectionStatus: 'CONNECTED', tokenId: TOKEN_ID },
      }),
    },
    vehicleTripDetectionState: {
      findUnique: jest.fn().mockResolvedValue({ state: fsmState }),
    },
  };

  const coordinator = new SnapshotWakeCoordinatorService(
    { add: queueAdd, getJob: queueGetJob } as never,
    { add: handoffAdd, getJob: handoffGetJob } as never,
    redis as never,
    prisma as never,
    undefined,
  );

  return { coordinator, redis, queueAdd, handoffAdd, prisma };
}

describe('SnapshotWakeCoordinatorService — R9F unknown retry completeness', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-07T14:00:30.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('A — afterSnapshotJob probeEligible + FSM UNKNOWN schedules retry without provider fetch', async () => {
    const h = createHarness();
    h.prisma.vehicleTripDetectionState.findUnique.mockRejectedValue(
      new Error('db down'),
    );
    const wake = makeWake(0);
    await h.coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, wake);
    const claimed = await h.coordinator.claimPendingWakeForRun(VEHICLE_ID);

    await h.coordinator.afterSnapshotJob({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      jobData: {
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        origin: 'PROVIDER_WAKE',
        wakeContext: wake,
      },
      claimedPendingWake: claimed,
      effectiveWakeContext: wake,
      snapshotSourceTimestamp: new Date('2026-09-07T14:00:21.000Z'),
      staleMonotonicSkipped: false,
      tripStartEvalError: false,
      possibleStartCreated: false,
      providerFetchFailed: false,
      fsmState: TripDetectionState.RESTING,
    });

    expect(h.redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
    expect(h.redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
    expect(h.handoffAdd).toHaveBeenCalled();
    expect(h.queueAdd).not.toHaveBeenCalled();
    const successor = await h.coordinator.loadSuccessorHandoff(VEHICLE_ID);
    expect(successor?.wakeContext.probeGeneration).toBe(0);
  });

  it('B — afterSnapshotJob uncovered gen0 + eligibility UNKNOWN schedules retry handoff', async () => {
    const h = createHarness();
    h.prisma.vehicle.findUnique.mockRejectedValue(new Error('db down'));
    const wake = makeWake(0);
    await h.coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, wake);
    const claimed = await h.coordinator.claimPendingWakeForRun(VEHICLE_ID);

    await h.coordinator.afterSnapshotJob({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      jobData: {
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        origin: 'PROVIDER_WAKE',
        wakeContext: wake,
      },
      claimedPendingWake: claimed,
      effectiveWakeContext: wake,
      snapshotSourceTimestamp: new Date('2026-09-07T14:00:10.000Z'),
      staleMonotonicSkipped: false,
      tripStartEvalError: false,
      possibleStartCreated: false,
      providerFetchFailed: false,
      fsmState: TripDetectionState.RESTING,
    });

    expect(h.handoffAdd).toHaveBeenCalled();
    expect(h.queueAdd).not.toHaveBeenCalled();
    expect(h.redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
  });

  it('C — reconcileOutstandingPendingWake with UNKNOWN schedules bounded retry', async () => {
    const h = createHarness();
    h.prisma.vehicleTripDetectionState.findUnique.mockRejectedValue(
      new Error('db down'),
    );
    await h.coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, makeWake(0));

    await h.coordinator.reconcileOutstandingPendingWake(VEHICLE_ID);

    expect(h.handoffAdd).toHaveBeenCalled();
    expect(h.redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
    expect(h.queueAdd).not.toHaveBeenCalled();
  });

  it('D — scheduleDurableSuccessor with UNKNOWN schedules retry without provider fetch', async () => {
    const h = createHarness();
    h.prisma.vehicleTripDetectionState.findUnique.mockRejectedValue(
      new Error('db down'),
    );

    const outcome = await h.coordinator.scheduleDurableSuccessor({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(0),
    });

    expect(outcome).toBe('UNKNOWN_RETRY_SCHEDULED');
    expect(h.handoffAdd).toHaveBeenCalled();
    expect(h.queueAdd).not.toHaveBeenCalled();
  });

  it('E — generation-1 stale ACK newer gen0 + UNKNOWN schedules retry for gen0 only', async () => {
    const h = createHarness();
    h.prisma.vehicleTripDetectionState.findUnique.mockRejectedValue(
      new Error('db down'),
    );
    const gen0 = makeWake(0, '2026-09-07T14:00:20.000Z');
    await h.coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, gen0);
    const claimed = await h.coordinator.claimPendingWakeForRun(VEHICLE_ID);
    await h.coordinator.persistPendingWakeAtomic(
      VEHICLE_ID,
      TOKEN_ID,
      makeWake(0, '2026-09-07T14:00:45.000Z'),
    );

    await h.coordinator.afterSnapshotJob({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      jobData: {
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        origin: 'WAKE_PROBE',
        wakeContext: makeWake(1),
      },
      claimedPendingWake: claimed,
      effectiveWakeContext: makeWake(1),
      snapshotSourceTimestamp: new Date('2026-09-07T14:00:10.000Z'),
      staleMonotonicSkipped: true,
      tripStartEvalError: false,
      possibleStartCreated: false,
      providerFetchFailed: false,
      fsmState: TripDetectionState.RESTING,
    });

    expect(h.handoffAdd).toHaveBeenCalled();
    expect(h.queueAdd).not.toHaveBeenCalled();
    const successor = await h.coordinator.loadSuccessorHandoff(VEHICLE_ID);
    expect(successor?.wakeContext.probeGeneration).toBe(0);
  });

  it('F — unknown retry handoff enqueue failure keeps durable successor and pending', async () => {
    const h = createHarness();
    h.handoffAdd.mockRejectedValue(new Error('bull down'));
    await h.coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, makeWake(0));

    const outcome = await h.coordinator.scheduleUnknownContinuationRetryHandoff({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(0),
    });

    expect(outcome).toBe('QUEUE_FAILED');
    expect(h.redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
    expect(h.redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
  });

  it('G — DB recovery RESTING+eligible dispatches canonical snapshot from retry handoff', async () => {
    const h = createHarness();
    await h.coordinator.scheduleUnknownContinuationRetryHandoff({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(0),
    });

    jest.advanceTimersByTime(UNKNOWN_CONTINUATION_RETRY_MS);
    await h.coordinator.dispatchSuccessorHandoff(VEHICLE_ID);

    expect(h.queueAdd).toHaveBeenCalledTimes(1);
    expect(await h.coordinator.loadSuccessorHandoff(VEHICLE_ID)).toBeNull();
  });

  it('H — DB recovery ACTIVE_TRIP retires obsolete wake without provider fetch', async () => {
    const h = createHarness(TripDetectionState.ACTIVE_TRIP);
    await h.coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, makeWake(0));
    await h.coordinator.scheduleUnknownContinuationRetryHandoff({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(0),
    });

    await h.coordinator.dispatchSuccessorHandoff(VEHICLE_ID);

    expect(h.queueAdd).not.toHaveBeenCalled();
    expect(h.redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(false);
    expect(await h.coordinator.loadSuccessorHandoff(VEHICLE_ID)).toBeNull();
  });
});
