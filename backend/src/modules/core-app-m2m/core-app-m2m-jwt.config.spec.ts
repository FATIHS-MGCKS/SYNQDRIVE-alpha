import {
  CORE_APP_M2M_JWT_AUDIENCE_DEFAULT,
  CORE_APP_M2M_JWT_ISSUER_DEFAULT,
  resolveCoreAppM2mJwtSigningSecret,
  resolveCoreAppM2mTokenTtlSeconds,
} from './core-app-m2m-jwt.config';

describe('core-app-m2m-jwt.config', () => {
  it('returns null signing secret when runtime disabled', () => {
    expect(
      resolveCoreAppM2mJwtSigningSecret({
        CORE_APP_M2M_ENABLED: 'false',
        CORE_APP_M2M_JWT_SECRET: 'test-secret',
      }),
    ).toBeNull();
  });

  it('returns null when enabled but secret missing', () => {
    expect(
      resolveCoreAppM2mJwtSigningSecret({
        CORE_APP_M2M_ENABLED: 'true',
      }),
    ).toBeNull();
  });

  it('returns isolated secret when enabled', () => {
    expect(
      resolveCoreAppM2mJwtSigningSecret({
        CORE_APP_M2M_ENABLED: 'true',
        CORE_APP_M2M_JWT_SECRET: 'm2m-only-secret',
      }),
    ).toBe('m2m-only-secret');
  });

  it('rejects M2M signing secret identical to JWT_SECRET', () => {
    expect(
      resolveCoreAppM2mJwtSigningSecret({
        CORE_APP_M2M_ENABLED: 'true',
        JWT_SECRET: 'shared-accidental-secret',
        CORE_APP_M2M_JWT_SECRET: 'shared-accidental-secret',
      }),
    ).toBeNull();
  });

  it('defaults issuer, audience, ttl', () => {
    expect(
      resolveCoreAppM2mTokenTtlSeconds({ CORE_APP_M2M_TOKEN_TTL_SECONDS: 'not-a-number' }),
    ).toBe(900);
    expect(CORE_APP_M2M_JWT_ISSUER_DEFAULT).toBe('synqdrive:core-app-m2m');
    expect(CORE_APP_M2M_JWT_AUDIENCE_DEFAULT).toBe('synqdrive:platform-api');
  });
});