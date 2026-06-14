import { DocumentExtractionType } from '@prisma/client';

/** Payload enqueued for the AI extraction worker. No file bytes — only the key. */
export interface DocumentExtractionJobData {
  extractionId: string;
  vehicleId: string;
  organizationId: string | null;
  documentType: DocumentExtractionType;
  objectKey: string;
}

/** Human-confirmed extraction fields (shape varies by {@link DocumentExtractionType}). */
export type ConfirmedExtractionData = Record<string, unknown>;

/** Statuses considered "already processed" — worker must not reprocess these. */
export const TERMINAL_OR_REVIEWABLE_STATUSES = [
  'READY_FOR_REVIEW',
  'CONFIRMED',
  'APPLIED',
] as const;
