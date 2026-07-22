import type { BookingDocumentGenerationJob } from '@prisma/client';

export interface BookingDocumentGenerationJobDto {
  id: string;
  organizationId: string;
  bookingId: string;
  bundleId: string | null;
  jobType: string;
  documentType: string | null;
  handoverProtocolId: string | null;
  idempotencyKey: string;
  correlationId: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastAttemptAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  requestedByUserId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toBookingDocumentGenerationJobDto(
  job: BookingDocumentGenerationJob,
): BookingDocumentGenerationJobDto {
  return {
    id: job.id,
    organizationId: job.organizationId,
    bookingId: job.bookingId,
    bundleId: job.bundleId,
    jobType: job.jobType,
    documentType: job.documentType,
    handoverProtocolId: job.handoverProtocolId,
    idempotencyKey: job.idempotencyKey,
    correlationId: job.correlationId,
    status: job.status,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    nextRetryAt: job.nextRetryAt ? job.nextRetryAt.toISOString() : null,
    lastAttemptAt: job.lastAttemptAt ? job.lastAttemptAt.toISOString() : null,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    requestedByUserId: job.requestedByUserId,
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
