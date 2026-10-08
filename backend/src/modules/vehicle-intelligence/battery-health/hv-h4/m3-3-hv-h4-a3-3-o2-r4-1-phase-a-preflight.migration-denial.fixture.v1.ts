import { PrismaClient } from '@prisma/client';

export const M3_3_HV_H4_A3_PHASE_A_MIGRATION_DENIAL_ROLE = 'phase_a_mig_select_denial' as const;
const MIGRATION_DENIAL_PASSWORD = 'phase_a_mig_select_denial_pw';

function databaseNameFromUrl(databaseUrl: string): string {
  const parsed = new URL(databaseUrl.replace(/^postgresql:/, 'postgres:'));
  return parsed.pathname.replace(/^\//, '').split('/')[0] || 'synqdrive';
}

export async function provisionPhaseAMigrationSelectDenialFixtureV1(
  adminDatabaseUrl: string,
): Promise<{ databaseUrl: string }> {
  const admin = new PrismaClient({ datasources: { db: { url: adminDatabaseUrl } } });
  const role = M3_3_HV_H4_A3_PHASE_A_MIGRATION_DENIAL_ROLE;
  const databaseName = databaseNameFromUrl(adminDatabaseUrl);

  try {
    await admin.$executeRawUnsafe(`DROP ROLE IF EXISTS ${role}`);
    await admin.$executeRawUnsafe(
      `CREATE ROLE ${role} LOGIN PASSWORD '${MIGRATION_DENIAL_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
    );
    await admin.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${databaseName}" TO ${role}`);
    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await admin.$executeRawUnsafe(`REVOKE SELECT ON TABLE public._prisma_migrations FROM PUBLIC`);
    await admin.$executeRawUnsafe(`REVOKE ALL ON TABLE public._prisma_migrations FROM ${role}`);
    await admin.$executeRawUnsafe(`GRANT SELECT ON TABLE public._prisma_migrations TO synqdrive`);
  } finally {
    await admin.$disconnect().catch(() => undefined);
  }

  const parsed = new URL(adminDatabaseUrl.replace(/^postgresql:/, 'postgres:'));
  parsed.username = role;
  parsed.password = MIGRATION_DENIAL_PASSWORD;
  const databaseUrl = parsed.toString().replace(/^postgres:/, 'postgresql:');
  return { databaseUrl };
}

export async function teardownPhaseAMigrationSelectDenialFixtureV1(adminDatabaseUrl: string): Promise<void> {
  const admin = new PrismaClient({ datasources: { db: { url: adminDatabaseUrl } } });
  try {
    await admin.$executeRawUnsafe(`GRANT SELECT ON TABLE public._prisma_migrations TO PUBLIC`);
    await admin.$executeRawUnsafe(`DROP ROLE IF EXISTS ${M3_3_HV_H4_A3_PHASE_A_MIGRATION_DENIAL_ROLE}`);
  } finally {
    await admin.$disconnect().catch(() => undefined);
  }
}
