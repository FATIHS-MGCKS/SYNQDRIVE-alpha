import {
  RAW_REFUEL_CANDIDATE_RECOVERY_MAX_BACKOFF_MS,
  RAW_REFUEL_CANDIDATE_RECOVERY_MIN_BACKOFF_MS,
  computeRawRefuelCandidateRecoveryBackoffMs,
} from './raw-refuel-candidate-recovery-backoff';

describe('computeRawRefuelCandidateRecoveryBackoffMs (F10.6.8-B3)', () => {
  it('uses 5m minimum on first claimed failure (attempt=1)', () => {
    expect(computeRawRefuelCandidateRecoveryBackoffMs(0)).toBe(
      RAW_REFUEL_CANDIDATE_RECOVERY_MIN_BACKOFF_MS,
    );
    expect(computeRawRefuelCandidateRecoveryBackoffMs(1)).toBe(300_000);
  });

  it('doubles from post-claim attempt number', () => {
    expect(computeRawRefuelCandidateRecoveryBackoffMs(2)).toBe(600_000);
    expect(computeRawRefuelCandidateRecoveryBackoffMs(3)).toBe(1_200_000);
    expect(computeRawRefuelCandidateRecoveryBackoffMs(4)).toBe(2_400_000);
  });

  it('caps at 6h', () => {
    expect(computeRawRefuelCandidateRecoveryBackoffMs(99)).toBe(
      RAW_REFUEL_CANDIDATE_RECOVERY_MAX_BACKOFF_MS,
    );
    expect(RAW_REFUEL_CANDIDATE_RECOVERY_MAX_BACKOFF_MS).toBe(21_600_000);
  });
});
