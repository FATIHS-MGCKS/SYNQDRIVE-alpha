/**
 * Fail-closed guard for HV P1 shadow refresh PostgreSQL integration tests.
 */
import type { PrismaClient } from '@prisma/client';

const DISPOSABLE_DB_NAME_PATTERN = /^synqdrive_hv_p1_[a-z0-9_]+$/i;

const FORBIDDEN_DATABASE_NAMES = new Set(
  [
    'synqdrive',
    'synqdrive_test',
    'production',
    'prod',
    'app',
    'postgres',
    'template0',
    'template1',
  ].map((name) => name.toLowerCase()),
);

const APPROVED_LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

const FORBIDDEN_URL_SUBSTRINGS = [
  'srv1374778',
  'hstgr.cloud',
  'app.synqdrive',
  'mein-vps',
  'production',
  'synqdrive.eu',
];

export function parsePostgresDatabaseName(databaseUrl: string): string | null {
  const base = databaseUrl.split('?')[0]?.trim() ?? '';
  const slash = base.lastIndexOf('/');
  if (slash < 0 || slash === base.length - 1) {
    return null;
  }
  const name = decodeURIComponent(base.slice(slash + 1)).trim();
  return name.length > 0 ? name : null;
}

export function parsePostgresHost(databaseUrl: string): string {
  const hostMatch = databaseUrl.match(/@([^/:]+)/);
  return hostMatch?.[1]?.toLowerCase() ?? '';
}

export function isHvP1DisposableDatabaseName(databaseName: string): boolean {
  return DISPOSABLE_DB_NAME_PATTERN.test(databaseName);
}

export function assertHvP1PostgresIntegrationTarget(): void {
  if (process.env.HV_P1_POSTGRES_INTEGRATION !== '1') {
    throw new Error('HV_P1_POSTGRES_INTEGRATION=1 required');
  }

  const url = process.env.DATABASE_URL ?? '';
  if (!url.trim()) {
    throw new Error('DATABASE_URL required for HV P1 postgres integration');
  }

  const lowerUrl = url.toLowerCase();
  for (const fragment of FORBIDDEN_URL_SUBSTRINGS) {
    if (lowerUrl.includes(fragment)) {
      throw new Error(
        `Refusing production-like DATABASE_URL fragment for HV P1 integration (${fragment})`,
      );
    }
  }

  const host = parsePostgresHost(url);
  if (!host || !APPROVED_LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing non-local database host for HV P1 integration (${host || 'missing'})`,
    );
  }

  const databaseName = parsePostgresDatabaseName(url);
  if (!databaseName) {
    throw new Error('Refusing ambiguous or missing database name in DATABASE_URL');
  }

  const normalizedDb = databaseName.toLowerCase();
  if (FORBIDDEN_DATABASE_NAMES.has(normalizedDb)) {
    throw new Error(
      `Refusing production-like database name for HV P1 integration (${databaseName})`,
    );
  }

  if (!isHvP1DisposableDatabaseName(databaseName)) {
    throw new Error(
      `Refusing non-disposable database name (expected synqdrive_hv_p1_* pattern, got ${databaseName})`,
    );
  }
}

export async function assertHvP1PostgresServerIdentity(prisma: PrismaClient): Promise<void> {
  const expectedName = parsePostgresDatabaseName(process.env.DATABASE_URL ?? '');
  if (!expectedName) {
    throw new Error('HV P1 postgres guard: missing expected database name');
  }

  const rows = await prisma.$queryRaw<
    Array<{ db: string; server_addr: string | null; server_version: string }>
  >`
    SELECT
      current_database()::text AS db,
      host(inet_server_addr())::text AS server_addr,
      version()::text AS server_version
  `;

  const row = rows[0];
  if (!row) {
    throw new Error('HV P1 postgres guard: could not read server identity');
  }

  if (row.db.toLowerCase() !== expectedName.toLowerCase()) {
    throw new Error(
      `HV P1 postgres guard: DATABASE_URL names ${expectedName} but server reports ${row.db}`,
    );
  }

  if (!row.server_version.includes('PostgreSQL 16')) {
    throw new Error(
      `HV P1 postgres guard: expected PostgreSQL 16, got ${row.server_version.slice(0, 40)}`,
    );
  }

  const addr = row.server_addr?.toLowerCase() ?? '';
  if (
    addr &&
    addr !== '127.0.0.1' &&
    addr !== '::1' &&
    !addr.startsWith('172.') &&
    !addr.startsWith('10.') &&
    !addr.startsWith('192.168.')
  ) {
    throw new Error(
      `HV P1 postgres guard: refusing non-local/non-container server address ${row.server_addr}`,
    );
  }
}
