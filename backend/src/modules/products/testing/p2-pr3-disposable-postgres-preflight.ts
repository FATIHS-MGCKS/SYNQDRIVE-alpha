/**
 * Strict disposable Postgres preflight for P2-PR3 vehicle access integration tests.
 * Never logs DATABASE_URL (credentials).
 */
export const P2_PR3_DISPOSABLE_DATABASE_NAMES = [
  'synqdrive_p2_pr3_vehicle_access',
  'synqdrive_product_catalog_p2_pr1',
  'synqdrive_p3_pr9_concurrency',
] as const;

const FORBIDDEN_URL_PATTERN =
  /production|staging|app\.synqdrive|srv1374778|hstgr\.cloud|mein-vps/i;

export function assertP2Pr3DisposablePostgresPreflight(optInEnvVar: string): void {
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
    !P2_PR3_DISPOSABLE_DATABASE_NAMES.some(
      (allowed) => databaseName === allowed || databaseName.startsWith(`${allowed}_`),
    )
  ) {
    throw new Error(
      `DATABASE_URL database name must be one of: ${P2_PR3_DISPOSABLE_DATABASE_NAMES.join(', ')}`,
    );
  }
}