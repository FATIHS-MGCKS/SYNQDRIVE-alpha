import { DelayedError } from 'bullmq';
import { TripDetectionState, VehicleStatus } from '@prisma/client';

import { SnapshotWakeHandoffProcessor } from '../processors/snapshot-wake-handoff.processor';
import { SnapshotWakeCoordinatorService } from './snapshot-wake-coordinator.service';
import { SnapshotWakeHandoffDeferError } from './snapshot-wake-handoff-defer.error';
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

const VEHICLE_ID = 'veh-r9c';
const TOKEN_ID = 42;
const PROBE_DELAY_MS = wakeProbeDelayMs(loadSnapshotPollingTierConfig());

function makeWake(
  probeGeneration: 0 | 1 = 0,
  providerObservedAt: string | null = '2026-09-07T14:00:20.000Z',
  receivedAt = '2026-09-07T14:00:21.000Z',
  reason: 'IGNITION_ON' | 'SPEED_MOVEMENT' = 'IGNITION_ON',
) {
  return buildSnapshotWakeContext({
    reason,
    signalName: reason === 'IGNITION_ON' ? 'isIgnitionOn' : 'speed',
    providerObservedAt: providerObservedAt
      ? new Date(providerObservedAt)
      : null,
    receivedAt: new Date(receivedAt),
    probeGeneration,
  });
}

