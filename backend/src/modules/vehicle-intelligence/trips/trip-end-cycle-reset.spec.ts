import {
  TRIP_FSM_MAX_FUTURE_SKEW_MS,
} from './trip-fsm-clock-contract';
import {
  buildPossibleEndToActiveReset,
  END_CYCLE_TRANSIENT_EVIDENCE_KEYS,
  stripEndCycleTransientEvidence,
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
    for (const key of END_CYCLE_TRANSIENT_EVIDENCE_KEYS) {
      expect((reset.lastEvidenceSummary as Record<string, unknown>)[key]).toBeUndefined();
    }
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

  it('stripEndCycleTransientEvidence removes known transient keys only', () => {
    expect(
      stripEndCycleTransientEvidence({
        endValidationScheduledAt: 'a',
        lifecycleNote: 'keep',
      }),
    ).toEqual({ lifecycleNote: 'keep' });
  });
});
