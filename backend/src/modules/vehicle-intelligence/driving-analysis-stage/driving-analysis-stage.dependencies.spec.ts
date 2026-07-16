import {
  buildStageStatusMap,
  resolveReadyStageKeys,
  STAGE_DEPENDENCIES,
} from './driving-analysis-stage.dependencies';

describe('DrivingAnalysisStage dependencies', () => {
  it('allows NATIVE_EVENTS and ROUTE in parallel after SEGMENT_VALIDATE', () => {
    const map = buildStageStatusMap([
      { stageKey: 'SEGMENT_VALIDATE', status: 'COMPLETED' },
    ]);
    const ready = resolveReadyStageKeys(map);
    expect(ready).toContain('NATIVE_EVENTS');
    expect(ready).toContain('ROUTE');
    expect(ready).toContain('ASSESSABILITY');
    expect(ready).toContain('ATTRIBUTION');
    expect(ready).not.toContain('EVENT_CONTEXT');
    expect(ready).not.toContain('MISUSE_RECONCILE');
  });

  it('MISUSE_RECONCILE waits only on EVENT_CONTEXT, not ROUTE', () => {
    expect(STAGE_DEPENDENCIES.MISUSE_RECONCILE).toEqual(['EVENT_CONTEXT']);
    expect(STAGE_DEPENDENCIES.MISUSE_RECONCILE).not.toContain('ROUTE');

    const routeOnlyDone = buildStageStatusMap([
      { stageKey: 'SEGMENT_VALIDATE', status: 'COMPLETED' },
      { stageKey: 'NATIVE_EVENTS', status: 'COMPLETED' },
      { stageKey: 'ROUTE', status: 'COMPLETED' },
      { stageKey: 'EVENT_CONTEXT', status: 'PENDING' },
    ]);
    expect(resolveReadyStageKeys(routeOnlyDone)).not.toContain('MISUSE_RECONCILE');

    const contextDone = buildStageStatusMap([
      { stageKey: 'SEGMENT_VALIDATE', status: 'COMPLETED' },
      { stageKey: 'NATIVE_EVENTS', status: 'COMPLETED' },
      { stageKey: 'ROUTE', status: 'PENDING' },
      { stageKey: 'EVENT_CONTEXT', status: 'COMPLETED' },
    ]);
    expect(resolveReadyStageKeys(contextDone)).toContain('MISUSE_RECONCILE');
  });

  it('DECISION_SUMMARY requires assessability, impact, misuse, attribution', () => {
    expect(STAGE_DEPENDENCIES.DECISION_SUMMARY).toEqual([
      'ASSESSABILITY',
      'DRIVING_IMPACT',
      'MISUSE_RECONCILE',
      'ATTRIBUTION',
    ]);
  });
});
