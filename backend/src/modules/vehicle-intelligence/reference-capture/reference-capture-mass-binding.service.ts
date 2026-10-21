import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { VehicleMassBinding } from './reference-capture.types';

@Injectable()
export class ReferenceCaptureMassBindingService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveMassBinding(
    organizationId: string,
    vehicleId: string,
  ): Promise<VehicleMassBinding> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        curbWeightKg: true,
        frontWeightDistributionPct: true,
        make: true,
        model: true,
      },
    });

    if (!vehicle) {
      return {
        baseVehicleMassKg: null,
        massSource: 'UNKNOWN',
        massConfidence: 'UNKNOWN',
        optionalSessionPayloadKg: null,
        effectiveMassKg: null,
        frontWeightDistributionPct: null,
        limitationNote: 'Vehicle not found — mass binding unavailable',
      };
    }

    const baseVehicleMassKg = vehicle.curbWeightKg ?? null;
    const hasManufacturerMass = baseVehicleMassKg != null && baseVehicleMassKg > 0;

    return {
      baseVehicleMassKg,
      massSource: hasManufacturerMass ? 'MANUFACTURER_CURB_WEIGHT' : 'UNKNOWN',
      massConfidence: hasManufacturerMass ? 'HIGH' : 'UNKNOWN',
      optionalSessionPayloadKg: null,
      effectiveMassKg: hasManufacturerMass ? baseVehicleMassKg : null,
      frontWeightDistributionPct: vehicle.frontWeightDistributionPct ?? null,
      limitationNote: hasManufacturerMass
        ? 'Using manufacturer curb weight from Vehicle.curbWeightKg; passenger/cargo mass not inferred at runtime'
        : 'No curbWeightKg on vehicle — brake energy physics requires manual mass binding before calibration',
    };
  }
}
