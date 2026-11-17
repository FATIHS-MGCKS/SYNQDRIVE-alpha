import { isCoreAppM2mEnabled, isCoreAppM2mProductionReady } from './core-app-m2m.config';

describe('core-app-m2m.config', () => {
  it('defaults M2M runtime to disabled', () => {
    expect(isCoreAppM2mEnabled({})).toBe(false);
    expect(isCoreAppM2mEnabled({ CORE_APP_M2M_ENABLED: 'false' })).toBe(false);
    expect(isCoreAppM2mProductionReady({})).toBe(false);
  });

  it('production ready requires explicit enable + attestation', () => {
    expect(isCoreAppM2mProductionReady({ CORE_APP_M2M_ENABLED: 'true' })).toBe(false);
    expect(
      isCoreAppM2mProductionReady({
        CORE_APP_M2M_ENABLED: 'true',
        CORE_APP_M2M_PRODUCTION_READY: 'true',
      }),
    ).toBe(true);
  });
});