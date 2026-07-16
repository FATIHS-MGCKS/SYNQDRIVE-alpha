import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { buildDriveProfileResolverInput } from './drive-profile-resolver.input';
import { resolveDriveProfile } from './drive-profile-resolver';
import type { ResolvedDriveProfile } from './drive-profile-resolver.types';

@Injectable()
export class DriveProfileResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForVehicle(vehicleId: string): Promise<ResolvedDriveProfile> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        fuelType: true,
        vin: true,
        hvBatteryCapacityKwh: true,
        tankCapacityLiters: true,
        dimoVehicle: {
          select: { vin: true, fuelType: true, powertrainType: true },
        },
      },
    });

    if (!vehicle) {
      return resolveDriveProfile({});
    }

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: {
        evSoc: true,
        tractionBatteryCurrentEnergyKwh: true,
        tractionBatteryIsCharging: true,
        tractionBatteryChargingPowerKw: true,
        lvBatteryVoltage: true,
        fuelLevelRelative: true,
        fuelLevelAbsolute: true,
        coolantTempC: true,
        engineLoad: true,
      },
    });

    return resolveDriveProfile(
      buildDriveProfileResolverInput({ ...vehicle, latestState }),
    );
  }
}
