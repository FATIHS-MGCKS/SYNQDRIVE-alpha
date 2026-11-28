/** Disposable DB identity for pricebook publish PostgreSQL regression (never production/staging). */
export const PRICEBOOK_PUBLISH_DISPOSABLE_DB_PREFIX = 'pricebook_publish_disposable';

const FORBIDDEN_URL = /production|staging|app\.synqdrive|srv1374778|hstgr\.cloud|mein-vps/i;

function parsePostgresDatabaseUrl(url: string): { hostname: string; database: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`DATABASE_URL protocol must be postgresql: (got "${parsed.protocol}")`);
  }
  const hostname = parsed.hostname;
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('/')[0] ?? '');
  if (!hostname) {
    throw new Error('DATABASE_URL hostname is required');
  }
  if (!database) {
    throw new Error('DATABASE_URL database name is required');
  }
  return { hostname, database };
}

export function assertPricebookPublishDisposablePostgres(optInEnvVar: string): void {
  if (process.env[optInEnvVar] !== '1') {
    throw new Error(`${optInEnvVar}=1 is required to run pricebook publish Postgres suites`);
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!url || FORBIDDEN_URL.test(url)) {
    throw new Error(`${optInEnvVar} requires an isolated local DATABASE_URL (never production or staging)`);
  }

  const { hostname, database } = parsePostgresDatabaseUrl(url);
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new Error(
      `${optInEnvVar} DATABASE_URL hostname must be loopback (got "${hostname}")`,
    );
  }
  if (!database.startsWith(PRICEBOOK_PUBLISH_DISPOSABLE_DB_PREFIX)) {
    throw new Error(
      `DATABASE_URL database name must start with "${PRICEBOOK_PUBLISH_DISPOSABLE_DB_PREFIX}" (got "${database}")`,
    );
  }
}