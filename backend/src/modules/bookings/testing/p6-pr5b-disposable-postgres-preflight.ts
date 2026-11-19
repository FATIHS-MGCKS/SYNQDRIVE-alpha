/**
 * P6-PR5B — fail-closed disposable PostgreSQL guard for rental booking lifecycle E2E.
 * Never logs DATABASE_URL.
 */
export const P6_PR5B_DISPOSABLE_DATABASE_NAMES = [
  'synqdrive_p6_pr5b_rental_e2e',
  'synqdrive_ci_ephemeral',
] as const;

const FORBIDDEN_URL_PATTERN =
  /production|staging|app\.synqdrive|srv1374778|hstgr\.cloud|mein-vps/i;

export const P6_PR5B_OPT_IN_ENV = 'RENTAL_BOOKING_LIFECYCLE_POSTGRES_INTEGRATION';

export type P6Pr5bIsolationProof = {
  optIn: true;
  hostname: string;
  databaseName: string;
  disposableNameMatched: string;
  productionHostRejected: true;
};

export function assertP6Pr5bDisposablePostgresPreflight(): P6Pr5bIsolationProof {
  if (process.env[P6_PR5B_OPT_IN_ENV] !== '1') {
    throw new Error(`${P6_PR5B_OPT_IN_ENV}=1 is required for disposable Postgres integration tests`);
  }

  const url = process.env.DATABASE_URL ?? '';
  if (!url.trim()) {
    throw new Error(`${P6_PR5B_OPT_IN_ENV}=1 requires DATABASE_URL (isolated disposable database only)`);
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

  if (hostname !== '127.0.0.1' && hostname !== 'localhost' && hostname !== 'postgres') {
    throw new Error('DATABASE_URL host must be 127.0.0.1, localhost, or postgres (CI service)');
  }

  const matched = P6_PR5B_DISPOSABLE_DATABASE_NAMES.find(
    (allowed) => databaseName === allowed || databaseName.startsWith(`${allowed}_`),
  );
  if (!matched && !databaseName.startsWith('p6_pr5b_test_')) {
    throw new Error(
      `DATABASE_URL database name must match p6_pr5b_test_* or: ${P6_PR5B_DISPOSABLE_DATABASE_NAMES.join(', ')}`,
    );
  }

  return {
    optIn: true,
    hostname,
    databaseName,
    disposableNameMatched: matched ?? 'p6_pr5b_test_*',
    productionHostRejected: true,
  };
}