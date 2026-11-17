import { RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS } from '@modules/rental-driving-analysis/rental-driving-analysis.recompute.types';
import { DrivingMisuseReconcileJobHandler } from '../misuse-cases/misuse-case-reconcile/driving-misuse-reconcile.handler';
import type { RentalDrivingAnalysisRecomputeTriggerPort } from './rental-driving-analysis-recompute-trigger.port';

describe('RentalDrivingAnalysisRecomputeTriggerPort — VI consumer parity', () => {
  const trigger: jest.Mocked<
    Pick<RentalDrivingAnalysisRecomputeTriggerPort, 'enqueueForBooking' | 'enqueueForTrip'>
  > = {
    enqueueForBooking: jest.fn().mockResolvedValue({ enqueued: true }),
    enqueueForTrip: jest.fn().mockResolvedValue({ enqueued: true }),
  };

  beforeEach(() => jest.resetAllMocks());

  it('DrivingMisuseReconcileJobHandler awaits enqueueForBooking with MISUSE_RECONCILED', async () => {
    const reconcile = { reconcileTrip: jest.fn().mockResolvedValue({ upserted: 1, resolved: 0 }) };
    const handler = new DrivingMisuseReconcileJobHandler(reconcile as any, trigger as any);

    await handler.handle({
      id: 'job-m',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      bookingId: 'book-1',
    } as any);

    expect(trigger.enqueueForBooking).toHaveBeenCalledTimes(1);
    expect(trigger.enqueueForBooking).toHaveBeenCalledWith({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      bookingId: 'book-1',
      tripId: 'trip-1',
      reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.MISUSE_RECONCILED,
      correlationId: `rental-recompute:book-1:${RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.MISUSE_RECONCILED}`,
    });
  });

  it('DrivingMisuseReconcileJobHandler skips enqueue when bookingId missing', async () => {
    const reconcile = { reconcileTrip: jest.fn().mockResolvedValue({ upserted: 0, resolved: 0 }) };
    const handler = new DrivingMisuseReconcileJobHandler(reconcile as any, trigger as any);

    await handler.handle({
      id: 'job-m',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
    } as any);

    expect(trigger.enqueueForBooking).not.toHaveBeenCalled();
  });
});