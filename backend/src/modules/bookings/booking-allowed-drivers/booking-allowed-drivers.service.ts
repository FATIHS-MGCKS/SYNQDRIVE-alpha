import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityAction, ActivityEntity, BookingDriverRole, Prisma } from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import type { BookingAllowedDriverRow, BookingDriverHistoryTrip } from './booking-allowed-drivers.types';
import { formatDriverName } from './booking-allowed-drivers.types';
import {
  isDriverInBookingPool,
  resolveBookingDriverPool,
} from './booking-allowed-drivers.util';
import { BookingEligibilityEnforcementService } from '../booking-eligibility-gatekeeper/booking-eligibility-enforcement.service';
import { BookingEligibilityApprovalService } from '../booking-eligibility-approval/booking-eligibility-approval.service';
import { BookingEligibilityRecheckService } from '../booking-eligibility-recheck/booking-eligibility-recheck.service';
import { isWizardDraftBooking } from '../booking-wizard-draft.util';

@Injectable()
export class BookingAllowedDriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly bookingEligibilityEnforcement: BookingEligibilityEnforcementService,
    private readonly bookingEligibilityApproval: BookingEligibilityApprovalService,
    private readonly bookingEligibilityRecheck: BookingEligibilityRecheckService,
  ) {}

  async listForBooking(organizationId: string, bookingId: string) {
    const booking = await this.assertBooking(organizationId, bookingId);
    const rows = await this.loadRows(organizationId, bookingId);
    const pool = resolveBookingDriverPool({
      bookingCustomerId: booking.customerId,
      assignedDriverId: booking.assignedDriverId,
      allowedRows: rows.map((row) => ({ customerId: row.customerId, role: row.role })),
    });

    return {
      bookingId,
      bookingCustomerId: booking.customerId,
      assignedDriverId: booking.assignedDriverId,
      pool,
      drivers: rows,
    };
  }

  async addAdditionalDriver(input: {
    organizationId: string;
    bookingId: string;
    customerId: string;
    userId?: string | null;
  }) {
    const booking = await this.assertBooking(input.organizationId, input.bookingId);
    if (input.customerId === booking.customerId) {
      throw new BadRequestException(
        'Contract holder cannot be registered as additional driver — use primary driver assignment instead',
      );
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, organizationId: input.organizationId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!customer) {
      throw new NotFoundException('Driver customer not found for organization');
    }

    const existing = await this.prisma.bookingAllowedDriver.findUnique({
      where: {
        bookingId_customerId: {
          bookingId: input.bookingId,
          customerId: input.customerId,
        },
      },
    });
    if (existing) {
      throw new BadRequestException('Customer is already an allowed driver for this booking');
    }

    const row = await this.prisma.bookingAllowedDriver.create({
      data: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        customerId: input.customerId,
        role: BookingDriverRole.ADDITIONAL,
        addedByUserId: input.userId ?? null,
      },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    await this.activityLog.log({
      organizationId: input.organizationId,
      userId: input.userId ?? undefined,
      action: ActivityAction.CREATE,
      entity: ActivityEntity.BOOKING,
      entityId: input.bookingId,
      description: `Added additional driver ${formatDriverName({ ...customer, fallbackId: input.customerId })} to booking`,
      metaJson: {
        kind: 'BOOKING_ALLOWED_DRIVER_ADD',
        customerId: input.customerId,
        role: BookingDriverRole.ADDITIONAL,
      },
    });

    await this.reassertBookingEligibilityAfterDriverChange(
      input.organizationId,
      input.bookingId,
      input.userId,
    );

    return this.mapRow(row);
  }

  async setPrimaryDriver(input: {
    organizationId: string;
    bookingId: string;
    customerId: string;
    userId?: string | null;
  }) {
    const booking = await this.assertBooking(input.organizationId, input.bookingId);

    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, organizationId: input.organizationId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!customer) {
      throw new NotFoundException('Driver customer not found for organization');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bookingAllowedDriver.updateMany({
        where: {
          bookingId: input.bookingId,
          organizationId: input.organizationId,
          role: BookingDriverRole.PRIMARY,
          customerId: { not: input.customerId },
        },
        data: { role: BookingDriverRole.ADDITIONAL },
      });

      await tx.bookingAllowedDriver.upsert({
        where: {
          bookingId_customerId: {
            bookingId: input.bookingId,
            customerId: input.customerId,
          },
        },
        create: {
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          customerId: input.customerId,
          role: BookingDriverRole.PRIMARY,
          addedByUserId: input.userId ?? null,
        },
        update: {
          role: BookingDriverRole.PRIMARY,
        },
      });

      await tx.booking.update({
        where: { id: input.bookingId },
        data: { assignedDriverId: input.customerId },
      });

      if (
        booking.assignedDriverId &&
        booking.assignedDriverId !== input.customerId &&
        booking.assignedDriverId !== booking.customerId
      ) {
        await tx.bookingAllowedDriver.upsert({
          where: {
            bookingId_customerId: {
              bookingId: input.bookingId,
              customerId: booking.assignedDriverId,
            },
          },
          create: {
            organizationId: input.organizationId,
            bookingId: input.bookingId,
            customerId: booking.assignedDriverId,
            role: BookingDriverRole.ADDITIONAL,
            addedByUserId: input.userId ?? null,
          },
          update: {
            role: BookingDriverRole.ADDITIONAL,
          },
        });
      }
    });

    await this.activityLog.log({
      organizationId: input.organizationId,
      userId: input.userId ?? undefined,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.BOOKING,
      entityId: input.bookingId,
      description: `Set primary driver ${formatDriverName({ ...customer, fallbackId: input.customerId })} on booking`,
      metaJson: {
        kind: 'BOOKING_PRIMARY_DRIVER_SET',
        customerId: input.customerId,
        previousAssignedDriverId: booking.assignedDriverId,
      },
    });

    await this.reassertBookingEligibilityAfterDriverChange(
      input.organizationId,
      input.bookingId,
      input.userId,
    );

    return this.listForBooking(input.organizationId, input.bookingId);
  }

  async removeAllowedDriver(input: {
    organizationId: string;
    bookingId: string;
    customerId: string;
    userId?: string | null;
  }) {
    const booking = await this.assertBooking(input.organizationId, input.bookingId);
    const row = await this.prisma.bookingAllowedDriver.findFirst({
      where: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        customerId: input.customerId,
      },
      include: { customer: { select: { firstName: true, lastName: true } } },
    });
    if (!row) {
      throw new NotFoundException('Allowed driver not found for booking');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bookingAllowedDriver.delete({ where: { id: row.id } });
      if (row.role === BookingDriverRole.PRIMARY || booking.assignedDriverId === input.customerId) {
        await tx.booking.update({
          where: { id: input.bookingId },
          data: { assignedDriverId: null },
        });
      }
    });

    await this.activityLog.log({
      organizationId: input.organizationId,
      userId: input.userId ?? undefined,
      action: ActivityAction.DELETE,
      entity: ActivityEntity.BOOKING,
      entityId: input.bookingId,
      description: `Removed allowed driver ${formatDriverName({ ...row.customer, fallbackId: input.customerId })} from booking`,
      metaJson: {
        kind: 'BOOKING_ALLOWED_DRIVER_REMOVE',
        customerId: input.customerId,
        role: row.role,
      },
    });

    await this.reassertBookingEligibilityAfterDriverChange(
      input.organizationId,
      input.bookingId,
      input.userId,
    );

    return this.listForBooking(input.organizationId, input.bookingId);
  }

  async assertTripDriverAllowed(input: {
    organizationId: string;
    bookingId: string;
    driverId: string;
  }): Promise<void> {
    const booking = await this.assertBooking(input.organizationId, input.bookingId);
    const rows = await this.loadRows(input.organizationId, input.bookingId);
    const pool = resolveBookingDriverPool({
      bookingCustomerId: booking.customerId,
      assignedDriverId: booking.assignedDriverId,
      allowedRows: rows.map((row) => ({ customerId: row.customerId, role: row.role })),
    });

    if (!isDriverInBookingPool(input.driverId, pool)) {
      throw new BadRequestException(
        'Driver is not in the allowed driver pool for this booking',
      );
    }
  }

  async getDriverConductHistory(input: {
    organizationId: string;
    driverCustomerId: string;
    limit?: number;
  }): Promise<BookingDriverHistoryTrip[]> {
    const limit = Math.min(input.limit ?? 50, 200);
    const trips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicle: { organizationId: input.organizationId },
        OR: [
          { actualDriverId: input.driverCustomerId },
          { assignedDriverId: input.driverCustomerId },
        ],
      },
      orderBy: { startTime: 'desc' },
      take: limit,
      select: {
        id: true,
        vehicleId: true,
        startTime: true,
        endTime: true,
        actualDriverId: true,
        assignedDriverId: true,
        assignedBookingId: true,
      },
    });

    return trips.map((trip) => ({
      tripId: trip.id,
      vehicleId: trip.vehicleId,
      startTime: trip.startTime,
      endTime: trip.endTime,
      actualDriverId: trip.actualDriverId,
      assignedDriverId: trip.assignedDriverId,
      bookingId: trip.assignedBookingId,
    }));
  }

  async loadPoolForBooking(organizationId: string, bookingId: string) {
    const booking = await this.assertBooking(organizationId, bookingId);
    const rows = await this.loadRows(organizationId, bookingId);
    return resolveBookingDriverPool({
      bookingCustomerId: booking.customerId,
      assignedDriverId: booking.assignedDriverId,
      allowedRows: rows.map((row) => ({ customerId: row.customerId, role: row.role })),
    });
  }

  private async reassertBookingEligibilityAfterDriverChange(
    organizationId: string,
    bookingId: string,
    userId?: string | null,
  ): Promise<void> {
    await this.bookingEligibilityApproval.revokeActiveApprovals({
      organizationId,
      bookingId,
      reason: 'Additional drivers changed',
      revokedByUserId: userId ?? null,
      invalidationFacts: ['additional_drivers', 'rule_revision'],
    });

    await this.bookingEligibilityRecheck.processMutationRecheckFromInvalidationFacts({
      organizationId,
      bookingId,
      invalidationFacts: ['additional_drivers', 'rule_revision'],
      actorUserId: userId ?? null,
    });

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: { status: true, notes: true },
    });
    if (!booking) return;
    if (isWizardDraftBooking(booking)) return;
    if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') return;

    await this.bookingEligibilityEnforcement.assertAllowedForBooking(
      organizationId,
      bookingId,
      booking.status,
    );
  }

  private async assertBooking(organizationId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: { id: true, customerId: true, assignedDriverId: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found for organization');
    }
    return booking;
  }

  private async loadRows(organizationId: string, bookingId: string): Promise<BookingAllowedDriverRow[]> {
    const rows = await this.prisma.bookingAllowedDriver.findMany({
      where: { organizationId, bookingId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(
    row: Prisma.BookingAllowedDriverGetPayload<{
      include: { customer: { select: { firstName: true; lastName: true; email: true } } };
    }>,
  ): BookingAllowedDriverRow {
    return {
      id: row.id,
      customerId: row.customerId,
      role: row.role,
      firstName: row.customer.firstName,
      lastName: row.customer.lastName,
      email: row.customer.email,
      addedByUserId: row.addedByUserId,
      createdAt: row.createdAt,
    };
  }
}
