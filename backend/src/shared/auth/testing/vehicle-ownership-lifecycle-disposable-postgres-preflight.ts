/** Exact disposable database names permitted for vehicle-ownership lifecycle PG tests. */
export const VEHICLE_OWNERSHIP_LIFECYCLE_DISPOSABLE_DATABASE_NAMES = [
  'synqdrive_vehicle_ownership_lifecycle_test',
] as const;

const OPT_IN_ENV = 'VEHICLE_OWNERSHIP_LIFECYCLE_PG';

const FORBIDDEN_URL_PATTERN =
  /production|staging|app\.synqdrive|srv1374778|hstgr\.cloud|mein-vps|synqdrive_prod|synqdrive_production/i;

const FORBIDDEN_DATABASE_NAMES = new Set([
  'synqdrive',
  'postgres',
  'synqdrive_production',
  'synqdrive_staging',
  'synqdrive_prod',
]);

/**
 * Fail closed before any Prisma client opens a connection.
 * Call only when VEHICLE_OWNERSHIP_LIFECYCLE_PG=1.
 */
export function assertVehicleOwnershipLifecycleDisposablePostgresPreflight(): void {
  if (process.env[OPT_IN_ENV] !== '1') {
    throw new Error(`${OPT_IN_ENV}=1 is required for disposable Postgres integration tests`);
  }

  const url = process.env.DATABASE_URL?.trim() ?? '';
  if (!url) {
    throw new Error(`${OPT_IN_ENV}=1 requires an explicit DATABASE_URL`);
  }

  if (FORBIDDEN_URL_PATTERN.test(url)) {
    throw new Error('DATABASE_URL rejected: production or staging targets are forbidden');
  }

  let hostname: string;
  let databaseName: string;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    databaseName = parsed.pathname.replace(/^\//, '').split('?')[0] ?? '';
  } catch {
    throw new Error('DATABASE_URL is missing or not a valid URL');
  }

  if (!databaseName) {
    throw new Error('DATABASE_URL must include an explicit database name');
  }

  if (FORBIDDEN_DATABASE_NAMES.has(databaseName)) {
    throw new Error(`DATABASE_URL database name "${databaseName}" is not a disposable test database`);
  }

  const allowedExact = VEHICLE_OWNERSHIP_LIFECYCLE_DISPOSABLE_DATABASE_NAMES.some(
    (name) => databaseName === name,
  );
  const allowedPrefix = VEHICLE_OWNERSHIP_LIFECYCLE_DISPOSABLE_DATABASE_NAMES.some((name) =>
    databaseName.startsWith(`${name}_`),
  );

  if (!allowedExact && !allowedPrefix) {
    throw new Error(
      `DATABASE_URL database name must be exactly one of: ${VEHICLE_OWNERSHIP_LIFECYCLE_DISPOSABLE_DATABASE_NAMES.join(', ')} (optional _suffix for parallel workers)`,
    );
  }

  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error(
      `DATABASE_URL host "${hostname}" rejected: lifecycle PG tests may only target localhost`,
    );
  }
}

export function isVehicleOwnershipLifecyclePostgresOptIn(): boolean {
  return process.env[OPT_IN_ENV] === '1';
}