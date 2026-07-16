import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BatteryChemistry,
  BatteryDriveProfile,
} from '../battery-health/battery-v2-domain';
import { buildDriveProfileResolverInput } from '../drive-profile/drive-profile-resolver.input';
import { resolveDriveProfile } from '../drive-profile/drive-profile-resolver';
import { resolveLvBatteryChemistry } from '../lv-battery-chemistry/lv-battery-chemistry-resolver';
import { buildLvBatteryChemistryResolverInput } from '../lv-battery-chemistry/lv-battery-chemistry-resolver.input';
import {
  resolveBatteryPolicy,
} from './battery-policy-profile.resolver';
import type { BatteryPolicyResolverInput, ResolvedBatteryPolicy } from './battery-policy-profile.types';

@Injectable()
export class BatteryPolicyProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForVehicle(
    vehicleId: string,
    context?: Pick<BatteryPolicyResolverInput, 'lvSignalPresent' | 'confirmedIceStart'>,
  ): Promise<ResolvedBatteryPolicy> {
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
        batterySpecs: {
          select: {
            batteryType: true,
            batteryVolt: true,
            sourceType: true,
            sourceConfidence: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
        },
        batteryEvidence: {
          where: { scope: 'LV' },
          select: {
            scope: true,
            sourceType: true,
            observedAt: true,
            metadataJson: true,
          },
          orderBy: { observedAt: 'desc' },
          take: 50,
        },
        latestState: {
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
        },
      },
    });

    if (!vehicle) {
      return resolveBatteryPolicy({
        driveProfile: BatteryDriveProfile.UNKNOWN,
        chemistry: BatteryChemistry.UNKNOWN,
      });
    }

    const drive = resolveDriveProfile(
      buildDriveProfileResolverInput({ ...vehicle, latestState: vehicle.latestState }),
    );
    const chemistry = resolveLvBatteryChemistry(
      buildLvBatteryChemistryResolverInput(vehicle),
    );

    const lvSignalPresent =
      context?.lvSignalPresent ??
      (vehicle.latestState?.lvBatteryVoltage != null &&
        Number.isFinite(vehicle.latestState.lvBatteryVoltage));

    return resolveBatteryPolicy({
      driveProfile: drive.profile,
      chemistry: chemistry.chemistry,
      lvSignalPresent,
      confirmedIceStart: context?.confirmedIceStart,
    });
  }
}
