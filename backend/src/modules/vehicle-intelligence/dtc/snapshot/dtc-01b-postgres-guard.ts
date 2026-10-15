const DISPOSABLE_DB_NAME_PATTERN = /^dtc01b_test_[a-z0-9_]+$/i;

const FORBIDDEN_DATABASE_NAMES = new Set(
  ['synqdrive', 'production', 'prod', 'app', 'postgres'].map((n) => n.toLowerCase()),
);

export function parsePostgresDatabaseName(databaseUrl: string): string | null {
  const base = databaseUrl.split('?')[0]?.trim() ?? '';
  const slash = base.lastIndexOf('/');
  if (slash < 0 || slash === base.length - 1) return null;
  const name = decodeURIComponent(base.slice(slash + 1)).trim();
  return name.length > 0 ? name : null;
}

export function assertDtc01bDisposablePostgresTarget(): void {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('DTC-01B PG integration requires DATABASE_URL');
  }
  const dbName = parsePostgresDatabaseName(url);
  if (!dbName) {
    throw new Error('DTC-01B PG integration: could not parse database name from DATABASE_URL');
  }
  const lower = dbName.toLowerCase();
  if (FORBIDDEN_DATABASE_NAMES.has(lower)) {
    throw new Error(`DTC-01B PG integration refused on forbidden database name: ${dbName}`);
  }
  if (!DISPOSABLE_DB_NAME_PATTERN.test(dbName)) {
    throw new Error(
      `DTC-01B PG integration requires disposable database name matching dtc01b_test_* (got ${dbName})`,
    );
  }
}
