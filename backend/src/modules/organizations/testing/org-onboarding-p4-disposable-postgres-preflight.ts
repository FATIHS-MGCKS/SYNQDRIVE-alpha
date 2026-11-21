export const ORG_ONBOARDING_P4_DISPOSABLE_DATABASE_NAMES = [
  'synqdrive_org_onboarding_p4_test',
] as const;

const OPT_IN_ENV = 'ORG_ONBOARDING_P4_PG';

const FORBIDDEN_URL_PATTERN =
  /production|staging|app\.synqdrive|srv1374778|hstgr\.cloud|mein-vps|synqdrive_prod/i;

const FORBIDDEN_DATABASE_NAMES = new Set([
  'synqdrive',
  'postgres',
  'synqdrive_production',
  'synqdrive_staging',
]);

export function assertOrgOnboardingP4DisposablePostgresPreflight(): void {
  if (process.env[OPT_IN_ENV] !== '1') {
    throw new Error(`${OPT_IN_ENV}=1 is required`);
  }
  const url = process.env.DATABASE_URL?.trim() ?? '';
  if (!url) throw new Error('DATABASE_URL is required');
  if (FORBIDDEN_URL_PATTERN.test(url)) {
    throw new Error('DATABASE_URL rejected: forbidden host pattern');
  }
  let hostname: string;
  let databaseName: string;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    databaseName = parsed.pathname.replace(/^\//, '').split('?')[0] ?? '';
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }
  if (FORBIDDEN_DATABASE_NAMES.has(databaseName)) {
    throw new Error(`DATABASE_URL database name "${databaseName}" is not disposable`);
  }
  const ok = ORG_ONBOARDING_P4_DISPOSABLE_DATABASE_NAMES.some(
    (name) => databaseName === name || databaseName.startsWith(`${name}_`),
  );
  if (!ok) {
    throw new Error(
      `DATABASE_URL database must be one of: ${ORG_ONBOARDING_P4_DISPOSABLE_DATABASE_NAMES.join(', ')}`,
    );
  }
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error('DATABASE_URL host must be localhost');
  }
}

export function isOrgOnboardingP4PostgresOptIn(): boolean {
  return process.env.ORG_ONBOARDING_P4_PG === '1';
}