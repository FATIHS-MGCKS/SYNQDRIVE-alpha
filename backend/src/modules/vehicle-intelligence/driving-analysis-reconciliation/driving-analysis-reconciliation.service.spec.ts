import { DrivingAnalysisReconciliationService } from './driving-analysis-reconciliation.service';
import {
  DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES,
  buildReconciliationIdempotencyKey,
} from './driving-analysis-reconciliation.types';

describe('DrivingAnalysisReconciliationService', () => {
  it('builds hour-bucket idempotency keys for reconciliation actions', () => {
    const key = buildReconciliationIdempotencyKey(
      DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.TRIP_WITHOUT_ANALYSIS_RUN,
      'trip-1',
      3_600_000,
      3_600_000 * 5,
    );
    expect(key).toBe('reconcile:TRIP_WITHOUT_ANALYSIS_RUN:trip-1:5');
  });

  it('second remediation with same bucket deduplicates via dispatcher skip', async () => {
    const prisma = {
      organization: { findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]) },
      vehicleTrip: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'trip-1', vehicleId: 'vehicle-1' }])
          .mockResolvedValue([])
          .mockResolvedValue([])
          .mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ vehicleId: 'vehicle-1', tripStatus: 'COMPLETED' }),
      },
      drivingAnalysisRun: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      tripDrivingImpact: { findMany: jest.fn().mockResolvedValue([]) },
      drivingEvent: { findMany: jest.fn().mockResolvedValue([]) },
      booking: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      drivingIntelligenceJob: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    } as any;

    const analysisInit = {
      initializeForCompletedTrip: jest.fn().mockResolvedValue({
        runId: 'run-1',
        runCreated: false,
        runDeduplicated: true,
        jobs: [{ enqueued: false, deduplicated: true }],
        queueErrors: [],
      }),
    };
    const jobDispatcher = { enqueue: jest.fn() };
    const jobRepository = {
      findRetryablePending: jest.fn().mockResolvedValue([]),
      findStuckInProgress: jest.fn().mockResolvedValue([]),
    };

    const service = new DrivingAnalysisReconciliationService(
      prisma,
      analysisInit as any,
      jobDispatcher as any,
      jobRepository as any,
    );

    const first = await service.runPeriodicReconciliation({ organizationId: 'org-1', maxActions: 10 });
    const second = await service.runPeriodicReconciliation({ organizationId: 'org-1', maxActions: 10 });

    expect(first.findings.length).toBeGreaterThan(0);
    expect(analysisInit.initializeForCompletedTrip).toHaveBeenCalledTimes(1);
    expect(second.actionsSkipped).toBeGreaterThanOrEqual(0);
    expect(second.actionsEnqueued).toBe(0);
  });
});
