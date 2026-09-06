import { TripDetectionState } from '@prisma/client';
import { TripTrackingRecoveryScheduler } from './trip-tracking-recovery.scheduler';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: () => true,
}));

function createTrackingQueueMock() {
  return {
    add: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn().mockResolvedValue(undefined),
  };
}

describe('TripTrackingRecoveryScheduler — R2A fail-closed filtering', () => {
  it('does not enqueue or reconcile blocked conflict states', async () => {
    const trackingQueue = createTrackingQueueMock();
    const reconciliation = {
      onStuckTrip: jest.fn().mockResolvedValue(undefined),
      onAnomalyDetected: jest.fn().mockResolvedValue(undefined),
    };
    const lifecycleRecovery = {
      classifyDetectionState: jest.fn().mockResolvedValue({
        classification: 'CONFLICT_MULTIPLE_ONGOING',
        action: 'NO_SAFE_REPAIR',
      }),
    };
    const staleRow = {
      vehicleId: 'veh-blocked',
      organizationId: 'org',
      state: TripDetectionState.POSSIBLE_END,
      activeTripId: 'trip-x',
      possibleEndAt: new Date('2026-09-06T09:00:00.000Z'),
      possibleEndEnteredAt: new Date('2026-09-06T09:00:00.000Z'),
      possibleStartAt: new Date('2026-09-06T08:00:00.000Z'),
      vehicle: { latestState: { dimoTokenId: 99 } },
    };

    const scheduler = new TripTrackingRecoveryScheduler(
      trackingQueue as any,
      { vehicleTripDetectionState: { findMany: jest.fn() } } as any,
      { shouldRun: () => true } as any,
      reconciliation as any,
      lifecycleRecovery as any,
    );

    await (scheduler as any).triggerEventBasedReconciliation(
      new Date('2026-09-06T10:00:00.000Z'),
      [],
    );
    expect(reconciliation.onStuckTrip).not.toHaveBeenCalled();

    const prisma = {
      vehicleTripDetectionState: {
        findMany: jest.fn().mockResolvedValue([staleRow]),
      },
    };
    const scheduler2 = new TripTrackingRecoveryScheduler(
      trackingQueue as any,
      prisma as any,
      { shouldRun: () => true } as any,
      reconciliation as any,
      lifecycleRecovery as any,
    );

    await scheduler2.recoverStaleTripStates();

    expect(trackingQueue.add).not.toHaveBeenCalled();
    expect(reconciliation.onStuckTrip).not.toHaveBeenCalled();
  });

  it('enqueues POSSIBLE_START for recoverable refined-start orphan classification', async () => {
    const trackingQueue = createTrackingQueueMock();
    const lifecycleRecovery = {
      classifyDetectionState: jest.fn().mockResolvedValue({
        classification: 'RECOVERABLE_START_ORPHAN',
        action: 'ADOPT_ONGOING',
      }),
    };
    const staleRow = {
      vehicleId: 'veh-recover',
      organizationId: 'org',
      state: TripDetectionState.POSSIBLE_START,
      possibleStartAt: new Date('2026-09-06T10:00:00.000Z'),
      vehicle: { latestState: { dimoTokenId: 7 } },
    };
    const prisma = {
      vehicleTripDetectionState: {
        findMany: jest.fn().mockResolvedValue([staleRow]),
      },
    };

    const scheduler = new TripTrackingRecoveryScheduler(
      trackingQueue as any,
      prisma as any,
      { shouldRun: () => true } as any,
      undefined,
      lifecycleRecovery as any,
    );

    await scheduler.recoverStaleTripStates();

    expect(trackingQueue.add).toHaveBeenCalledWith(
      'trip-recovery',
      expect.objectContaining({ trigger: 'POSSIBLE_START' }),
      expect.any(Object),
    );
  });
});
