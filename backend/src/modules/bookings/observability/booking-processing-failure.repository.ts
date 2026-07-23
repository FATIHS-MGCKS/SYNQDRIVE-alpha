import { Injectable } from '@nestjs/common';
import {
  BookingProcessingFailureCategory,
  BookingProcessingFailureSeverity,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class BookingProcessingFailureRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    organizationId: string;
    bookingId?: string | null;
    category: BookingProcessingFailureCategory;
    operation: string;
    errorCode: string;
    message: string;
    correlationId?: string | null;
    requestId?: string | null;
    eventId?: string | null;
    retryable?: boolean;
    severity?: BookingProcessingFailureSeverity;
    metadata?: Prisma.InputJsonValue | null;
  }) {
    return this.prisma.bookingProcessingFailure.create({
      data: {
        organizationId: input.organizationId,
        bookingId: input.bookingId ?? null,
        category: input.category,
        operation: input.operation,
        errorCode: input.errorCode,
        message: input.message,
        correlationId: input.correlationId ?? null,
        requestId: input.requestId ?? null,
        eventId: input.eventId ?? null,
        retryable: input.retryable ?? true,
        severity: input.severity ?? 'ERROR',
        metadata: input.metadata ?? undefined,
      },
    });
  }

  countUnresolvedByCategory(since: Date) {
    return this.prisma.bookingProcessingFailure.groupBy({
      by: ['category'],
      where: {
        resolvedAt: null,
        severity: { in: ['ERROR', 'CRITICAL'] },
        createdAt: { lt: since },
      },
      _count: { _all: true },
    });
  }

  countTenantDenials(windowStart: Date) {
    return this.prisma.bookingProcessingFailure.count({
      where: {
        category: 'TENANT',
        errorCode: 'TENANT_MISMATCH',
        createdAt: { gte: windowStart },
      },
    });
  }

  countConflicts(windowStart: Date) {
    return this.prisma.bookingProcessingFailure.count({
      where: {
        category: 'CONFLICT',
        createdAt: { gte: windowStart },
      },
    });
  }
}
