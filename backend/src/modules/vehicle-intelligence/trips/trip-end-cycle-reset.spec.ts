import {
  TRIP_FSM_MAX_FUTURE_SKEW_MS,
} from './trip-fsm-clock-contract';
import {
  buildEndValidationCompletionEvidence,
  buildEndValidationFailureEvidence,
  buildEndValidationFetchFailureEvidence,
  buildEndValidationScheduledEvidence,
  buildEndValidationStartedEvidence,
  buildPossibleEndToActiveReset,
  clearEndValidationAttemptLocalEvidence,
  END_CYCLE_REOPEN_STRIP_KEYS,
  END_VALIDATION_ATTEMPT_LOCAL_KEYS,
  extractR5EndForensicsForPersistence,
  stripEndCycleEvidenceForActiveReopen,
  validateCusumMovementEventTime,
  isEndCycleTokenStale,
  resolveEndCycleToken,
  evaluateEndCycleJobAdmission,
} from './trip-end-cycle-reset';

const WORKER_NOW = new Date('2026-09-06T12:00:00.000Z');

describe('trip-end-cycle-reset (R5)', () => {
  it('buildPossibleEndToActiveReset clears all end-cycle fields on ACTIVITY resume', () => {
    const reset = buildPossibleEndToActiveReset({
      workerNow: WORKER_NOW,
      priorSummary: {
        endValidationStartedAt: 'x',
        endValidationScheduledAt: 'y',
        completedEndValidationAttempt: 2,
        startEvidence: 'preserve-me',
      },
      reopenReason: 'ACTIVITY_RESUMED',
    });

    expect(reset.possibleEndAt).toBeNull();
    expect(reset.possibleEndEnteredAt).toBeNull();
    expect(reset.endDetectionMode).toBeNull();
    expect(reset.endConfidence).toBeNull();
    expect(reset.endValidationAttempts).toBe(0);
    expect(reset.cusumValidatedAt).toBeNull();
    expect(reset.cusumSegmentStart).toBeNull();
    expect(reset.cusumSegmentEnd).toBeNull();
    expect(reset.lastActivityAt).toEqual(WORKER_NOW);
    expect(reset.lastCoreProcessedAt).toEqual(WORKER_NOW);
    expect(reset.lastEvidenceSummary).toEqual({ startEvidence: 'preserve-me' });
    for (const key of END_CYCLE_REOPEN_STRIP_KEYS) {
      expect((reset.lastEvidenceSummary as Record<string, unknown>)[key]).toBeUndefined();
    }
  });

  it('buildEndValidationCompletionEvidence uses distinct started/completed timestamps', () => {
    const started = new Date('2026-09-06T12:00:00.000Z');
    const completed = new Date('2026-09-06T12:00:05.000Z');
    const evidence = buildEndValidationCompletionEvidence({
      priorSummary: {},
      validationStartedAt: started,
      validationCompletedAt: completed,
      completedAttempt: 1,
    });
    expect(evidence.endValidationStartedAt).toBe(started.toISOString());
    expect(evidence.endValidationCompletedAt).toBe(completed.toISOString());
    expect(completed.getTime()).toBeGreaterThanOrEqual(started.getTime());
  });

  it('buildEndValidationCompletionEvidence preserves same-episode provenance', () => {
    const started = new Date('2026-09-06T12:00:00.000Z');
    const completed = new Date('2026-09-06T12:00:05.000Z');
    const evidence = buildEndValidationCompletionEvidence({
      priorSummary: {
        endCandidateClockSource: 'PROVIDER_EVENT_TIME',
        noCoreEmptyCoreForensics: { decision: 'POSSIBLE_END' },
        emptyCoreReason: 'empty_core_corroborated_inactivity',
      },
      validationStartedAt: started,
      validationCompletedAt: completed,
      completedAttempt: 2,
      scheduledAt: '2026-09-06T11:59:50.000Z',
    });
    expect(evidence.endValidationStartedAt).toBe(started.toISOString());
    expect(evidence.endValidationCompletedAt).toBe(completed.toISOString());
    expect(evidence.endCandidateClockSource).toBe('PROVIDER_EVENT_TIME');
    expect(evidence.noCoreEmptyCoreForensics).toEqual({ decision: 'POSSIBLE_END' });
  });

  it('extractR5EndForensicsForPersistence copies bounded end-cycle fields', () => {
    const extracted = extractR5EndForensicsForPersistence(
      {
        endValidationScheduledAt: '2026-09-06T11:59:50.000Z',
        endValidationStartedAt: '2026-09-06T12:00:00.000Z',
        endValidationCompletedAt: '2026-09-06T12:00:05.000Z',
        completedEndValidationAttempt: 2,
        maxAttemptFallbackReason: 'max_completed_cusum_attempts',
        completedAttemptCount: 3,
        resumeCheckOutcome: 'NO_RESUME_EVIDENCE',
        noCoreEmptyCoreForensics: {
          noCoreStream: true,
          operationalInactiveMs: 150000,
          vlsEvidenceState: 'INACTIVE',
          vlsProviderObservedAt: '2026-09-06T11:58:00.000Z',
          vlsObservationAgeMs: 120000,
          performanceActivity: false,
          routeMotion: false,
          decision: 'POSSIBLE_END',
          reason: 'empty_core_corroborated_inactivity',
        },
      },
      3,
    );
    expect(extracted.endValidation.completedAttempt).toBe(2);
    expect(extracted.endValidation.completedAttemptCount).toBe(3);
    expect(extracted.endValidation.maxAttemptFallbackReason).toBe(
      'max_completed_cusum_attempts',
    );
    expect(extracted.emptyCoreEndGate?.vlsEvidenceState).toBe('INACTIVE');
  });

  it('clearEndValidationAttemptLocalEvidence removes attempt-local keys only', () => {
    const cleared = clearEndValidationAttemptLocalEvidence({
      endValidationScheduledAt: 'a',
      endValidationStartedAt: 'b',
      endValidationCompletedAt: 'c',
      completedEndValidationAttempt: 1,
      endValidationFailureReason: 'x',
      endCandidateClockSource: 'keep',
      emptyCoreReason: 'keep',
    });
    for (const key of END_VALIDATION_ATTEMPT_LOCAL_KEYS) {
      expect(cleared[key]).toBeUndefined();
    }
    expect(cleared.endCandidateClockSource).toBe('keep');
    expect(cleared.emptyCoreReason).toBe('keep');
  });

  it('buildEndValidationFailureEvidence clears stale completedAt from prior attempt', () => {
    const evidence = buildEndValidationFailureEvidence({
      priorSummary: {
        endValidationScheduledAt: '2026-09-06T12:00:55.000Z',
        endValidationStartedAt: '2026-09-06T12:01:00.000Z',
        endValidationCompletedAt: '2026-09-06T12:00:05.000Z',
        completedEndValidationAttempt: 1,
        endCandidateClockSource: 'PROVIDER_EVENT_TIME',
      },
      validationStartedAt: new Date('2026-09-06T12:01:00.000Z'),
      failureReason: 'detector boom',
      failureOutcome: 'DETECTOR_EXECUTION_FAILURE',
    });
    expect(evidence.endValidationStartedAt).toBe('2026-09-06T12:01:00.000Z');
    expect(evidence.endValidationCompletedAt).toBeUndefined();
    expect(evidence.completedEndValidationAttempt).toBeUndefined();
    expect(evidence.endValidationFailureOutcome).toBe('DETECTOR_EXECUTION_FAILURE');
    expect(evidence.endCandidateClockSource).toBe('PROVIDER_EVENT_TIME');
  });

  it('buildEndValidationStartedEvidence clears stale completedAt before start', () => {
    const evidence = buildEndValidationStartedEvidence({
      priorSummary: {
        endValidationScheduledAt: '2026-09-06T12:00:55.000Z',
        endValidationCompletedAt: '2026-09-06T12:00:05.000Z',
        completedEndValidationAttempt: 1,
      },
      validationStartedAt: new Date('2026-09-06T12:01:00.000Z'),
    });
    expect(evidence.endValidationScheduledAt).toBe('2026-09-06T12:00:55.000Z');
    expect(evidence.endValidationStartedAt).toBe('2026-09-06T12:01:00.000Z');
    expect(evidence.endValidationCompletedAt).toBeUndefined();
    expect(evidence.completedEndValidationAttempt).toBeUndefined();
  });

  it('buildEndValidationScheduledEvidence clears prior attempt-local runtime state', () => {
    const evidence = buildEndValidationScheduledEvidence({
      priorSummary: {
        endValidationScheduledAt: '2026-09-06T11:59:50.000Z',
        endValidationStartedAt: '2026-09-06T12:00:00.000Z',
        endValidationCompletedAt: '2026-09-06T12:00:05.000Z',
        completedEndValidationAttempt: 1,
        endCandidateClockSource: 'PROVIDER_EVENT_TIME',
      },
      workerNow: new Date('2026-09-06T12:01:00.000Z'),
    });
    expect(evidence.endValidationScheduledAt).toBe('2026-09-06T12:01:00.000Z');
    expect(evidence.endValidationStartedAt).toBeUndefined();
    expect(evidence.endValidationCompletedAt).toBeUndefined();
    expect(evidence.endCandidateClockSource).toBe('PROVIDER_EVENT_TIME');
  });

  it('buildEndValidationFetchFailureEvidence clears stale completedAt', () => {
    const evidence = buildEndValidationFetchFailureEvidence({
      priorSummary: {
        endValidationScheduledAt: '2026-09-06T12:00:55.000Z',
        endValidationCompletedAt: '2026-09-06T12:00:05.000Z',
        completedEndValidationAttempt: 1,
      },
      validationStartedAt: new Date('2026-09-06T12:01:00.000Z'),
      failureReason: 'fetch failed',
    });
    expect(evidence.endValidationCompletedAt).toBeUndefined();
    expect(evidence.endValidationFetchFailureReason).toBe('fetch failed');
  });

  it('validateCusumMovementEventTime accepts valid provider timestamp', () => {
    const valid = new Date(WORKER_NOW.getTime() - 30_000);
    expect(validateCusumMovementEventTime(valid.toISOString(), WORKER_NOW)).toEqual(
      valid,
    );
  });

  it('validateCusumMovementEventTime rejects invalid Date', () => {
    expect(validateCusumMovementEventTime('not-a-date', WORKER_NOW)).toBeNull();
  });

  it('validateCusumMovementEventTime rejects future outside R1 skew', () => {
    const beyond = new Date(WORKER_NOW.getTime() + TRIP_FSM_MAX_FUTURE_SKEW_MS + 1);
    expect(validateCusumMovementEventTime(beyond, WORKER_NOW)).toBeNull();
  });

  it('validateCusumMovementEventTime accepts within-skew future timestamp', () => {
    const within = new Date(WORKER_NOW.getTime() + 30_000);
    expect(validateCusumMovementEventTime(within, WORKER_NOW)).toEqual(within);
  });

  it('buildPossibleEndToActiveReset preserves trusted boundary on CUSUM still-ongoing', () => {
    const workerNow = new Date('2026-09-12T05:11:03.781Z');
    const boundaryAt = new Date('2026-09-12T05:06:59.000Z');
    const reset = buildPossibleEndToActiveReset({
      workerNow,
      lastMeaningfulMovementAt: new Date('2026-09-12T05:06:52.636Z'),
      priorSummary: {
        stopBoundaryAt: boundaryAt.toISOString(),
        stopBoundarySource: 'provider_stationary_vls',
        stopBoundaryClockAuthority: 'PROVIDER_EVENT_TIME',
        stopBoundaryTrust: true,
        endValidationScheduledAt: 'y',
      },
      reopenReason: 'CUSUM_STILL_ONGOING',
    });
    const summary = reset.lastEvidenceSummary as Record<string, unknown>;
    expect(summary.stopBoundaryAt).toBe(boundaryAt.toISOString());
    expect(summary.endValidationScheduledAt).toBeUndefined();
  });

  it('stripEndCycleEvidenceForActiveReopen removes known transient keys only', () => {
    expect(
      stripEndCycleEvidenceForActiveReopen({
        endValidationScheduledAt: 'a',
        lifecycleNote: 'keep',
      }),
    ).toEqual({ lifecycleNote: 'keep' });
  });

  it('resolveEndCycleToken uses possibleEndEnteredAt ISO', () => {
    const entered = new Date('2026-09-08T05:02:20.000Z');
    expect(resolveEndCycleToken({ possibleEndEnteredAt: entered })).toBe(
      entered.toISOString(),
    );
  });

  it('isEndCycleTokenStale detects ACTIVE_TRIP and token mismatch', () => {
    expect(
      isEndCycleTokenStale({
        jobToken: 'a',
        expectedToken: 'b',
        fsmState: 'POSSIBLE_END',
      }),
    ).toBe('stale_token_mismatch');
    expect(
      isEndCycleTokenStale({
        jobToken: 'a',
        expectedToken: null,
        fsmState: 'ACTIVE_TRIP',
      }),
    ).toBe('stale_active_trip');
  });

  it('R10 legacy tokenless: cycle-A job rejected when cycle-B POSSIBLE_END', () => {
    const cycleA = '2026-09-08T04:48:50.000Z';
    const cycleB = '2026-09-08T05:02:20.000Z';
    expect(
      isEndCycleTokenStale({
        jobToken: undefined,
        expectedToken: cycleB,
        fsmState: 'POSSIBLE_END',
        jobRequestedAt: '2026-09-08T04:50:08.000Z',
      }),
    ).toBe('stale_legacy_requested_before_cycle');
    expect(
      evaluateEndCycleJobAdmission({
        det: {
          state: 'POSSIBLE_END',
          possibleEndEnteredAt: new Date(cycleB),
          lastEvidenceSummary: {
            pendingFinalizeCycleToken: cycleB,
            pendingFinalizeScheduledAt: '2026-09-08T05:17:36.000Z',
          },
        },
        job: {
          requestedAt: '2026-09-08T04:50:08.000Z',
        },
      }),
    ).toBe('stale_legacy_requested_before_cycle');
  });

  it('R10 legacy tokenless: same-cycle job without token still admitted', () => {
    const cycleA = '2026-09-08T04:48:50.000Z';
    expect(
      isEndCycleTokenStale({
        jobToken: undefined,
        expectedToken: cycleA,
        fsmState: 'POSSIBLE_END',
        jobRequestedAt: '2026-09-08T05:17:36.000Z',
      }),
    ).toBe('ok');
  });

  it('R10 legacy tokenless: missing requestedAt is ambiguous and rejected', () => {
    expect(
      isEndCycleTokenStale({
        jobToken: undefined,
        expectedToken: '2026-09-08T05:02:20.000Z',
        fsmState: 'POSSIBLE_END',
      }),
    ).toBe('stale_legacy_missing_correlation');
  });

  it('pre-clock POSSIBLE_END without possibleEndEnteredAt still admits tokenless legacy job', () => {
    expect(
      isEndCycleTokenStale({
        jobToken: undefined,
        expectedToken: null,
        fsmState: 'POSSIBLE_END',
        jobRequestedAt: '2026-09-06T12:00:00.000Z',
      }),
    ).toBe('ok');
  });
});
