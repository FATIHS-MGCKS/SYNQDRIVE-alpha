import {
  buildPossibleEndToActiveReset,
  evaluateEndCycleJobAdmission,
  resolveTrustedStopBoundaryForCusumRetry,
  stripEndCycleEvidenceForActiveReopen,
} from './trip-end-cycle-reset';
import { readStopBoundaryAt } from './trip-fsm-evidence-state';
import { buildTripTrackingJobId } from './testing/trip-r11-postgres-redis.integration.harness';

const WORKER_NOW = new Date('2026-09-12T05:11:03.781Z');
const STOP_BOUNDARY = new Date('2026-09-12T05:06:59.000Z');
const LAST_MOVEMENT = new Date('2026-09-12T05:06:52.636Z');
const POST_MOVEMENT = new Date('2026-09-12T05:08:00.000Z');
const POSSIBLE_END_AT = new Date('2026-09-12T05:09:02.763Z');
const END_CYCLE_2_AT = new Date('2026-09-12T05:13:00.000Z');

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
      completedEndValidationAttempts: 2,
    });
    const summary = reset.lastEvidenceSummary as Record<string, unknown>;
    expect(readStopBoundaryAt(summary)?.toISOString()).toBe(STOP_BOUNDARY.toISOString());
    expect(summary.stopBoundaryTrust).toBe(true);
    expect(summary.endValidationScheduledAt).toBeUndefined();
    expect(summary.emptyCoreDeferralStreak).toBeUndefined();
    expect(reset.endValidationAttempts).toBe(2);
  });

  it('CUSUM_STILL_ONGOING without trusted boundary does not preserve retry budget', () => {
    const reset = buildPossibleEndToActiveReset({
      workerNow: WORKER_NOW,
      lastMeaningfulMovementAt: POST_MOVEMENT,
      priorSummary: TRUSTED_BOUNDARY_SUMMARY,
      reopenReason: 'CUSUM_STILL_ONGOING',
      completedEndValidationAttempts: 3,
    });
    expect(reset.endValidationAttempts).toBe(0);
  });

  it('ACTIVITY_RESUMED reopen resets retry budget to zero', () => {
    const reset = buildPossibleEndToActiveReset({
      workerNow: WORKER_NOW,
      priorSummary: TRUSTED_BOUNDARY_SUMMARY,
      reopenReason: 'ACTIVITY_RESUMED',
      completedEndValidationAttempts: 3,
    });
    expect(reset.endValidationAttempts).toBe(0);
  });

  it('new stop episode after movement cannot inherit prior CUSUM retry budget', () => {
    const reset = buildPossibleEndToActiveReset({
      workerNow: WORKER_NOW,
      lastMeaningfulMovementAt: POST_MOVEMENT,
      priorSummary: TRUSTED_BOUNDARY_SUMMARY,
      reopenReason: 'CUSUM_STILL_ONGOING',
      completedEndValidationAttempts: 3,
    });
    expect(reset.endValidationAttempts).toBe(0);
    expect(readStopBoundaryAt(reset.lastEvidenceSummary as Record<string, unknown>)).toBeNull();
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

  it('cross-cycle: stale end-cycle token cannot authorize later END_VALIDATION', () => {
    const cycleA = POSSIBLE_END_AT.toISOString();
    const cycleB = END_CYCLE_2_AT.toISOString();
    expect(
      evaluateEndCycleJobAdmission({
        det: {
          state: 'POSSIBLE_END',
          possibleEndEnteredAt: new Date(cycleB),
          lastEvidenceSummary: TRUSTED_BOUNDARY_SUMMARY,
        },
        job: {
          endCycleToken: cycleA,
          requestedAt: WORKER_NOW.toISOString(),
        },
      }),
    ).toBe('stale_token_mismatch');
  });

  it('cross-trip: stable-slot job ids are scoped to activeTripId', () => {
    const vehicleId = 'veh-ks661';
    const tripA = 'a05fa903-9ea7-4f20-8281-5cf185233c1a';
    const tripB = 'b16gb014-0fb8-5g31-9392-6dg296344d2b';
    expect(buildTripTrackingJobId('pec', vehicleId, tripA)).not.toBe(
      buildTripTrackingJobId('pec', vehicleId, tripB),
    );
    expect(buildTripTrackingJobId('ev', vehicleId, tripA)).not.toBe(
      buildTripTrackingJobId('ev', vehicleId, tripB),
    );
  });

  it('cross-trip: ACTIVITY resume clears boundary so a later trip cannot inherit it', () => {
    const reset = buildPossibleEndToActiveReset({
      workerNow: WORKER_NOW,
      priorSummary: TRUSTED_BOUNDARY_SUMMARY,
      reopenReason: 'ACTIVITY_RESUMED',
    });
    expect(readStopBoundaryAt(reset.lastEvidenceSummary as Record<string, unknown>)).toBeNull();
    expect(reset.possibleEndEnteredAt).toBeNull();
  });
});
