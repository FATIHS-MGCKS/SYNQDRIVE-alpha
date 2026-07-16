import { DrivingEventSource } from '@prisma/client';
import { DrivingEventContextJobService } from './driving-event-context-job.service';
import { EVENT_CONTEXT_MODEL_VERSION } from './event-context.config';

describe('DrivingEventContextJobService', () => {
  function makeService(opts?: {
    events?: Array<{
      id: string;
      recordedAt: Date;
      metadataJson?: unknown;
      vehicle?: { hardwareType: string; fuelType: string };
    }>;
    pendingJobs?: number;
    enqueue?: jest.Mock;
  }) {
    const prisma = {
      drivingEvent: {
        findMany: jest.fn(async () =>
          opts?.events ?? [
            {
              id: 'ev-1',
              recordedAt: new Date(),
              metadataJson: null,
              vehicle: { hardwareType: 'LTE_R1', fuelType: 'GASOLINE' },
            },
          ],
        ),
      },
      drivingIntelligenceJob: {
        count: jest.fn(async () => opts?.pendingJobs ?? 0),
      },
      drivingAnalysisRun: {
        findFirst: jest.fn(async () => ({ vehicleId: 'veh-1', modelVersion: 'di-v2-pipeline-v1' })),
      },
    };
    const jobDispatcher = {
      enqueue: opts?.enqueue ?? jest.fn(async () => ({ enqueued: true, deduplicated: false, created: true, job: { id: 'j1' } })),
    };
    const stageRepository = {
      markCompleted: jest.fn(async () => ({})),
    };
    const stageOrchestrator = {
      syncRunStatusFromStages: jest.fn(async () => undefined),
      enqueueReadyStages: jest.fn(async () => ({ enqueued: [], readyStageKeys: [] })),
    };
    const service = new DrivingEventContextJobService(
      prisma as any,
      jobDispatcher as any,
      stageRepository as any,
      stageOrchestrator as any,
    );
    return { service, prisma, jobDispatcher, stageRepository, stageOrchestrator };
  }

  it('enqueues one job per eligible native event', async () => {
    const { service, jobDispatcher } = makeService({
      events: [
        { id: 'ev-a', recordedAt: new Date(), vehicle: { hardwareType: 'LTE_R1', fuelType: 'GASOLINE' } },
        { id: 'ev-b', recordedAt: new Date(), vehicle: { hardwareType: 'LTE_R1', fuelType: 'GASOLINE' } },
      ],
    });

    const result = await service.scheduleContextEnrichmentForTrip({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
      modelVersion: 'di-v2-pipeline-v1',
      correlationId: 'corr-1',
      requestedAt: new Date(),
    });

    expect(result.eligibleEvents).toBe(2);
    expect(result.enqueued).toBe(2);
    expect(jobDispatcher.enqueue).toHaveBeenCalledTimes(2);
    expect(jobDispatcher.enqueue.mock.calls[0][0].idempotencyKey).toContain('ev-a');
  });

  it('skips events that already have terminal assessments for the model version', async () => {
    const { service, jobDispatcher } = makeService({
      events: [
        {
          id: 'ev-done',
          recordedAt: new Date(),
          metadataJson: {
            contextAssessment: {
              status: 'SUCCESS',
              contextModelVersion: EVENT_CONTEXT_MODEL_VERSION,
            },
          },
          vehicle: { hardwareType: 'LTE_R1', fuelType: 'GASOLINE' },
        },
      ],
    });

    const result = await service.scheduleContextEnrichmentForTrip({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
      modelVersion: 'di-v2-pipeline-v1',
      correlationId: 'corr-1',
      requestedAt: new Date(),
    });

    expect(result.skipped).toBe(1);
    expect(jobDispatcher.enqueue).not.toHaveBeenCalled();
  });

  it('marks EVENT_CONTEXT stage complete when all eligible events are terminal', async () => {
    const { service, stageRepository } = makeService({
      events: [
        {
          id: 'ev-1',
          recordedAt: new Date(),
          metadataJson: {
            contextAssessment: {
              status: 'INSUFFICIENT_CADENCE',
              contextModelVersion: EVENT_CONTEXT_MODEL_VERSION,
            },
          },
          vehicle: { hardwareType: 'LTE_R1', fuelType: 'GASOLINE' },
        },
      ],
      pendingJobs: 0,
    });

    const ready = await service.isTripContextStageReady('trip-1');
    expect(ready).toBe(true);

    await service.tryCompleteEventContextStage('org-1', 'run-1', 'trip-1');
    expect(stageRepository.markCompleted).toHaveBeenCalledWith('org-1', 'run-1', 'EVENT_CONTEXT');
  });

  it('excludes events outside historical window from fan-out', async () => {
    const prisma = {
      drivingEvent: {
        findMany: jest.fn(async () => []),
      },
      drivingIntelligenceJob: { count: jest.fn(async () => 0) },
      drivingAnalysisRun: { findFirst: jest.fn() },
    };
    const jobDispatcher = { enqueue: jest.fn() };
    const service = new DrivingEventContextJobService(prisma as any, jobDispatcher as any);

    const result = await service.scheduleContextEnrichmentForTrip({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
      modelVersion: 'di-v2-pipeline-v1',
      correlationId: 'corr-1',
      requestedAt: new Date(),
    });

    expect(result.eligibleEvents).toBe(0);
    expect(jobDispatcher.enqueue).not.toHaveBeenCalled();
    expect(prisma.drivingEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recordedAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
  });
});
