/**
 * USR-P1A master admin audit certification — disposable PostgreSQL guard.
 */
const OPT_IN = 'USR_P1A_SESSION_AUDIT_PG';

const ALLOWED_DB_NAME = /(?:^|_)(test|disposable|ci|local|dev|seal|pg03|p3b0|usr)(?:$|_)/i;

export function assertMasterAdminAuditDisposablePostgresPreflight(): void {
  if (process.env[OPT_IN] !== '1') {
    throw new Error(`${OPT_IN}=1 is required for master admin audit PostgreSQL certification`);
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
      `DATABASE_URL host "${hostname}" rejected: certification tests may only target localhost disposable DBs`,
    );
  }
  if (!ALLOWED_DB_NAME.test(databaseName)) {
    throw new Error(
      `DATABASE_URL database "${databaseName}" rejected: name must match disposable test pattern`,
    );
  }
}