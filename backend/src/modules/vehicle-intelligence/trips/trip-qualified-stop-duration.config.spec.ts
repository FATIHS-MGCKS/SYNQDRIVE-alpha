import { CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS } from './trip-qualified-stop-duration.policy';
import { resolveMaxSameTripQualifiedStopMs } from './trip-qualified-stop-duration.config';

describe('trip-qualified-stop-duration.config', () => {
  const baseEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...baseEnv };
  });

  it('defaults to canonical 300000 when no env is set', () => {
    delete process.env.TRIP_SAME_TRIP_MAX_STOP_MS;
    delete process.env.TRIP_MID_GAP_SPLIT_MS;
    expect(resolveMaxSameTripQualifiedStopMs(process.env)).toBe(
      CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS,
    );
  });

  it('prefers TRIP_SAME_TRIP_MAX_STOP_MS over legacy', () => {
    process.env.TRIP_SAME_TRIP_MAX_STOP_MS = '240000';
    process.env.TRIP_MID_GAP_SPLIT_MS = '180000';
    expect(resolveMaxSameTripQualifiedStopMs(process.env)).toBe(240_000);
  });

  it('falls back to legacy TRIP_MID_GAP_SPLIT_MS when canonical unset', () => {
    delete process.env.TRIP_SAME_TRIP_MAX_STOP_MS;
    process.env.TRIP_MID_GAP_SPLIT_MS = '180000';
    expect(resolveMaxSameTripQualifiedStopMs(process.env)).toBe(180_000);
  });

  it('invalid values fall through to default', () => {
    process.env.TRIP_SAME_TRIP_MAX_STOP_MS = 'not-a-number';
    delete process.env.TRIP_MID_GAP_SPLIT_MS;
    expect(resolveMaxSameTripQualifiedStopMs(process.env)).toBe(
      CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS,
    );
  });
});
