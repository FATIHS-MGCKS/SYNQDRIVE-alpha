import type { DrivingIntelligenceJob } from '@prisma/client';
import { DrivingIntelligenceJobRetryableError } from '../driving-intelligence-jobs/driving-intelligence-jobs.errors';
import { DrivingEventContextEnrichJobHandler } from './driving-event-context-enrich.handler';
import { buildPerEventContextJobIdempotencyKey } from './driving-event-context-job.contract';

describe('DrivingEventContextEnrichJobHandler', () => {
  function makeJob(overrides: Partial<DrivingIntelligenceJob> = {}): DrivingIntelligenceJob {
    return {
      id: 'job-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      bookingId: null,
      analysisRunId: 'run-1',
      jobType: 'DRIVING_EVENT_CONTEXT_ENRICH',
      modelVersion: 'di-v2-pipeline-v1',
      idempotencyKey: buildPerEventContextJobIdempotencyKey('ev-1'),
      correlationId: 'corr-1',
      requestedAt: new Date(),
      status: 'IN_PROGRESS',
      attemptCount: 1,
      maxAttempts: 3,
      nextRetryAt: null,
      lastAttemptAt: new Date(),
      bullJobId: 'bull-1',
      errorCode: null,
      errorMessage: null,
      completedAt: null,
      deadLetteredAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it('retries on transient provider errors before persisting PROVIDER_ERROR', async () => {
    const enrichment = {
      enrichDrivingEventContextForJob: jest.fn(async () => {
        throw new DrivingIntelligenceJobRetryableError('PROVIDER_TRANSIENT', '503 timeout');
      }),
    };
    const contextJobs = {
      isCoordinatorJob: jest.fn(() => false),
      parsePerEventJob: jest.fn(() => ({ drivingEventId: 'ev-1', contextModelVersion: '2026-07-16.1' })),
      tryCompleteEventContextStage: jest.fn(),
    };
    const handler = new DrivingEventContextEnrichJobHandler(enrichment as any, contextJobs as any);

    await expect(handler.handle(makeJob({ attemptCount: 1 }))).rejects.toThrow('503 timeout');
    expect(enrichment.enrichDrivingEventContextForJob).toHaveBeenCalledWith(
      'ev-1',
      '2026-07-16.1',
      { attemptCount: 1, maxAttempts: 3 },
    );
  });

  it('persists PROVIDER_ERROR on final attempt without rethrowing', async () => {
    const assessment = { status: 'PROVIDER_ERROR', contextModelVersion: '2026-07-16.1' };
    const enrichment = {
      enrichDrivingEventContextForJob: jest.fn(async () => assessment),
    };
    const contextJobs = {
      isCoordinatorJob: jest.fn(() => false),
      parsePerEventJob: jest.fn(() => ({ drivingEventId: 'ev-1', contextModelVersion: '2026-07-16.1' })),
      tryCompleteEventContextStage: jest.fn(async () => true),
    };
    const handler = new DrivingEventContextEnrichJobHandler(enrichment as any, contextJobs as any);

    await expect(handler.handle(makeJob({ attemptCount: 3 }))).resolves.toBeUndefined();
    expect(contextJobs.tryCompleteEventContextStage).toHaveBeenCalledWith('org-1', 'run-1', 'trip-1');
  });

  it('delegates coordinator jobs to fan-out service', async () => {
    const enrichment = { enrichDrivingEventContextForJob: jest.fn() };
    const contextJobs = {
      isCoordinatorJob: jest.fn(() => true),
      handleCoordinatorJob: jest.fn(async () => undefined),
      parsePerEventJob: jest.fn(),
      tryCompleteEventContextStage: jest.fn(),
    };
    const handler = new DrivingEventContextEnrichJobHandler(enrichment as any, contextJobs as any);

    await handler.handle(makeJob({ idempotencyKey: 'stage:trip-1:v1:EVENT_CONTEXT:abc' }));
    expect(contextJobs.handleCoordinatorJob).toHaveBeenCalled();
    expect(enrichment.enrichDrivingEventContextForJob).not.toHaveBeenCalled();
  });
});
