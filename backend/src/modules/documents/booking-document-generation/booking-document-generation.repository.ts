import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BOOKING_DOCUMENT_GENERATION_DEFAULT_MAX_ATTEMPTS,
  BOOKING_DOCUMENT_GENERATION_STATUS,
  BOOKING_DOCUMENT_GENERATION_TERMINAL_STATUSES,
  type BookingDocumentGenerationStatus,
} from './booking-document-generation.constants';
import { buildBookingDocumentGenerationIdempotencyKey } from './booking-document-generation.contract';
import type { EnqueueBookingDocumentGenerationInput } from './booking-document-generation.types';

function computeNextRetryAt(attemptCount: number): Date {
  const delayMs = 5_000 * Math.pow(2, Math.max(0, attemptCount - 1));
  return new Date(Date.now() + delayMs);
}

@Injectable()
export class BookingDocumentGenerationRepository {
  constructor(private readonly prisma: PrismaService) {}

  isTerminalStatus(status: string): boolean {
    return BOOKING_DOCUMENT_GENERATION_TERMINAL_STATUSES.has(status as BookingDocumentGenerationStatus);
  }

  shouldSkipEnqueue(status: string): boolean {
    return (
      status === BOOKING_DOCUMENT_GENERATION_STATUS.PENDING ||
      status === BOOKING_DOCUMENT_GENERATION_STATUS.PROCESSING ||
      status === BOOKING_DOCUMENT_GENERATION_STATUS.SUCCEEDED
    );
  }

  findById(organizationId: string, jobId: string) {
    return this.prisma.bookingDocumentGenerationJob.findFirst({
      where: { id: jobId, organizationId },
    });
  }

  findByIdempotencyKey(organizationId: string, idempotencyKey: string) {
    return this.prisma.bookingDocumentGenerationJob.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
    });
  }

  listForBooking(organizationId: string, bookingId: string) {
    return this.prisma.bookingDocumentGenerationJob.findMany({
      where: { organizationId, bookingId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async assertBookingInOrg(organizationId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: { id: true, organizationId: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found for organization');
    }
    return booking;
  }

  async persistOrGet(input: EnqueueBookingDocumentGenerationInput) {
    await this.assertBookingInOrg(input.organizationId, input.bookingId);

    const idempotencyKey = buildBookingDocumentGenerationIdempotencyKey({
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      jobType: input.jobType,
      documentType: input.documentType,
      handoverProtocolId: input.handoverProtocolId,
    });

    const existing = await this.findByIdempotencyKey(input.organizationId, idempotencyKey);
    if (existing) {
      return { job: existing, created: false, deduplicated: true, idempotencyKey };
    }

    const bundle = await this.prisma.bookingDocumentBundle.findUnique({
      where: { bookingId: input.bookingId },
      select: { id: true, organizationId: true },
    });
    if (bundle && bundle.organizationId !== input.organizationId) {
      throw new NotFoundException('Booking bundle tenant mismatch');
    }

    try {
      const job = await this.prisma.bookingDocumentGenerationJob.create({
        data: {
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          bundleId: bundle?.id ?? null,
          jobType: input.jobType,
          documentType: input.documentType ?? null,
          handoverProtocolId: input.handoverProtocolId ?? null,
          idempotencyKey,
          correlationId: input.correlationId ?? idempotencyKey,
          status: BOOKING_DOCUMENT_GENERATION_STATUS.PENDING,
          maxAttempts: BOOKING_DOCUMENT_GENERATION_DEFAULT_MAX_ATTEMPTS,
          requestedByUserId: input.requestedByUserId ?? null,
        },
      });
      return { job, created: true, deduplicated: false, idempotencyKey };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.findByIdempotencyKey(input.organizationId, idempotencyKey);
        if (raced) {
          return { job: raced, created: false, deduplicated: true, idempotencyKey };
        }
      }
      throw err;
    }
  }

  markEnqueued(jobId: string, bullJobId: string) {
    return this.prisma.bookingDocumentGenerationJob.update({
      where: { id: jobId },
      data: { bullJobId },
    });
  }

  async markProcessing(jobId: string) {
    const job = await this.prisma.bookingDocumentGenerationJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    if (this.isTerminalStatus(job.status)) return job;
    if (job.status === BOOKING_DOCUMENT_GENERATION_STATUS.PROCESSING) return job;

    return this.prisma.bookingDocumentGenerationJob.update({
      where: { id: jobId },
      data: {
        status: BOOKING_DOCUMENT_GENERATION_STATUS.PROCESSING,
        lastAttemptAt: new Date(),
        attemptCount: { increment: 1 },
        errorCode: null,
        errorMessage: null,
      },
    });
  }

  markSucceeded(jobId: string) {
    return this.prisma.bookingDocumentGenerationJob.update({
      where: { id: jobId },
      data: {
        status: BOOKING_DOCUMENT_GENERATION_STATUS.SUCCEEDED,
        completedAt: new Date(),
        nextRetryAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
  }

  markFailedRetryable(jobId: string, attemptCount: number, errorCode: string, errorMessage: string) {
    return this.prisma.bookingDocumentGenerationJob.update({
      where: { id: jobId },
      data: {
        status: BOOKING_DOCUMENT_GENERATION_STATUS.FAILED_RETRYABLE,
        errorCode,
        errorMessage,
        nextRetryAt: computeNextRetryAt(attemptCount),
        bullJobId: null,
      },
    });
  }

  markFailedFinal(jobId: string, errorCode: string, errorMessage: string) {
    return this.prisma.bookingDocumentGenerationJob.update({
      where: { id: jobId },
      data: {
        status: BOOKING_DOCUMENT_GENERATION_STATUS.FAILED_FINAL,
        completedAt: new Date(),
        errorCode,
        errorMessage,
        nextRetryAt: null,
        bullJobId: null,
      },
    });
  }

  resetForManualRetry(jobId: string) {
    return this.prisma.bookingDocumentGenerationJob.update({
      where: { id: jobId },
      data: {
        status: BOOKING_DOCUMENT_GENERATION_STATUS.PENDING,
        attemptCount: 0,
        nextRetryAt: null,
        errorCode: null,
        errorMessage: null,
        completedAt: null,
        bullJobId: null,
      },
    });
  }

  findRetryableJobs(limit = 50) {
    const now = new Date();
    return this.prisma.bookingDocumentGenerationJob.findMany({
      where: {
        status: {
          in: [
            BOOKING_DOCUMENT_GENERATION_STATUS.PENDING,
            BOOKING_DOCUMENT_GENERATION_STATUS.FAILED_RETRYABLE,
          ],
        },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  findStaleProcessingJobs(staleBefore: Date, limit = 50) {
    return this.prisma.bookingDocumentGenerationJob.findMany({
      where: {
        status: BOOKING_DOCUMENT_GENERATION_STATUS.PROCESSING,
        lastAttemptAt: { lt: staleBefore },
      },
      orderBy: { lastAttemptAt: 'asc' },
      take: limit,
    });
  }
}
