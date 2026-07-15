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

export function maskTaskId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length <= 10) return trimmed;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

function assertSafeTaskDataDatabaseTarget(options: {
  databaseUrl: string;
  allowRemote?: boolean;
  mode: 'diagnostic' | 'repair';
}): void {
  const { databaseUrl, allowRemote, mode } = options;
  const prodEnvVar =
    mode === 'repair' ? 'TASK_DATA_REPAIR_ALLOW_PROD' : 'TASK_DATA_DIAGNOSTIC_ALLOW_PROD';
  const remoteEnvVar =
    mode === 'repair' ? 'TASK_DATA_REPAIR_ALLOW_REMOTE' : 'TASK_DATA_DIAGNOSTIC_ALLOW_REMOTE';
  const modeLabel = mode === 'repair' ? 'task data repair' : 'task diagnostics';

  if (!databaseUrl.trim()) {
    throw new Error('DATABASE_URL is not set — configure a local or test database first.');
  }

  if (process.env.NODE_ENV === 'production' && process.env[prodEnvVar] !== '1') {
    throw new Error(
      `Refusing to run ${modeLabel} with NODE_ENV=production. Use a local/test shell or set ${prodEnvVar}=1 only when explicitly intended.`,
    );
  }

  const looksProduction = PRODUCTION_DB_PATTERNS.some((pattern) => pattern.test(databaseUrl));
  const looksLocal = LOCAL_DB_PATTERNS.some((pattern) => pattern.test(databaseUrl));

  if (looksProduction && process.env[prodEnvVar] !== '1') {
    throw new Error(
      `DATABASE_URL looks like production. ${modeLabel} must only run against local/test databases. Set ${prodEnvVar}=1 to override (not recommended).`,
    );
  }

  if (!looksLocal && !allowRemote && process.env[remoteEnvVar] !== '1') {
    throw new Error(
      `DATABASE_URL does not look local/test. Pass --allow-remote-db or set ${remoteEnvVar}=1 after confirming this is not production.`,
    );
  }
}

export function assertSafeDiagnosticDatabaseTarget(options?: {
  databaseUrl?: string;
  allowRemote?: boolean;
}): void {
  assertSafeTaskDataDatabaseTarget({
    databaseUrl: options?.databaseUrl ?? process.env.DATABASE_URL ?? '',
    allowRemote: options?.allowRemote,
    mode: 'diagnostic',
  });
}

export function assertSafeRepairDatabaseTarget(options?: {
  databaseUrl?: string;
  allowRemote?: boolean;
}): void {
  assertSafeTaskDataDatabaseTarget({
    databaseUrl: options?.databaseUrl ?? process.env.DATABASE_URL ?? '',
    allowRemote: options?.allowRemote,
    mode: 'repair',
  });
}
