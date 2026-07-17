import { registerAs } from '@nestjs/config';

const intEnv = (key: string, def: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw === null || raw.trim() === '') return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

const boolEnv = (key: string, def: boolean): boolean => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return def;
  return raw.toLowerCase() === 'true' || raw === '1';
};

/**
 * Document extraction storage lifecycle retention.
 * Master switch defaults OFF; dry-run defaults ON.
 * Age windows use days; `0` disables a category (no automatic deletion).
 */
export default registerAs('documentRetention', () => ({
  enabled: boolEnv('DOCUMENT_RETENTION_ENABLED', false),
  dryRun: boolEnv('DOCUMENT_RETENTION_DRY_RUN', true),
  batchSize: intEnv('DOCUMENT_RETENTION_BATCH_SIZE', 100),
  maxBatchesPerRun: intEnv('DOCUMENT_RETENTION_MAX_BATCHES', 200),
  policyVersion: process.env.DOCUMENT_RETENTION_POLICY_VERSION || '2026-07-17',
  stripOcrCacheOnManualDelete: boolEnv('DOCUMENT_DELETE_STRIP_OCR_CACHE', true),
  days: {
    /** Strip `_pipeline.contentCache` after soft delete (`fileDeletedAt`). 0 = disabled. */
    ocrCacheAfterSoftDelete: intEnv('DOCUMENT_RETENTION_OCR_CACHE_AFTER_SOFT_DELETE_DAYS', 90),
    /** Redact OCR-derived fields in `extractedData` after soft delete. 0 = disabled. */
    sensitiveExtractedDataAfterSoftDelete: intEnv(
      'DOCUMENT_RETENTION_SENSITIVE_EXTRACTED_DATA_DAYS',
      0,
    ),
    /** Final DB row delete after soft delete when no downstream links. 0 = keep audit row. */
    extractionRowAfterSoftDelete: intEnv('DOCUMENT_RETENTION_ROW_AFTER_SOFT_DELETE_DAYS', 0),
    /** Remove stale REJECTED rows without stored files. 0 = disabled. */
    rejectedWithoutFile: intEnv('DOCUMENT_RETENTION_REJECTED_WITHOUT_FILE_DAYS', 30),
  },
  encryptionAtRest: {
    declared: boolEnv('DOCUMENT_STORAGE_ENCRYPTION_DECLARED', false),
    provider: (process.env.DOCUMENT_STORAGE_ENCRYPTION_PROVIDER || 'none').toLowerCase() as
      | 'none'
      | 'local-disk'
      | 's3-sse'
      | 's3-kms',
    kmsKeyId: process.env.DOCUMENT_STORAGE_ENCRYPTION_KMS_KEY_ID || null,
  },
  backup: {
    strategy: (process.env.DOCUMENT_STORAGE_BACKUP_STRATEGY || 'vps-pre-deploy-db') as
      | 'vps-pre-deploy-db'
      | 'manual'
      | 'none',
    documentObjectsIncluded: boolEnv('DOCUMENT_STORAGE_BACKUP_INCLUDES_OBJECTS', false),
    lastVerifiedAt: process.env.DOCUMENT_STORAGE_BACKUP_LAST_VERIFIED_AT || null,
    note: process.env.DOCUMENT_STORAGE_BACKUP_NOTE || null,
  },
}));
