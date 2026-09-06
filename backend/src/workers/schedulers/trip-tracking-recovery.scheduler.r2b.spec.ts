import { TripDetectionState } from '@prisma/client';
import { TripTrackingRecoveryScheduler } from './trip-tracking-recovery.scheduler';
import {
  isPossibleEndRecoveryEligible,
} from '../../modules/vehicle-intelligence/trips/trip-fsm-clock-contract';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: () => true,
}));

const STUCK_POSSIBLE_END_THRESHOLD_MS = 30 * 60_000;
const SUSPICIOUS_LONG_OPEN_THRESHOLD_MS = 4 * 3600_000;

function makeSchedulerHarness(classification: {
  classification: string;
  action: string;
}) {
  const trackingQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const reconciliation = {
    onStuckTrip: jest.fn().mockResolvedValue(undefined),
    onAnomalyDetected: jest.fn().mockResolvedValue(undefined),
  };
  const lifecycleRecovery = {
    classifyDetectionState: jest.fn().mockResolvedValue(classification),
  };
  return { trackingQueue, reconciliation, lifecycleRecovery };
}

describe('TripTrackingRecoveryScheduler — R2B disposition matrix', () => {
  /** Scheduler uses live `new Date()` — anchor stale rows to real wall clock. */
  const schedulerNow = () => new Date();
  const oldStartFrom = (now: Date) =>
    new Date(now.getTime() - 5 * 3600_000);

  async function runScheduler(
    staleRow: Record<string, unknown>,
    classification: { classification: string; action: string },
  ) {
    const { trackingQueue, reconciliation, lifecycleRecovery } =
      makeSchedulerHarness(classification);
    const prisma = {
      vehicleTripDetectionState: {
        findMany: jest.fn().mockResolvedValue([staleRow]),
      },
    };
    const scheduler = new TripTrackingRecoveryScheduler(
      trackingQueue as any,
      prisma as any,
      { shouldRun: () => true } as any,
      reconciliation as any,
      lifecycleRecovery as any,
    );
    await scheduler.recoverStaleTripStates();
    return { trackingQueue, reconciliation };
  }

  it('A — RECOVERABLE_MISSING_POINTER: ACTIVE_TICK enqueued, no anomaly reconciliation', async () => {
    const now = schedulerNow();
    const { trackingQueue, reconciliation } = await runScheduler(
      {
        vehicleId: 'veh-a',
        organizationId: 'org',
        state: TripDetectionState.ACTIVE_TRIP,
        activeTripId: null,
        possibleStartAt: oldStartFrom(now),
        vehicle: { latestState: { dimoTokenId: 1 } },
      },
      { classification: 'RECOVERABLE_MISSING_POINTER', action: 'ADOPT_ONGOING' },
    );
    expect(trackingQueue.add).toHaveBeenCalledWith(
      'trip-recovery',
      expect.objectContaining({ trigger: 'ACTIVE_TICK' }),
      expect.any(Object),
    );
    expect(reconciliation.onAnomalyDetected).not.toHaveBeenCalled();
  });

  it('B — RECOVERABLE_SPLIT_REPOINT: ACTIVE_TICK enqueued, no anomaly reconciliation', async () => {
    const now = schedulerNow();
    const { trackingQueue, reconciliation } = await runScheduler(
      {
        vehicleId: 'veh-b',
        organizationId: 'org',
        state: TripDetectionState.ACTIVE_TRIP,
        activeTripId: 'trip1',
        possibleStartAt: oldStartFrom(now),
        vehicle: { latestState: { dimoTokenId: 2 } },
      },
      { classification: 'RECOVERABLE_SPLIT_REPOINT', action: 'REPOINT_ACTIVE_TRIP' },
    );
    expect(trackingQueue.add).toHaveBeenCalledWith(
      'trip-recovery',
      expect.objectContaining({ trigger: 'ACTIVE_TICK' }),
      expect.any(Object),
    );
    expect(reconciliation.onAnomalyDetected).not.toHaveBeenCalled();
  });

  it('C — RECOVERABLE_END_ORPHAN: PEC enqueued, onStuckTrip NOT called', async () => {
    const now = schedulerNow();
    const peEntered = new Date(now.getTime() - 45 * 60_000);
    const staleRow = {
      vehicleId: 'veh-c',
      organizationId: 'org',
      state: TripDetectionState.POSSIBLE_END,
      activeTripId: 'trip-x',
      possibleEndAt: peEntered,
      possibleEndEnteredAt: peEntered,
      possibleStartAt: oldStartFrom(now),
      vehicle: { latestState: { dimoTokenId: 3 } },
    };
    expect(
      isPossibleEndRecoveryEligible(staleRow as any, now, STUCK_POSSIBLE_END_THRESHOLD_MS),
    ).toBe(true);

    const { trackingQueue, reconciliation } = await runScheduler(staleRow, {
      classification: 'RECOVERABLE_END_ORPHAN',
      action: 'RESET_TO_RESTING',
    });
    expect(trackingQueue.add).toHaveBeenCalledWith(
      'trip-recovery',
      expect.objectContaining({ trigger: 'POSSIBLE_END_CHECK' }),
      expect.any(Object),
    );
    expect(reconciliation.onStuckTrip).not.toHaveBeenCalled();
  });

  it('D — RECOVERABLE_START_ORPHAN: POSSIBLE_START enqueued, no reconciliation', async () => {
    const now = schedulerNow();
    const { trackingQueue, reconciliation } = await runScheduler(
      {
        vehicleId: 'veh-d',
        organizationId: 'org',
        state: TripDetectionState.POSSIBLE_START,
        possibleStartAt: oldStartFrom(now),
        vehicle: { latestState: { dimoTokenId: 4 } },
      },
      { classification: 'RECOVERABLE_START_ORPHAN', action: 'ADOPT_ONGOING' },
    );
    expect(trackingQueue.add).toHaveBeenCalledWith(
      'trip-recovery',
      expect.objectContaining({ trigger: 'POSSIBLE_START' }),
      expect.any(Object),
    );
    expect(reconciliation.onStuckTrip).not.toHaveBeenCalled();
    expect(reconciliation.onAnomalyDetected).not.toHaveBeenCalled();
  });

  it('E — CONFLICT_MULTIPLE_ONGOING: no enqueue, no reconciliation', async () => {
    const now = schedulerNow();
    const { trackingQueue, reconciliation } = await runScheduler(
      {
        vehicleId: 'veh-e',
        organizationId: 'org',
        state: TripDetectionState.ACTIVE_TRIP,
        possibleStartAt: oldStartFrom(now),
        vehicle: { latestState: { dimoTokenId: 5 } },
      },
      { classification: 'CONFLICT_MULTIPLE_ONGOING', action: 'NO_SAFE_REPAIR' },
    );
    expect(trackingQueue.add).not.toHaveBeenCalled();
    expect(reconciliation.onStuckTrip).not.toHaveBeenCalled();
    expect(reconciliation.onAnomalyDetected).not.toHaveBeenCalled();
  });

  it('F — HEALTHY stuck POSSIBLE_END: enqueue + onStuckTrip eligible', async () => {
    const now = schedulerNow();
    const peEntered = new Date(now.getTime() - 45 * 60_000);
    const staleRow = {
      vehicleId: 'veh-f',
      organizationId: 'org',
      state: TripDetectionState.POSSIBLE_END,
      activeTripId: 'trip-f',
      possibleEndAt: peEntered,
      possibleEndEnteredAt: peEntered,
      possibleStartAt: oldStartFrom(now),
      vehicle: { latestState: { dimoTokenId: 6 } },
    };
    const { trackingQueue, reconciliation } = await runScheduler(staleRow, {
      classification: 'HEALTHY',
      action: 'NONE',
    });
    expect(trackingQueue.add).toHaveBeenCalled();
    expect(reconciliation.onStuckTrip).toHaveBeenCalledWith('veh-f', 'trip-f');
  });

  it('G — HEALTHY long ACTIVE_TRIP: anomaly reconciliation retained', async () => {
    const now = schedulerNow();
    const { trackingQueue, reconciliation } = await runScheduler(
      {
        vehicleId: 'veh-g',
        organizationId: 'org',
        state: TripDetectionState.ACTIVE_TRIP,
        activeTripId: 'trip-g',
        possibleStartAt: oldStartFrom(now),
        vehicle: { latestState: { dimoTokenId: 7 } },
      },
      { classification: 'HEALTHY', action: 'NONE' },
    );
    expect(trackingQueue.add).toHaveBeenCalled();
    expect(reconciliation.onAnomalyDetected).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId: 'veh-g',
        type: 'SUSPICIOUS_LONG_OPEN',
      }),
    );
  });
});
