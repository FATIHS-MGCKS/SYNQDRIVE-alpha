import { Prisma, PrismaClient } from '@prisma/client';
import {
  brandM3_3HvH4A3IntegrityAttestationIssuerDbV1,
  type M3_3HvH4A3IntegrityAttestationIssuerDbV1,
} from './m3-3-hv-h4-a3-3-o2-isolated-attestation-issuer.types.v1';

/** CI-only role names mirroring intended production separation (not production-certified). */
export const M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE = 'm3_3_hv_h4_a3_r2_app_restricted';
export const M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE = 'm3_3_hv_h4_a3_r2_attestation_issuer';
/** Non-superuser CI login inheriting restricted app role only (not issuer). */
export const M3_3_HV_H4_A3_O2_R2_APP_LOGIN_ROLE = 'm3_3_hv_h4_a3_r2_app_login';
const APP_LOGIN_PASSWORD = 'r2_ci_app_login_pw';
export const M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE = 'm3_3_hv_h4_a3_r2_issuer_login';
const ISSUER_LOGIN_PASSWORD = 'r2_ci_issuer_login_pw';

const ATTESTATION_TABLE = 'public.battery_hv_charge_session_evidence_integrity_attestations';
const REVISION_TABLE = 'public.battery_hv_charge_session_evidence_revisions';
const ACK_TABLE = 'public.battery_hv_charge_session_evidence_acks';

