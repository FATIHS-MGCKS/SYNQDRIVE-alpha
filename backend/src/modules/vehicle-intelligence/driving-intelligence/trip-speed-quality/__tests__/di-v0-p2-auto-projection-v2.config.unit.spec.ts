import {
  DI_V0_P2_AUTO_PROJECTION_V2_ENV,
  DiV0P2AutoProjectionV2ConfigError,
  parseDiV0P2AutoProjectionV2Config,
} from '../di-v0-p2-auto-projection-v2.config';

describe('P2 auto projection V2 config', () => {
  it('defaults to disabled without enabledSince', () => {
    const cfg = parseDiV0P2AutoProjectionV2Config({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.enabledSince).toBeNull();
  });

  it('requires enabledSince when enabled', () => {
    expect(() =>
      parseDiV0P2AutoProjectionV2Config({
        [DI_V0_P2_AUTO_PROJECTION_V2_ENV.enabled]: 'true',
      }),
    ).toThrow(DiV0P2AutoProjectionV2ConfigError);
  });

  it('parses enabled config with ISO since', () => {
    const since = '2026-10-15T00:00:00.000Z';
    const cfg = parseDiV0P2AutoProjectionV2Config({
      [DI_V0_P2_AUTO_PROJECTION_V2_ENV.enabled]: '1',
      [DI_V0_P2_AUTO_PROJECTION_V2_ENV.enabledSince]: since,
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.enabledSince?.toISOString()).toBe(since);
    expect(cfg.qcPolicyVersion).toBe('DI_V0_SPEED_QC_POLICY_V2');
  });
});
