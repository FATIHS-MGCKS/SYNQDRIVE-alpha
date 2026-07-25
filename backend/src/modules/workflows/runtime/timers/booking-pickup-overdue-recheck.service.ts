import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

export interface BookingPickupOverdueRecheckResult {
  shouldEmit: boolean;
  skipReason?: string;
}

@Injectable()
export class BookingPickupOverdueRecheckService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(
    orgId: string,
    bookingId: string,
    now = new Date(),
  ): Promise<BookingPickupOverdueRecheckResult> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      include: {
        handoverProtocols: { where: { kind: 'PICKUP' }, select: { id: true } },
        organization: { select: { status: true } },
      },
    });

    if (!booking) {
      return { shouldEmit: false, skipReason: 'booking_not_found' };
    }

    if (booking.organization.status === 'ARCHIVED' || booking.organization.status === 'SUSPENDED') {
      return { shouldEmit: false, skipReason: 'organization_locked' };
    }

    if (booking.status === 'CANCELLED' || booking.cancelledAt) {
      return { shouldEmit: false, skipReason: 'booking_cancelled' };
    }

    if (booking.status !== 'CONFIRMED') {
      return { shouldEmit: false, skipReason: 'pickup_already_completed_or_not_relevant' };
    }

    if (booking.handoverProtocols.length > 0) {
      return { shouldEmit: false, skipReason: 'pickup_handover_exists' };
    }

    const extras =
      booking.extrasJson && typeof booking.extrasJson === 'object' && !Array.isArray(booking.extrasJson)
        ? (booking.extrasJson as Record<string, unknown>)
        : {};
    if (extras.pickupOverdueSuppressed === true || extras.workflowManualException === true) {
      return { shouldEmit: false, skipReason: 'manual_exception' };
    }

    if (now.getTime() < booking.startDate.getTime()) {
      return { shouldEmit: false, skipReason: 'pickup_not_yet_due' };
    }

    const alreadyContacted = await this.prisma.outboundEmail.count({
      where: {
        organizationId: orgId,
        bookingId,
        createdAt: { gte: booking.startDate },
      },
    });
    if (alreadyContacted > 0) {
      return { shouldEmit: false, skipReason: 'customer_already_contacted' };
    }

    const activeWorkflow = await this.prisma.workflowDefinition.count({
      where: {
        organizationId: orgId,
        lifecycleStatus: 'ACTIVE',
        archivedAt: null,
      },
    });
    if (activeWorkflow === 0) {
      return { shouldEmit: false, skipReason: 'no_active_workflow' };
    }

    return { shouldEmit: true };
  }
}
