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

export function maskDiagnosticId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length <= 10) return trimmed;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

function assertSafeDatabaseTarget(options: {
  databaseUrl: string;
  allowRemote?: boolean;
}): void {
  const { databaseUrl, allowRemote } = options;

  if (!databaseUrl.trim()) {
    throw new Error('DATABASE_URL is not set — configure a local or test database first.');
  }

  if (
    process.env.NODE_ENV === 'production' &&
    process.env.VEHICLE_BOOKING_HANDOVER_DIAGNOSTIC_ALLOW_PROD !== '1'
  ) {
    throw new Error(
      'Refusing to run vehicle/booking/handover diagnostics with NODE_ENV=production. Use a local/test shell or set VEHICLE_BOOKING_HANDOVER_DIAGNOSTIC_ALLOW_PROD=1 only when explicitly intended.',
    );
  }

  const looksProduction = PRODUCTION_DB_PATTERNS.some((pattern) => pattern.test(databaseUrl));
  const looksLocal = LOCAL_DB_PATTERNS.some((pattern) => pattern.test(databaseUrl));

  if (looksProduction && process.env.VEHICLE_BOOKING_HANDOVER_DIAGNOSTIC_ALLOW_PROD !== '1') {
    throw new Error(
      'DATABASE_URL looks like production. Vehicle/booking/handover diagnostics must only run against local/test databases. Set VEHICLE_BOOKING_HANDOVER_DIAGNOSTIC_ALLOW_PROD=1 to override (not recommended).',
    );
  }

  if (
    !looksLocal &&
    !allowRemote &&
    process.env.VEHICLE_BOOKING_HANDOVER_DIAGNOSTIC_ALLOW_REMOTE !== '1'
  ) {
    throw new Error(
      'DATABASE_URL does not look local/test. Pass --allow-remote-db or set VEHICLE_BOOKING_HANDOVER_DIAGNOSTIC_ALLOW_REMOTE=1 after confirming this is not production.',
    );
  }
}

export function assertSafeVbhDiagnosticDatabaseTarget(options?: {
  databaseUrl?: string;
  allowRemote?: boolean;
}): void {
  assertSafeDatabaseTarget({
    databaseUrl: options?.databaseUrl ?? process.env.DATABASE_URL ?? '',
    allowRemote: options?.allowRemote,
  });
}
