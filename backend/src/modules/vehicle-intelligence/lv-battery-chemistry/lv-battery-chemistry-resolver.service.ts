import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { buildLvBatteryChemistryResolverInput } from './lv-battery-chemistry-resolver.input';
import { resolveLvBatteryChemistry } from './lv-battery-chemistry-resolver';
import type { ResolvedLvBatteryChemistry } from './lv-battery-chemistry-resolver.types';

@Injectable()
export class LvBatteryChemistryResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForVehicle(vehicleId: string): Promise<ResolvedLvBatteryChemistry> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
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
      },
    });

    if (!vehicle) {
      return resolveLvBatteryChemistry({});
    }

    return resolveLvBatteryChemistry(
      buildLvBatteryChemistryResolverInput(vehicle),
    );
  }
}
