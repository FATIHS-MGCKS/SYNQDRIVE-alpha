import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { AiVehicleOrgBinding, AiVehicleScopeResolver } from '../execution/ai-execution-context.types';

@Injectable()
export class AiPrismaVehicleScopeResolver implements AiVehicleScopeResolver {
  constructor(private readonly prisma: PrismaService) {}

  async findVehicleInOrganization(
    vehicleId: string,
    organizationId: string,
  ): Promise<AiVehicleOrgBinding | null> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        organizationId: true,
        currentStationId: true,
      },
    });

    if (!vehicle) {
      return null;
    }

    return {
      id: vehicle.id,
      organizationId: vehicle.organizationId,
      currentStationId: vehicle.currentStationId,
    };
  }
}
