import { buildStageInputFingerprint, requiresStageRecompute } from './driving-analysis-stage.fingerprint';

const baseCtx = {
  organizationId: 'org-1',
  tripId: 'trip-1',
  vehicleId: 'veh-1',
  modelVersion: 'di-v2-pipeline-v1',
  capabilityVersion: 'at-finalize-v1',
  tripEndTimeIso: '2026-07-16T10:00:00.000Z',
  waypointCount: 10,
  behaviorEnrichmentStatus: 'PENDING',
};

describe('DrivingAnalysisStage fingerprint', () => {
  it('is deterministic per stage key', () => {
    const fp1 = buildStageInputFingerprint({ ...baseCtx, stageKey: 'NATIVE_EVENTS' });
    const fp2 = buildStageInputFingerprint({ ...baseCtx, stageKey: 'NATIVE_EVENTS' });
    const fpRoute = buildStageInputFingerprint({ ...baseCtx, stageKey: 'ROUTE' });
    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fpRoute);
  });

  it('changes when stage-relevant inputs change', () => {
    const before = buildStageInputFingerprint({ ...baseCtx, stageKey: 'ROUTE', waypointCount: 5 });
    const after = buildStageInputFingerprint({ ...baseCtx, stageKey: 'ROUTE', waypointCount: 6 });
    expect(before).not.toBe(after);
  });

  it('requires recompute on model version change', () => {
    expect(
      requiresStageRecompute(
        { modelVersion: 'v1', inputFingerprint: 'abc' },
        { modelVersion: 'v2', inputFingerprint: 'abc' },
      ),
    ).toBe(true);
  });

  it('skips recompute when fingerprint unchanged', () => {
    expect(
      requiresStageRecompute(
        { modelVersion: 'v1', inputFingerprint: 'abc' },
        { modelVersion: 'v1', inputFingerprint: 'abc' },
      ),
    ).toBe(false);
  });

  it('supports targeted recompute for specific stages on model bump', () => {
    expect(
      requiresStageRecompute(
        { modelVersion: 'v1', inputFingerprint: 'abc' },
        { modelVersion: 'v2', inputFingerprint: 'abc' },
        ['NATIVE_EVENTS'],
        'NATIVE_EVENTS',
      ),
    ).toBe(true);
    expect(
      requiresStageRecompute(
        { modelVersion: 'v1', inputFingerprint: 'abc' },
        { modelVersion: 'v2', inputFingerprint: 'abc' },
        ['NATIVE_EVENTS'],
        'ROUTE',
      ),
    ).toBe(false);
  });
});
