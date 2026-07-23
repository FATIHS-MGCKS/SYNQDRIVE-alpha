import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { computeAuditContentHash } from '../util/booking-request-context.util';
import type {
  BookingCancellationProcessStatus,
  BookingCancellationRequestContext,
} from './booking-cancellation.types';

export interface AppendBookingCancellationAuditInput {
  organizationId: string;
  bookingId: string;
  statusCommandId?: string | null;
  fromStatus: string | null;
  toStatus: string;
  reasonCode: string;
  description?: string | null;
  effectiveAt: Date;
  feeCents: number;
  feeCurrency: string;
  actor: {
    userId?: string | null;
    displayName?: string | null;
  };
  requestContext?: BookingCancellationRequestContext;
  processStatus: BookingCancellationProcessStatus;
  correlationId?: string | null;
}

@Injectable()
export class BookingCancellationAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async append(input: AppendBookingCancellationAuditInput): Promise<string> {
    const hashPayload = {
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      reasonCode: input.reasonCode,
      description: input.description ?? null,
      effectiveAt: input.effectiveAt.toISOString(),
      feeCents: input.feeCents,
      feeCurrency: input.feeCurrency,
      actorUserId: input.actor.userId ?? null,
      processStatus: input.processStatus,
      correlationId: input.correlationId ?? null,
    };

    const row = await this.prisma.bookingCancellationAuditEvent.create({
      data: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        statusCommandId: input.statusCommandId ?? null,
        fromStatus: input.fromStatus as BookingStatus | null,
        toStatus: input.toStatus as BookingStatus,
        reasonCode: input.reasonCode,
        description: input.description ?? null,
        effectiveAt: input.effectiveAt,
        feeCents: input.feeCents,
        feeCurrency: input.feeCurrency,
        actorUserId: input.actor.userId ?? null,
        actorDisplayName: input.actor.displayName ?? null,
        requestIpTruncated: input.requestContext?.ipTruncated ?? null,
        requestUserAgent: input.requestContext?.userAgent ?? null,
        processStatusJson: input.processStatus as unknown as Prisma.InputJsonValue,
        contentHash: computeAuditContentHash(hashPayload),
        correlationId: input.correlationId ?? null,
      },
    });

    return row.id;
  }
}
