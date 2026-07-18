import {
  resolveStationsV2EffectiveFeatureFlags,
  resolveStationsV2GlobalFeatureFlags,
  parseStationsV2OrgAllowlist,
} from './stations-v2-feature-flags.resolver';

describe('stations-v2-feature-flags.resolver', () => {
  const baseEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...baseEnv };
  });

  it('defaults all flags to false outside test', () => {
    const env = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;
    const flags = resolveStationsV2GlobalFeatureFlags(env);
    expect(flags.stationsScopeV2Enabled).toBe(false);
    expect(flags.stationBookingRulesEnabled).toBe(false);
    expect(flags.bookingRulesEnforcement).toBe('off');
  });

  it('enables all flags in test unless STATIONS_V2_FLAGS_TEST_DEFAULT=off', () => {
    const env = { NODE_ENV: 'test' } as NodeJS.ProcessEnv;
    const flags = resolveStationsV2GlobalFeatureFlags(env);
    expect(flags.stationsScopeV2Enabled).toBe(true);
    expect(flags.stationTransfersEnabled).toBe(true);
    expect(flags.bookingRulesEnforcement).toBe('enforce');
  });

  it('respects org allowlist when set', () => {
    const env = {
      NODE_ENV: 'development',
      STATIONS_V2_SCHEMA_ENABLED: 'true',
      STATIONS_V2_SCOPE_ENABLED: 'true',
      STATIONS_V2_ORG_ALLOWLIST: 'org-a,org-b',
    } as NodeJS.ProcessEnv;

    expect(resolveStationsV2EffectiveFeatureFlags('org-a', env).stationsScopeV2Enabled).toBe(
      true,
    );
    expect(resolveStationsV2EffectiveFeatureFlags('org-x', env).stationsScopeV2Enabled).toBe(
      false,
    );
  });

  it('enforces dependency closure', () => {
    const env = {
      NODE_ENV: 'development',
      STATIONS_V2_TRANSFERS_ENABLED: 'true',
    } as NodeJS.ProcessEnv;
    const flags = resolveStationsV2GlobalFeatureFlags(env);
    expect(flags.stationTransfersEnabled).toBe(false);
  });

  it('parses org allowlist', () => {
    const allowlist = parseStationsV2OrgAllowlist({
      STATIONS_V2_ORG_ALLOWLIST: 'a,b, c',
    } as NodeJS.ProcessEnv);
    expect(allowlist).toEqual(new Set(['a', 'b', 'c']));
  });
});
