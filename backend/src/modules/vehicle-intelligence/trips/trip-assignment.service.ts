import { Injectable, Optional } from '@nestjs/common';
import {
  BookingStatus,
  Prisma,
  TripAssignmentStatus,
  TripAssignmentSubjectType,
  VehicleTrip,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '../../observability/trip-metrics.service';

export interface TripAssignmentResolution {
  assignmentStatus: TripAssignmentStatus;
  assignmentSubjectType: TripAssignmentSubjectType | null;
  assignmentSubjectId: string | null;
  assignedBookingId: string | null;
  isPrivateTrip: boolean;
  scoreEligible: boolean;
}

type TripAssignmentInput = Pick<
  VehicleTrip,
  | 'id'
  | 'vehicleId'
  | 'startTime'
  | 'endTime'
  | 'driverName'
  | 'assignmentStatus'
  | 'assignmentSubjectType'
  | 'assignmentSubjectId'
  | 'assignedBookingId'
  | 'isPrivateTrip'
>;

@Injectable()
export class TripAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  async applyAssignmentToTrip(tripId: string): Promise<TripAssignmentResolution | null> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        vehicleId: true,
        startTime: true,
        endTime: true,
        driverName: true,
        assignmentStatus: true,
        assignmentSubjectType: true,
        assignmentSubjectId: true,
        assignedBookingId: true,
        isPrivateTrip: true,
      },
    });
    if (!trip) return null;

    const resolution = await this.resolveForTrip(trip, { recordMetric: true });
    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        assignmentStatus: resolution.assignmentStatus,
        assignmentSubjectType: resolution.assignmentSubjectType ?? undefined,
        assignmentSubjectId: resolution.assignmentSubjectId ?? undefined,
        assignedBookingId: resolution.assignedBookingId ?? undefined,
        isPrivateTrip: resolution.isPrivateTrip,
      },
    });
    return resolution;
  }

  async resolveForTrip(
    trip: TripAssignmentInput,
    options: { recordMetric?: boolean } = {},
  ): Promise<TripAssignmentResolution> {
    const fallback = this.normalizeFallbackAssignment(trip);
    const bookingAssignment = await this.findBookingAssignment(trip);
    const resolution = bookingAssignment ?? fallback;
    if (options.recordMetric) {
      this.tripMetrics?.tripAssignmentResolutions.inc({
        status: resolution.assignmentStatus,
        score_eligible: resolution.scoreEligible ? 'yes' : 'no',
      });
    }
    return resolution;
  }

  private normalizeFallbackAssignment(trip: TripAssignmentInput): TripAssignmentResolution {
    if (trip.assignmentStatus && trip.assignmentStatus !== TripAssignmentStatus.UNKNOWN_ASSIGNMENT) {
      return {
        assignmentStatus: trip.assignmentStatus,
        assignmentSubjectType: trip.assignmentSubjectType ?? null,
        assignmentSubjectId: trip.assignmentSubjectId ?? null,
        assignedBookingId: trip.assignedBookingId ?? null,
        isPrivateTrip: trip.isPrivateTrip === true,
        scoreEligible:
          trip.isPrivateTrip !== true &&
          trip.assignmentSubjectType != null &&
          !!trip.assignmentSubjectId,
      };
    }

    const normalizedDriver = this.normalizeSubjectId(trip.driverName);
    if (normalizedDriver) {
      return {
        assignmentStatus: TripAssignmentStatus.ASSIGNED_DRIVER,
        assignmentSubjectType: TripAssignmentSubjectType.DRIVER,
        assignmentSubjectId: normalizedDriver,
        assignedBookingId: null,
        isPrivateTrip: false,
        scoreEligible: true,
      };
    }

    if (!trip.endTime) {
      return {
        assignmentStatus: TripAssignmentStatus.UNKNOWN_ASSIGNMENT,
        assignmentSubjectType: null,
        assignmentSubjectId: null,
        assignedBookingId: null,
        isPrivateTrip: false,
        scoreEligible: false,
      };
    }

    return {
      assignmentStatus: TripAssignmentStatus.PRIVATE_UNASSIGNED,
      assignmentSubjectType: null,
      assignmentSubjectId: null,
      assignedBookingId: null,
      isPrivateTrip: true,
      scoreEligible: false,
    };
  }

  private async findBookingAssignment(
    trip: TripAssignmentInput,
  ): Promise<TripAssignmentResolution | null> {
    const tripEnd = trip.endTime ?? trip.startTime;

    const overlapWhere: Prisma.BookingWhereInput = {
      vehicleId: trip.vehicleId,
      status: { in: [BookingStatus.ACTIVE, BookingStatus.COMPLETED] },
      startDate: { lte: tripEnd },
      endDate: { gte: trip.startTime },
    };

    const booking = await this.prisma.booking.findFirst({
      where: overlapWhere,
      orderBy: { startDate: 'desc' },
      select: { id: true, customerId: true },
    });
    if (!booking) return null;

    return {
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignmentSubjectType: TripAssignmentSubjectType.BOOKING_CUSTOMER,
      assignmentSubjectId: booking.customerId,
      assignedBookingId: booking.id,
      isPrivateTrip: false,
      scoreEligible: true,
    };
  }

  private normalizeSubjectId(value: string | null | undefined): string | null {
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  }
}

