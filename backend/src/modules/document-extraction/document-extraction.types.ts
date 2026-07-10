import { DocumentExtractionType } from '@prisma/client';
import { ApplyDocumentExtractionType } from './document-extraction.schemas';

/** Payload enqueued for the AI extraction worker. No file bytes — only the key. */
export interface DocumentExtractionJobData {
  extractionId: string;
  vehicleId: string;
  organizationId: string | null;
  /** Optional hint — worker always reads the authoritative type from the DB record. */
  documentType?: ApplyDocumentExtractionType | null;
  objectKey: string;
  /** When true, worker reuses cached OCR text from plausibility._pipeline.contentCache. */
  skipOcr?: boolean;
}

/** Human-confirmed extraction fields (shape varies by apply document type). */
export type ConfirmedExtractionData = Record<string, unknown>;

/** Statuses considered "already processed" — worker must not reprocess these. */
export const TERMINAL_OR_REVIEWABLE_STATUSES = [
  'READY_FOR_REVIEW',
  'CONFIRMED',
  'APPLIED',
  'AWAITING_DOCUMENT_TYPE',
  'CANCELLED',
] as const;
