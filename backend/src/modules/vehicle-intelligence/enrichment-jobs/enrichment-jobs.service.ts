import { BadRequestException, Injectable } from '@nestjs/common';
import { EnrichmentJobType, VehicleEnrichmentJob, Prisma } from '@prisma/client';
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
    if (data.jobType === EnrichmentJobType.BRAKE) {
      throw new BadRequestException(
        'BRAKE enrichment jobs are deprecated. Use the canonical brake initialization workflow (direct lifecycle on registration or controlled backfill).',
      );
    }
    return this.prisma.vehicleEnrichmentJob.create({
      data: { ...data, vehicle: { connect: { id: vehicleId } } },
    });
  }
}
