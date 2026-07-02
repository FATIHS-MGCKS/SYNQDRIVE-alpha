import { registerAs } from '@nestjs/config';

/**
 * AI Document Upload / extraction configuration.
 */
export default registerAs('documentExtraction', () => ({
  storageProvider: (process.env.DOCUMENT_STORAGE_PROVIDER || 'local').toLowerCase(),
  localStorageDir: process.env.LOCAL_DOCUMENT_STORAGE_DIR || './storage/documents',
  maxUploadMb: parseInt(process.env.DOCUMENT_UPLOAD_MAX_MB || '10', 10),
  queueEnabled: (process.env.DOCUMENT_EXTRACTION_QUEUE_ENABLED || 'true') === 'true',
  aiExtractionEnabled: (process.env.DOCUMENT_AI_EXTRACTION_ENABLED ?? 'true') === 'true',
}));
