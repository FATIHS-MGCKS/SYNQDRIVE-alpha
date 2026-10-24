import tireDs4ShadowConfig, { TIRE_DS4_SHADOW_CATCHUP_ENABLED_ENV } from './tire-ds4-shadow.config';

describe('tire-ds4-shadow.config', () => {
  const original = process.env[TIRE_DS4_SHADOW_CATCHUP_ENABLED_ENV];

  afterEach(() => {
    if (original === undefined) {
      delete process.env[TIRE_DS4_SHADOW_CATCHUP_ENABLED_ENV];
    } else {
      process.env[TIRE_DS4_SHADOW_CATCHUP_ENABLED_ENV] = original;
    }
  });

  it('defaults catch-up to disabled for canary safety', () => {
    delete process.env[TIRE_DS4_SHADOW_CATCHUP_ENABLED_ENV];
    const cfg = tireDs4ShadowConfig();
    expect(cfg.catchupEnabled).toBe(false);
  });
});
