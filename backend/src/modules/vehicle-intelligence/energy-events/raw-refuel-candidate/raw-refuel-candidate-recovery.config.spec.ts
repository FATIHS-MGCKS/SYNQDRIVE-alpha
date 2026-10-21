import {
  canExecuteRawRefuelCandidateRecovery,
  RFRF_CANDIDATE_RECOVERY_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';

describe('canExecuteRawRefuelCandidateRecovery', () => {
  const base = { ...process.env };

  afterEach(() => {
    process.env = { ...base };
  });

  it('requires master, persist, and dedicated recovery flag', () => {
    delete process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV];
    delete process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV];
    delete process.env[RFRF_CANDIDATE_RECOVERY_ENABLED_ENV];
    expect(canExecuteRawRefuelCandidateRecovery()).toBe(false);

    process.env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV] = 'true';
    process.env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV] = 'true';
    expect(canExecuteRawRefuelCandidateRecovery()).toBe(false);

    process.env[RFRF_CANDIDATE_RECOVERY_ENABLED_ENV] = 'true';
    expect(canExecuteRawRefuelCandidateRecovery()).toBe(true);
  });
});
