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
  // Reuses the same private storage root as document-extraction by default.
  localStorageDir: process.env.LOCAL_DOCUMENT_STORAGE_DIR || './storage/documents',
  localQuarantineStorageDir:
    process.env.LOCAL_DOCUMENT_QUARANTINE_STORAGE_DIR || './storage/documents-quarantine',
  pdfRenderer: (process.env.DOCUMENT_PDF_RENDERER || 'html').toLowerCase(),
  generationEnabled: (process.env.DOCUMENT_GENERATION_ENABLED || 'true') === 'true',
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
  legalMalwareScanFailOpen: (process.env.DOCUMENT_LEGAL_MALWARE_SCAN_FAIL_OPEN ?? 'false') === 'true',
}));
