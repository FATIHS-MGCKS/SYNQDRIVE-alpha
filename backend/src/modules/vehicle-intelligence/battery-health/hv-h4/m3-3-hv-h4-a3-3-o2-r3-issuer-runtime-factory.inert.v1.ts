import { PrismaClient } from '@prisma/client';
import {
  brandM3_3HvH4A3IntegrityAttestationIssuerDbV1,
  type M3_3HvH4A3IntegrityAttestationIssuerDbV1,
} from './m3-3-hv-h4-a3-3-o2-isolated-attestation-issuer.types.v1';
import {
  canonicalPostgresTargetKeyV1,
  parsePostgresUrlLoginV1,
} from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';

/** Dedicated issuer credential env — must never alias generic `DATABASE_URL` at runtime. */
export const M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV =
  'M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL' as const;

/** Required startup identity check (login name only — never a password). */
export const M3_3_HV_H4_A3_ATTESTATION_ISSUER_EXPECTED_DB_LOGIN_ENV =
  'M3_3_HV_H4_A3_ATTESTATION_ISSUER_EXPECTED_DB_LOGIN' as const;

export class M3_3HvH4A3AttestationIssuerFactoryUnavailableError extends Error {
  readonly code = 'M3_3_HV_H4_A3_ATTESTATION_ISSUER_FACTORY_UNAVAILABLE';

  constructor(reasonCode: string) {
    super(reasonCode);
    this.name = 'M3_3HvH4A3AttestationIssuerFactoryUnavailableError';
  }
}

export type M3_3HvH4A3InertAttestationIssuerFactoryInputV1 = {
  issuerDatabaseUrl: string;
  /** Required dedicated issuer DB login name (must match session_user/current_user after connect). */
  expectedDbLogin: string;
  /** Generic application pool URL — rejects identical canonical target or login. */
  forbidSameTargetAs?: string | null;
  /** Explicit generic app login to reject even when URL strings differ cosmetically. */
  forbiddenGenericAppDbLogin?: string | null;
};

function normalizeDatabaseUrl(url: string): string {
  return url.trim();
}

function rejectFactory(reasonCode: string): never {
  throw new M3_3HvH4A3AttestationIssuerFactoryUnavailableError(reasonCode);
}

function assertExpectedLoginConfigured(expectedDbLogin: string): string {
  const login = expectedDbLogin.trim();
  if (!login) {
    rejectFactory('EXPECTED_DB_LOGIN_REQUIRED');
  }
  return login;
}

function assertUrlIdentityBeforeConnect(
  issuerDatabaseUrl: string,
  expectedDbLogin: string,
  input: M3_3HvH4A3InertAttestationIssuerFactoryInputV1,
): void {
  const urlLogin = parsePostgresUrlLoginV1(issuerDatabaseUrl);
  if (urlLogin && urlLogin !== expectedDbLogin) {
    rejectFactory('URL_LOGIN_MISMATCH');
  }

  const forbiddenLogin = input.forbiddenGenericAppDbLogin?.trim();
  if (forbiddenLogin && urlLogin === forbiddenLogin) {
    rejectFactory('GENERIC_APP_LOGIN_REJECTED');
  }

  const forbiddenUrl = input.forbidSameTargetAs ? normalizeDatabaseUrl(input.forbidSameTargetAs) : '';
  if (forbiddenUrl) {
    const issuerKey = canonicalPostgresTargetKeyV1(issuerDatabaseUrl);
    const forbiddenKey = canonicalPostgresTargetKeyV1(forbiddenUrl);
    if (issuerKey && forbiddenKey && issuerKey === forbiddenKey) {
      rejectFactory('GENERIC_APP_TARGET_REJECTED');
    }
    if (normalizeDatabaseUrl(issuerDatabaseUrl) === forbiddenUrl) {
      rejectFactory('GENERIC_APP_URL_REJECTED');
    }
  }
}

type SessionIdentityRow = {
  session_user: string;
  current_user: string;
  rolsuper: boolean;
  rolcreaterole: boolean;
};

/**
 * Inert prototype — not registered in Nest modules. Builds a branded issuer pool from dedicated credentials only.
 */
export async function createInertM3_3HvH4A3AttestationIssuerDbV1(
  input: M3_3HvH4A3InertAttestationIssuerFactoryInputV1,
): Promise<M3_3HvH4A3IntegrityAttestationIssuerDbV1> {
  const issuerDatabaseUrl = normalizeDatabaseUrl(input.issuerDatabaseUrl);
  if (!issuerDatabaseUrl) {
    rejectFactory('ISSUER_DATABASE_URL_EMPTY');
  }

  const expectedDbLogin = assertExpectedLoginConfigured(input.expectedDbLogin);
  assertUrlIdentityBeforeConnect(issuerDatabaseUrl, expectedDbLogin, input);

  const client = new PrismaClient({
    datasources: { db: { url: issuerDatabaseUrl } },
  });

  try {
    await client.$connect();
    const identityRows = await client.$queryRaw<SessionIdentityRow[]>`
      SELECT
        session_user::text AS session_user,
        current_user::text AS current_user,
        r.rolsuper,
        r.rolcreaterole
      FROM pg_roles r
      WHERE r.rolname = current_user
    `;
    const identity = identityRows[0];
    if (!identity?.session_user || !identity.current_user) {
      rejectFactory('SESSION_IDENTITY_UNAVAILABLE');
    }
    if (identity.session_user !== expectedDbLogin || identity.current_user !== expectedDbLogin) {
      rejectFactory('SESSION_LOGIN_MISMATCH');
    }
    if (identity.rolsuper) {
      rejectFactory('SUPERUSER_LOGIN_REJECTED');
    }
    if (identity.rolcreaterole) {
      rejectFactory('CREATEROLE_LOGIN_REJECTED');
    }

    return brandM3_3HvH4A3IntegrityAttestationIssuerDbV1(client);
  } catch (error) {
    await client.$disconnect().catch(() => undefined);
    if (error instanceof M3_3HvH4A3AttestationIssuerFactoryUnavailableError) {
      throw error;
    }
    rejectFactory('ISSUER_POOL_CONNECT_FAILED');
  }
}

/** Fail-closed env-based construction for future trusted worker bootstrap (not wired in R3). */
export async function createInertM3_3HvH4A3AttestationIssuerDbFromProcessEnvV1(): Promise<M3_3HvH4A3IntegrityAttestationIssuerDbV1> {
  const issuerDatabaseUrl = process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV];
  if (!issuerDatabaseUrl?.trim()) {
    rejectFactory('ISSUER_DATABASE_URL_ENV_MISSING');
  }

  const expectedDbLogin = process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_EXPECTED_DB_LOGIN_ENV];
  if (!expectedDbLogin?.trim()) {
    rejectFactory('EXPECTED_DB_LOGIN_ENV_MISSING');
  }

  const genericUrl = process.env.DATABASE_URL ?? null;
  return createInertM3_3HvH4A3AttestationIssuerDbV1({
    issuerDatabaseUrl,
    expectedDbLogin,
    forbidSameTargetAs: genericUrl,
    forbiddenGenericAppDbLogin: genericUrl ? parsePostgresUrlLoginV1(genericUrl) : null,
  });
}

export async function disconnectInertM3_3HvH4A3AttestationIssuerDbV1(
  issuerDb: M3_3HvH4A3IntegrityAttestationIssuerDbV1,
): Promise<void> {
  await issuerDb.$disconnect();
}
