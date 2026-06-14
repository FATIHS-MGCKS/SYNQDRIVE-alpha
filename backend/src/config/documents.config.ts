import { registerAs } from '@nestjs/config';

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
  pdfRenderer: (process.env.DOCUMENT_PDF_RENDERER || 'html').toLowerCase(),
  generationEnabled: (process.env.DOCUMENT_GENERATION_ENABLED || 'true') === 'true',
  maxLegalUploadMb: parseInt(process.env.DOCUMENT_LEGAL_UPLOAD_MAX_MB || '15', 10),
}));
