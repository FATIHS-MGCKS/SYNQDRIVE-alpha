import { Injectable } from '@nestjs/common';
import { BillingQuantityEventType, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildPaginatedResult, PaginatedResult } from '@shared/utils/pagination';
import {
  TenantVehicleLicenseListItemDto,
  TenantVehicleLicenseQueryDto,
} from './dto/tenant-billing-history.dto';
import { parseTenantBillingListQuery } from './tenant-billing-list-query.util';
import { resolveVehicleLicenseEventLabel } from './tenant-billing.mapper';

@Injectable()
export class TenantBillingVehicleLicensesService {
  constructor(private readonly prisma: PrismaService) {}

  async listVehicleLicenses(
    organizationId: string,
    query: TenantVehicleLicenseQueryDto = {},
  ): Promise<PaginatedResult<TenantVehicleLicenseListItemDto>> {
    const parsed = parseTenantBillingListQuery(query, {
      defaultSortField: 'effectiveAt',
      defaultSortOrder: 'desc',
      allowedSortFields: TenantVehicleLicenseQueryDto.ALLOWED_SORT_FIELDS,
    });

    const where = this.buildWhere(organizationId, parsed);
    const orderBy = this.buildOrderBy(parsed);

    const [rows, total] = await Promise.all([
      this.prisma.billingQuantityEvent.findMany({
        where,
        skip: parsed.skip,
        take: parsed.take,
        orderBy,
        include: {
          vehicle: {
            select: {
              licensePlate: true,
              make: true,
              model: true,
            },
          },
        },
      }),
      this.prisma.billingQuantityEvent.count({ where }),
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
  ): Prisma.BillingQuantityEventWhereInput {
    const where: Prisma.BillingQuantityEventWhereInput = { organizationId };

    if (parsed.status) {
      where.eventType = parsed.status as BillingQuantityEventType;
    }

    if (parsed.from || parsed.to) {
      where.effectiveAt = {};
      if (parsed.from) where.effectiveAt.gte = parsed.from;
      if (parsed.to) where.effectiveAt.lte = parsed.to;
    }

    if (parsed.search) {
      where.OR = [
        { reason: { contains: parsed.search, mode: 'insensitive' } },
        {
          vehicle: {
            licensePlate: { contains: parsed.search, mode: 'insensitive' },
          },
        },
        {
          vehicle: {
            make: { contains: parsed.search, mode: 'insensitive' },
          },
        },
        {
          vehicle: {
            model: { contains: parsed.search, mode: 'insensitive' },
          },
        },
      ];
    }

    return where;
  }

  private buildOrderBy(
    parsed: ReturnType<typeof parseTenantBillingListQuery>,
  ): Prisma.BillingQuantityEventOrderByWithRelationInput[] {
    const dir = parsed.sortOrder;
    const stableId: Prisma.BillingQuantityEventOrderByWithRelationInput = { id: dir };

    switch (parsed.sortField) {
      case 'eventType':
        return [{ eventType: dir }, stableId];
      case 'licensePlate':
        return [{ vehicle: { licensePlate: { sort: dir, nulls: 'last' } } }, stableId];
      case 'effectiveAt':
      default:
        return [{ effectiveAt: dir }, stableId];
    }
  }

  private mapRow(
    row: Prisma.BillingQuantityEventGetPayload<{
      include: { vehicle: { select: { licensePlate: true; make: true; model: true } } };
    }>,
  ): TenantVehicleLicenseListItemDto {
    const vehicleLabel =
      row.vehicle != null
        ? [row.vehicle.make, row.vehicle.model].filter(Boolean).join(' ') || null
        : null;

    return {
      id: row.id,
      licensePlate: row.vehicle?.licensePlate ?? null,
      vehicleLabel,
      eventType: row.eventType,
      eventTypeLabel: resolveVehicleLicenseEventLabel(row.eventType),
      billingStatusLabel: this.resolveBillingStatusLabel(row.eventType),
      effectiveAt: row.effectiveAt.toISOString(),
      reason: row.reason,
    };
  }

  private resolveBillingStatusLabel(eventType: BillingQuantityEventType): string {
    switch (eventType) {
      case BillingQuantityEventType.VEHICLE_CONNECTED:
      case BillingQuantityEventType.VEHICLE_INCLUDED:
        return 'Abrechenbar';
      case BillingQuantityEventType.VEHICLE_DISCONNECTED:
      case BillingQuantityEventType.VEHICLE_EXCLUDED:
        return 'Nicht abrechenbar';
      default:
        return 'Geändert';
    }
  }
}
