import { Injectable } from '@nestjs/common';
import {
  CustomerTimelineEvent,
  CustomerTimelineEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildPaginatedResult,
  parsePagination,
  PaginationParams,
} from '@shared/utils/pagination';

@Injectable()
export class CustomerTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async addEvent(
    orgId: string,
    customerId: string,
    type: CustomerTimelineEventType,
    title: string,
    metadata?: Prisma.InputJsonValue,
    userId?: string,
    description?: string,
  ): Promise<CustomerTimelineEvent> {
    return this.prisma.customerTimelineEvent.create({
      data: {
        organizationId: orgId,
        customerId,
        type,
        title,
        description,
        metadata: metadata ?? undefined,
        createdByUserId: userId ?? null,
      },
    });
  }

  async listEvents(
    orgId: string,
    customerId: string,
    params?: PaginationParams,
  ) {
    const { skip, take } = parsePagination(params || {});
    const where = { organizationId: orgId, customerId };
    const [data, total] = await Promise.all([
      this.prisma.customerTimelineEvent.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customerTimelineEvent.count({ where }),
    ]);
    return buildPaginatedResult(data, total, params || {});
  }
}
