/**
 * Fail-closed guard for VSI-03 disposable PostgreSQL integration tests.
 */
export function assertVsi03DisposablePostgresTarget(): void {
  if (process.env.VSI03_READONLY_COMPOSER_PG !== '1') {
    throw new Error('VSI03_READONLY_COMPOSER_PG=1 required');
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!url.trim()) {
    throw new Error('DATABASE_URL required for VSI03 postgres integration');
  }
  const lower = url.toLowerCase();
  const forbidden =
    lower.includes('synqdrive') ||
    lower.includes('hstgr') ||
    lower.includes('srv1374778') ||
    lower.includes('production') ||
    lower.includes('app.synqdrive');
  if (forbidden) {
    throw new Error('Refusing production-like DATABASE_URL for VSI03 postgres integration');
  }
  const hostMatch = url.match(/@([^/:]+)/);
  const host = hostMatch?.[1]?.toLowerCase() ?? '';
  if (host && host !== '127.0.0.1' && host !== 'localhost' && host !== 'postgres') {
    if (process.env.VSI03_READONLY_COMPOSER_ALLOW_NONLOCAL_HOST !== '1') {
      throw new Error(`Refusing non-local database host for VSI03 integration (${host})`);
    }
  }
}
