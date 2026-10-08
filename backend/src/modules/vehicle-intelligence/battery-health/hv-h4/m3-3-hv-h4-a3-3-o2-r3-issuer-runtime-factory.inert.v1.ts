import { PrismaClient } from '@prisma/client';
import {
  brandM3_3HvH4A3IntegrityAttestationIssuerDbV1,
  type M3_3HvH4A3IntegrityAttestationIssuerDbV1,
} from './m3-3-hv-h4-a3-3-o2-isolated-attestation-issuer.types.v1';

/** Dedicated issuer credential env — must never alias generic `DATABASE_URL` at runtime. */
export const M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV =
  'M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL' as const;

/** Optional startup identity check (login name only — never a password). */
export const M3_3_HV_H4_A3_ATTESTATION_ISSUER_EXPECTED_DB_LOGIN_ENV =
  'M3_3_HV_H4_A3_ATTESTATION_ISSUER_EXPECTED_DB_LOGIN' as const;

export class M3_3HvH4A3AttestationIssuerFactoryUnavailableError extends Error {
  readonly code = 'M3_3_HV_H4_A3_ATTESTATION_ISSUER_FACTORY_UNAVAILABLE';
}

export type M3_3HvH4A3InertAttestationIssuerFactoryInputV1 = {
  issuerDatabaseUrl: string;
  /** When set, factory rejects URLs identical to the generic app pool (fail-closed). */
  forbidSameUrlAs?: string | null;
  expectedDbLogin?: string | null;
};

function normalizeDatabaseUrl(url: string): string {
  return url.trim();
}

/**
 * Inert prototype — not registered in Nest modules. Builds a branded issuer pool from dedicated credentials only.
 */
export async function createInertM3_3HvH4A3AttestationIssuerDbV1(
  input: M3_3HvH4A3InertAttestationIssuerFactoryInputV1,
): Promise<M3_3HvH4A3IntegrityAttestationIssuerDbV1> {
  const issuerDatabaseUrl = normalizeDatabaseUrl(input.issuerDatabaseUrl);
  if (!issuerDatabaseUrl) {
    throw new M3_3HvH4A3AttestationIssuerFactoryUnavailableError('issuer database URL is empty');
  }

  const forbidden = input.forbidSameUrlAs ? normalizeDatabaseUrl(input.forbidSameUrlAs) : '';
  if (forbidden && forbidden === issuerDatabaseUrl) {
    throw new M3_3HvH4A3AttestationIssuerFactoryUnavailableError(
      'issuer database URL must not equal generic application DATABASE_URL',
    );
  }

  const client = new PrismaClient({
    datasources: { db: { url: issuerDatabaseUrl } },
  });

  try {
    await client.$connect();
    const identityRows = await client.$queryRaw<Array<{ session_user: string; current_user: string }>>`
      SELECT session_user::text, current_user::text
    `;
    const sessionUser = identityRows[0]?.session_user ?? '';
    const currentUser = identityRows[0]?.current_user ?? '';
    if (!sessionUser || !currentUser) {
      throw new M3_3HvH4A3AttestationIssuerFactoryUnavailableError('could not read PostgreSQL session identity');
    }

    const expectedLogin = input.expectedDbLogin?.trim();
    if (expectedLogin && sessionUser !== expectedLogin) {
      throw new M3_3HvH4A3AttestationIssuerFactoryUnavailableError(
        'issuer database login identity does not match expected login',
      );
    }

    return brandM3_3HvH4A3IntegrityAttestationIssuerDbV1(client);
  } catch (error) {
    await client.$disconnect().catch(() => undefined);
    if (error instanceof M3_3HvH4A3AttestationIssuerFactoryUnavailableError) {
      throw error;
    }
    throw new M3_3HvH4A3AttestationIssuerFactoryUnavailableError(
      error instanceof Error ? error.message : 'issuer pool connect failed',
    );
  }
}

/** Fail-closed env-based construction for future trusted worker bootstrap (not wired in R3). */
export async function createInertM3_3HvH4A3AttestationIssuerDbFromProcessEnvV1(): Promise<M3_3HvH4A3IntegrityAttestationIssuerDbV1> {
  const issuerDatabaseUrl = process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV];
  if (!issuerDatabaseUrl?.trim()) {
    throw new M3_3HvH4A3AttestationIssuerFactoryUnavailableError(
      `${M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV} is not configured`,
    );
  }

  return createInertM3_3HvH4A3AttestationIssuerDbV1({
    issuerDatabaseUrl,
    forbidSameUrlAs: process.env.DATABASE_URL ?? null,
    expectedDbLogin: process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_EXPECTED_DB_LOGIN_ENV] ?? null,
  });
}

export async function disconnectInertM3_3HvH4A3AttestationIssuerDbV1(
  issuerDb: M3_3HvH4A3IntegrityAttestationIssuerDbV1,
): Promise<void> {
  await issuerDb.$disconnect();
}
