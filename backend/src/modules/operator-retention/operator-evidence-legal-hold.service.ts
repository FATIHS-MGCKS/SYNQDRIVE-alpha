import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

export interface SetOperatorEvidenceLegalHoldInput {
  organizationId: string;
  bookingId: string;
  reason?: string | null;
  setByUserId?: string | null;
}

@Injectable()
export class OperatorEvidenceLegalHoldService {
  constructor(private readonly prisma: PrismaService) {}

  async isActive(organizationId: string, bookingId: string): Promise<boolean> {
    const row = await this.prisma.operatorBookingEvidenceLegalHold.findFirst({
      where: { organizationId, bookingId, active: true },
      select: { id: true },
    });
    return Boolean(row);
  }

  async get(organizationId: string, bookingId: string) {
    return this.prisma.operatorBookingEvidenceLegalHold.findFirst({
      where: { organizationId, bookingId },
    });
  }

  async setActive(input: SetOperatorEvidenceLegalHoldInput) {
    await this.assertBookingInOrg(input.organizationId, input.bookingId);
    return this.prisma.operatorBookingEvidenceLegalHold.upsert({
      where: { bookingId: input.bookingId },
      create: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        active: true,
        reason: input.reason?.trim() || null,
        setByUserId: input.setByUserId ?? null,
        releasedAt: null,
        releasedByUserId: null,
      },
      update: {
        active: true,
        reason: input.reason?.trim() || null,
        setByUserId: input.setByUserId ?? null,
        setAt: new Date(),
        releasedAt: null,
        releasedByUserId: null,
      },
    });
  }

  async release(organizationId: string, bookingId: string, releasedByUserId?: string | null) {
    const existing = await this.prisma.operatorBookingEvidenceLegalHold.findFirst({
      where: { organizationId, bookingId },
    });
    if (!existing) {
      throw new NotFoundException('Operator evidence legal hold not found');
    }
    return this.prisma.operatorBookingEvidenceLegalHold.update({
      where: { id: existing.id },
      data: {
        active: false,
        releasedAt: new Date(),
        releasedByUserId: releasedByUserId ?? null,
      },
    });
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
