export const RETENTION_DELETION_CONFIG = {
  enabled: process.env.RETENTION_DELETION_ENABLED !== 'false',
  defaultDryRun: process.env.RETENTION_DELETION_DRY_RUN !== 'false',
  batchSize: Number(process.env.RETENTION_DELETION_BATCH_SIZE ?? 50),
  maxRetries: Number(process.env.RETENTION_DELETION_MAX_RETRIES ?? 3),
  schedulerPollMs: Number(process.env.RETENTION_DELETION_POLL_MS ?? 3_600_000),
  requireRetentionForActivation: process.env.RETENTION_REQUIRE_FOR_ACTIVATION !== 'false',
  revocationBlindDeleteForbidden: true,
  cacheInvalidationIsNotFullDeletion: true,
  disclaimer:
    'Retention- und Löschsteuerung sind technische Governance-Werkzeuge — keine automatische juristische Löschentscheidung.',
} as const;

export const DELETION_STEP_TARGETS = [
  'POSTGRESQL',
  'CLICKHOUSE',
  'OBJECT_STORAGE',
  'REDIS_CACHE',
  'DERIVED_DATA',
] as const;
