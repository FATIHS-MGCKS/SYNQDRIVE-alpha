export const CORE_APP_M2M_DISPOSABLE_DATABASE_NAMES = [
  'synqdrive_product_catalog_p2_pr1',
  'synqdrive_p3_pr1_core_app_m2m',
] as const;

const FORBIDDEN_URL_PATTERN =
  /production|staging|app\.synqdrive|srv1374778|hstgr\.cloud|mein-vps/i;

export function assertCoreAppM2mDisposablePostgresPreflight(optInEnvVar: string): void {
  if (process.env[optInEnvVar] !== '1') {
    throw new Error(`${optInEnvVar}=1 is required for disposable Postgres integration tests`);
  }

  const url = process.env.DATABASE_URL ?? '';
  if (!url.trim()) {
    throw new Error(`${optInEnvVar}=1 requires DATABASE_URL (isolated disposable database only)`);
  }

  if (FORBIDDEN_URL_PATTERN.test(url)) {
    throw new Error('DATABASE_URL target rejected (production/staging hosts are forbidden)');
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

  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error('DATABASE_URL host must be 127.0.0.1 or localhost');
  }

  if (
    !CORE_APP_M2M_DISPOSABLE_DATABASE_NAMES.some(
      (allowed) => databaseName === allowed || databaseName.startsWith(`${allowed}_`),
    )
  ) {
    throw new Error(
      `DATABASE_URL database name must be one of: ${CORE_APP_M2M_DISPOSABLE_DATABASE_NAMES.join(', ')}`,
    );
  }
}