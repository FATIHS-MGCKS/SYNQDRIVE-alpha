import { registerAs } from '@nestjs/config';
import {
  ApplyDocumentExtractionType,
  isApplyDocumentType,
} from '@modules/document-extraction/document-extraction.schemas';

function parseDisabledApplyTypes(
  value: string | undefined,
): Partial<Record<ApplyDocumentExtractionType, boolean>> {
  if (!value?.trim()) return {};
  const disabled: Partial<Record<ApplyDocumentExtractionType, boolean>> = {};
  for (const token of value.split(',').map((part) => part.trim()).filter(Boolean)) {
    if (isApplyDocumentType(token)) {
      disabled[token] = false;
    }
  }
  return disabled;
}

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
  recoveryIntervalMs: parsePositiveIntEnv(
    process.env.DOCUMENT_EXTRACTION_RECOVERY_INTERVAL_MS,
    120_000,
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
  /** Master gate for downstream document apply (confirm → domain modules). */
  applyEnabled: (process.env.DOCUMENT_APPLY_ENABLED ?? 'true') === 'true',
  /** Comma-separated ApplyDocumentExtractionType values with apply disabled. */
  applyDisabledTypes: parseDisabledApplyTypes(process.env.DOCUMENT_APPLY_DISABLED_TYPES),
  /**
   * When true, document types with weak downstream idempotency downgrade to DRAFT_ONLY
   * instead of APPLY_ALLOWED.
   */
  applyStrictIdempotency:
    (process.env.DOCUMENT_APPLY_STRICT_IDEMPOTENCY ?? 'false') === 'true',
}));
