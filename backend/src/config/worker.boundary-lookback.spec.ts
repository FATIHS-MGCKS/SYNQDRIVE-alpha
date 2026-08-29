import { deriveDefaultTripStartBoundaryMaxLookbackMs } from '@config/worker.config';

describe('deriveDefaultTripStartBoundaryMaxLookbackMs', () => {
  it('uses the supplied env object consistently (not process.env)', () => {
    const env = {
      WORKER_SNAPSHOT_TIER_ACTIVE_DRIVING_MS: '10000',
      WORKER_SNAPSHOT_TIER_RECENTLY_ACTIVE_MS: '20000',
      WORKER_SNAPSHOT_TIER_RESTING_STANDBY_MS: '30000',
      WORKER_SNAPSHOT_TIER_LONG_IDLE_MS: '40000',
      WORKER_POSSIBLE_START_CONFIRM_MAX_WAIT_MS: '5000',
    } as NodeJS.ProcessEnv;

    const lookback = deriveDefaultTripStartBoundaryMaxLookbackMs(env);
    expect(lookback).toBe(40_000 + 5_000 + 120_000);
  });

  it('changes when confirmation wait in env changes', () => {
    const base = {
      WORKER_SNAPSHOT_TIER_LONG_IDLE_MS: '60000',
      WORKER_POSSIBLE_START_CONFIRM_MAX_WAIT_MS: '10000',
    } as NodeJS.ProcessEnv;
    const longer = {
      ...base,
      WORKER_POSSIBLE_START_CONFIRM_MAX_WAIT_MS: '20000',
    } as NodeJS.ProcessEnv;

    expect(deriveDefaultTripStartBoundaryMaxLookbackMs(longer)).toBeGreaterThan(
      deriveDefaultTripStartBoundaryMaxLookbackMs(base),
    );
  });
});
