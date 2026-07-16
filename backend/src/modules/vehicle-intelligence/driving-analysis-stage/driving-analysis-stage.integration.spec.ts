import {
  buildStageStatusMap,
  resolveReadyStageKeys,
} from './driving-analysis-stage.dependencies';
import { DrivingAnalysisStageOrchestratorService } from './driving-analysis-stage.orchestrator.service';

function makeStageRepository() {
  return {
    findByRun: jest.fn(),
    initializeStagesForRun: jest.fn(),
    markInProgress: jest.fn(),
    markCompleted: jest.fn(),
    markFailed: jest.fn(),
  };
}

function makeRunRepository() {
  return {
    findById: jest.fn(),
    syncStatusFromStages: jest.fn(),
  };
}

function makeJobDispatcher() {
  return {
    enqueue: jest.fn(),
  };
}

describe('DrivingAnalysisStageOrchestratorService', () => {
  let stageRepository: ReturnType<typeof makeStageRepository>;
  let runRepository: ReturnType<typeof makeRunRepository>;
  let jobDispatcher: ReturnType<typeof makeJobDispatcher>;
  let orchestrator: DrivingAnalysisStageOrchestratorService;

  beforeEach(() => {
    stageRepository = makeStageRepository();
    runRepository = makeRunRepository();
    jobDispatcher = makeJobDispatcher();
    orchestrator = new DrivingAnalysisStageOrchestratorService(
      stageRepository as any,
      runRepository as any,
      jobDispatcher as any,
    );
  });

  it('enqueues only ready PENDING stages', async () => {
    stageRepository.findByRun.mockResolvedValue([
      { stageKey: 'SEGMENT_VALIDATE', status: 'PENDING', inputFingerprint: 'fp-seg' },
      { stageKey: 'NATIVE_EVENTS', status: 'PENDING', inputFingerprint: 'fp-native' },
      { stageKey: 'ROUTE', status: 'PENDING', inputFingerprint: 'fp-route' },
    ]);
    stageRepository.markInProgress.mockImplementation((_o, _r, key) =>
      Promise.resolve({ stageKey: key, status: 'IN_PROGRESS' }),
    );
    jobDispatcher.enqueue.mockResolvedValue({
      job: { id: 'job-1' },
      created: true,
      deduplicated: false,
      enqueued: true,
    });

    const result = await orchestrator.enqueueReadyStages({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
      modelVersion: 'di-v2-pipeline-v1',
      correlationId: 'corr-1',
      requestedAt: new Date(),
    });

    expect(result.readyStageKeys).toEqual(['SEGMENT_VALIDATE']);
    expect(result.enqueued).toHaveLength(1);
    expect(result.enqueued[0].stageKey).toBe('SEGMENT_VALIDATE');
    expect(jobDispatcher.enqueue).toHaveBeenCalledTimes(1);
  });

  it('chains next stages after job completion', async () => {
    stageRepository.markCompleted.mockResolvedValue({
      stageKey: 'SEGMENT_VALIDATE',
      status: 'COMPLETED',
    });
    stageRepository.findByRun
      .mockResolvedValueOnce([
        { stageKey: 'SEGMENT_VALIDATE', status: 'COMPLETED' },
        { stageKey: 'NATIVE_EVENTS', status: 'PENDING', inputFingerprint: 'fp1' },
        { stageKey: 'ROUTE', status: 'PENDING', inputFingerprint: 'fp2' },
      ])
      .mockResolvedValueOnce([
        { stageKey: 'SEGMENT_VALIDATE', status: 'COMPLETED' },
        { stageKey: 'NATIVE_EVENTS', status: 'PENDING', inputFingerprint: 'fp1' },
        { stageKey: 'ROUTE', status: 'PENDING', inputFingerprint: 'fp2' },
      ]);
    runRepository.findById.mockResolvedValue({
      id: 'run-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      modelVersion: 'di-v2-pipeline-v1',
    });
    runRepository.syncStatusFromStages.mockResolvedValue({});
    stageRepository.markInProgress.mockResolvedValue({});
    jobDispatcher.enqueue.mockResolvedValue({
      job: { id: 'job-x' },
      created: true,
      deduplicated: false,
      enqueued: true,
    });

    await orchestrator.onJobCompleted('org-1', 'run-1', 'DIMO_TRIP_SEGMENT_VALIDATE');

    expect(stageRepository.markCompleted).toHaveBeenCalledWith(
      'org-1',
      'run-1',
      'SEGMENT_VALIDATE',
    );
    expect(runRepository.syncStatusFromStages).toHaveBeenCalled();
    expect(jobDispatcher.enqueue).toHaveBeenCalled();
  });
});

describe('Stage orchestration integration (in-memory)', () => {
  it('parallel native + route after segment validate', () => {
    const map = buildStageStatusMap([
      { stageKey: 'SEGMENT_VALIDATE', status: 'COMPLETED' },
    ]);
    const ready = resolveReadyStageKeys(map);
    expect(ready.filter((k) => k === 'NATIVE_EVENTS' || k === 'ROUTE').sort()).toEqual([
      'NATIVE_EVENTS',
      'ROUTE',
    ]);
  });

  it('misuse blocked until event context completes even if route is done', () => {
    const map = buildStageStatusMap([
      { stageKey: 'SEGMENT_VALIDATE', status: 'COMPLETED' },
      { stageKey: 'NATIVE_EVENTS', status: 'COMPLETED' },
      { stageKey: 'ROUTE', status: 'COMPLETED' },
      { stageKey: 'EVENT_CONTEXT', status: 'IN_PROGRESS' },
    ]);
    expect(resolveReadyStageKeys(map)).not.toContain('MISUSE_RECONCILE');
  });
});
