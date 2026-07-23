import type { BookingDocumentGenerationJobType } from './booking-document-generation.constants';
import type { DocumentType } from '../documents.constants';

export interface EnqueueBookingDocumentGenerationInput {
  organizationId: string;
  bookingId: string;
  jobType: BookingDocumentGenerationJobType;
  documentType?: DocumentType | null;
  handoverProtocolId?: string | null;
  requestedByUserId?: string | null;
  correlationId?: string | null;
}

export interface BookingDocumentGenerationBullJobData {
  persistentJobId: string;
  organizationId: string;
  bookingId: string;
  jobType: BookingDocumentGenerationJobType;
}

export interface EnqueueBookingDocumentGenerationResult {
  jobId: string;
  idempotencyKey: string;
  created: boolean;
  deduplicated: boolean;
  enqueued: boolean;
  status: string;
}
