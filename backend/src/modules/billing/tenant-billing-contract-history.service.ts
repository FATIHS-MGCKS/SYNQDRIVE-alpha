import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildPaginatedResult, PaginatedResult } from '@shared/utils/pagination';
import {
  TenantContractHistoryItemDto,
  TenantContractHistoryQueryDto,
} from './dto/tenant-billing-history.dto';
import { parseTenantBillingListQuery } from './tenant-billing-list-query.util';
import { resolveContractActionLabel } from './tenant-billing.mapper';

@Injectable()
export class TenantBillingContractHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listContractHistory(
    organizationId: string,
    query: TenantContractHistoryQueryDto = {},
  ): Promise<PaginatedResult<TenantContractHistoryItemDto>> {
    const parsed = parseTenantBillingListQuery(query, {
      defaultSortField: 'occurredAt',
      defaultSortOrder: 'desc',
      allowedSortFields: TenantContractHistoryQueryDto.ALLOWED_SORT_FIELDS,
    });

    const where = this.buildWhere(organizationId, parsed);

    const [rows, total] = await Promise.all([
      this.prisma.billingAuditLog.findMany({
        where,
        skip: parsed.skip,
        take: parsed.take,
        orderBy: [{ createdAt: parsed.sortOrder }, { id: parsed.sortOrder }],
      }),
      this.prisma.billingAuditLog.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => this.mapRow(row)),
      total,
      { page: parsed.page, limit: parsed.limit },
    );
  }

  private buildWhere(
    organizationId: string,
    parsed: ReturnType<typeof parseTenantBillingListQuery>,
  ): Prisma.BillingAuditLogWhereInput {
    const where: Prisma.BillingAuditLogWhereInput = {
      organizationId,
      entityType: { in: ['BillingSubscription', 'BillingSubscriptionItem'] },
    };

    if (parsed.status) {
      where.action = parsed.status;
    }

    if (parsed.from || parsed.to) {
      where.createdAt = {};
      if (parsed.from) where.createdAt.gte = parsed.from;
      if (parsed.to) where.createdAt.lte = parsed.to;
    }

    if (parsed.search) {
      where.OR = [
        { action: { contains: parsed.search, mode: 'insensitive' } },
        { entityType: { contains: parsed.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private mapRow(row: {
    id: string;
    action: string;
    createdAt: Date;
    afterJson: unknown;
    beforeJson: unknown;
  }): TenantContractHistoryItemDto {
    const after =
      row.afterJson && typeof row.afterJson === 'object'
        ? (row.afterJson as Record<string, unknown>)
        : null;
    const status =
      typeof after?.status === 'string'
        ? after.status
        : typeof after?.toStatus === 'string'
          ? after.toStatus
          : null;

    return {
      id: row.id,
      occurredAt: row.createdAt.toISOString(),
      actionLabel: resolveContractActionLabel(row.action),
      statusLabel: status,
      summary: this.buildSummary(row.action, after),
    };
  }

  private buildSummary(action: string, after: Record<string, unknown> | null): string {
    if (!after) {
      return resolveContractActionLabel(action);
    }
    if (typeof after.productKey === 'string') {
      return `${resolveContractActionLabel(action)} (${after.productKey})`;
    }
    if (typeof after.priceVersionId === 'string') {
      return `${resolveContractActionLabel(action)}`;
    }
    return resolveContractActionLabel(action);
  }
}
