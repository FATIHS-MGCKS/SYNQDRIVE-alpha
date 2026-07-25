import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HandoverKind, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessService } from '@shared/stations/station-access.service';

export interface HandoverDraftDto {
  id: string;
  bookingId: string;
  kind: HandoverKind;
  userId: string;
  payload: Record<string, unknown>;
  updatedAt: string;
  createdAt: string;
}

@Injectable()
export class BookingHandoverDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccess: StationAccessService,
  ) {}

  async getDraft(
    orgId: string,
    bookingId: string,
    kind: HandoverKind,
    userId: string,
  ): Promise<HandoverDraftDto | null> {
    await this.assertBookingReadable(orgId, bookingId, userId);
    const row = await this.prisma.bookingHandoverDraft.findFirst({
      where: { organizationId: orgId, bookingId, kind, userId },
    });
    return row ? this.mapRow(row) : null;
  }

  async upsertDraft(
    orgId: string,
    bookingId: string,
    kind: HandoverKind,
    userId: string,
    payload: Record<string, unknown>,
    expectedUpdatedAt?: string,
  ): Promise<HandoverDraftDto> {
    await this.assertBookingReadable(orgId, bookingId, userId);

    const existing = await this.prisma.bookingHandoverDraft.findFirst({
      where: { organizationId: orgId, bookingId, kind, userId },
    });

    if (expectedUpdatedAt && existing) {
      const expectedMs = new Date(expectedUpdatedAt).getTime();
      if (Number.isNaN(expectedMs)) {
        throw new ConflictException({
          code: 'HANDOVER_DRAFT_CONFLICT',
          message: 'expectedUpdatedAt must be a valid ISO-8601 timestamp',
        });
      }
      if (existing.updatedAt.getTime() !== expectedMs) {
        throw new ConflictException({
          code: 'HANDOVER_DRAFT_CONFLICT',
          message: 'Handover draft was modified in another session. Refresh and retry.',
          serverUpdatedAt: existing.updatedAt.toISOString(),
        });
      }
    }

    const row = existing
      ? await this.prisma.bookingHandoverDraft.update({
          where: { id: existing.id },
          data: { payload: payload as Prisma.InputJsonValue },
        })
      : await this.prisma.bookingHandoverDraft.create({
          data: {
            organizationId: orgId,
            bookingId,
            kind,
            userId,
            payload: payload as Prisma.InputJsonValue,
          },
        });

    return this.mapRow(row);
  }

  async deleteDraft(
    orgId: string,
    bookingId: string,
    kind: HandoverKind,
    userId: string,
  ): Promise<void> {
    await this.assertBookingReadable(orgId, bookingId, userId);
    await this.prisma.bookingHandoverDraft.deleteMany({
      where: { organizationId: orgId, bookingId, kind, userId },
    });
  }

  async deleteDraftsForBooking(orgId: string, bookingId: string): Promise<void> {
    await this.prisma.bookingHandoverDraft.deleteMany({
      where: { organizationId: orgId, bookingId },
    });
  }

  private async assertBookingReadable(
    orgId: string,
    bookingId: string,
    userId: string,
  ): Promise<void> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: { id: true, pickupStationId: true, returnStationId: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const access = await this.stationAccess.resolve(userId, orgId);
    if (booking.pickupStationId) {
      this.stationAccess.assertStationReadable(access, booking.pickupStationId);
    }
    if (booking.returnStationId) {
      this.stationAccess.assertStationReadable(access, booking.returnStationId);
    }
  }

  private mapRow(row: {
    id: string;
    bookingId: string;
    kind: HandoverKind;
    userId: string;
    payload: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): HandoverDraftDto {
    return {
      id: row.id,
      bookingId: row.bookingId,
      kind: row.kind,
      userId: row.userId,
      payload:
        row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {},
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
