/** Parse PostgreSQL URL login target for issuer identity checks (no secrets returned). */
export function parsePostgresUrlLoginV1(databaseUrl: string): string | null {
  try {
    const parsed = new URL(databaseUrl.trim().replace(/^postgresql:/, 'postgres:'));
    if (!parsed.username) return null;
    return decodeURIComponent(parsed.username);
  } catch {
    return null;
  }
}

/**
 * Canonical connection target (user@host:port/database) — ignores query parameters such as
 * `connection_limit` that can disguise the same underlying login as a distinct URL string.
 */
export function canonicalPostgresTargetKeyV1(databaseUrl: string): string | null {
  try {
    const parsed = new URL(databaseUrl.trim().replace(/^postgresql:/, 'postgres:'));
    const user = decodeURIComponent(parsed.username || '');
    const host = parsed.hostname;
    const port = parsed.port || '5432';
    const database = parsed.pathname.replace(/^\//, '').split('/')[0] ?? '';
    if (!host || !database) return null;
    return `${user}@${host}:${port}/${database}`;
  } catch {
    return null;
  }
}
