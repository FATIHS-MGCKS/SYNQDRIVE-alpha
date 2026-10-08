import {
  createInertM3_3HvH4A3AttestationIssuerDbFromProcessEnvV1,
  createInertM3_3HvH4A3AttestationIssuerDbV1,
  M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV,
  M3_3_HV_H4_A3_ATTESTATION_ISSUER_EXPECTED_DB_LOGIN_ENV,
  M3_3HvH4A3AttestationIssuerFactoryUnavailableError,
} from './m3-3-hv-h4-a3-3-o2-r3-issuer-runtime-factory.inert.v1';

const databaseUrl = process.env.DATABASE_URL;

describe('m3-3-hv-h4-a3-3-o2-r3-h1 inert issuer factory', () => {
  const originalIssuerUrl = process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV];
  const originalExpectedLogin = process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_EXPECTED_DB_LOGIN_ENV];
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalIssuerUrl === undefined) {
      delete process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV];
    } else {
      process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV] = originalIssuerUrl;
    }
    if (originalExpectedLogin === undefined) {
      delete process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_EXPECTED_DB_LOGIN_ENV];
    } else {
      process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_EXPECTED_DB_LOGIN_ENV] = originalExpectedLogin;
    }
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it('fails closed when dedicated issuer env is missing', async () => {
    delete process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV];
    await expect(createInertM3_3HvH4A3AttestationIssuerDbFromProcessEnvV1()).rejects.toMatchObject({
      code: 'M3_3_HV_H4_A3_ATTESTATION_ISSUER_FACTORY_UNAVAILABLE',
      message: 'ISSUER_DATABASE_URL_ENV_MISSING',
    });
  });

  it('fails closed when expected DB login env is missing', async () => {
    process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV] = 'postgresql://issuer@localhost/db';
    delete process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_EXPECTED_DB_LOGIN_ENV];
    await expect(createInertM3_3HvH4A3AttestationIssuerDbFromProcessEnvV1()).rejects.toMatchObject({
      message: 'EXPECTED_DB_LOGIN_ENV_MISSING',
    });
  });

  it('requires expectedDbLogin in direct factory input', async () => {
    await expect(
      createInertM3_3HvH4A3AttestationIssuerDbV1({
        issuerDatabaseUrl: 'postgresql://issuer@localhost/db',
        expectedDbLogin: '  ',
      }),
    ).rejects.toThrow(M3_3HvH4A3AttestationIssuerFactoryUnavailableError);
  });

  it('rejects same canonical target disguised by query parameters', async () => {
    if (!databaseUrl) return;
    const withLimit = databaseUrl.includes('?')
      ? `${databaseUrl}&connection_limit=1`
      : `${databaseUrl}?connection_limit=1`;
    await expect(
      createInertM3_3HvH4A3AttestationIssuerDbV1({
        issuerDatabaseUrl: withLimit,
        expectedDbLogin: 'dedicated_issuer_login',
        forbidSameTargetAs: databaseUrl,
      }),
    ).rejects.toMatchObject({ message: 'GENERIC_APP_TARGET_REJECTED' });
  });

  it('sanitizes connect failures without leaking driver details', async () => {
    await expect(
      createInertM3_3HvH4A3AttestationIssuerDbV1({
        issuerDatabaseUrl: 'postgresql://issuer_login@127.0.0.1:1/nonexistent_db',
        expectedDbLogin: 'issuer_login',
      }),
    ).rejects.toMatchObject({ message: 'ISSUER_POOL_CONNECT_FAILED' });
  });
});
