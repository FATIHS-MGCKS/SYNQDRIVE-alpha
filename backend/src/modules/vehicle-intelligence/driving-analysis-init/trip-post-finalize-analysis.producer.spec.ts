import { RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS } from '@modules/rental-driving-analysis/rental-driving-analysis.recompute.types';
import { TripPostFinalizeAnalysisProducer } from './trip-post-finalize-analysis.producer';
import { DrivingAnalysisInitService } from './driving-analysis-init.service';
import type { RentalDrivingAnalysisRecomputeTriggerPort } from '../ports/rental-driving-analysis-recompute-trigger.port';

function mockRentalRecomputeTriggerPort(): jest.Mocked<RentalDrivingAnalysisRecomputeTriggerPort> {
  return {
    enqueueForBooking: jest.fn().mockResolvedValue({ enqueued: true }),
    enqueueForTrip: jest.fn().mockResolvedValue({ enqueued: true }),
  };
}

describe('TripPostFinalizeAnalysisProducer', () => {
  it('awaits durable init and returns null when organizationId is missing', async () => {
    const analysisInit = {
      initializeForCompletedTrip: jest.fn(),
    };
    const producer = new TripPostFinalizeAnalysisProducer(analysisInit as unknown as DrivingAnalysisInitService);

    const result = await producer.produceAfterPersistedCompletion({
      tripId: 'trip-1',
      vehicleId: 'vehicle-1',
      organizationId: null,
      source: 'LIVE_FINALIZE',
    });

    expect(result).toBeNull();
    expect(analysisInit.initializeForCompletedTrip).not.toHaveBeenCalled();
  });

  it('returns queue errors without throwing so finalize path is not poisoned', async () => {
    const analysisInit = {
      initializeForCompletedTrip: jest.fn().mockResolvedValue({
        runId: 'run-1',
        runCreated: true,
        runDeduplicated: false,
        jobs: [],
        queueErrors: ['Redis down'],
      }),
    };
    const producer = new TripPostFinalizeAnalysisProducer(analysisInit as unknown as DrivingAnalysisInitService);

    const result = await producer.produceAfterPersistedCompletion({
      tripId: 'trip-1',
      vehicleId: 'vehicle-1',
      organizationId: 'org-1',
      source: 'LIVE_FINALIZE',
    });

    expect(result?.queueErrors).toEqual(['Redis down']);
  });

  it('fire-and-forget enqueueForTrip with TRIP_COMPLETED after successful init', async () => {
    const analysisInit = {
      initializeForCompletedTrip: jest.fn().mockResolvedValue({
        runId: 'run-1',
        runCreated: true,
        runDeduplicated: false,
        jobs: [],
        queueErrors: [],
      }),
    };
    const rentalRecomputeTrigger = mockRentalRecomputeTriggerPort();
    const producer = new TripPostFinalizeAnalysisProducer(
      analysisInit as unknown as DrivingAnalysisInitService,
      rentalRecomputeTrigger,
    );

    await producer.produceAfterPersistedCompletion({
      tripId: 'trip-9',
      vehicleId: 'veh-9',
      organizationId: 'org-9',
      source: 'LIVE_FINALIZE',
    });

    await new Promise((r) => setImmediate(r));

    expect(rentalRecomputeTrigger.enqueueForTrip).toHaveBeenCalledWith({
      organizationId: 'org-9',
      vehicleId: 'veh-9',
      tripId: 'trip-9',
      reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.TRIP_COMPLETED,
      correlationId: `rental-recompute:trip:trip-9:${RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.TRIP_COMPLETED}`,
    });
  });
});
