import {
  BOOKING_DOCUMENT_GENERATION_JOB_TYPE,
  type BookingDocumentGenerationJobType,
} from './booking-document-generation.constants';
import type { DocumentType } from '../documents.constants';
import { sanitizeBullMqJobId } from '@shared/queue/bullmq-job-id.sanitizer';

const JOB_TYPE_SET = new Set<string>(Object.values(BOOKING_DOCUMENT_GENERATION_JOB_TYPE));

export function buildBookingDocumentGenerationIdempotencyKey(input: {
  organizationId: string;
  bookingId: string;
  jobType: BookingDocumentGenerationJobType;
  documentType?: DocumentType | null;
  handoverProtocolId?: string | null;
}): string {
  switch (input.jobType) {
    case BOOKING_DOCUMENT_GENERATION_JOB_TYPE.INITIAL_BUNDLE:
      return `booking-doc:initial:${input.organizationId}:${input.bookingId}`;
    case BOOKING_DOCUMENT_GENERATION_JOB_TYPE.REGENERATE:
      return `booking-doc:regen:${input.organizationId}:${input.bookingId}:${input.documentType}`;
    case BOOKING_DOCUMENT_GENERATION_JOB_TYPE.PICKUP_PROTOCOL:
      return `booking-doc:pickup:${input.organizationId}:${input.bookingId}:${input.handoverProtocolId}`;
    case BOOKING_DOCUMENT_GENERATION_JOB_TYPE.RETURN_PROTOCOL:
      return `booking-doc:return:${input.organizationId}:${input.bookingId}:${input.handoverProtocolId}`;
    case BOOKING_DOCUMENT_GENERATION_JOB_TYPE.FINAL_INVOICE:
      return `booking-doc:final:${input.organizationId}:${input.bookingId}`;
    default:
      throw new Error(`Unknown job type: ${input.jobType}`);
  }
}

export function buildBookingDocumentGenerationBullJobId(persistentJobId: string): string {
  return sanitizeBullMqJobId({ namespace: 'booking-doc', key: persistentJobId });
}

export function assertValidJobType(jobType: string): BookingDocumentGenerationJobType {
  if (!JOB_TYPE_SET.has(jobType)) {
    throw new Error(`Invalid booking document generation job type: ${jobType}`);
  }
  return jobType as BookingDocumentGenerationJobType;
}
