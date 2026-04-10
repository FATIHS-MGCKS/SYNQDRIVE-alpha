import { Injectable } from '@nestjs/common';
import { VehicleBrakeReferenceSpec, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

@Injectable()
export class BrakesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByVehicle(vehicleId: string): Promise<VehicleBrakeReferenceSpec[]> {
    return this.prisma.vehicleBrakeReferenceSpec.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    vehicleId: string,
    data: Omit<Prisma.VehicleBrakeReferenceSpecCreateInput, 'vehicle'>,
  ): Promise<VehicleBrakeReferenceSpec> {
    return this.prisma.vehicleBrakeReferenceSpec.create({
      data: { ...data, vehicle: { connect: { id: vehicleId } } },
    });
  }

  async update(
    id: string,
    data: Prisma.VehicleBrakeReferenceSpecUpdateInput,
  ): Promise<VehicleBrakeReferenceSpec> {
    return this.prisma.vehicleBrakeReferenceSpec.update({ where: { id }, data });
  }
}