function createCoordinatorHarness() {
  const redis = createSnapshotWakeRedisTestHarness();
  const queueAdd = jest.fn().mockResolvedValue(undefined);
  const queueGetJob = jest.fn().mockResolvedValue(null);
  const handoffAdd = jest.fn().mockResolvedValue(undefined);
  const handoffChangeDelay = jest.fn().mockResolvedValue(undefined);
  const handoffGetJob = jest.fn().mockResolvedValue(null);

  const coordinator = new SnapshotWakeCoordinatorService(
    { add: queueAdd, getJob: queueGetJob } as never,
    { add: handoffAdd, getJob: handoffGetJob } as never,
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

  return {
    redis,
    coordinator,
    queueAdd,
    queueGetJob,
    handoffAdd,
    handoffGetJob,
    handoffChangeDelay,
  };
}

describe('SnapshotWakeCoordinatorService — R9C BullMQ delay & single-probe closure', () => {
  describe('afterSnapshotJob generation-1 terminal guard', () => {
    it('generation-1 + claimed pending + stale snapshot does not schedule successor', async () => {
      const { coordinator, handoffAdd, redis } = createCoordinatorHarness();
      const gen0 = makeWake(0);
      await coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, gen0);
      const claimed = await coordinator.claimPendingWakeForRun(VEHICLE_ID);
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
        claimedPendingWake: claimed,
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

    it('generation-1 + claimed pending + provider fetch failure does not schedule successor', async () => {
      const { coordinator, handoffAdd } = createCoordinatorHarness();
      const gen0 = makeWake(0);
      await coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, gen0);
      const claimed = await coordinator.claimPendingWakeForRun(VEHICLE_ID);

      await coordinator.afterSnapshotJob({
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
        snapshotSourceTimestamp: null,
        staleMonotonicSkipped: false,
        tripStartEvalError: false,
        possibleStartCreated: false,
        providerFetchFailed: true,
        fsmState: TripDetectionState.RESTING,
      });

      expect(handoffAdd).not.toHaveBeenCalled();
    });

    it('generation-1 + null providerObservedAt does not schedule another probe', async () => {
      const { coordinator, handoffAdd } = createCoordinatorHarness();

      await coordinator.afterSnapshotJob({
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        jobData: {
          vehicleId: VEHICLE_ID,
          dimoTokenId: TOKEN_ID,
          origin: 'WAKE_PROBE',
          wakeContext: makeWake(1, null),
        },
        claimedPendingWake: null,
        effectiveWakeContext: makeWake(1, null),
        snapshotSourceTimestamp: null,
        staleMonotonicSkipped: false,
        tripStartEvalError: false,
        possibleStartCreated: false,
        providerFetchFailed: true,
        fsmState: TripDetectionState.RESTING,
      });

      expect(handoffAdd).not.toHaveBeenCalled();
    });

    it('generation-1 stale ACK with newer generation-0 wake schedules successor for newer wake only', async () => {
      const { coordinator, handoffAdd, redis } = createCoordinatorHarness();
      const oldWake = makeWake(0, '2026-09-07T14:00:20.000Z');
      await coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, oldWake);
      const claimed = await coordinator.claimPendingWakeForRun(VEHICLE_ID);
      await coordinator.persistPendingWakeAtomic(
        VEHICLE_ID,
        TOKEN_ID,
        makeWake(0, '2026-09-07T14:00:45.000Z'),
      );

      await coordinator.afterSnapshotJob({
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

      expect(handoffAdd).toHaveBeenCalledTimes(1);
      const successor = await coordinator.loadSuccessorHandoff(VEHICLE_ID);
      expect(successor?.origin).toBe('PROVIDER_WAKE');
      expect(successor?.wakeContext.probeGeneration).toBe(0);
      expect(successor?.wakeContext.providerObservedAt).toBe(
        '2026-09-07T14:00:45.000Z',
      );
      expect(redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(true);
    });
  });

  describe('afterSnapshotJob fresh covered generation-0 probe ordering', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-07T14:00:30.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('fresh covered generation-0 + POSSIBLE_START ACKs without probe', async () => {
      const { coordinator, handoffAdd, redis } = createCoordinatorHarness();
      const wake = makeWake(0, '2026-09-07T14:00:20.000Z');
      await coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, wake);
      const claimed = await coordinator.claimPendingWakeForRun(VEHICLE_ID);

      await coordinator.afterSnapshotJob({
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
        possibleStartCreated: true,
        providerFetchFailed: false,
        fsmState: TripDetectionState.RESTING,
      });

      expect(handoffAdd).not.toHaveBeenCalled();
      expect(redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(false);
    });

    it('fresh covered generation-0 + no candidate schedules exactly one generation-1 probe', async () => {
      const { coordinator, handoffAdd, redis } = createCoordinatorHarness();
      const wake = makeWake(0, '2026-09-07T14:00:20.000Z');
      await coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, wake);
      const claimed = await coordinator.claimPendingWakeForRun(VEHICLE_ID);
      const before = Date.now();

      await coordinator.afterSnapshotJob({
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

      expect(handoffAdd).toHaveBeenCalledWith(
        'dispatch',
        { vehicleId: VEHICLE_ID },
        expect.objectContaining({ jobId: snapshotWakeHandoffJobId(VEHICLE_ID) }),
      );
      const successor = await coordinator.loadSuccessorHandoff(VEHICLE_ID);
      expect(successor?.origin).toBe('WAKE_PROBE');
      expect(successor?.wakeContext.probeGeneration).toBe(1);
      expect(successor!.notBeforeMs).toBeGreaterThanOrEqual(before + PROBE_DELAY_MS - 5);
      expect(redis.store.has(pendingWakeRedisKey(VEHICLE_ID))).toBe(false);
    });

    it('fresh covered generation-0 + trip eval error schedules exactly one generation-1 probe', async () => {
      const { coordinator, handoffAdd } = createCoordinatorHarness();
      const wake = makeWake(0, '2026-09-07T14:00:20.000Z');
      await coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, wake);

      await coordinator.afterSnapshotJob({
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        jobData: {
          vehicleId: VEHICLE_ID,
          dimoTokenId: TOKEN_ID,
          origin: 'PROVIDER_WAKE',
          wakeContext: wake,
        },
        claimedPendingWake: null,
        effectiveWakeContext: wake,
        snapshotSourceTimestamp: new Date('2026-09-07T14:00:21.000Z'),
        staleMonotonicSkipped: false,
        tripStartEvalError: true,
        possibleStartCreated: false,
        providerFetchFailed: false,
        fsmState: TripDetectionState.RESTING,
      });

      expect(handoffAdd).toHaveBeenCalledTimes(1);
      const successor = await coordinator.loadSuccessorHandoff(VEHICLE_ID);
      expect(successor?.wakeContext.probeGeneration).toBe(1);
    });

    it('generation-1 equivalent of fresh covered no-candidate does not schedule another probe', async () => {
      const { coordinator, handoffAdd } = createCoordinatorHarness();

      await coordinator.afterSnapshotJob({
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        jobData: {
          vehicleId: VEHICLE_ID,
          dimoTokenId: TOKEN_ID,
          origin: 'WAKE_PROBE',
          wakeContext: makeWake(1),
        },
        claimedPendingWake: null,
        effectiveWakeContext: makeWake(1),
        snapshotSourceTimestamp: new Date('2026-09-07T14:00:21.000Z'),
        staleMonotonicSkipped: false,
        tripStartEvalError: true,
        possibleStartCreated: false,
        providerFetchFailed: false,
        fsmState: TripDetectionState.RESTING,
      });

      expect(handoffAdd).not.toHaveBeenCalled();
    });
  });

  describe('null timestamp probe bound', () => {
    it('generation-0 null providerObservedAt + fetch failure may create one generation-1 probe', async () => {
      const { coordinator, handoffAdd } = createCoordinatorHarness();
      const wake = makeWake(0, null);
      await coordinator.persistPendingWakeAtomic(VEHICLE_ID, TOKEN_ID, wake);

      await coordinator.afterSnapshotJob({
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        jobData: {
          vehicleId: VEHICLE_ID,
          dimoTokenId: TOKEN_ID,
          origin: 'PROVIDER_WAKE',
          wakeContext: wake,
        },
        claimedPendingWake: null,
        effectiveWakeContext: wake,
        snapshotSourceTimestamp: null,
        staleMonotonicSkipped: false,
        tripStartEvalError: false,
        possibleStartCreated: false,
        providerFetchFailed: true,
        fsmState: TripDetectionState.RESTING,
      });

      expect(handoffAdd).toHaveBeenCalledTimes(1);
      const successor = await coordinator.loadSuccessorHandoff(VEHICLE_ID);
      expect(successor?.wakeContext.probeGeneration).toBe(1);
    });
  });

  describe('dispatchSuccessorHandoff stale successor ACK rearm', () => {
    it('re-arms when newer successor arrives during dispatch and dispatches latest on retry', async () => {
      const { coordinator, queueAdd, queueGetJob } = createCoordinatorHarness();
      queueGetJob.mockResolvedValue(null);

      await coordinator.persistSuccessorHandoffAtomic({
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        origin: 'WAKE_PROBE',
        wakeContext: makeWake(1),
        notBeforeMs: Date.now() - 1,
      });
      const first = await coordinator.loadSuccessorHandoff(VEHICLE_ID);

      queueAdd.mockImplementation(async () => {
        await coordinator.persistSuccessorHandoffAtomic({
          vehicleId: VEHICLE_ID,
          dimoTokenId: TOKEN_ID,
          origin: 'PROVIDER_WAKE',
          wakeContext: makeWake(0, '2026-09-07T14:01:00.000Z'),
          notBeforeMs: Date.now() - 1,
        });
      });

      await expect(
        coordinator.dispatchSuccessorHandoff(VEHICLE_ID),
      ).rejects.toBeInstanceOf(SnapshotWakeHandoffDeferError);
      expect(queueAdd).toHaveBeenCalledTimes(1);

      queueAdd.mockImplementation(async () => undefined);
      await coordinator.dispatchSuccessorHandoff(VEHICLE_ID);

      expect(queueAdd).toHaveBeenCalledTimes(2);
      expect(await coordinator.loadSuccessorHandoff(VEHICLE_ID)).toBeNull();
      expect(first?.version).toBeGreaterThan(0);
    });
  });

  describe('enqueueHandoffJob waiting vs delayed', () => {
    it('does not call changeDelay when handoff job is waiting', async () => {
      const { coordinator, handoffAdd, handoffGetJob, handoffChangeDelay } =
        createCoordinatorHarness();
      handoffGetJob.mockResolvedValue({
        getState: jest.fn().mockResolvedValue('waiting'),
        changeDelay: handoffChangeDelay,
      });

      await coordinator.enqueueHandoffJob(VEHICLE_ID, Date.now() + 5000);

      expect(handoffChangeDelay).not.toHaveBeenCalled();
      expect(handoffAdd).not.toHaveBeenCalled();
    });

    it('adjusts delayed handoff deadline from successor notBeforeMs', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-07T14:00:00.000Z'));
      const { coordinator, handoffGetJob, handoffChangeDelay, handoffAdd } =
        createCoordinatorHarness();
      const notBeforeMs = Date.now() + 30_000;
      handoffGetJob.mockResolvedValue({
        getState: jest.fn().mockResolvedValue('delayed'),
        changeDelay: handoffChangeDelay,
      });

      await coordinator.enqueueHandoffJob(VEHICLE_ID, notBeforeMs);

      expect(handoffChangeDelay).toHaveBeenCalledWith(30_000);
      expect(handoffAdd).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('successor merge determinism', () => {
    it('keeps newer receivedAt on equal providerObservedAt', async () => {
      const { coordinator } = createCoordinatorHarness();
      const observed = '2026-09-07T14:00:20.000Z';

      await coordinator.persistSuccessorHandoffAtomic({
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        origin: 'PROVIDER_WAKE',
        wakeContext: makeWake(0, observed, '2026-09-07T14:00:21.000Z'),
        notBeforeMs: Date.now() + 60_000,
      });
      await coordinator.persistSuccessorHandoffAtomic({
        vehicleId: VEHICLE_ID,
        dimoTokenId: TOKEN_ID,
        origin: 'PROVIDER_WAKE',
        wakeContext: makeWake(0, observed, '2026-09-07T14:00:19.000Z'),
        notBeforeMs: Date.now() + 30_000,
      });

      const successor = await coordinator.loadSuccessorHandoff(VEHICLE_ID);
      expect(successor?.wakeContext.receivedAt).toBe(
        '2026-09-07T14:00:21.000Z',
      );
      expect(successor!.notBeforeMs).toBeLessThanOrEqual(Date.now() + 30_000 + 5);
    });
  });
});

describe('SnapshotWakeHandoffProcessor — R9C BullMQ DelayedError protocol', () => {
  it('throws BullMQ DelayedError after moveToDelayed on defer', async () => {
    const moveToDelayed = jest.fn().mockResolvedValue(undefined);
    const dispatchSuccessorHandoff = jest
      .fn()
      .mockRejectedValue(new SnapshotWakeHandoffDeferError(1500, 'canonical_active'));

    const processor = new SnapshotWakeHandoffProcessor({
      dispatchSuccessorHandoff,
    } as never);

    const job = {
      data: { vehicleId: VEHICLE_ID },
      token: 'tok-1',
      moveToDelayed,
    };

    await expect(processor.process(job as never)).rejects.toBeInstanceOf(
      DelayedError,
    );
    expect(moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'tok-1');
  });

  it('does not return normal success after defer', async () => {
    const processor = new SnapshotWakeHandoffProcessor({
      dispatchSuccessorHandoff: jest
        .fn()
        .mockRejectedValue(new SnapshotWakeHandoffDeferError(500, 'not_before')),
    } as never);

    const result = processor.process({
      data: { vehicleId: VEHICLE_ID },
      token: 'tok',
      moveToDelayed: jest.fn().mockResolvedValue(undefined),
    } as never);

    await expect(result).rejects.toThrow();
    await expect(result).rejects.toBeInstanceOf(DelayedError);
  });
});
