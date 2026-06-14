import { DocumentExtractionType } from '@prisma/client';

/** Payload enqueued for the AI extraction worker. No file bytes — only the key. */
export interface DocumentExtractionJobData {
  extractionId: string;
  vehicleId: string;
  organizationId: string | null;
  documentType: DocumentExtractionType;
  objectKey: string;
}

/** Statuses considered "already processed" — worker must not reprocess these. */
export const TERMINAL_OR_REVIEWABLE_STATUSES = [
  'READY_FOR_REVIEW',
  'CONFIRMED',
  'APPLIED',
] as const;
