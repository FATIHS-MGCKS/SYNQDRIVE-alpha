import {
  TRIP_FSM_MAX_FUTURE_SKEW_MS,
} from './trip-fsm-clock-contract';
import {
  buildEndValidationCompletionEvidence,
  buildPossibleEndToActiveReset,
  END_CYCLE_REOPEN_STRIP_KEYS,
  extractR5EndForensicsForPersistence,
  stripEndCycleEvidenceForActiveReopen,
  validateCusumMovementEventTime,
} from './trip-end-cycle-reset';

const WORKER_NOW = new Date('2026-09-06T12:00:00.000Z');

describe('trip-end-cycle-reset (R5)', () => {
  it('buildPossibleEndToActiveReset clears all end-cycle fields', () => {
    const reset = buildPossibleEndToActiveReset({
      workerNow: WORKER_NOW,
      priorSummary: {
        endValidationStartedAt: 'x',
        endValidationScheduledAt: 'y',
        completedEndValidationAttempt: 2,
        startEvidence: 'preserve-me',
      },
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
    const extracted = extractR5EndForensicsForPersistence({
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
    });
    expect(extracted.endValidation.completedAttempt).toBe(2);
    expect(extracted.endValidation.maxAttemptFallbackReason).toBe(
      'max_completed_cusum_attempts',
    );
    expect(extracted.emptyCoreEndGate?.vlsEvidenceState).toBe('INACTIVE');
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

  it('stripEndCycleEvidenceForActiveReopen removes known transient keys only', () => {
    expect(
      stripEndCycleEvidenceForActiveReopen({
        endValidationScheduledAt: 'a',
        lifecycleNote: 'keep',
      }),
    ).toEqual({ lifecycleNote: 'keep' });
  });
});
