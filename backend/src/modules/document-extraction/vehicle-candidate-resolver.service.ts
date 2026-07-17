import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  applyGlobalBlockerToCandidates,
  buildVehicleResolverHints,
  detectVinPlateSignalBlocker,
  scoreVehicleCandidates,
} from './vehicle-candidate-matching.util';
import type {
  VehicleCandidatePipelineState,
  VehicleCandidateResolverInput,
  VehicleCandidateSearchRecord,
} from './vehicle-candidate-resolver.types';

const VEHICLE_SELECT = {
  id: true,
  licensePlate: true,
  vin: true,
  make: true,
  model: true,
  vehicleName: true,
} satisfies Prisma.VehicleSelect;

@Injectable()
export class VehicleCandidateResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(input: VehicleCandidateResolverInput): Promise<VehicleCandidatePipelineState> {
    const hints = buildVehicleResolverHints(input);
    const bookingVehicleId =
      input.bookingVehicleId ??
      (await this.resolveBookingVehicleId(input.organizationId, hints.bookingReference));

    const vehicles = await this.loadVehiclesForHints({
      organizationId: input.organizationId,
      hints,
      bookingVehicleId,
      uploadContextVehicleId: input.uploadContextVehicleId ?? hints.documentContextVehicleId ?? null,
    });

    const globalBlocker = detectVinPlateSignalBlocker({ hints, vehicles });
    let candidates = scoreVehicleCandidates({
      vehicles,
      hints,
      bookingVehicleId,
    });

    if (globalBlocker.blockerPresent) {
      candidates = applyGlobalBlockerToCandidates(candidates, globalBlocker.conflicts);
    }

    return {
      evaluatedAt: new Date().toISOString(),
      hints,
      candidates,
      blockerPresent: globalBlocker.blockerPresent,
      autoConfirmEligible: false,
    };
  }

  private async resolveBookingVehicleId(
    organizationId: string,
    bookingReference?: string | null,
  ): Promise<string | null> {
    const bookingId = bookingReference?.trim();
    if (!bookingId) return null;
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: { vehicleId: true },
    });
    return booking?.vehicleId ?? null;
  }

  private async loadVehiclesForHints(input: {
    organizationId: string;
    hints: ReturnType<typeof buildVehicleResolverHints>;
    bookingVehicleId: string | null;
    uploadContextVehicleId: string | null;
  }): Promise<VehicleCandidateSearchRecord[]> {
    const { organizationId, hints, bookingVehicleId, uploadContextVehicleId } = input;
    const whereOr: Prisma.VehicleWhereInput[] = [];

    if (uploadContextVehicleId) {
      whereOr.push({ id: uploadContextVehicleId });
    }
    if (bookingVehicleId) {
      whereOr.push({ id: bookingVehicleId });
    }
    if (hints.licensePlate) {
      const compact = hints.licensePlate.replace(/[\s\-._/]+/g, '');
      whereOr.push({
        licensePlate: { contains: compact.slice(0, 12), mode: 'insensitive' },
      });
    }
    if (hints.fleetNumber) {
      whereOr.push({
        vehicleName: { equals: hints.fleetNumber, mode: 'insensitive' },
      });
    }
    if (hints.make && hints.model) {
      whereOr.push({
        AND: [
          { make: { equals: hints.make, mode: 'insensitive' } },
          { model: { equals: hints.model, mode: 'insensitive' } },
        ],
      });
    }
    if (hints.vin) {
      const compactVin = hints.vin.replace(/[\s\-._/]+/g, '');
      whereOr.push({ vin: { equals: hints.vin, mode: 'insensitive' } });
      if (compactVin && compactVin !== hints.vin) {
        whereOr.push({ vin: { equals: compactVin, mode: 'insensitive' } });
      }
    }

    if (whereOr.length === 0) {
      return [];
    }

    const rows = await this.prisma.vehicle.findMany({
      where: {
        organizationId,
        OR: whereOr,
      },
      select: VEHICLE_SELECT,
    });

    return rows;
  }
}
