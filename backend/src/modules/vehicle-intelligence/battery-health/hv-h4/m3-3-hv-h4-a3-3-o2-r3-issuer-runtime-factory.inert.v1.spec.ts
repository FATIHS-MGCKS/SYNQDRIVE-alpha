import {
  createInertM3_3HvH4A3AttestationIssuerDbFromProcessEnvV1,
  createInertM3_3HvH4A3AttestationIssuerDbV1,
  M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV,
  M3_3HvH4A3AttestationIssuerFactoryUnavailableError,
} from './m3-3-hv-h4-a3-3-o2-r3-issuer-runtime-factory.inert.v1';

const databaseUrl = process.env.DATABASE_URL;

describe('m3-3-hv-h4-a3-3-o2-r3 inert issuer factory', () => {
  const originalIssuerUrl = process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV];
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalIssuerUrl === undefined) {
      delete process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV];
    } else {
      process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV] = originalIssuerUrl;
    }
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it('fails closed when dedicated issuer env is missing', async () => {
    delete process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV];
    await expect(createInertM3_3HvH4A3AttestationIssuerDbFromProcessEnvV1()).rejects.toThrow(
      M3_3HvH4A3AttestationIssuerFactoryUnavailableError,
    );
  });

  it('rejects issuer URL identical to DATABASE_URL', async () => {
    if (!databaseUrl) {
      return;
    }
    await expect(
      createInertM3_3HvH4A3AttestationIssuerDbV1({
        issuerDatabaseUrl: databaseUrl,
        forbidSameUrlAs: databaseUrl,
      }),
    ).rejects.toThrow(M3_3HvH4A3AttestationIssuerFactoryUnavailableError);
  });

});
