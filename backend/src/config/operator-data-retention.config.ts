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
 * Operator App evidence retention.
 * All day-based windows default to 0 (disabled) — legal/compliance must confirm values per tenant.
 */
export default registerAs('operatorDataRetention', () => ({
  enabled: boolEnv('OPERATOR_DATA_RETENTION_ENABLED', false),
  dryRun: boolEnv('OPERATOR_DATA_RETENTION_DRY_RUN', true),
  batchSize: intEnv('OPERATOR_DATA_RETENTION_BATCH_SIZE', 100),
  maxBatchesPerRun: intEnv('OPERATOR_DATA_RETENTION_MAX_BATCHES', 200),
  policyVersion: process.env.OPERATOR_DATA_RETENTION_POLICY_VERSION || '2026-07-25',
  /** Default TTL for new server-side handover drafts (hours). */
  handoverDraftTtlHours: intEnv('OPERATOR_HANDOVER_DRAFT_TTL_HOURS', 72),
  days: {
    /** Delete expired `operator_handover_drafts` rows (expiresAt). 0 = disabled. */
    abandonedHandoverDraft: intEnv('OPERATOR_RETENTION_ABANDONED_HANDOVER_DRAFT_DAYS', 0),
    /** Redact signature bitmap fields on completed handover protocols. 0 = disabled. */
    handoverSignatureBitmap: intEnv('OPERATOR_RETENTION_HANDOVER_SIGNATURE_BITMAP_DAYS', 0),
    /** Remove stale operator-surface extractions without downstream links. 0 = disabled. */
    operatorOrphanExtraction: intEnv('OPERATOR_RETENTION_ORPHAN_EXTRACTION_DAYS', 0),
    /** Strip OCR cache from soft-deleted operator extractions (delegates phase). 0 = disabled. */
    operatorExtractionOcrCache: intEnv('OPERATOR_RETENTION_EXTRACTION_OCR_CACHE_DAYS', 0),
  },
  backup: {
    note:
      process.env.OPERATOR_DATA_RETENTION_BACKUP_NOTE ||
      'Operator evidence lives in PostgreSQL (signatures, damage images, extractions). Backup behaviour follows VPS pre-deploy DB backup; object storage follows document retention runbook.',
  },
}));
