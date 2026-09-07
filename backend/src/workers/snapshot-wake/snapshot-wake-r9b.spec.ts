import { TripDetectionState, VehicleStatus } from '@prisma/client';

import { SnapshotWakeCoordinatorService } from './snapshot-wake-coordinator.service';
import { SnapshotWakeHandoffDeferError } from './snapshot-wake-handoff-defer.error';
import { createSnapshotWakeRedisTestHarness } from './snapshot-wake-redis.test-harness';
import {
  buildSnapshotWakeContext,
  pendingWakeRedisKey,
  snapshotJobId,
  snapshotWakeHandoffJobId,
  successorWakeRedisKey,
} from './snapshot-wake.util';

const VEHICLE_ID = 'veh-1';
const TOKEN_ID = 42;

function makeWake(
  probeGeneration: 0 | 1 = 0,
  providerObservedAt = '2026-09-07T14:00:20.000Z',
  receivedAt = '2026-09-07T14:00:21.000Z',
) {
  return buildSnapshotWakeContext({
    reason: 'SPEED_MOVEMENT',
    signalName: 'speed',
    providerObservedAt: new Date(providerObservedAt),
    receivedAt: new Date(receivedAt),
    probeGeneration,
  });
}

describe('SnapshotWakeCoordinatorService — R9B atomic mailbox/handoff', () => {
  let coordinator: SnapshotWakeCoordinatorService;
  let redis: ReturnType<typeof createSnapshotWakeRedisTestHarness>;
  let queueAdd: jest.Mock;
  let queueGetJob: jest.Mock;
  let handoffAdd: jest.Mock;
  let handoffGetJob: jest.Mock;
  let handoffChangeDelay: jest.Mock;

  beforeEach(() => {
    redis = createSnapshotWakeRedisTestHarness();
    queueAdd = jest.fn().mockResolvedValue(undefined);
    queueGetJob = jest.fn().mockResolvedValue(null);
    handoffAdd = jest.fn().mockResolvedValue(undefined);
    handoffChangeDelay = jest.fn().mockResolvedValue(undefined);
    handoffGetJob = jest.fn().mockResolvedValue(null);

    coordinator = new SnapshotWakeCoordinatorService(
      { add: queueAdd, getJob: queueGetJob } as never,
      {
        add: handoffAdd,
        getJob: handoffGetJob,
      } as never,
      redis as never,
      {
        vehicle: {
          findUnique: jest.fn().mockResolvedValue({
            status: VehicleStatus.AVAILABLE,
            dimoVehicle: { connectionStatus: 'CONNECTED', tokenId: TOKEN_ID },
          }),
        },
        vehicleTripDetectionState: { findUnique: jest.fn() },
      } as never,
      undefined,
    );
  });

  it('A — defers via HandoffDeferError when canonical snapshot is active (not self-coalesce)', async () => {
    queueGetJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('active'),
    });
    await coordinator.persistSuccessorHandoffAtomic({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'WAKE_PROBE',
      wakeContext: makeWake(1),
      notBeforeMs: Date.now() - 1,
    });

    await expect(coordinator.dispatchSuccessorHandoff(VEHICLE_ID)).rejects.toBeInstanceOf(
      SnapshotWakeHandoffDeferError,
    );
    expect(handoffAdd).not.toHaveBeenCalled();
    expect(redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
  });

  it('B — defers when notBefore is still in the future', async () => {
    const future = Date.now() + 60_000;
    await coordinator.persistSuccessorHandoffAtomic({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'WAKE_PROBE',
      wakeContext: makeWake(1),
      notBeforeMs: future,
    });

    await expect(coordinator.dispatchSuccessorHandoff(VEHICLE_ID)).rejects.toMatchObject({
      reason: 'not_before',
    });
    expect(handoffAdd).not.toHaveBeenCalled();
  });

  it('C — defers on canonical queue failure without clearing successor', async () => {
    queueAdd.mockRejectedValue(new Error('queue down'));
    await coordinator.persistSuccessorHandoffAtomic({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(),
      notBeforeMs: Date.now() - 1,
    });

    await expect(coordinator.dispatchSuccessorHandoff(VEHICLE_ID)).rejects.toMatchObject({
      reason: 'queue_failed',
    });
    expect(redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
    expect(redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
  });

  it('D — durable-first: pending mailbox exists before coalesce enqueue attempt', async () => {
    const callOrder: string[] = [];
    const baseEval = redis.eval.getMockImplementation();
    redis.eval.mockImplementation(async (...args: unknown[]) => {
      callOrder.push('persist');
      return baseEval!(...(args as Parameters<NonNullable<typeof baseEval>>));
    });
    queueGetJob.mockImplementation(async () => {
      callOrder.push('getJob');
      return { getState: jest.fn().mockResolvedValue('waiting') };
    });

    await coordinator.requestSnapshot({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(),
    });

    expect(callOrder.indexOf('persist')).toBeLessThan(callOrder.indexOf('getJob'));
    expect(redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
  });

  it('E — concurrent pending writes preserve latest wake with monotonic version', async () => {
    const wakeA = makeWake(0, '2026-09-07T14:00:20.000Z');
    const wakeB = makeWake(0, '2026-09-07T14:00:30.000Z');

    const [r1, r2] = await Promise.all([
      coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, wakeA),
      coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, wakeB),
    ]);

    expect(r1.ok && r2.ok).toBe(true);
    const latest = await coordinator.loadPendingWake(VEHICLE_ID);
    expect(latest?.wakeContext.providerObservedAt).toBe('2026-09-07T14:00:30.000Z');
    expect(latest!.version).toBeGreaterThanOrEqual(2);
  });

  it('F — stale ACK schedules successor for newer pending wake', async () => {
    const wakeV10 = makeWake(0, '2026-09-07T14:00:20.000Z');
    await coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, wakeV10);
    const claimed = await coordinator.claimPendingWakeForRun(VEHICLE_ID);
    await coordinator.persistPendingWakeAtomic(
      VEHICLE_ID,
      TOKEN_ID,
      makeWake(0, '2026-09-07T14:00:35.000Z'),
    );

    await coordinator.afterSnapshotJob({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      jobData: {
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        origin: 'SCHEDULED',
        wakeContext: wakeV10,
      },
      claimedPendingWake: claimed,
      effectiveWakeContext: wakeV10,
      snapshotSourceTimestamp: new Date('2026-09-07T14:00:25.000Z'),
      staleMonotonicSkipped: false,
      tripStartEvalError: false,
      possibleStartCreated: false,
      providerFetchFailed: false,
      fsmState: TripDetectionState.RESTING,
    });

    expect(redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
    expect(redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
    expect(handoffAdd).toHaveBeenCalled();
  });

  it('G — mid-run wake without initial claim gets successor after snapshot', async () => {
    await coordinator.persistPendingWakeAtomic(
      VEHICLE_ID,
      TOKEN_ID,
      makeWake(0, '2026-09-07T14:00:40.000Z'),
    );

    await coordinator.afterSnapshotJob({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      jobData: { vehicleId: VEHICLE_ID, dimoTokenId: TOKEN_ID, origin: 'SCHEDULED' },
      claimedPendingWake: null,
      effectiveWakeContext: undefined,
      snapshotSourceTimestamp: new Date('2026-09-07T14:00:10.000Z'),
      staleMonotonicSkipped: false,
      tripStartEvalError: false,
      possibleStartCreated: false,
      providerFetchFailed: false,
      fsmState: TripDetectionState.RESTING,
    });

    expect(redis.store.has(successorWakeRedisKey(VEHICLE_ID))).toBe(true);
  });

  it('H — successor compare-and-clear preserves newer successor B', async () => {
    await coordinator.persistSuccessorHandoffAtomic({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(0, '2026-09-07T14:00:20.000Z'),
      notBeforeMs: Date.now() - 1,
    });
    const first = await coordinator.loadSuccessorHandoff(VEHICLE_ID);
    await coordinator.persistSuccessorHandoffAtomic({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(0, '2026-09-07T14:00:50.000Z'),
      notBeforeMs: Date.now() - 1,
    });

    const cleared = await coordinator.acknowledgeSuccessorHandoff(
      VEHICLE_ID,
      first!.version,
    );
    expect(cleared).toBe(false);
    const latest = await coordinator.loadSuccessorHandoff(VEHICLE_ID);
    expect(latest?.wakeContext.providerObservedAt).toBe('2026-09-07T14:00:50.000Z');
  });

  it('I — urgent wake preserves earliest notBefore when old delayed handoff exists', async () => {
    const later = Date.now() + 120_000;
    await coordinator.persistSuccessorHandoffAtomic({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'WAKE_PROBE',
      wakeContext: makeWake(1),
      notBeforeMs: later,
    });
    handoffGetJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('delayed'),
      opts: { delay: 120_000 },
      changeDelay: handoffChangeDelay,
    });

    await coordinator.scheduleDurableSuccessor({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'PROVIDER_WAKE',
      wakeContext: makeWake(0, '2026-09-07T14:00:55.000Z'),
      delayMs: 0,
    });

    const successor = await coordinator.loadSuccessorHandoff(VEHICLE_ID);
    expect(successor!.notBeforeMs).toBeLessThanOrEqual(Date.now() + 1000);
    expect(handoffChangeDelay).toHaveBeenCalled();
  });

  it('dispatches canonical snapshot and clears exact successor version on success', async () => {
    await coordinator.persistSuccessorHandoffAtomic({
      vehicleId: VEHICLE_ID,
      dimoTokenId: TOKEN_ID,
      origin: 'WAKE_PROBE',
      wakeContext: makeWake(1),
      notBeforeMs: Date.now() - 1,
    });
    const loaded = await coordinator.loadSuccessorHandoff(VEHICLE_ID);

    await coordinator.dispatchSuccessorHandoff(VEHICLE_ID);

    expect(queueAdd).toHaveBeenCalledWith(
      'snapshot',
      expect.objectContaining({ vehicleId: VEHICLE_ID }),
      expect.objectContaining({ jobId: snapshotJobId(VEHICLE_ID) }),
    );
    expect(await coordinator.loadSuccessorHandoff(VEHICLE_ID)).toBeNull();
    expect(loaded?.version).toBeGreaterThan(0);
  });
});
