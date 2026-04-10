import { Injectable } from '@nestjs/common';
import { Customer, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, data: Omit<Prisma.CustomerCreateInput, 'organization'>): Promise<Customer> {
    return this.prisma.customer.create({
      data: { ...data, organization: { connect: { id: orgId } } },
    });
  }

  async findAll(orgId: string, params?: PaginationParams) {
    const { skip, take } = parsePagination(params || {});
    const where = { organizationId: orgId };
    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { bookings: true } } },
      }),
      this.prisma.customer.count({ where }),
    ]);

    const mapped = data.map((c) => ({
      ...c,
      bookingCount: c._count.bookings,
      _count: undefined,
    }));

    return buildPaginatedResult(mapped, total, params || {});
  }

  async findById(orgId: string, id: string) {
    return this.prisma.customer.findFirst({
      where: { id, organizationId: orgId },
      include: {
        bookings: {
          orderBy: { startDate: 'desc' },
          include: { vehicle: true },
        },
      },
    });
  }

  async update(
    orgId: string,
    id: string,
    data: Prisma.CustomerUpdateInput,
  ): Promise<Customer> {
    await this.prisma.customer.findFirstOrThrow({
      where: { id, organizationId: orgId },
    });
    return this.prisma.customer.update({ where: { id }, data });
  }

  async softDelete(orgId: string, id: string): Promise<Customer> {
    await this.prisma.customer.findFirstOrThrow({
      where: { id, organizationId: orgId },
    });
    return this.prisma.customer.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
  }

  async getCustomerStats(orgId: string) {
    const [total, active, inactive] = await Promise.all([
      this.prisma.customer.count({ where: { organizationId: orgId } }),
      this.prisma.customer.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
      this.prisma.customer.count({ where: { organizationId: orgId, status: 'INACTIVE' } }),
    ]);
    return { total, active, inactive };
  }
}
