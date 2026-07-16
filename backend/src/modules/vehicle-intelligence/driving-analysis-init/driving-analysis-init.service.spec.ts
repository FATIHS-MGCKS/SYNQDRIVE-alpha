import { BadRequestException } from '@nestjs/common';
import { DrivingAnalysisInitService } from './driving-analysis-init.service';
import {
  DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
  DRIVING_INTELLIGENCE_PIPELINE_START_JOB,
  buildInitJobIdempotencyKey,
} from './driving-analysis-init.types';

function makePrisma() {
  return {
    vehicleTrip: { findFirst: jest.fn() },
    vehicleTripWaypoint: { count: jest.fn() },
    drivingIntelligenceJob: { findMany: jest.fn() },
  } as any;
}

function makeAnalysisRunService() {
  return {
    resolveOrBeginRun: jest.fn(),
  };
}

function makeJobDispatcher() {
  return {
    enqueue: jest.fn(),
  };
}

function makeJobRepository() {
  return {
    findByIdempotencyKey: jest.fn(),
  };
}

describe('DrivingAnalysisInitService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let analysisRunService: ReturnType<typeof makeAnalysisRunService>;
  let jobDispatcher: ReturnType<typeof makeJobDispatcher>;
  let jobRepository: ReturnType<typeof makeJobRepository>;
  let service: DrivingAnalysisInitService;

  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'vehicle-1',
    tripId: 'trip-1',
    source: 'LIVE_FINALIZE' as const,
  };

  beforeEach(() => {
    prisma = makePrisma();
    analysisRunService = makeAnalysisRunService();
    jobDispatcher = makeJobDispatcher();
    jobRepository = makeJobRepository();
    service = new DrivingAnalysisInitService(
      prisma,
      analysisRunService as any,
      jobDispatcher as any,
      jobRepository as any,
    );

    prisma.vehicleTrip.findFirst.mockResolvedValue({
      id: 'trip-1',
      vehicleId: 'vehicle-1',
      tripStatus: 'COMPLETED',
      endTime: new Date('2026-07-16T10:00:00.000Z'),
      behaviorEnrichmentStatus: 'PENDING',
      routeEnrichmentStatus: null,
    });
    prisma.vehicleTripWaypoint.count.mockResolvedValue(12);
    analysisRunService.resolveOrBeginRun.mockResolvedValue({
      run: { id: 'run-1', status: 'IN_PROGRESS' },
      created: true,
      deduplicated: false,
      supersededRunId: null,
    });
    jobDispatcher.enqueue.mockResolvedValue({
      job: { id: 'job-1' },
      created: true,
      deduplicated: false,
      enqueued: true,
    });
  });

  it('refuses init when trip is not yet COMPLETED', async () => {
    prisma.vehicleTrip.findFirst.mockResolvedValue({
      id: 'trip-1',
      vehicleId: 'vehicle-1',
      tripStatus: 'ONGOING',
      endTime: null,
      behaviorEnrichmentStatus: 'PENDING',
      routeEnrichmentStatus: null,
    });

    await expect(service.initializeForCompletedTrip(baseInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(analysisRunService.resolveOrBeginRun).not.toHaveBeenCalled();
  });

  it('creates analysis run and enqueues pipeline start with stable idempotency key', async () => {
    const result = await service.initializeForCompletedTrip(baseInput);

    expect(result.runId).toBe('run-1');
    expect(result.runCreated).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.enqueued).toBe(true);
    expect(result.queueErrors).toHaveLength(0);

    expect(analysisRunService.resolveOrBeginRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip-1',
        modelVersion: DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
        analysisType: 'TRIP_ENRICHMENT',
      }),
    );

    expect(jobDispatcher.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: DRIVING_INTELLIGENCE_PIPELINE_START_JOB,
        analysisRunId: 'run-1',
        idempotencyKey: buildInitJobIdempotencyKey(
          'trip-1',
          DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
          DRIVING_INTELLIGENCE_PIPELINE_START_JOB,
        ),
        correlationId: 'trip-finalize:trip-1',
      }),
    );
  });

  it('deduplicates duplicate finalize events — second init does not enqueue again', async () => {
    await service.initializeForCompletedTrip(baseInput);

    analysisRunService.resolveOrBeginRun.mockResolvedValue({
      run: { id: 'run-1', status: 'COMPLETED' },
      created: false,
      deduplicated: true,
      supersededRunId: null,
    });

    const second = await service.initializeForCompletedTrip(baseInput);

    expect(second.runDeduplicated).toBe(true);
    expect(second.jobs).toHaveLength(0);
    expect(jobDispatcher.enqueue).toHaveBeenCalledTimes(1);
  });

  it('surfaces queue errors and leaves jobs retryable via PENDING row lookup', async () => {
    jobDispatcher.enqueue.mockRejectedValue(new Error('Redis connection refused'));
    jobRepository.findByIdempotencyKey.mockResolvedValue({
      id: 'job-pending-1',
      status: 'PENDING',
    });

    const result = await service.initializeForCompletedTrip(baseInput);

    expect(result.queueErrors).toEqual(
      expect.arrayContaining([expect.stringContaining('Redis connection refused')]),
    );
    expect(result.jobs[0]?.enqueued).toBe(false);
    expect(result.jobs[0]?.jobId).toBe('job-pending-1');
  });

  it('retries pending jobs for a trip after queue recovery', async () => {
    prisma.drivingIntelligenceJob.findMany.mockResolvedValue([
      {
        id: 'job-pending-1',
        vehicleId: 'vehicle-1',
        tripId: 'trip-1',
        bookingId: null,
        analysisRunId: 'run-1',
        jobType: DRIVING_INTELLIGENCE_PIPELINE_START_JOB,
        modelVersion: DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
        idempotencyKey: buildInitJobIdempotencyKey(
          'trip-1',
          DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
          DRIVING_INTELLIGENCE_PIPELINE_START_JOB,
        ),
        correlationId: 'trip-finalize:trip-1',
        requestedAt: new Date('2026-07-16T10:00:00.000Z'),
        status: 'PENDING',
      },
    ]);
    jobDispatcher.enqueue.mockResolvedValue({
      job: { id: 'job-pending-1' },
      created: false,
      deduplicated: true,
      enqueued: true,
    });

    const retried = await service.retryPendingJobsForTrip('org-1', 'trip-1');

    expect(retried).toHaveLength(1);
    expect(retried[0]?.enqueued).toBe(true);
    expect(jobDispatcher.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: buildInitJobIdempotencyKey(
          'trip-1',
          DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
          DRIVING_INTELLIGENCE_PIPELINE_START_JOB,
        ),
      }),
    );
  });
});
