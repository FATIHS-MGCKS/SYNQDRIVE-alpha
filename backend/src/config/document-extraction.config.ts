import { registerAs } from '@nestjs/config';

/**
 * AI Document Upload / extraction configuration.
 *
 * Storage is LOCAL by default and is intentionally separate from the public
 * `/uploads` static directory (StorageService) — uploaded documents must NOT be
 * publicly served. `provider` is forward-looking for a future S3 adapter.
 */
export default registerAs('documentExtraction', () => ({
  /** Storage provider for uploaded documents. Only 'local' is implemented. */
  storageProvider: (process.env.DOCUMENT_STORAGE_PROVIDER || 'local').toLowerCase(),
  /** Base directory for local document storage (private, never statically served). */
  localStorageDir: process.env.LOCAL_DOCUMENT_STORAGE_DIR || './storage/documents',
  /** Max upload size in MB. */
  maxUploadMb: parseInt(process.env.DOCUMENT_UPLOAD_MAX_MB || '10', 10),
  /** When false, uploads are stored + recorded but no extraction job is enqueued. */
  queueEnabled: (process.env.DOCUMENT_EXTRACTION_QUEUE_ENABLED || 'true') === 'true',
  /** When false, the worker will not call the DIMO Agents API. */
  dimoAgentEnabled: (process.env.DIMO_DOCUMENT_AGENT_ENABLED || 'true') === 'true',
  /** Preferred DIMO agent personality for document extraction (advisory). */
  dimoAgentPersonality: process.env.DIMO_DOCUMENT_AGENT_PERSONALITY || 'fleet_manager_pro',
}));
