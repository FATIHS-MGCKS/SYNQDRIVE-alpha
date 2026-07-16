import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { deriveVehicleCapabilityProfile } from '../vehicle-capabilities';
import { VehicleDrivingCapabilityResolverService } from '../driving-capability/vehicle-driving-capability-resolver.service';
import { resolveDrivingDetectorCapabilities } from './driving-detector-capability.resolver';
import type { DrivingDetectorCapabilityResult } from './driving-detector-capability.types';

@Injectable()
export class DrivingDetectorCapabilityResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilityResolver: VehicleDrivingCapabilityResolverService,
  ) {}

  async resolveForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<DrivingDetectorCapabilityResult> {
    const [vehicle, snapshot] = await Promise.all([
      this.prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
        select: { hardwareType: true, fuelType: true },
      }),
      this.capabilityResolver.resolveForVehicle(organizationId, vehicleId),
    ]);

    const hardwareBaselineLabel = vehicle
      ? deriveVehicleCapabilityProfile({
          hardwareType: vehicle.hardwareType,
          fuelType: vehicle.fuelType,
        }).profileLabel
      : snapshot.hardwareBaselineLabel;

    return resolveDrivingDetectorCapabilities({
      hardwareType: vehicle?.hardwareType ?? null,
      fuelType: vehicle?.fuelType ?? null,
      hardwareBaselineLabel,
      capabilities: snapshot.capabilities,
    });
  }
}
