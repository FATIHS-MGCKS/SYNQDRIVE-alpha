import { Injectable, NotFoundException } from '@nestjs/common';
import { Prospect, Prisma, ProspectStatus, ProspectPriority, BusinessType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';

export interface ProspectFindAllParams extends PaginationParams {
  status?: ProspectStatus;
  priority?: ProspectPriority;
  businessType?: BusinessType;
}

@Injectable()
export class ProspectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.ProspectCreateInput): Promise<Prospect> {
    return this.prisma.prospect.create({ data });
  }

  async findAll(params?: ProspectFindAllParams): Promise<PaginatedResult<Prospect>> {
    const { status, priority, businessType, ...paginationParams } = params || {};
    const where: Prisma.ProspectWhereInput = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (businessType) where.businessType = businessType;

    const { skip, take } = parsePagination(paginationParams);
    const [data, total] = await Promise.all([
      this.prisma.prospect.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.prospect.count({ where }),
    ]);
    return buildPaginatedResult(data, total, paginationParams);
  }

  async findById(id: string): Promise<Prospect | null> {
    return this.prisma.prospect.findUnique({ where: { id } });
  }

  async update(id: string, data: Prisma.ProspectUpdateInput): Promise<Prospect> {
    return this.prisma.prospect.update({ where: { id }, data });
  }

  async delete(id: string): Promise<Prospect> {
    return this.prisma.prospect.delete({ where: { id } });
  }

  async import(data: Prisma.ProspectCreateInput[]): Promise<{ count: number }> {
    const result = await this.prisma.prospect.createMany({ data });
    return { count: result.count };
  }

  async convertToOrganization(prospectId: string): Promise<{ organizationId: string }> {
    const prospect = await this.prisma.prospect.findUniqueOrThrow({
      where: { id: prospectId },
    });
    if (prospect.status === 'CONVERTED') {
      throw new NotFoundException('Prospect already converted');
    }

    const organization = await this.prisma.organization.create({
      data: {
        companyName: prospect.companyName,
        businessType: prospect.businessType,
        email: prospect.email ?? undefined,
        phone: prospect.phone ?? undefined,
        city: prospect.city ?? undefined,
        country: prospect.country ?? undefined,
      },
    });

    await this.prisma.prospect.update({
      where: { id: prospectId },
      data: {
        status: 'CONVERTED' as ProspectStatus,
        convertedOrgId: organization.id,
      },
    });

    return { organizationId: organization.id };
  }
}
