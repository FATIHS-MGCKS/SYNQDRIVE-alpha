import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { computeAuditContentHash } from '../util/booking-request-context.util';
import type { BookingCancellationRequestContext } from '../cancellation/booking-cancellation.types';
import type { BookingStatusOverrideInvariant } from './booking-status-override-invariants';

export interface AppendBookingStatusOverrideAuditInput {
  organizationId: string;
  bookingId: string;
  statusCommandId?: string | null;
  fromStatus: BookingStatus;
  toStatus: BookingStatus;
  reason: string;
  affectedInvariants: BookingStatusOverrideInvariant[];
  approvalRequestId?: string | null;
  actor: {
    userId?: string | null;
    displayName?: string | null;
  };
  requestContext?: BookingCancellationRequestContext;
  correlationId?: string | null;
}

@Injectable()
export class BookingStatusOverrideAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async append(input: AppendBookingStatusOverrideAuditInput): Promise<string> {
    const hashPayload = {
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      reason: input.reason,
      affectedInvariants: input.affectedInvariants,
      approvalRequestId: input.approvalRequestId ?? null,
      actorUserId: input.actor.userId ?? null,
      correlationId: input.correlationId ?? null,
    };

    const row = await this.prisma.bookingStatusOverrideAuditEvent.create({
      data: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        statusCommandId: input.statusCommandId ?? null,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        reason: input.reason,
        affectedInvariants: input.affectedInvariants as unknown as Prisma.InputJsonValue,
        approvalRequestId: input.approvalRequestId ?? null,
        actorUserId: input.actor.userId ?? null,
        actorDisplayName: input.actor.displayName ?? null,
        requestIpTruncated: input.requestContext?.ipTruncated ?? null,
        requestUserAgent: input.requestContext?.userAgent ?? null,
        contentHash: computeAuditContentHash(hashPayload),
        correlationId: input.correlationId ?? null,
      },
    });

    return row.id;
  }
}
