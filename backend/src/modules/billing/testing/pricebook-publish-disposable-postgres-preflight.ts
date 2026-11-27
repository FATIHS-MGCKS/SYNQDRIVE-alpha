/** Disposable DB identity for pricebook publish PostgreSQL regression (never production/staging). */
export const PRICEBOOK_PUBLISH_DISPOSABLE_DB_PREFIX = 'pricebook_publish_disposable';

const FORBIDDEN_URL = /production|staging|app\.synqdrive|srv1374778|hstgr\.cloud|mein-vps/i;

export function assertPricebookPublishDisposablePostgres(optInEnvVar: string): void {
  if (process.env[optInEnvVar] !== '1') {
    throw new Error(`${optInEnvVar}=1 is required to run pricebook publish Postgres suites`);
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!url || FORBIDDEN_URL.test(url)) {
    throw new Error(`${optInEnvVar} requires an isolated local DATABASE_URL (never production or staging)`);
  }
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(`${optInEnvVar} DATABASE_URL must target loopback PostgreSQL`);
  }
  const dbName = url.match(/\/([^/?]+)(\?|$)/)?.[1] ?? '';
  if (!dbName.startsWith(PRICEBOOK_PUBLISH_DISPOSABLE_DB_PREFIX)) {
    throw new Error(
      `DATABASE_URL database name must start with "${PRICEBOOK_PUBLISH_DISPOSABLE_DB_PREFIX}" (got "${dbName}")`,
    );
  }
}