/**
 * USR_P0 inventory SQL — disposable PostgreSQL guard (mirrors repository patterns).
 */
const OPT_IN = 'USR_P0_INVENTORY_PG';

const ALLOWED_DB_NAME = /(?:^|_)(test|disposable|ci|local|dev|seal|pg03|p3b0)(?:$|_)/i;

export function assertUsrP0DisposablePostgresPreflight(): void {
  if (process.env[OPT_IN] !== '1') {
    throw new Error(`${OPT_IN}=1 is required for disposable Postgres inventory SQL validation`);
  }
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(`${OPT_IN}=1 requires DATABASE_URL`);
  }
  let hostname = '';
  let databaseName = '';
  try {
    const parsed = new URL(url.replace(/^postgresql:/, 'http:'));
    hostname = parsed.hostname;
    databaseName = parsed.pathname.replace(/^\//, '').split('?')[0];
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new Error(
      `DATABASE_URL host "${hostname}" rejected: USR_P0 inventory tests may only target localhost disposable DBs`,
    );
  }
  if (!ALLOWED_DB_NAME.test(databaseName)) {
    throw new Error(
      `DATABASE_URL database "${databaseName}" rejected: name must match disposable test pattern (test|disposable|ci|local|dev|seal|pg03|p3b0)`,
    );
  }
}