import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolveBookingDriverPool } from '@modules/bookings/booking-allowed-drivers/booking-allowed-drivers.util';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeLicenseNumber } from '@modules/customers/utils/customer-normalizer.util';
import { readFineEventDate } from './document-fine-extraction.rules';
import {
  buildDriverResolverHints,
  buildDriverResolverPrivateHints,
  isDriverUnassignedForFine,
  scoreDriverCandidates,
} from './driver-candidate-matching.util';
import {
  DRIVER_CANDIDATE_RESOLVER_DOCUMENT_TYPES,
  type DriverBookingPoolContext,
  type DriverCandidatePipelineState,
  type DriverCandidateResolverInput,
  type DriverCandidateSearchRecord,
  type DriverResolverPrivateHints,
} from './driver-candidate-resolver.types';

const DRIVER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  company: true,
  fullNameNormalized: true,
  licenseNumberNormalized: true,
} satisfies Prisma.CustomerSelect;

const BOOKING_MATCH_STATUSES = ['ACTIVE', 'COMPLETED', 'CONFIRMED'] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class DriverCandidateResolverService {
  constructor(private readonly prisma: PrismaService) {}

  supportsDocumentType(documentType: string): boolean {
    return (DRIVER_CANDIDATE_RESOLVER_DOCUMENT_TYPES as readonly string[]).includes(
      documentType,
    );
  }

  async resolve(input: DriverCandidateResolverInput): Promise<DriverCandidatePipelineState> {
    const privateHints = buildDriverResolverPrivateHints(input);
    const bookingPool = input.linkedBookingId
      ? await this.loadBookingPoolContext({
          organizationId: input.organizationId,
          linkedBookingId: input.linkedBookingId,
          resolvedVehicleId: input.resolvedVehicleId ?? null,
          documentType: input.documentType,
          extractedData: input.extractedData,
        })
      : null;

    const hints = buildDriverResolverHints(
      privateHints,
      input.linkedBookingId,
      bookingPool?.tripDriverId ?? null,
    );

    const drivers = await this.loadDriversForHints({
      organizationId: input.organizationId,
      privateHints,
      bookingPool,
    });

    const candidates = scoreDriverCandidates({
      drivers,
      privateHints,
      bookingPool,
    });

    const ambiguousDriverPool = Boolean(
      bookingPool && bookingPool.allowedDriverIds.length > 1,
    );
    const unassignedDriver = isDriverUnassignedForFine({
      documentType: input.documentType,
      candidates,
      ambiguousDriverPool,
    });

    return {
      evaluatedAt: new Date().toISOString(),
      hints,
      candidates,
      ambiguousDriverPool,
      unassignedDriver,
      autoConfirmEligible: false,
    };
  }

  private async loadBookingPoolContext(input: {
    organizationId: string;
    linkedBookingId: string;
    resolvedVehicleId: string | null;
    documentType: string;
    extractedData: Record<string, unknown>;
  }): Promise<DriverBookingPoolContext | null> {
    const booking = await this.prisma.booking.findFirst({
      where: {
        id: input.linkedBookingId,
        organizationId: input.organizationId,
        status: { in: [...BOOKING_MATCH_STATUSES] },
      },
      select: {
        id: true,
        customerId: true,
        assignedDriverId: true,
        allowedDrivers: {
          select: {
            customerId: true,
            role: true,
          },
        },
      },
    });

    if (!booking) return null;

    const pool = resolveBookingDriverPool({
      bookingCustomerId: booking.customerId,
      assignedDriverId: booking.assignedDriverId,
      allowedRows: booking.allowedDrivers,
    });

    const tripDriverId = await this.resolveTripDriverId({
      organizationId: input.organizationId,
      bookingId: booking.id,
      vehicleId: input.resolvedVehicleId,
      documentType: input.documentType,
      extractedData: input.extractedData,
    });

    return {
      bookingId: booking.id,
      bookingCustomerId: pool.bookingCustomerId,
      primaryDriverId: pool.primaryDriverId,
      additionalDriverIds: pool.additionalDriverIds,
      allowedDriverIds: pool.allowedDriverIds,
      tripDriverId,
    };
  }

  private async resolveTripDriverId(input: {
    organizationId: string;
    bookingId: string;
    vehicleId: string | null;
    documentType: string;
    extractedData: Record<string, unknown>;
  }): Promise<string | null> {
    const eventDateRaw =
      input.documentType === 'FINE'
        ? readFineEventDate(input.extractedData)
        : typeof input.extractedData.eventDate === 'string'
          ? input.extractedData.eventDate
          : null;

    const where: Prisma.VehicleTripWhereInput = {
      assignedBookingId: input.bookingId,
      vehicle: { organizationId: input.organizationId },
    };
    if (input.vehicleId) {
      where.vehicleId = input.vehicleId;
    }

    if (eventDateRaw) {
      const eventDate = new Date(eventDateRaw);
      if (!Number.isNaN(eventDate.getTime())) {
        const windowStart = new Date(eventDate);
        const windowEnd = new Date(eventDate);
        windowStart.setUTCHours(0, 0, 0, 0);
        windowEnd.setUTCHours(23, 59, 59, 999);
        where.startTime = { lte: windowEnd };
        where.OR = [{ endTime: null }, { endTime: { gte: windowStart } }];
      }
    }

    const trip = await this.prisma.vehicleTrip.findFirst({
      where,
      orderBy: { startTime: 'desc' },
      select: {
        actualDriverId: true,
        assignedDriverId: true,
      },
    });

    return trip?.actualDriverId ?? trip?.assignedDriverId ?? null;
  }

  private async loadDriversForHints(input: {
    organizationId: string;
    privateHints: DriverResolverPrivateHints;
    bookingPool: DriverBookingPoolContext | null;
  }): Promise<DriverCandidateSearchRecord[]> {
    const { organizationId, privateHints, bookingPool } = input;
    const whereOr: Prisma.CustomerWhereInput[] = [];

    if (privateHints.documentContextDriverId) {
      whereOr.push({ id: privateHints.documentContextDriverId });
    }
    if (privateHints.driverId) {
      whereOr.push({ id: privateHints.driverId });
    }

    const license = privateHints.licenseNumber
      ? normalizeLicenseNumber(privateHints.licenseNumber)
      : null;
    if (license) {
      whereOr.push({ licenseNumberNormalized: license });
    }

    if (privateHints.driverName) {
      const normalizedName = privateHints.driverName.trim().toLowerCase().replace(/\s+/g, ' ');
      whereOr.push({ fullNameNormalized: normalizedName });
    }

    if (bookingPool) {
      for (const driverId of bookingPool.allowedDriverIds) {
        whereOr.push({ id: driverId });
      }
      if (bookingPool.tripDriverId) {
        whereOr.push({ id: bookingPool.tripDriverId });
      }
    }

    if (whereOr.length === 0) {
      return [];
    }

    const rows = await this.prisma.customer.findMany({
      where: {
        organizationId,
        archivedAt: null,
        status: 'ACTIVE',
        OR: whereOr,
      },
      select: DRIVER_SELECT,
      take: 25,
    });

    const byId = new Map(rows.map((row) => [row.id, row]));
    return [...byId.values()];
  }
}
