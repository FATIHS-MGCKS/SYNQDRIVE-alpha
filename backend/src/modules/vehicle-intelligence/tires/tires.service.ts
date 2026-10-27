import { Injectable, Optional } from '@nestjs/common';
import { VehicleTireSetup } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TireHealthV3ReadService } from './tire-health-v3-read.service';
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
    @Optional() private readonly tireHealthV3Read?: TireHealthV3ReadService,
  ) {}

  async findSetupsByVehicle(vehicleId: string): Promise<VehicleTireSetup[]> {
    return this.prisma.vehicleTireSetup.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      include: { measurements: { orderBy: { measuredAt: 'desc' } } },
    });
  }

  async getWearAnalysis(vehicleId: string) {
    const analysis = await this.wearModel.computeWearAnalysis(vehicleId);
    if (!analysis || !this.tireHealthV3Read?.isCustomerReadEnabled()) {
      return analysis;
    }
    const setup = await this.prisma.vehicleTireSetup.findFirst({
      where: { vehicleId, status: 'ACTIVE' },
      select: { id: true },
    });
    const wearV3 = setup ? await this.tireHealthV3Read.computeCustomerRead(setup.id) : null;
    return {
      ...analysis,
      wearReadModel: this.tireHealthV3Read.isCustomerReadAuthoritative() ? 'v3' : 'v2',
      wearV3,
    };
  }
}
