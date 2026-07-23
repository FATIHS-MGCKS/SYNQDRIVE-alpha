import { ConflictException, Injectable } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BLOCKING_BOOKING_STATUSES,
  BOOKING_AVAILABILITY_ERROR_CODES,
  PG_EXCLUSION_VIOLATION,
} from './booking-availability.constants';

export type Tx = Prisma.TransactionClient;

export interface VehicleAvailabilityWindow {
  organizationId: string;
  vehicleId: string;
  startDate: Date;
  endDate: Date;
  turnaroundBufferMinutes: number;
  excludeBookingId?: string;
}

export interface VehicleAvailabilityConflict {
  bookingId: string;
  startDate: Date;
  endDate: Date;
  status: BookingStatus;
  turnaroundBufferMinutes: number;
}

@Injectable()
export class BookingVehicleAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async acquireVehicleLock(
    tx: Tx,
    organizationId: string,
    vehicleId: string,
  ): Promise<void> {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${`booking-vehicle:${organizationId}:${vehicleId}`})
      )
    `;
  }

  /**
   * Half-open overlap: [start, end + buffer).
   * Adjacent windows (endA == startB) do not conflict when buffer is 0.
   */
  async findBlockingConflict(
    tx: Tx,
    input: VehicleAvailabilityWindow,
  ): Promise<VehicleAvailabilityConflict | null> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        start_date: Date;
        end_date: Date;
        status: BookingStatus;
        turnaround_buffer_minutes: number;
      }>
    >`
      SELECT b.id, b.start_date, b.end_date, b.status, b.turnaround_buffer_minutes
      FROM bookings b
      WHERE b.organization_id = ${input.organizationId}
        AND b.vehicle_id = ${input.vehicleId}
        AND b.status IN ('PENDING', 'CONFIRMED', 'ACTIVE')
        AND (${input.excludeBookingId ?? null}::text IS NULL OR b.id <> ${input.excludeBookingId ?? null})
        AND b.start_date < (
          ${input.endDate}::timestamptz
          + make_interval(mins => ${input.turnaroundBufferMinutes})
        )
        AND ${input.startDate}::timestamptz < (
          b.end_date + make_interval(mins => b.turnaround_buffer_minutes)
        )
      LIMIT 1
    `;

    const hit = rows[0];
    if (!hit) return null;

    return {
      bookingId: hit.id,
      startDate: hit.start_date,
      endDate: hit.end_date,
      status: hit.status,
      turnaroundBufferMinutes: hit.turnaround_buffer_minutes,
    };
  }

  async assertNoBlockingConflict(
    tx: Tx,
    input: VehicleAvailabilityWindow,
  ): Promise<void> {
    const conflict = await this.findBlockingConflict(tx, input);
    if (conflict) {
      throw this.buildConflictException(conflict);
    }
  }

  buildConflictException(conflict?: VehicleAvailabilityConflict): ConflictException {
    return new ConflictException({
      message: 'Dieses Fahrzeug ist im gewählten Zeitraum bereits gebucht.',
      code: BOOKING_AVAILABILITY_ERROR_CODES.BOOKING_CONFLICT,
      conflictingBookingId: conflict?.bookingId ?? null,
      conflictRange: conflict
        ? {
            startDate: conflict.startDate.toISOString(),
            endDate: conflict.endDate.toISOString(),
            status: conflict.status,
            turnaroundBufferMinutes: conflict.turnaroundBufferMinutes,
          }
        : null,
    });
  }

  isAvailabilityExclusionViolation(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const meta = error.meta as { database_error_code?: string } | undefined;
      if (meta?.database_error_code === PG_EXCLUSION_VIOLATION) return true;
      if (typeof error.message === 'string' && error.message.includes('exclusion constraint')) {
        return true;
      }
    }
    const driverCode = (error as { code?: string })?.code;
    return driverCode === PG_EXCLUSION_VIOLATION;
  }

  rethrowAvailabilityError(error: unknown): never {
    if (this.isAvailabilityExclusionViolation(error)) {
      throw this.buildConflictException();
    }
    throw error;
  }

  isBlockingStatus(status: BookingStatus): boolean {
    return (BLOCKING_BOOKING_STATUSES as readonly string[]).includes(status);
  }
}
