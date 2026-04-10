import { Injectable } from '@nestjs/common';
import { VehicleEnrichmentJob, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';

@Injectable()
export class EnrichmentJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByVehicle(
    vehicleId: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<VehicleEnrichmentJob>> {
    const { skip, take } = parsePagination(params || {});
    const where = { vehicleId };
    const [data, total] = await Promise.all([
      this.prisma.vehicleEnrichmentJob.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vehicleEnrichmentJob.count({ where }),
    ]);
    return buildPaginatedResult(data, total, params || {});
  }

  async create(
    vehicleId: string,
    data: Omit<Prisma.VehicleEnrichmentJobCreateInput, 'vehicle'>,
  ): Promise<VehicleEnrichmentJob> {
    return this.prisma.vehicleEnrichmentJob.create({
      data: { ...data, vehicle: { connect: { id: vehicleId } } },
    });
  }
}
