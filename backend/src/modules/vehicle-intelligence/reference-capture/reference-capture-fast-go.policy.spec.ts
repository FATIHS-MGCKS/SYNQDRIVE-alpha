import { ReferenceCaptureSessionStatus } from '@prisma/client';
import {
  assessFastGoReadiness,
  clampHttpRequestTimeoutMs,
  computeGoDeadlineMs,
  createFastGoTimestamps,
  isFastGoReadyToDrive,
  isRunnerContinuityProven,
  isSessionCleanupComplete,
  normalizeFastGoTimeoutMs,
  remainingGoBudgetMs,
  runnerSnapshotFromSession,
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
  });

  it('clamps extremely large timeout config', () => {
    expect(normalizeFastGoTimeoutMs(String(60 * 60 * 1000))).toBe(30 * 60 * 1000);
  });

  it('A — absolute deadline is anchored at goRequestedAt before any HTTP work', () => {
    const goRequestedAtMs = 1_000_000;
    const deadline = computeGoDeadlineMs(goRequestedAtMs, 15_000);
    expect(deadline).toBe(1_015_000);
    expect(remainingGoBudgetMs(deadline, goRequestedAtMs + 1_000)).toBe(14_000);
    const ts = createFastGoTimestamps(goRequestedAtMs, 15_000);
    expect(ts.goDeadlineAt).toBe(new Date(1_015_000).toISOString());
    expect(ts.startRequestStartedAt).toBeNull();
  });

  it('C — clampHttpRequestTimeoutMs never exceeds remaining GO budget', () => {
    expect(clampHttpRequestTimeoutMs(5_000, 30_000)).toBe(5_000);
    expect(clampHttpRequestTimeoutMs(30_000, 30_000)).toBe(30_000);
    expect(clampHttpRequestTimeoutMs(0)).toBeNull();
    expect(clampHttpRequestTimeoutMs(-1)).toBeNull();
  });

  it('D — cycle 1 + signals + NO runner continuity => NOT ready', () => {
    const assessment = assessFastGoReadiness({
      snapshot: {
        ...recordingSnapshot,
        pendingCycleJobId: null,
        activeCycleJobId: null,
      },
      signalObservationCount: 5,
    });
    expect(assessment.ready).toBe(false);
    expect(assessment.blockers).toContain('runner_continuity_not_proven');
  });

  it('E — cycle 1 + signals + pending next cycle => ready', () => {
    expect(
      isFastGoReadyToDrive(recordingSnapshot, 3),
    ).toBe(true);
  });

  it('E-alt — cycle 1 + signals + active next cycle => ready', () => {
    expect(
      isRunnerContinuityProven({
        ...recordingSnapshot,
        pendingCycleJobId: null,
        activeCycleJobId: 'refcap-cycle-s1-2-active',
      }),
    ).toBe(true);
  });

  it('F — already RECORDING + cycle>=1 + zero signals => NOT ready', () => {
    const assessment = assessFastGoReadiness({
      snapshot: recordingSnapshot,
      signalObservationCount: 0,
    });
    expect(assessment.ready).toBe(false);
    expect(assessment.blockers).toContain('no_signal_observations_after_first_cycle');
  });

  it('G — already RECORDING + signals + no runner continuity => NOT ready', () => {
    const assessment = assessFastGoReadiness({
      snapshot: {
        ...recordingSnapshot,
        pendingCycleJobId: null,
        activeCycleJobId: null,
      },
      signalObservationCount: 2,
    });
    expect(assessment.ready).toBe(false);
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
    expect(
      isSessionCleanupComplete({
        status: ReferenceCaptureSessionStatus.RECORDING,
        cycleCount: 1,
        runnerJobId: 'x',
        pendingCycleJobId: null,
        activeCycleJobId: null,
      }),
    ).toBe(false);
  });

  it('runnerSnapshotFromSession reads operational block', () => {
    const snapshot = runnerSnapshotFromSession({
      status: ReferenceCaptureSessionStatus.RECORDING,
      operational: {
        cycleCount: 2,
        runnerJobId: 'r',
        pendingCycleJobId: 'p',
        activeCycleJobId: 'a',
        preflightAssessedAt: null,
      },
    } as never);
    expect(snapshot.cycleCount).toBe(2);
    expect(snapshot.runnerJobId).toBe('r');
  });
});
