import { ReferenceCaptureObservationKind, ReferenceCaptureSessionStatus } from '@prisma/client';
import {
  assessFastGoReadiness,
  clampHttpRequestTimeoutMs,
  computeGoDeadlineMs,
  countPersistedSignalPoints,
  createFastGoTimestamps,
  isFastGoReadyToDrive,
  isRunnerContinuityProven,
  isSessionCleanupComplete,
  MAX_FAST_GO_TIMEOUT_MS,
  normalizeFastGoTimeoutMs,
  remainingGoBudgetMs,
  runnerSnapshotFromSession,
  shouldContinueFastGoWait,
} from './reference-capture-fast-go.policy';

describe('reference-capture-fast-go.policy', () => {
  const recordingSnapshot = {
    status: ReferenceCaptureSessionStatus.RECORDING,
    cycleCount: 1,
    runnerJobId: 'refcap-session-s1',
    pendingCycleJobId: 'refcap-cycle-s1-2',
    activeCycleJobId: null,
  };

  it('normalizes invalid timeout config to default 15s', () => {
    expect(normalizeFastGoTimeoutMs(undefined)).toBe(15_000);
    expect(normalizeFastGoTimeoutMs('0')).toBe(15_000);
    expect(normalizeFastGoTimeoutMs('NaN')).toBe(15_000);
    expect(normalizeFastGoTimeoutMs('-5')).toBe(15_000);
    expect(normalizeFastGoTimeoutMs(Number.POSITIVE_INFINITY)).toBe(15_000);
  });

  it('clamps production timeout to 15s max (RD002 freeze)', () => {
    expect(normalizeFastGoTimeoutMs(String(60 * 60 * 1000))).toBe(MAX_FAST_GO_TIMEOUT_MS);
    expect(MAX_FAST_GO_TIMEOUT_MS).toBe(15_000);
  });

  it('allows intentionally lower timeout values', () => {
    expect(normalizeFastGoTimeoutMs('5000')).toBe(5_000);
  });

  it('A — absolute deadline is anchored at goRequestedAt before any HTTP work', () => {
    const goRequestedAtMs = 1_000_000;
    const deadline = computeGoDeadlineMs(goRequestedAtMs, 15_000);
    expect(deadline).toBe(1_015_000);
    expect(remainingGoBudgetMs(deadline, goRequestedAtMs + 1_000)).toBe(14_000);
    const ts = createFastGoTimestamps(goRequestedAtMs, 15_000);
    expect(ts.goDeadlineAt).toBe(new Date(1_015_000).toISOString());
    expect(ts.startRequestStartedAt).toBeNull();
    expect(ts.startAcceptedAt).toBeNull();
  });

  it('C — clampHttpRequestTimeoutMs never exceeds remaining GO budget', () => {
    expect(clampHttpRequestTimeoutMs(5_000, 30_000)).toBe(5_000);
    expect(clampHttpRequestTimeoutMs(0)).toBeNull();
  });

  describe('SIGNAL_POINT-only persistence gate', () => {
    const rows = [
      { observationKind: ReferenceCaptureObservationKind.PROBE_RESULT },
      { observationKind: ReferenceCaptureObservationKind.SEGMENT },
      { observationKind: ReferenceCaptureObservationKind.NATIVE_EVENT },
      { observationKind: ReferenceCaptureObservationKind.SESSION_METADATA },
      { observationKind: ReferenceCaptureObservationKind.SIGNAL_POINT },
    ];

    it('A — PROBE_RESULT alone does not satisfy gate', () => {
      const assessment = assessFastGoReadiness({
        snapshot: recordingSnapshot,
        signalPointCount: countPersistedSignalPoints([rows[0]]),
      });
      expect(assessment.ready).toBe(false);
      expect(assessment.blockers).toContain('no_signal_point_observations_after_first_cycle');
    });

    it('B — SEGMENT alone does not satisfy gate', () => {
      const assessment = assessFastGoReadiness({
        snapshot: recordingSnapshot,
        signalPointCount: countPersistedSignalPoints([rows[1]]),
      });
      expect(assessment.ready).toBe(false);
    });

    it('C — NATIVE_EVENT alone does not satisfy gate', () => {
      const assessment = assessFastGoReadiness({
        snapshot: recordingSnapshot,
        signalPointCount: countPersistedSignalPoints([rows[2], rows[3]]),
      });
      expect(assessment.ready).toBe(false);
    });

    it('D — SIGNAL_POINT satisfies signal persistence prerequisite', () => {
      expect(countPersistedSignalPoints(rows)).toBe(1);
      expect(isFastGoReadyToDrive(recordingSnapshot, 1)).toBe(true);
    });
  });

  it('D — cycle 1 + signals + NO runner continuity => NOT ready', () => {
    const assessment = assessFastGoReadiness({
      snapshot: { ...recordingSnapshot, pendingCycleJobId: null, activeCycleJobId: null },
      signalPointCount: 5,
    });
    expect(assessment.ready).toBe(false);
    expect(assessment.blockers).toContain('runner_continuity_not_proven');
  });

  it('E — cycle 1 + SIGNAL_POINT + pending next cycle => ready', () => {
    expect(isFastGoReadyToDrive(recordingSnapshot, 3)).toBe(true);
  });

  it('E-alt — cycle 1 + active next cycle => continuity proven', () => {
    expect(
      isRunnerContinuityProven({
        ...recordingSnapshot,
        pendingCycleJobId: null,
        activeCycleJobId: 'refcap-cycle-s1-2-active',
      }),
    ).toBe(true);
  });

  it('shouldContinueFastGoWait allows bounded wait for cycle 0 with active runner', () => {
    const snapshot = {
      status: ReferenceCaptureSessionStatus.RECORDING,
      cycleCount: 0,
      runnerJobId: 'r',
      pendingCycleJobId: 'p',
      activeCycleJobId: null,
    };
    const assessment = assessFastGoReadiness({ snapshot, signalPointCount: 0 });
    expect(shouldContinueFastGoWait(snapshot, assessment)).toBe(true);
  });

  it('shouldContinueFastGoWait stops when cycle>=1 but runner continuity missing', () => {
    const snapshot = {
      status: ReferenceCaptureSessionStatus.RECORDING,
      cycleCount: 2,
      runnerJobId: 'r',
      pendingCycleJobId: null,
      activeCycleJobId: null,
    };
    const assessment = assessFastGoReadiness({ snapshot, signalPointCount: 5 });
    expect(assessment.runnerContinuityProven).toBe(false);
    expect(shouldContinueFastGoWait(snapshot, assessment)).toBe(false);
  });

  it('J — cleanup complete when session not recording and no runner artifacts', () => {
    expect(
      isSessionCleanupComplete({
        status: ReferenceCaptureSessionStatus.ABORTED,
        cycleCount: 1,
        runnerJobId: null,
        pendingCycleJobId: null,
        activeCycleJobId: null,
      }),
    ).toBe(true);
  });
});
