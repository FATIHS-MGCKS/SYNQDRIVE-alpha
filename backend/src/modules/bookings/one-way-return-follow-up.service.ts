import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { ACTIVE_VEHICLE_STATION_TRANSFER_STATUSES } from '@modules/stations/vehicle-station-transfer.types';
import {
  evaluateOneWayReturnFollowUp,
  serializeOneWayReturnFollowUpSnapshot,
} from '@shared/stations/one-way-return-follow-up.util';
import type { OneWayReturnFollowUpResult } from '@shared/stations/one-way-return-follow-up.contract';

export interface EvaluateOneWayReturnFollowUpCommand {
  organizationId: string;
  bookingId: string;
  vehicleId: string;
  isOneWayRental: boolean;
  pickupStationId: string | null;
  plannedReturnStationId: string | null;
  actualReturnStationId: string;
  evaluatedAt?: Date;
}

@Injectable()
export class OneWayReturnFollowUpService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateAfterReturn(
    input: EvaluateOneWayReturnFollowUpCommand,
  ): Promise<OneWayReturnFollowUpResult> {
    const evaluatedAt = input.evaluatedAt ?? new Date();

    const [vehicle, nextBooking, activeTransfer] = await Promise.all([
      this.prisma.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId: input.organizationId },
        select: {
          homeStationId: true,
          currentStationId: true,
          expectedStationId: true,
          expectedStationSource: true,
        },
      }),
      this.prisma.booking.findFirst({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          id: { not: input.bookingId },
          status: { in: ['PENDING', 'CONFIRMED'] },
          startDate: { gte: evaluatedAt },
        },
        orderBy: { startDate: 'asc' },
        select: {
          id: true,
          pickupStationId: true,
          startDate: true,
        },
      }),
      this.prisma.vehicleStationTransfer.findFirst({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          status: { in: ACTIVE_VEHICLE_STATION_TRANSFER_STATUSES },
        },
        select: {
          id: true,
          fromStationId: true,
          toStationId: true,
          status: true,
        },
      }),
    ]);

    const result = evaluateOneWayReturnFollowUp({
      evaluatedAt: evaluatedAt.toISOString(),
      bookingId: input.bookingId,
      isOneWayRental: input.isOneWayRental,
      pickupStationId: input.pickupStationId,
      plannedReturnStationId: input.plannedReturnStationId,
      actualReturnStationId: input.actualReturnStationId,
      homeStationId: vehicle?.homeStationId ?? null,
      currentStationId: input.actualReturnStationId,
      expectedStationId: vehicle?.expectedStationId ?? null,
      expectedStationSource: vehicle?.expectedStationSource ?? null,
      nextBooking: nextBooking
        ? {
            id: nextBooking.id,
            pickupStationId: nextBooking.pickupStationId,
            startDate: nextBooking.startDate.toISOString(),
          }
        : null,
      activeTransfer: activeTransfer
        ? {
            id: activeTransfer.id,
            fromStationId: activeTransfer.fromStationId,
            toStationId: activeTransfer.toStationId,
            status: activeTransfer.status,
          }
        : null,
    });

    return serializeOneWayReturnFollowUpSnapshot(result);
  }
}
