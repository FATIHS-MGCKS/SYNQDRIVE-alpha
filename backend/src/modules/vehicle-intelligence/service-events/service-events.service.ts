import { Injectable } from '@nestjs/common';
import { VehicleServiceEvent, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';

@Injectable()
export class ServiceEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByVehicle(
    vehicleId: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<VehicleServiceEvent>> {
    const { skip, take } = parsePagination(params || {});
    const where = { vehicleId };
    const [data, total] = await Promise.all([
      this.prisma.vehicleServiceEvent.findMany({
        where,
        skip,
        take,
        orderBy: { eventDate: 'desc' },
      }),
      this.prisma.vehicleServiceEvent.count({ where }),
    ]);
    return buildPaginatedResult(data, total, params || {});
  }

  async create(
    vehicleId: string,
    data: Omit<Prisma.VehicleServiceEventCreateInput, 'vehicle'>,
  ): Promise<VehicleServiceEvent> {
    return this.prisma.vehicleServiceEvent.create({
      data: { ...data, vehicle: { connect: { id: vehicleId } } },
    });
  }

  async update(
    id: string,
    data: Prisma.VehicleServiceEventUpdateInput,
  ): Promise<VehicleServiceEvent> {
    return this.prisma.vehicleServiceEvent.update({ where: { id }, data });
  }
}
