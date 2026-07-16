import { TripPostFinalizeAnalysisProducer } from './trip-post-finalize-analysis.producer';
import { DrivingAnalysisInitService } from './driving-analysis-init.service';

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
});
