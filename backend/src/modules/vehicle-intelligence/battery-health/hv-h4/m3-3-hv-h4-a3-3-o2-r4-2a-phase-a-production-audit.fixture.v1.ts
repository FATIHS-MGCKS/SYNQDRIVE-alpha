import { PrismaClient } from '@prisma/client';

export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUDIT_FIXTURE_ROLE = 'phase_a_prod_audit_fixture' as const;
const FIXTURE_PASSWORD = 'phase_a_prod_audit_fixture_pw';

function databaseNameFromUrl(databaseUrl: string): string {
  const parsed = new URL(databaseUrl.replace(/^postgresql:/, 'postgres:'));
  return parsed.pathname.replace(/^\//, '').split('/')[0] || 'synqdrive';
}

export async function provisionPhaseAProductionAuditFixtureUrlV1(
  adminDatabaseUrl: string,
): Promise<{ databaseUrl: string }> {
  const admin = new PrismaClient({ datasources: { db: { url: adminDatabaseUrl } } });
  const role = M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUDIT_FIXTURE_ROLE;
  const databaseName = databaseNameFromUrl(adminDatabaseUrl);

  try {
    await admin.$executeRawUnsafe(`DROP ROLE IF EXISTS ${role}`);
    await admin.$executeRawUnsafe(
      `CREATE ROLE ${role} LOGIN PASSWORD '${FIXTURE_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
    );
    await admin.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${databaseName}" TO ${role}`);
    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await admin.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`);
  } finally {
    await admin.$disconnect().catch(() => undefined);
  }

  const parsed = new URL(adminDatabaseUrl.replace(/^postgresql:/, 'postgres:'));
  parsed.username = role;
  parsed.password = FIXTURE_PASSWORD;
  const databaseUrl = parsed.toString().replace(/^postgres:/, 'postgresql:');
  return { databaseUrl };
}

/** Fixture-only: audit role must not hold direct INSERT on public catalog tables. */
export async function assertPhaseAProductionAuditFixtureCannotInsertOnPublicV1(
  auditDatabaseUrl: string,
): Promise<{ ok: true } | { ok: false; reasonCode: string }> {
  const client = new PrismaClient({ datasources: { db: { url: auditDatabaseUrl } } });
  try {
    await client.$connect();
    await client.$executeRawUnsafe(
      `INSERT INTO pg_catalog.pg_roles (rolname) VALUES ('phase_a_audit_write_probe_should_fail')`,
    );
    return { ok: false, reasonCode: 'PHASE_A_AUDIT_FIXTURE_UNEXPECTED_WRITE_CAPABILITY' };
  } catch {
    return { ok: true };
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}

export async function teardownPhaseAProductionAuditFixtureV1(adminDatabaseUrl: string): Promise<void> {
  const admin = new PrismaClient({ datasources: { db: { url: adminDatabaseUrl } } });
  const role = M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUDIT_FIXTURE_ROLE;
  const databaseName = databaseNameFromUrl(adminDatabaseUrl);
  try {
    await admin.$executeRawUnsafe(`REVOKE ALL PRIVILEGES ON DATABASE "${databaseName}" FROM ${role}`).catch(
      () => undefined,
    );
    await admin.$executeRawUnsafe(`REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${role}`).catch(() => undefined);
    await admin.$executeRawUnsafe(`DROP OWNED BY ${role}`).catch(() => undefined);
    await admin.$executeRawUnsafe(`DROP ROLE IF EXISTS ${role}`);
  } finally {
    await admin.$disconnect().catch(() => undefined);
  }
}
