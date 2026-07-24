import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { AiAllowedVehicleScope } from '../execution/ai-execution-context.types';
import { resolveAiVehicleFromMessage } from './ai-vehicle-resolution.matcher';
import type {
  AiVehicleResolutionRecord,
  AiVehicleResolutionResult,
} from './ai-vehicle-resolution.types';

@Injectable()
export class AiVehicleResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async loadOrganizationFleet(organizationId: string): Promise<AiVehicleResolutionRecord[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId },
      select: {
        id: true,
        organizationId: true,
        licensePlate: true,
        vehicleName: true,
        make: true,
        model: true,
        year: true,
        vin: true,
        fuelType: true,
        status: true,
        currentStationId: true,
        dimoVehicle: { select: { tokenId: true } },
      },
    });

    return vehicles.map((vehicle) => ({
      vehicleId: vehicle.id,
      organizationId: vehicle.organizationId,
      licensePlate: vehicle.licensePlate,
      vehicleName: vehicle.vehicleName,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      vin: vehicle.vin,
      fuelType: vehicle.fuelType,
      status: vehicle.status,
      currentStationId: vehicle.currentStationId,
      tokenId: vehicle.dimoVehicle?.tokenId ?? null,
    }));
  }

  async resolveBookingVehicleId(
    organizationId: string,
    bookingId?: string | null,
  ): Promise<string | null> {
    if (!bookingId?.trim()) {
      return null;
    }

    const booking = await this.prisma.booking.findFirst({
      where: {
        id: bookingId.trim(),
        organizationId,
      },
      select: { vehicleId: true },
    });

    return booking?.vehicleId ?? null;
  }

  async resolveFromMessage(input: {
    organizationId: string;
    message: string;
    allowedVehicleScope?: AiAllowedVehicleScope;
    bookingId?: string | null;
    fleet?: readonly AiVehicleResolutionRecord[];
  }): Promise<{
    fleet: readonly AiVehicleResolutionRecord[];
    resolution: AiVehicleResolutionResult;
  }> {
    const fleet = input.fleet ?? (await this.loadOrganizationFleet(input.organizationId));
    const bookingVehicleId = await this.resolveBookingVehicleId(
      input.organizationId,
      input.bookingId,
    );

    const resolution = resolveAiVehicleFromMessage({
      organizationId: input.organizationId,
      message: input.message,
      fleet,
      allowedVehicleScope: input.allowedVehicleScope,
      bookingId: input.bookingId,
      bookingVehicleId,
    });

    return { fleet, resolution };
  }
}
