import {
  buildPossibleEndToActiveReset,
  resolveTrustedStopBoundaryForCusumRetry,
  stripEndCycleEvidenceForActiveReopen,
} from './trip-end-cycle-reset';
import { readStopBoundaryAt } from './trip-fsm-evidence-state';

const WORKER_NOW = new Date('2026-09-12T05:11:03.781Z');
const STOP_BOUNDARY = new Date('2026-09-12T05:06:59.000Z');
const LAST_MOVEMENT = new Date('2026-09-12T05:06:52.636Z');
const POST_MOVEMENT = new Date('2026-09-12T05:08:00.000Z');

const TRUSTED_BOUNDARY_SUMMARY = {
  stopBoundaryAt: STOP_BOUNDARY.toISOString(),
  stopBoundarySource: 'provider_stationary_vls',
  stopBoundaryClockAuthority: 'PROVIDER_EVENT_TIME',
  stopBoundaryTrust: true,
  stopBoundaryEvidenceState: 'QUALIFIED',
  endValidationScheduledAt: '2026-09-12T05:11:00.000Z',
  emptyCoreDeferralStreak: 3,
};

describe('R12 — CUSUM still-ongoing boundary retry contract', () => {
  it('ACTIVITY_RESUMED reopen strips trusted stop boundary', () => {
    const reset = buildPossibleEndToActiveReset({
      workerNow: WORKER_NOW,
      priorSummary: TRUSTED_BOUNDARY_SUMMARY,
      reopenReason: 'ACTIVITY_RESUMED',
    });
    expect(readStopBoundaryAt(reset.lastEvidenceSummary as Record<string, unknown>)).toBeNull();
  });

  it('CUSUM_STILL_ONGOING reopen preserves trusted stop boundary', () => {
    const reset = buildPossibleEndToActiveReset({
      workerNow: WORKER_NOW,
      lastMeaningfulMovementAt: LAST_MOVEMENT,
      priorSummary: TRUSTED_BOUNDARY_SUMMARY,
      reopenReason: 'CUSUM_STILL_ONGOING',
    });
    const summary = reset.lastEvidenceSummary as Record<string, unknown>;
    expect(readStopBoundaryAt(summary)?.toISOString()).toBe(STOP_BOUNDARY.toISOString());
    expect(summary.stopBoundaryTrust).toBe(true);
    expect(summary.endValidationScheduledAt).toBeUndefined();
    expect(summary.emptyCoreDeferralStreak).toBeUndefined();
  });

  it('CUSUM reopen rejects preservation when movement is after boundary', () => {
    const reset = buildPossibleEndToActiveReset({
      workerNow: WORKER_NOW,
      lastMeaningfulMovementAt: POST_MOVEMENT,
      priorSummary: TRUSTED_BOUNDARY_SUMMARY,
      reopenReason: 'CUSUM_STILL_ONGOING',
    });
    expect(
      readStopBoundaryAt(reset.lastEvidenceSummary as Record<string, unknown>),
    ).toBeNull();
  });

  it('CUSUM reopen rejects preservation when stopBoundaryTrust is false', () => {
    const reset = buildPossibleEndToActiveReset({
      workerNow: WORKER_NOW,
      priorSummary: {
        ...TRUSTED_BOUNDARY_SUMMARY,
        stopBoundaryTrust: false,
      },
      reopenReason: 'CUSUM_STILL_ONGOING',
    });
    expect(
      readStopBoundaryAt(reset.lastEvidenceSummary as Record<string, unknown>),
    ).toBeNull();
  });

  it('resolveTrustedStopBoundaryForCusumRetry requires explicit trust', () => {
    expect(
      resolveTrustedStopBoundaryForCusumRetry(
        { stopBoundaryAt: STOP_BOUNDARY.toISOString(), stopBoundaryTrust: false },
        WORKER_NOW,
        LAST_MOVEMENT,
      ),
    ).toBeNull();
    expect(
      resolveTrustedStopBoundaryForCusumRetry(
        TRUSTED_BOUNDARY_SUMMARY,
        WORKER_NOW,
        LAST_MOVEMENT,
      )?.boundaryAt.toISOString(),
    ).toBe(STOP_BOUNDARY.toISOString());
  });

  it('stripEndCycleEvidenceForActiveReopen default is ACTIVITY strip semantics', () => {
    const stripped = stripEndCycleEvidenceForActiveReopen(TRUSTED_BOUNDARY_SUMMARY);
    expect(readStopBoundaryAt(stripped)).toBeNull();
  });
});
