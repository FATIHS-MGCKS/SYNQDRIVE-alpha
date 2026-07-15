import { Injectable } from '@nestjs/common';
import { BillingQuantityEventType, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildPaginatedResult, PaginatedResult } from '@shared/utils/pagination';
import { buildProrationAmountCents } from './domain/proration-calculator';
import { TenantVehicleBillingChangeDto } from './dto/tenant-billing-tariff.dto';
import { TenantVehicleLicenseQueryDto } from './dto/tenant-billing-history.dto';
import { SubscriptionPricePreviewService } from './subscription-price-preview.service';
import { SubscriptionResolverService } from './resolvers';
import { parseTenantBillingListQuery } from './tenant-billing-list-query.util';
import {
  resolveVehicleLicenseChangeType,
  resolveVehicleLicenseEventLabel,
  toTenantMoney,
} from './tenant-billing.mapper';

const VEHICLE_CHANGE_EVENT_TYPES: BillingQuantityEventType[] = [
  BillingQuantityEventType.VEHICLE_CONNECTED,
  BillingQuantityEventType.VEHICLE_DISCONNECTED,
  BillingQuantityEventType.VEHICLE_EXCLUDED,
  BillingQuantityEventType.VEHICLE_INCLUDED,
];

@Injectable()
export class TenantVehicleBillingChangesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricePreview: SubscriptionPricePreviewService,
    private readonly subscriptionResolver: SubscriptionResolverService,
  ) {}

  async listChanges(
    organizationId: string,
    query: TenantVehicleLicenseQueryDto = {},
  ): Promise<PaginatedResult<TenantVehicleBillingChangeDto>> {
    const parsed = parseTenantBillingListQuery(query, {
      defaultSortField: 'effectiveAt',
      defaultSortOrder: 'desc',
      allowedSortFields: TenantVehicleLicenseQueryDto.ALLOWED_SORT_FIELDS,
    });

    const where: Prisma.BillingQuantityEventWhereInput = {
      organizationId,
      eventType: { in: VEHICLE_CHANGE_EVENT_TYPES },
    };

    if (parsed.from || parsed.to) {
      where.effectiveAt = {};
      if (parsed.from) where.effectiveAt.gte = parsed.from;
      if (parsed.to) where.effectiveAt.lte = parsed.to;
    }

    if (parsed.search) {
      where.OR = [
        { reason: { contains: parsed.search, mode: 'insensitive' } },
        { vehicle: { licensePlate: { contains: parsed.search, mode: 'insensitive' } } },
        { vehicle: { make: { contains: parsed.search, mode: 'insensitive' } } },
        { vehicle: { model: { contains: parsed.search, mode: 'insensitive' } } },
      ];
    }

    const orderBy: Prisma.BillingQuantityEventOrderByWithRelationInput[] =
      parsed.sortField === 'licensePlate'
        ? [{ vehicle: { licensePlate: { sort: parsed.sortOrder, nulls: 'last' } } }, { id: parsed.sortOrder }]
        : [{ effectiveAt: parsed.sortOrder }, { id: parsed.sortOrder }];

    const [rows, total, preview, contract] = await Promise.all([
      this.prisma.billingQuantityEvent.findMany({
        where,
        skip: parsed.skip,
        take: parsed.take,
        orderBy,
        include: {
          vehicle: {
            select: { licensePlate: true, make: true, model: true },
          },
        },
      }),
      this.prisma.billingQuantityEvent.count({ where }),
      this.pricePreview.preview(organizationId).catch(() => null),
      this.subscriptionResolver.resolveContract(organizationId).catch(() => null),
    ]);

    const periodStart = contract?.currentPeriod.start ?? null;
    const periodEnd = contract?.currentPeriod.end ?? null;
    const unitPriceCents = preview?.unitPriceCents ?? null;
    const currency = preview?.currency ?? 'EUR';

    const data = rows.map((row) => {
      const vehicleLabel =
        row.vehicle != null
          ? [row.vehicle.make, row.vehicle.model].filter(Boolean).join(' ') || null
          : null;
      const changeType = resolveVehicleLicenseChangeType(row.eventType, row.delta);
      const effectiveAt = row.effectiveAt;
      const prorationCents =
        periodStart && periodEnd && unitPriceCents != null
          ? estimateChangeProrationCents(
              changeType,
              effectiveAt,
              periodStart,
              periodEnd,
              unitPriceCents,
            )
          : null;

      return {
        id: row.id,
        licensePlate: row.vehicle?.licensePlate ?? null,
        vehicleLabel,
        changeType,
        eventTypeLabel: resolveVehicleLicenseEventLabel(row.eventType),
        effectiveAt: effectiveAt.toISOString(),
        prorationAmount:
          prorationCents != null ? toTenantMoney(prorationCents, currency) : null,
        reason: row.reason,
      } satisfies TenantVehicleBillingChangeDto;
    });

    return buildPaginatedResult(data, total, {
      page: parsed.page,
      limit: parsed.limit,
    });
  }
}

function estimateChangeProrationCents(
  changeType: 'ADDED' | 'REMOVED' | 'CHANGED',
  effectiveAt: Date,
  periodStart: Date,
  periodEnd: Date,
  unitPriceCents: number,
): number | null {
  const periodMs = periodEnd.getTime() - periodStart.getTime();
  if (periodMs <= 0) return null;

  if (changeType === 'ADDED') {
    const activeFromMs = Math.max(effectiveAt.getTime(), periodStart.getTime());
    const activeMs = periodEnd.getTime() - activeFromMs;
    if (activeMs <= 0) return null;
    return buildProrationAmountCents(unitPriceCents, activeMs, periodMs);
  }

  if (changeType === 'REMOVED') {
    const activeUntilMs = Math.min(effectiveAt.getTime(), periodEnd.getTime());
    const activeMs = activeUntilMs - periodStart.getTime();
    if (activeMs <= 0) return null;
    return buildProrationAmountCents(unitPriceCents, activeMs, periodMs);
  }

  return null;
}

export const tenantVehicleBillingChangesInternals = {
  estimateChangeProrationCents,
};
