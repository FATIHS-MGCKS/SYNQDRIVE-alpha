import { TripDetectionState, VehicleStatus } from '@prisma/client';

import { SnapshotWakeCoordinatorService } from './snapshot-wake-coordinator.service';
import { SnapshotWakeHandoffDeferError } from './snapshot-wake-handoff-defer.error';
import { MAX_RETIREMENT_RECONCILE_ITERATIONS } from './snapshot-wake-retirement.util';
import { createSnapshotWakeRedisTestHarness } from './snapshot-wake-redis.test-harness';
import {
  buildSnapshotWakeContext,
  pendingWakeRedisKey,
  snapshotJobId,
  snapshotWakeHandoffJobId,
  successorWakeRedisKey,
} from './snapshot-wake.util';

const VEHICLE_ID = 'veh-r9e';
const TOKEN_ID = 42;

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
  let canonicalState = 'active';
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
  const handoffChangeDelay = jest.fn().mockResolvedValue(undefined);
  const handoffGetJob = jest.fn(async (jobId: string) => {
    if (jobId !== snapshotWakeHandoffJobId(VEHICLE_ID) || !handoffState) {
      return null;
    }
    return {
      getState: async () => handoffState,
      changeDelay: handoffChangeDelay,
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

  return {
    coordinator,
    redis,
    queueAdd,
    handoffAdd,
    prisma,
    setCanonicalState: (state: string) => {
      canonicalState = state;
    },
  };
}

describe('SnapshotWakeCoordinatorService — R9E continuation & CAS seal', () => {
  it('A — UNKNOWN FSM read defers handoff without clearing successor', async () => {
    const h = createHarness();
    h.prisma.vehicleTripDetectionState.findUnique.mockRejectedValue(
      new Error('db down'),
    );
    await h.coordinator.persistSuccessorHandoffAtomic({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'WAKE_PROBE',
      wakeContext: makeWake(1),
      notBeforeMs: Date.now() - 1,
    });

    await expect(h.coordinator.dispatchSuccessorHandoff(VEHICLE_ID)).rejects.toMatchObject({
      reason: 'continuation_unknown',
    });
    expect(h.queueAdd).not.toHaveBeenCalled();
    expect(h.redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
  });

  it('B — UNKNOWN eligibility read defers handoff without clearing successor', async () => {
    const h = createHarness();
    h.prisma.vehicle.findUnique.mockRejectedValue(new Error('db down'));
    await h.coordinator.persistSuccessorHandoffAtomic({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'WAKE_PROBE',
      wakeContext: makeWake(1),
      notBeforeMs: Date.now() - 1,
    });

    await expect(h.coordinator.dispatchSuccessorHandoff(VEHICLE_ID)).rejects.toMatchObject({
      reason: 'continuation_unknown',
    });
    expect(h.queueAdd).not.toHaveBeenCalled();
    expect(h.redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
  });

  it('C — ACTIVE coalesce + UNKNOWN continuation preserves pending and schedules retry handoff', async () => {
    const h = createHarness();
    h.prisma.vehicleTripDetectionState.findUnique.mockRejectedValueOnce(
      new Error('db down'),
    );

    const outcome = await h.coordinator.requestSnapshot({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(0),
    });

    expect(outcome).toBe('COALESCED');
    expect(h.redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
    expect(h.redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
    expect(h.handoffAdd).toHaveBeenCalled();
    expect(h.queueAdd).not.toHaveBeenCalled();
  });

  it('D — obsolete successor stale ACK reloads newer successor instead of false success', async () => {
    const h = createHarness(TripDetectionState.ACTIVE_TRIP);
    await h.coordinator.persistSuccessorHandoffAtomic({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(0, '2026-09-07T14:00:20.000Z'),
      notBeforeMs: Date.now() - 1,
    });

    jest.spyOn(h.coordinator, 'acknowledgeSuccessorHandoff').mockImplementationOnce(async () => {
      await h.coordinator.persistSuccessorHandoffAtomic({
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        origin: 'PROVIDER_WAKE',
        wakeContext: makeWake(0, '2026-09-07T14:01:00.000Z'),
        notBeforeMs: Date.now() - 1,
      });
      h.prisma.vehicleTripDetectionState.findUnique.mockResolvedValue({
        state: TripDetectionState.RESTING,
      });
      return false;
    });

    await expect(h.coordinator.dispatchSuccessorHandoff(VEHICLE_ID)).rejects.toBeInstanceOf(
      SnapshotWakeHandoffDeferError,
    );
    expect(h.queueAdd).not.toHaveBeenCalled();
    expect(h.redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
  });

  it('E — newer valid successor is not deleted using stale ACTIVE classification', async () => {
    const h = createHarness(TripDetectionState.ACTIVE_TRIP);
    await h.coordinator.persistSuccessorHandoffAtomic({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(0, '2026-09-07T14:00:20.000Z'),
      notBeforeMs: Date.now() - 1,
    });
    const v10 = await h.coordinator.loadSuccessorHandoff(VEHICLE_ID);

    await h.coordinator.persistSuccessorHandoffAtomic({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(0, '2026-09-07T14:00:55.000Z'),
      notBeforeMs: Date.now() - 1,
    });

    h.prisma.vehicleTripDetectionState.findUnique.mockResolvedValue({
      state: TripDetectionState.RESTING,
    });

    const retireResult = await h.coordinator['retireExactSuccessorWakeBounded'](
      VEHICLE_ID,
      v10!.version,
    );
    expect(retireResult).toBe('NEWER_FOUND');
    const latest = await h.coordinator.loadSuccessorHandoff(VEHICLE_ID);
    expect(latest?.wakeContext.providerObservedAt).toBe('2026-09-07T14:00:55.000Z');
  });

  it('F — pending obsolete exact-version race preserves newer pending wake', async () => {
    const h = createHarness(TripDetectionState.POSSIBLE_START);
    await h.coordinator.persistPendingWakeAtomic(
      VEHICLE_ID,
      TOKEN_ID,
      makeWake(0, '2026-09-07T14:00:20.000Z'),
    );
    const v10 = await h.coordinator.loadPendingWake(VEHICLE_ID);

    await h.coordinator.persistPendingWakeAtomic(
      VEHICLE_ID,
      TOKEN_ID,
      makeWake(0, '2026-09-07T14:00:55.000Z'),
    );

    h.prisma.vehicleTripDetectionState.findUnique.mockResolvedValue({
      state: TripDetectionState.RESTING,
    });

    const outcome = await h.coordinator['retireExactPendingWakeBounded'](
      VEHICLE_ID,
      v10!.version,
      'DEFINITIVELY_NOT_RESTING',
    );
    expect(outcome).toBe('NEWER_FOUND');
    expect(h.redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
    expect(
      (await h.coordinator.loadPendingWake(VEHICLE_ID))?.wakeContext.providerObservedAt,
    ).toBe('2026-09-07T14:00:55.000Z');
  });

  it('G — persistent pending ACK failure is bounded without unbounded recursion', async () => {
    const h = createHarness(TripDetectionState.POSSIBLE_START);
    await h.coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, makeWake(0));
    const version = (await h.coordinator.loadPendingWake(VEHICLE_ID))!.version;

    const ackSpy = jest
      .spyOn(h.coordinator, 'acknowledgePendingWake')
      .mockResolvedValue(false);

    const outcome = await h.coordinator['retireExactPendingWakeBounded'](
      VEHICLE_ID,
      version,
      'DEFINITIVELY_NOT_RESTING',
    );

    expect(outcome).toBe('ACK_ERROR');
    expect(ackSpy.mock.calls.length).toBeLessThanOrEqual(
      MAX_RETIREMENT_RECONCILE_ITERATIONS,
    );
    expect(h.redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
    ackSpy.mockRestore();
  });

  it('H — READ_ERROR during obsolete successor reload re-arms handoff', async () => {
    const h = createHarness(TripDetectionState.ACTIVE_TRIP);
    await h.coordinator.persistSuccessorHandoffAtomic({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(0),
      notBeforeMs: Date.now() - 1,
    });

    let successorReads = 0;
    const baseGet = h.redis.get.getMockImplementation();
    h.redis.get.mockImplementation(async (key: string) => {
      if (key === successorWakeRedisKey(VEHICLE_ID)) {
        successorReads += 1;
        if (successorReads >= 2) {
          throw new Error('reload read failed');
        }
      }
      return baseGet!(key);
    });

    await expect(h.coordinator.dispatchSuccessorHandoff(VEHICLE_ID)).rejects.toMatchObject({
      reason: 'redis_read_error',
    });
    expect(h.queueAdd).not.toHaveBeenCalled();
    expect(h.redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
  });
});
