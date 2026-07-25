import { Injectable, NotFoundException } from '@nestjs/common';
import { VehicleBatterySpec, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class BatteryService {
  constructor(private readonly prisma: PrismaService) {}

  async findByVehicle(vehicleId: string): Promise<VehicleBatterySpec[]> {
    return this.prisma.vehicleBatterySpec.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    vehicleId: string,
    data: Omit<Prisma.VehicleBatterySpecCreateInput, 'vehicle'>,
  ): Promise<VehicleBatterySpec> {
    return this.prisma.vehicleBatterySpec.create({
      data: { ...data, vehicle: { connect: { id: vehicleId } } },
    });
  }

  async update(
    vehicleId: string,
    id: string,
    data: Prisma.VehicleBatterySpecUpdateInput,
  ): Promise<VehicleBatterySpec> {
    const existing = await this.prisma.vehicleBatterySpec.findFirst({
      where: { id, vehicleId },
    });
    if (!existing) {
      throw new NotFoundException(
        `Battery spec ${id} not found for vehicle ${vehicleId}`,
      );
    }
    return this.prisma.vehicleBatterySpec.update({ where: { id }, data });
  }
}
