import { registerAs } from '@nestjs/config';

function parsePositiveIntEnv(value: string | undefined, defaultValue: number): number {
  if (value == null || value.trim() === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

/**
 * Booking Document Lifecycle configuration.
 *
 * Generated PDFs and uploaded legal documents are stored in PRIVATE object
 * storage (never served statically). The renderer is pluggable behind the
 * DOCUMENT_RENDERER token — the default `html`/pdf implementation is a pure-JS
 * (pdfkit) renderer with no headless browser dependency. A future Chromium
 * renderer can be selected via DOCUMENT_PDF_RENDERER without touching callers.
 */
export default registerAs('documents', () => ({
  storageProvider: (process.env.DOCUMENT_STORAGE_PROVIDER || 'local').toLowerCase(),
  allowLocalStorageInProduction:
    (process.env.DOCUMENT_STORAGE_ALLOW_LOCAL_IN_PRODUCTION || 'false') === 'true',
  // Reuses the same private storage root as document-extraction by default.
  localStorageDir: process.env.LOCAL_DOCUMENT_STORAGE_DIR || './storage/documents',
  localQuarantineStorageDir:
    process.env.LOCAL_DOCUMENT_QUARANTINE_STORAGE_DIR || './storage/documents-quarantine',
  privateS3: {
    bucket: process.env.DOCUMENT_PRIVATE_S3_BUCKET || '',
    region: process.env.DOCUMENT_PRIVATE_S3_REGION || 'auto',
    endpoint: process.env.DOCUMENT_PRIVATE_S3_ENDPOINT || '',
    accessKeyId: process.env.DOCUMENT_PRIVATE_S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.DOCUMENT_PRIVATE_S3_SECRET_ACCESS_KEY || '',
    forcePathStyle: (process.env.DOCUMENT_PRIVATE_S3_FORCE_PATH_STYLE || 'true') === 'true',
    keyPrefix: (process.env.DOCUMENT_PRIVATE_S3_KEY_PREFIX || '').replace(/^\/|\/$/g, ''),
    sseAlgorithm: (process.env.DOCUMENT_PRIVATE_S3_SSE || 'AES256').toLowerCase(),
    kmsKeyId: process.env.DOCUMENT_PRIVATE_S3_KMS_KEY_ID || '',
  },
  storageHealthAlertThreshold: parsePositiveIntEnv(
    process.env.DOCUMENT_STORAGE_HEALTH_ALERT_THRESHOLD,
    5,
  ),
  integrityVerifyOnDownload:
    (process.env.DOCUMENT_LEGAL_INTEGRITY_VERIFY_ON_DOWNLOAD ?? 'true') === 'true',
  integrityReconciliationBatchSize: parsePositiveIntEnv(
    process.env.DOCUMENT_LEGAL_INTEGRITY_RECONCILIATION_BATCH_SIZE,
    50,
  ),
  integrityReconciliationRateLimitMs: parsePositiveIntEnv(
    process.env.DOCUMENT_LEGAL_INTEGRITY_RECONCILIATION_RATE_LIMIT_MS,
    25,
  ),
  integrityAlertThreshold: parsePositiveIntEnv(
    process.env.DOCUMENT_LEGAL_INTEGRITY_ALERT_THRESHOLD,
    5,
  ),
  pdfRenderer: (process.env.DOCUMENT_PDF_RENDERER || 'html').toLowerCase(),
  generationEnabled: (process.env.DOCUMENT_GENERATION_ENABLED || 'true') === 'true',
  generationQueueEnabled: (process.env.DOCUMENT_GENERATION_QUEUE_ENABLED ?? 'true') === 'true',
  generationJobMaxAttempts: parsePositiveIntEnv(process.env.DOCUMENT_GENERATION_JOB_MAX_ATTEMPTS, 5),
  generationJobBackoffMs: parsePositiveIntEnv(process.env.DOCUMENT_GENERATION_JOB_BACKOFF_MS, 5_000),
  maxLegalUploadMb: parsePositiveIntEnv(process.env.DOCUMENT_LEGAL_UPLOAD_MAX_MB, 15),
  legalPdfValidationTimeoutMs: parsePositiveIntEnv(
    process.env.DOCUMENT_LEGAL_PDF_VALIDATION_TIMEOUT_MS,
    10_000,
  ),
  legalPdfMaxPages: parsePositiveIntEnv(process.env.DOCUMENT_LEGAL_PDF_MAX_PAGES, 200),
  legalPdfMaxObjects: parsePositiveIntEnv(process.env.DOCUMENT_LEGAL_PDF_MAX_OBJECTS, 5_000),
  legalPdfMaxStreams: parsePositiveIntEnv(process.env.DOCUMENT_LEGAL_PDF_MAX_STREAMS, 2_000),
  legalPdfMaxDecompressedBytes: parsePositiveIntEnv(
    process.env.DOCUMENT_LEGAL_PDF_MAX_DECOMPRESSED_BYTES,
    80 * 1024 * 1024,
  ),
  legalMalwareScanEnabled: (process.env.DOCUMENT_LEGAL_MALWARE_SCAN_ENABLED ?? 'false') === 'true',
  legalMalwareScannerProvider: (
    process.env.DOCUMENT_LEGAL_MALWARE_SCANNER_PROVIDER ||
    process.env.DOCUMENT_MALWARE_SCANNER_PROVIDER ||
    'unavailable'
  ).toLowerCase(),
  legalMalwareScanTimeoutMs: parsePositiveIntEnv(
    process.env.DOCUMENT_LEGAL_MALWARE_SCAN_TIMEOUT_MS,
    parsePositiveIntEnv(process.env.DOCUMENT_MALWARE_SCAN_TIMEOUT_MS, 15_000),
  ),
  legalMalwareScanMaxRetries: parsePositiveIntEnv(
    process.env.DOCUMENT_LEGAL_MALWARE_SCAN_MAX_RETRIES,
    3,
  ),
  legalMalwareScanRetryBackoffMs: parsePositiveIntEnv(
    process.env.DOCUMENT_LEGAL_MALWARE_SCAN_RETRY_BACKOFF_MS,
    500,
  ),
  legalMalwareScanHealthAlertThreshold: parsePositiveIntEnv(
    process.env.DOCUMENT_LEGAL_MALWARE_SCAN_HEALTH_ALERT_THRESHOLD,
    5,
  ),
  legalMalwareScanFailOpen: (process.env.DOCUMENT_LEGAL_MALWARE_SCAN_FAIL_OPEN ?? 'false') === 'true',
  legalClamAvHost: process.env.DOCUMENT_LEGAL_CLAMAV_HOST || process.env.CLAMAV_HOST || '127.0.0.1',
  legalClamAvPort: parsePositiveIntEnv(
    process.env.DOCUMENT_LEGAL_CLAMAV_PORT || process.env.CLAMAV_PORT,
    3310,
  ),
}));