export async function ensureM3_3HvH4A3O2R2PostgresRolesV1(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE ROLE ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE} NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE ROLE ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE} NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE ROLE ${M3_3_HV_H4_A3_O2_R2_APP_LOGIN_ROLE} LOGIN PASSWORD '${APP_LOGIN_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(
    `ALTER ROLE ${M3_3_HV_H4_A3_O2_R2_APP_LOGIN_ROLE} PASSWORD '${APP_LOGIN_PASSWORD}'`,
  );
  await prisma.$executeRawUnsafe(
    `GRANT ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE} TO ${M3_3_HV_H4_A3_O2_R2_APP_LOGIN_ROLE}`,
  );
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE ROLE ${M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE} LOGIN PASSWORD '${ISSUER_LOGIN_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(
    `ALTER ROLE ${M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE} PASSWORD '${ISSUER_LOGIN_PASSWORD}'`,
  );
  await prisma.$executeRawUnsafe(
    `GRANT ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE} TO ${M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE}`,
  );
  await prisma.$executeRawUnsafe(
    `GRANT USAGE ON SCHEMA public TO ${M3_3_HV_H4_A3_O2_R2_APP_LOGIN_ROLE}, ${M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE}`,
  );
  await prisma.$executeRawUnsafe(
    `GRANT SELECT ON ${REVISION_TABLE}, ${ACK_TABLE}, ${ATTESTATION_TABLE} TO ${M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE}`,
  );
  await prisma.$executeRawUnsafe(`GRANT INSERT ON ${ATTESTATION_TABLE} TO ${M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE}`);
  await prisma.$executeRawUnsafe(
    `GRANT EXECUTE ON FUNCTION public.m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1(text) TO ${M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE}`,
  );
  await prisma.$executeRawUnsafe(
    `GRANT UPDATE ON ${REVISION_TABLE}, ${ACK_TABLE} TO ${M3_3_HV_H4_A3_O2_R2_APP_LOGIN_ROLE}`,
  );
  await prisma.$executeRawUnsafe(
    `REVOKE INSERT, UPDATE, DELETE ON ${ATTESTATION_TABLE} FROM ${M3_3_HV_H4_A3_O2_R2_APP_LOGIN_ROLE}`,
  );
  await prisma.$executeRawUnsafe(
    `REVOKE ALL ON FUNCTION public.m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1(text) FROM ${M3_3_HV_H4_A3_O2_R2_APP_LOGIN_ROLE}`,
  );

  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE}`);
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}`);

  await prisma.$executeRawUnsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE}`,
  );
  await prisma.$executeRawUnsafe(
    `REVOKE INSERT, UPDATE, DELETE ON ${ATTESTATION_TABLE} FROM ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE}`,
  );
  await prisma.$executeRawUnsafe(
    `GRANT UPDATE ON ${REVISION_TABLE} TO ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE}`,
  );
  await prisma.$executeRawUnsafe(`GRANT UPDATE ON ${ACK_TABLE} TO ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE}`);

  await prisma.$executeRawUnsafe(
    `GRANT SELECT ON ${REVISION_TABLE}, ${ACK_TABLE}, ${ATTESTATION_TABLE} TO ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}`,
  );
  await prisma.$executeRawUnsafe(`GRANT INSERT ON ${ATTESTATION_TABLE} TO ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}`);
  await prisma.$executeRawUnsafe(
    `REVOKE INSERT, UPDATE, DELETE ON ${REVISION_TABLE}, ${ACK_TABLE} FROM ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}`,
  );

  await prisma.$executeRawUnsafe(
    `GRANT ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE} TO CURRENT_USER`,
  );
  await prisma.$executeRawUnsafe(
    `GRANT ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE} TO CURRENT_USER`,
  );

  await prisma.$executeRawUnsafe(
    `REVOKE ALL ON FUNCTION public.m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1(text) FROM ${M3_3_HV_H4_A3_O2_R2_RESTRICTED_APP_ROLE}`,
  );
  await prisma.$executeRawUnsafe(
    `GRANT EXECUTE ON FUNCTION public.m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1(text) TO ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}`,
  );
}

function withPrismaSingleConnectionUrlV1(databaseUrl: string): string {
  const parsed = new URL(databaseUrl.replace(/^postgresql:/, 'postgres:'));
  parsed.searchParams.set('connection_limit', '1');
  return parsed.toString().replace(/^postgres:/, 'postgresql:');
}

function buildLoginDatabaseUrlV1(loginRole: string, password: string): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;
  try {
    const parsed = new URL(base.replace(/^postgresql:/, 'postgres:'));
    parsed.username = loginRole;
    parsed.password = password;
    return parsed.toString().replace(/^postgres:/, 'postgresql:');
  } catch {
    return undefined;
  }
}

/**
 * CI-only: connection scoped to a PostgreSQL role via startup options (not issuer application code).
 * Production must use separate credentials/pools — not certified here.
 */
export function buildRoleScopedDatabaseUrlV1(pgRole: string): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;
  try {
    const parsed = new URL(base.replace(/^postgresql:/, 'postgres:'));
    const roleFlag = `-c role=${pgRole}`;
    const existing = parsed.searchParams.get('options');
    parsed.searchParams.set('options', existing ? `${existing} ${roleFlag}` : roleFlag);
    return parsed.toString().replace(/^postgres:/, 'postgresql:');
  } catch {
    return undefined;
  }
}

/** CI fixture session (SET ROLE here is test harness only — not issuer application code). */
export async function createDedicatedPostgresSessionClientV1(role: string): Promise<PrismaClient> {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error('O2-R2: DATABASE_URL required for dedicated postgres session client');
  }
  const url = withPrismaSingleConnectionUrlV1(base);
  const client = new PrismaClient({ datasources: { db: { url } } });
  await client.$connect();
  await client.$executeRawUnsafe(`SET ROLE ${role}`);
  return client;
}

/** Non-superuser CI login inheriting restricted app role only (SET ROLE isolation proof). */
export async function createRestrictedAppLoginPostgresClientV1(): Promise<PrismaClient | undefined> {
  const loginUrl = buildLoginDatabaseUrlV1(M3_3_HV_H4_A3_O2_R2_APP_LOGIN_ROLE, APP_LOGIN_PASSWORD);
  if (!loginUrl) return undefined;
  const client = new PrismaClient({
    datasources: { db: { url: withPrismaSingleConnectionUrlV1(loginUrl) } },
  });
  await client.$connect();
  return client;
}

/** Restricted app privileges on a dedicated non-superuser connection (concurrency / mutation tests). */
export async function createRestrictedAppRoleScopedPostgresClientV1(): Promise<PrismaClient | undefined> {
  return createRestrictedAppLoginPostgresClientV1();
}

/** CI fixture URL for issuer-login pool tests (not for production runtime). */
export function buildIssuerLoginDatabaseUrlForCiV1(): string | undefined {
  const loginUrl = buildLoginDatabaseUrlV1(M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE, ISSUER_LOGIN_PASSWORD);
  return loginUrl ? withPrismaSingleConnectionUrlV1(loginUrl) : undefined;
}

/** Dedicated issuer-login Prisma pool (CI fixture credentials only). */
export async function createIssuerLoginPostgresClientV1(): Promise<
  M3_3HvH4A3IntegrityAttestationIssuerDbV1 | undefined
> {
  const loginUrl = buildIssuerLoginDatabaseUrlForCiV1();
  if (!loginUrl) return undefined;
  const client = new PrismaClient({
    datasources: { db: { url: withPrismaSingleConnectionUrlV1(loginUrl) } },
  });
  await client.$connect();
  return brandM3_3HvH4A3IntegrityAttestationIssuerDbV1(client);
}

export type M3_3HvH4A3O2R2PostgresSessionIdentityV1 = {
  sessionUser: string;
  currentUser: string;
  rolsuper: boolean;
  rolcreaterole: boolean;
};

export async function readPostgresSessionIdentityV1(
  db: PrismaClient | Prisma.TransactionClient,
): Promise<M3_3HvH4A3O2R2PostgresSessionIdentityV1> {
  const rows = await db.$queryRaw<
    Array<{ session_user: string; current_user: string; rolsuper: boolean; rolcreaterole: boolean }>
  >`
    SELECT
      session_user::text,
      current_user::text,
      r.rolsuper,
      r.rolcreaterole
    FROM pg_roles r
    WHERE r.rolname = current_user
  `;
  const row = rows[0];
  return {
    sessionUser: row?.session_user ?? '',
    currentUser: row?.current_user ?? '',
    rolsuper: row?.rolsuper ?? true,
    rolcreaterole: row?.rolcreaterole ?? true,
  };
}

export async function readPostgresBackendPidV1(db: PrismaClient | Prisma.TransactionClient): Promise<number> {
  const rows = await db.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid()::int AS pid`;
  return rows[0]?.pid ?? -1;
}

export async function waitUntilBackendBlockedByV1(
  observer: PrismaClient,
  blockedPid: number,
  expectedBlockerPid: number,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await observer.$queryRaw<Array<{ blockers: number[] }>>`
      SELECT COALESCE(pg_blocking_pids(${blockedPid}::integer), ARRAY[]::integer[]) AS blockers
    `;
    const blockers = rows[0]?.blockers ?? [];
    if (blockers.includes(expectedBlockerPid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(
    `O2-R2-H2: backend pid ${blockedPid} was not blocked by ${expectedBlockerPid} within ${timeoutMs}ms`,
  );
}

export async function withPostgresRoleV1<T>(
  prisma: PrismaClient,
  role: string,
  fn: () => Promise<T>,
): Promise<T> {
  await prisma.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
  return fn();
}
