import { maskTaskId } from '@modules/tasks/diagnostic/task-data-diagnostic.safety.util';

export function maskVehicleId(id: string): string {
  return maskTaskId(id);
}

const PRODUCTION_DB_PATTERNS = [
  /synqdrive\.eu/i,
  /\/opt\/synqdrive\//i,
  /prod(uction)?[._-]?(db|postgres|pgsql)/i,
  /rds\.amazonaws\.com/i,
  /\.render\.com/i,
  /neon\.tech/i,
];

const LOCAL_DB_PATTERNS = [
  /localhost/i,
  /127\.0\.0\.1/,
  /0\.0\.0\.0/,
  /host\.docker\.internal/i,
  /\/test\b/i,
  /_test\b/i,
  /synqdrive_test/i,
];

export function assertSafeBatteryDiagnosticDatabaseTarget(options?: {
  databaseUrl?: string;
  allowRemote?: boolean;
}): void {
  const databaseUrl = options?.databaseUrl ?? process.env.DATABASE_URL ?? '';
  const allowRemote = options?.allowRemote;

  if (!databaseUrl.trim()) {
    throw new Error('DATABASE_URL is not set — configure a local or test database first.');
  }

  if (
    process.env.NODE_ENV === 'production' &&
    process.env.BATTERY_DATA_DIAGNOSTIC_ALLOW_PROD !== '1'
  ) {
    throw new Error(
      'Refusing to run battery diagnostics with NODE_ENV=production. Use a local/test shell or set BATTERY_DATA_DIAGNOSTIC_ALLOW_PROD=1 only when explicitly intended.',
    );
  }

  const looksProduction = PRODUCTION_DB_PATTERNS.some((pattern) => pattern.test(databaseUrl));
  const looksLocal = LOCAL_DB_PATTERNS.some((pattern) => pattern.test(databaseUrl));

  if (looksProduction && process.env.BATTERY_DATA_DIAGNOSTIC_ALLOW_PROD !== '1') {
    throw new Error(
      'DATABASE_URL looks like production. Battery diagnostics must only run against local/test databases. Set BATTERY_DATA_DIAGNOSTIC_ALLOW_PROD=1 to override (not recommended).',
    );
  }

  if (!looksLocal && !allowRemote && process.env.BATTERY_DATA_DIAGNOSTIC_ALLOW_REMOTE !== '1') {
    throw new Error(
      'DATABASE_URL does not look local/test. Pass --allow-remote-db or set BATTERY_DATA_DIAGNOSTIC_ALLOW_REMOTE=1 after confirming this is not production.',
    );
  }
}

export function assertSafeBatteryRepairDatabaseTarget(options?: {
  databaseUrl?: string;
  allowRemote?: boolean;
}): void {
  const databaseUrl = options?.databaseUrl ?? process.env.DATABASE_URL ?? '';
  const allowRemote = options?.allowRemote;

  if (!databaseUrl.trim()) {
    throw new Error('DATABASE_URL is not set — configure a local or test database first.');
  }

  if (
    process.env.NODE_ENV === 'production' &&
    process.env.BATTERY_DATA_REPAIR_ALLOW_PROD !== '1'
  ) {
    throw new Error(
      'Refusing to run battery repair with NODE_ENV=production. Use a local/test shell or set BATTERY_DATA_REPAIR_ALLOW_PROD=1 only when explicitly intended.',
    );
  }

  const looksProduction = PRODUCTION_DB_PATTERNS.some((pattern) => pattern.test(databaseUrl));
  const looksLocal = LOCAL_DB_PATTERNS.some((pattern) => pattern.test(databaseUrl));

  if (looksProduction && process.env.BATTERY_DATA_REPAIR_ALLOW_PROD !== '1') {
    throw new Error(
      'DATABASE_URL looks like production. Battery repair must only run against local/test databases. Set BATTERY_DATA_REPAIR_ALLOW_PROD=1 to override (not recommended).',
    );
  }

  if (!looksLocal && !allowRemote && process.env.BATTERY_DATA_REPAIR_ALLOW_REMOTE !== '1') {
    throw new Error(
      'DATABASE_URL does not look local/test. Pass --allow-remote-db or set BATTERY_DATA_REPAIR_ALLOW_REMOTE=1 after confirming this is not production.',
    );
  }
}
