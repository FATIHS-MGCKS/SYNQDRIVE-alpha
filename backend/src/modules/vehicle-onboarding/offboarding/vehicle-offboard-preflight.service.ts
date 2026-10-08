import { Injectable } from '@nestjs/common';
import type { BookingStatus, Prisma } from '@prisma/client';
import { TripStatus, VehicleStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isActiveDamage } from '@modules/vehicle-intelligence/damages/damage.mapper';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import type {
  VehicleOffboardPreflightBlockCode,
  VehicleOffboardPreflightResult,
  VehicleOffboardPreflightWarningCode,
} from './vehicle-offboard-preflight.types';

const COMMITTED_BOOKING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED'];

const OPEN_SERVICE_CASE_STATUSES = [
  'OPEN',
  'SCHEDULED',
  'IN_PROGRESS',
  'WAITING_VENDOR',
  'WAITING_PARTS',
] as const;

const UNPAID_INVOICE_STATUSES = ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const;

const OPEN_TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING'] as const;

@Injectable()
export class VehicleOffboardPreflightService {
  constructor(private readonly prisma: PrismaService) {}

  async assess(input: {
    organizationId: string;
    vehicleId: string;
    now?: Date;
  }): Promise<VehicleOffboardPreflightResult> {
    return this.evaluate(this.prisma, input);
  }

  async assertBlockingAbsentInTransaction(
    tx: Prisma.TransactionClient,
    input: { organizationId: string; vehicleId: string; now?: Date },
  ): Promise<void> {
    const result = await this.evaluate(tx, input);
    if (!result.allowed) {
      throw new VehicleOnboardingError(
        'OFFBOARD_OPERATIONALLY_BLOCKED',
        'Vehicle cannot be offboarded while operational preconditions are not met',
        { blockingReasons: result.blockingReasons },
      );
    }
  }

  private async evaluate(
    db: PrismaService | Prisma.TransactionClient,
    input: { organizationId: string; vehicleId: string; now?: Date },
  ): Promise<VehicleOffboardPreflightResult> {
    const now = input.now ?? new Date();
    const blockingReasons: VehicleOffboardPreflightBlockCode[] = [];
    const warnings: VehicleOffboardPreflightWarningCode[] = [];

    const vehicle = await db.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId: input.organizationId },
      select: { id: true, status: true },
    });
    if (!vehicle) {
      return { allowed: true, blockingReasons: [], warnings: [] };
    }

    const activeRentalBooking = await db.booking.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (activeRentalBooking || vehicle.status === VehicleStatus.RENTED) {
      blockingReasons.push('ACTIVE_RENTAL');
    }

    const futureCommittedBooking = await db.booking.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        status: { in: COMMITTED_BOOKING_STATUSES },
        endDate: { gte: now },
      },
      select: { id: true },
    });
    if (futureCommittedBooking) {
      blockingReasons.push('ACTIVE_BOOKING');
    }

    const ongoingTrip = await db.vehicleTrip.findFirst({
      where: {
        vehicleId: input.vehicleId,
        tripStatus: TripStatus.ONGOING,
      },
      select: { id: true },
    });
    if (ongoingTrip) {
      blockingReasons.push('ONGOING_TRIP');
    }

    const openHandoverDraft = await db.bookingHandoverDraft.findFirst({
      where: {
        organizationId: input.organizationId,
        booking: { vehicleId: input.vehicleId },
      },
      select: { id: true },
    });
    if (openHandoverDraft) {
      blockingReasons.push('OPEN_HANDOVER');
    }

    const openPickupHandover = await db.booking.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        status: { in: ['ACTIVE', 'CONFIRMED', 'PENDING'] },
        handoverProtocols: { none: { kind: 'PICKUP' } },
        endDate: { gte: now },
      },
      select: { id: true },
    });
    if (openPickupHandover && !blockingReasons.includes('OPEN_HANDOVER')) {
      blockingReasons.push('OPEN_HANDOVER');
    }

    const openDamage = await db.vehicleDamage.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        status: { in: ['OPEN', 'IN_REPAIR'] },
      },
      select: { status: true, repairedAt: true, repairStartedAt: true },
    });
    if (openDamage && isActiveDamage(openDamage)) {
      warnings.push('OPEN_DAMAGE_WARNING');
    }

    const openServiceCase = await db.serviceCase.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        status: { in: [...OPEN_SERVICE_CASE_STATUSES] },
      },
      select: { id: true },
    });
    if (openServiceCase) {
      warnings.push('OPEN_MAINTENANCE_WARNING');
    }

    const unpaidInvoice = await db.orgInvoice.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        outstandingCents: { gt: 0 },
        status: { in: [...UNPAID_INVOICE_STATUSES] },
      },
      select: { id: true },
    });
    if (unpaidInvoice) {
      warnings.push('UNPAID_BILLING_WARNING');
    }

    const openTask = await db.orgTask.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        status: { in: [...OPEN_TASK_STATUSES] },
      },
      select: { id: true },
    });
    if (openTask) {
      warnings.push('FLEET_TASK_WARNING');
    }

    return {
      allowed: blockingReasons.length === 0,
      blockingReasons,
      warnings,
    };
  }
}
