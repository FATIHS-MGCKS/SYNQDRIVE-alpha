import {
  LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS,
} from './longitudinal-input.constants';
import {
  BATTERY_V2_LONGITUDINAL_MATERIALIZATION_SESSION_LIMIT_ENV,
  getBatteryV2LongitudinalMaterializationSessionLimit,
  normalizeLongitudinalMaterializationSessionLimitOverride,
} from './longitudinal-profile-materialization.runtime-config';

describe('longitudinal-profile-materialization.runtime-config', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('E — session limit absent => D1 DB safety max default', () => {
    delete process.env[BATTERY_V2_LONGITUDINAL_MATERIALIZATION_SESSION_LIMIT_ENV];
    expect(getBatteryV2LongitudinalMaterializationSessionLimit()).toBe(
      LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS,
    );
  });

  it('F — session limit <=0 => safe default', () => {
    process.env[BATTERY_V2_LONGITUDINAL_MATERIALIZATION_SESSION_LIMIT_ENV] = '0';
    expect(getBatteryV2LongitudinalMaterializationSessionLimit()).toBe(
      LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS,
    );
  });

  it('G — session limit above D1 max => capped', () => {
    process.env[BATTERY_V2_LONGITUDINAL_MATERIALIZATION_SESSION_LIMIT_ENV] = '999';
    expect(getBatteryV2LongitudinalMaterializationSessionLimit()).toBe(
      LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS,
    );
  });

  it('Q — ops override above max normalized', () => {
    expect(normalizeLongitudinalMaterializationSessionLimitOverride(500)).toBe(
      LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS,
    );
  });

  it('valid override within max preserved', () => {
    expect(normalizeLongitudinalMaterializationSessionLimitOverride(25)).toBe(25);
  });
});
