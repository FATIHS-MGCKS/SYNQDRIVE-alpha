export const M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_ACTIVE_ENV =
  'M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_ACTIVE' as const;

export const M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_DATABASE_URL_ENV =
  'M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_DATABASE_URL' as const;

export const M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_TRUSTED_CA_ENV =
  'M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_TRUSTED_CA' as const;

export const M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_WRONG_CA_ENV =
  'M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_WRONG_CA' as const;

export function isPhaseAProductionTlsFixtureJobV1(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_ACTIVE_ENV] === '1';
}

export function resolvePhaseAProductionTlsFixtureDatabaseUrlV1(
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!isPhaseAProductionTlsFixtureJobV1(env)) {
    throw new Error('PHASE_A_TLS_FIXTURE_NOT_ACTIVE');
  }
  const url = env[M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_DATABASE_URL_ENV]?.trim();
  if (!url) {
    throw new Error('PHASE_A_TLS_FIXTURE_DATABASE_URL_REQUIRED');
  }
  return url;
}

export function buildPhaseAProductionVerifyFullDatabaseUrlV1(params: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  sslrootcertPath: string;
  extraSearchParams?: Record<string, string>;
}): string {
  const parsed = new URL('postgres://placeholder');
  parsed.username = params.user;
  parsed.password = params.password;
  parsed.hostname = params.host;
  parsed.port = String(params.port);
  parsed.pathname = `/${params.database}`;
  parsed.searchParams.set('sslmode', 'verify-full');
  parsed.searchParams.set('sslrootcert', params.sslrootcertPath);
  for (const [key, value] of Object.entries(params.extraSearchParams ?? {})) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString().replace(/^postgres:/, 'postgresql:');
}

export async function assertPrismaConnectOutcomeV1(
  databaseUrl: string,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const { PrismaClient } = await import('@prisma/client');
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await client.$connect();
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}
