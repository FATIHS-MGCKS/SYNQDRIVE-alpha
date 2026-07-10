/**
 * Low-risk structured logging helpers for the document extraction pipeline.
 * Never include document text, base64, API keys, filenames, VINs, or license plates.
 */

export type DocumentExtractionLogStage =
  | 'UPLOAD'
  | 'QUEUE'
  | 'OCR'
  | 'CLASSIFICATION'
  | 'EXTRACTION'
  | 'REVIEW'
  | 'CONFIRM'
  | 'APPLY'
  | 'STORAGE'
  | 'RECOVERY'
  | 'VALIDATION'
  | string;

export type DocumentExtractionLogStatus =
  | 'started'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'retry_scheduled';

export interface DocumentExtractionLogEvent {
  extractionId: string;
  stage: DocumentExtractionLogStage;
  status: DocumentExtractionLogStatus;
  errorCode?: string | null;
  attempt?: number | null;
  mimeCategory?: string | null;
  fileSizeBucket?: string | null;
  pageCount?: number | null;
  provider?: string | null;
  model?: string | null;
  durationMs?: number | null;
}

const MIME_CATEGORY_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'image_jpeg',
  'image/png': 'image_png',
  'image/webp': 'image_webp',
  'text/plain': 'text',
};

/** Buckets file sizes for logs/metrics without exposing exact bytes. */
export function bucketFileSizeBytes(sizeBytes: number | null | undefined): string {
  if (sizeBytes == null || sizeBytes <= 0) return 'unknown';
  if (sizeBytes <= 256 * 1024) return 'le_256kb';
  if (sizeBytes <= 1024 * 1024) return 'le_1mb';
  if (sizeBytes <= 5 * 1024 * 1024) return 'le_5mb';
  if (sizeBytes <= 10 * 1024 * 1024) return 'le_10mb';
  if (sizeBytes <= 25 * 1024 * 1024) return 'le_25mb';
  return 'gt_25mb';
}

export function mimeCategoryFromMime(mimeType: string | null | undefined): string {
  if (!mimeType) return 'unknown';
  const normalized = mimeType.toLowerCase().split(';')[0].trim();
  return MIME_CATEGORY_MAP[normalized] ?? 'other';
}

export function formatDocumentExtractionLog(event: DocumentExtractionLogEvent): string {
  const payload: Record<string, unknown> = {
    component: 'document_extraction',
    extractionId: event.extractionId,
    stage: event.stage,
    status: event.status,
  };
  if (event.errorCode) payload.errorCode = event.errorCode;
  if (event.attempt != null) payload.attempt = event.attempt;
  if (event.mimeCategory) payload.mimeCategory = event.mimeCategory;
  if (event.fileSizeBucket) payload.fileSizeBucket = event.fileSizeBucket;
  if (event.pageCount != null) payload.pageCount = event.pageCount;
  if (event.provider) payload.provider = event.provider;
  if (event.model) payload.model = event.model;
  if (event.durationMs != null) payload.durationMs = event.durationMs;
  return JSON.stringify(payload);
}
