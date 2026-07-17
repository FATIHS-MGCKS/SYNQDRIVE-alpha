import { registerAs } from '@nestjs/config';

function parsePositiveIntEnv(value: string | undefined, defaultValue: number): number {
  if (value == null || value.trim() === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseRatioEnv(value: string | undefined, defaultValue: number): number {
  if (value == null || value.trim() === '') return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : defaultValue;
}

/**
 * AI Document Upload / extraction configuration.
 */
export default registerAs('documentExtraction', () => ({
  storageProvider: (process.env.DOCUMENT_STORAGE_PROVIDER || 'local').toLowerCase(),
  localStorageDir: process.env.LOCAL_DOCUMENT_STORAGE_DIR || './storage/documents',
  maxUploadMb: parsePositiveIntEnv(process.env.DOCUMENT_UPLOAD_MAX_MB, 10),
  queueEnabled: (process.env.DOCUMENT_EXTRACTION_QUEUE_ENABLED || 'true') === 'true',
  /**
   * Dev/test only — when true AND queueEnabled=false, uploads stay in PENDING without
   * enqueue (explicit opt-in; never used in production).
   */
  allowPendingWithoutQueue:
    (process.env.DOCUMENT_EXTRACTION_ALLOW_PENDING_WITHOUT_QUEUE || 'false') === 'true',
  aiExtractionEnabled: (process.env.DOCUMENT_AI_EXTRACTION_ENABLED ?? 'true') === 'true',
  pdfMinTextChars: parsePositiveIntEnv(process.env.DOCUMENT_PDF_MIN_TEXT_CHARS, 40),
  pdfMinSensibleCharRatio: parseRatioEnv(process.env.DOCUMENT_PDF_MIN_SENSIBLE_RATIO, 0.45),
  pdfMaxRepeatedLineRatio: parseRatioEnv(process.env.DOCUMENT_PDF_MAX_REPEATED_LINE_RATIO, 0.7),
  /** BullMQ job attempts for document.extraction (includes the first run). */
  jobAttempts: parsePositiveIntEnv(process.env.DOCUMENT_EXTRACTION_JOB_ATTEMPTS, 4),
  jobBackoffMs: parsePositiveIntEnv(process.env.DOCUMENT_EXTRACTION_JOB_BACKOFF_MS, 5_000),
  jobTimeoutMs: parsePositiveIntEnv(process.env.DOCUMENT_EXTRACTION_JOB_TIMEOUT_MS, 120_000),
  /** Recovery: QUEUED rows older than this without an active job are re-enqueued. */
  staleQueuedThresholdMs: parsePositiveIntEnv(
    process.env.DOCUMENT_EXTRACTION_STALE_QUEUED_MS,
    10 * 60_000,
  ),
  /** Recovery: PROCESSING rows older than this are reset and re-enqueued. */
  staleProcessingThresholdMs: parsePositiveIntEnv(
    process.env.DOCUMENT_EXTRACTION_STALE_PROCESSING_MS,
    15 * 60_000,
  ),
  /** Recovery: CONFIRMED without appliedAt older than this may retry apply. */
  staleConfirmedApplyThresholdMs: parsePositiveIntEnv(
    process.env.DOCUMENT_EXTRACTION_STALE_CONFIRMED_MS,
    10 * 60_000,
  ),
  /** Max automatic recovery enqueue/apply attempts per extraction record. */
  maxRecoveryAttempts: parsePositiveIntEnv(
    process.env.DOCUMENT_EXTRACTION_MAX_RECOVERY_ATTEMPTS,
    5,
  ),
  /** Recovery: APPLYING lifecycle older than this may be reconciled/retried. */
  staleApplyingThresholdMs: parsePositiveIntEnv(
    process.env.DOCUMENT_EXTRACTION_STALE_APPLYING_MS,
    10 * 60_000,
  ),
  /** Max automatic action-plan recovery attempts per extraction record. */
  maxActionRecoveryAttempts: parsePositiveIntEnv(
    process.env.DOCUMENT_EXTRACTION_MAX_ACTION_RECOVERY_ATTEMPTS,
    5,
  ),
  actionRecoveryBatchSize: parsePositiveIntEnv(
    process.env.DOCUMENT_EXTRACTION_ACTION_RECOVERY_BATCH_SIZE,
    10,
  ),
  actionRecoveryEnabled:
    (process.env.DOCUMENT_EXTRACTION_ACTION_RECOVERY_ENABLED ?? 'true') === 'true',
  recoveryIntervalMs: parsePositiveIntEnv(
    process.env.DOCUMENT_EXTRACTION_RECOVERY_INTERVAL_MS,
    120_000,
  ),
  uploadRateLimitEnabled:
    (process.env.DOCUMENT_UPLOAD_RATE_LIMIT_ENABLED ?? 'true') === 'true',
  uploadRateLimitWindowMs: parsePositiveIntEnv(
    process.env.DOCUMENT_UPLOAD_RATE_LIMIT_WINDOW_MS,
    60_000,
  ),
  uploadRateLimitMaxUploadsPerOrg: parsePositiveIntEnv(
    process.env.DOCUMENT_UPLOAD_RATE_LIMIT_MAX_UPLOADS_PER_ORG,
    40,
  ),
  uploadRateLimitMaxBytesPerOrg: parsePositiveIntEnv(
    process.env.DOCUMENT_UPLOAD_RATE_LIMIT_MAX_BYTES_PER_ORG,
    200 * 1024 * 1024,
  ),
  uploadRateLimitMaxUploadsPerUser: parsePositiveIntEnv(
    process.env.DOCUMENT_UPLOAD_RATE_LIMIT_MAX_UPLOADS_PER_USER,
    25,
  ),
  uploadRateLimitMaxBytesPerUser: parsePositiveIntEnv(
    process.env.DOCUMENT_UPLOAD_RATE_LIMIT_MAX_BYTES_PER_USER,
    120 * 1024 * 1024,
  ),
  uploadRateLimitMaxUploadsPerIp: parsePositiveIntEnv(
    process.env.DOCUMENT_UPLOAD_RATE_LIMIT_MAX_UPLOADS_PER_IP,
    30,
  ),
  uploadRateLimitMaxBytesPerIp: parsePositiveIntEnv(
    process.env.DOCUMENT_UPLOAD_RATE_LIMIT_MAX_BYTES_PER_IP,
    150 * 1024 * 1024,
  ),
  uploadRateLimitOperatorMultiplier: parsePositiveIntEnv(
    process.env.DOCUMENT_UPLOAD_RATE_LIMIT_OPERATOR_MULTIPLIER,
    2,
  ),
  uploadRateLimitAdminMultiplier: parsePositiveIntEnv(
    process.env.DOCUMENT_UPLOAD_RATE_LIMIT_ADMIN_MULTIPLIER,
    4,
  ),
  /** Chunking — conservative char budgets (≈ token estimate via chars/3.5). */
  chunkTargetChars: parsePositiveIntEnv(process.env.DOCUMENT_EXTRACTION_CHUNK_TARGET_CHARS, 6_000),
  chunkMaxChars: parsePositiveIntEnv(process.env.DOCUMENT_EXTRACTION_CHUNK_MAX_CHARS, 8_000),
  chunkMaxPages: parsePositiveIntEnv(process.env.DOCUMENT_EXTRACTION_CHUNK_MAX_PAGES, 200),
  chunkMaxChunks: parsePositiveIntEnv(process.env.DOCUMENT_EXTRACTION_CHUNK_MAX_CHUNKS, 12),
  chunkOverlapChars: parsePositiveIntEnv(process.env.DOCUMENT_EXTRACTION_CHUNK_OVERLAP_CHARS, 0),
  /** Document-type classification (AUTO uploads). */
  classificationEnabled:
    (process.env.DOCUMENT_CLASSIFICATION_ENABLED ?? 'true') === 'true',
  classificationMaxChars: parsePositiveIntEnv(
    process.env.DOCUMENT_CLASSIFICATION_MAX_CHARS,
    24_000,
  ),
  classificationTimeoutMs: parsePositiveIntEnv(
    process.env.DOCUMENT_CLASSIFICATION_TIMEOUT_MS,
    45_000,
  ),
  /** >= autoContinue: set effective type and continue extraction automatically. */
  classificationAutoContinueMinConfidence: parseRatioEnv(
    process.env.DOCUMENT_CLASSIFICATION_AUTO_CONTINUE_MIN,
    0.85,
  ),
  /** >= suggestion: AWAITING_DOCUMENT_TYPE with detected suggestion. */
  classificationSuggestionMinConfidence: parseRatioEnv(
    process.env.DOCUMENT_CLASSIFICATION_SUGGESTION_MIN,
    0.55,
  ),
}));
