import { Injectable } from '@nestjs/common';
import { VehicleTireSetup } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TireWearModelService } from './tire-wear-model.service';

/**
 * Read-only tire setup listing + wear analysis passthrough.
 * All mutations go through {@link TireLifecycleService}.
 */
@Injectable()
export class TiresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wearModel: TireWearModelService,
  ) {}

  async findSetupsByVehicle(vehicleId: string): Promise<VehicleTireSetup[]> {
    return this.prisma.vehicleTireSetup.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      include: { measurements: { orderBy: { measuredAt: 'desc' } } },
    });
  }

  async getWearAnalysis(vehicleId: string) {
    return this.wearModel.computeWearAnalysis(vehicleId);
  }
}
