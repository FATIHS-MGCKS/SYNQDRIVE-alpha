import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { HandoverKind, Prisma } from '@prisma/client';
import operatorDataRetentionConfig from '@config/operator-data-retention.config';
import { PrismaService } from '@shared/database/prisma.service';

export interface UpsertOperatorHandoverDraftInput {
  organizationId: string;
  bookingId: string;
  kind: HandoverKind;
  stepId?: string | null;
  payload: Prisma.InputJsonValue;
}

/**
 * Server-side handover draft store with TTL.
 * Payload must not include signature bitmaps — those stay in-memory until submit.
 */
@Injectable()
export class OperatorHandoverDraftService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(operatorDataRetentionConfig.KEY)
    private readonly config: ConfigType<typeof operatorDataRetentionConfig>,
  ) {}

  async upsert(input: UpsertOperatorHandoverDraftInput) {
    await this.assertBookingInOrg(input.organizationId, input.bookingId);
    const expiresAt = this.computeExpiresAt();
    return this.prisma.operatorHandoverDraft.upsert({
      where: {
        organizationId_bookingId_kind: {
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          kind: input.kind,
        },
      },
      create: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        kind: input.kind,
        stepId: input.stepId ?? null,
        payload: input.payload,
        expiresAt,
      },
      update: {
        stepId: input.stepId ?? null,
        payload: input.payload,
        expiresAt,
      },
    });
  }

  async find(organizationId: string, bookingId: string, kind: HandoverKind) {
    return this.prisma.operatorHandoverDraft.findUnique({
      where: {
        organizationId_bookingId_kind: { organizationId, bookingId, kind },
      },
    });
  }

  async delete(organizationId: string, bookingId: string, kind: HandoverKind) {
    const existing = await this.find(organizationId, bookingId, kind);
    if (!existing) {
      throw new NotFoundException('Operator handover draft not found');
    }
    await this.prisma.operatorHandoverDraft.delete({ where: { id: existing.id } });
    return { deleted: true };
  }

  private computeExpiresAt(): Date {
    const hours = Math.max(1, this.config.handoverDraftTtlHours);
    const expiresAt = new Date();
    expiresAt.setUTCHours(expiresAt.getUTCHours() + hours);
    return expiresAt;
  }

  private async assertBookingInOrg(organizationId: string, bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: { id: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found in organization');
    }
  }
}
