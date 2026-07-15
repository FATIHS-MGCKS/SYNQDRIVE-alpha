import { Injectable } from '@nestjs/common';
import { BillingPaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildPaginatedResult, PaginatedResult } from '@shared/utils/pagination';
import {
  TenantPaymentListItemDto,
  TenantPaymentListQueryDto,
} from './dto/tenant-billing-history.dto';
import { parseTenantBillingListQuery } from './tenant-billing-list-query.util';
import {
  requireTenantMoney,
  resolveInvoiceNumberLabel,
  resolvePaymentStatusLabel,
  resolveProviderLabel,
  toTenantMoney,
} from './tenant-billing.mapper';

@Injectable()
export class TenantBillingPaymentsListService {
  constructor(private readonly prisma: PrismaService) {}

  async listPayments(
    organizationId: string,
    query: TenantPaymentListQueryDto = {},
  ): Promise<PaginatedResult<TenantPaymentListItemDto>> {
    const parsed = parseTenantBillingListQuery(query, {
      defaultSortField: 'succeededAt',
      defaultSortOrder: 'desc',
      allowedSortFields: TenantPaymentListQueryDto.ALLOWED_SORT_FIELDS,
    });

    const where = this.buildWhere(organizationId, parsed);
    const orderBy = this.buildOrderBy(parsed);

    const [rows, total] = await Promise.all([
      this.prisma.billingPayment.findMany({
        where,
        skip: parsed.skip,
        take: parsed.take,
        orderBy,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              invoiceDate: true,
              currency: true,
            },
          },
        },
      }),
      this.prisma.billingPayment.count({ where }),
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
  ): Prisma.BillingPaymentWhereInput {
    const where: Prisma.BillingPaymentWhereInput = {
      invoice: {
        subscription: { organizationId },
      },
    };

    if (parsed.status) {
      where.status = parsed.status as BillingPaymentStatus;
    }

    const dateField = parsed.sortField === 'failedAt' ? 'failedAt' : 'succeededAt';
    if (parsed.from || parsed.to) {
      where[dateField] = {};
      if (parsed.from) where[dateField]!.gte = parsed.from;
      if (parsed.to) where[dateField]!.lte = parsed.to;
    }

    if (parsed.search) {
      where.invoice = {
        subscription: { organizationId },
        invoiceNumber: { contains: parsed.search, mode: 'insensitive' },
      };
    }

    return where;
  }

  private buildOrderBy(
    parsed: ReturnType<typeof parseTenantBillingListQuery>,
  ): Prisma.BillingPaymentOrderByWithRelationInput[] {
    const dir = parsed.sortOrder;
    const stableId: Prisma.BillingPaymentOrderByWithRelationInput = { id: dir };

    switch (parsed.sortField) {
      case 'failedAt':
        return [{ failedAt: { sort: dir, nulls: 'last' } }, stableId];
      case 'amount':
        return [{ amountCents: dir }, stableId];
      case 'status':
        return [{ status: dir }, stableId];
      case 'invoiceDate':
        return [{ invoice: { invoiceDate: dir } }, stableId];
      case 'succeededAt':
      default:
        return [{ succeededAt: { sort: dir, nulls: 'last' } }, stableId];
    }
  }

  private mapRow(
    row: Prisma.BillingPaymentGetPayload<{
      include: {
        invoice: { select: { id: true; invoiceNumber: true; invoiceDate: true; currency: true } };
      };
    }>,
  ): TenantPaymentListItemDto {
    const currency = row.currency.toUpperCase();
    return {
      id: row.id,
      invoiceId: row.invoice.id,
      invoiceNumberLabel: resolveInvoiceNumberLabel(row.invoice.invoiceNumber),
      amount: requireTenantMoney(row.amountCents, currency),
      status: row.status,
      statusLabel: resolvePaymentStatusLabel(row.status),
      providerLabel: resolveProviderLabel(row.provider),
      succeededAt: row.succeededAt?.toISOString() ?? null,
      failedAt: row.failedAt?.toISOString() ?? null,
      refundedAmount: toTenantMoney(row.refundedAmountCents, currency),
      remainingAmount: toTenantMoney(row.remainingAmountCents, currency),
    };
  }
}
