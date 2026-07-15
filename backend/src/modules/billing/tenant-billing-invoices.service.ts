import { Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildPaginatedResult, PaginatedResult } from '@shared/utils/pagination';
import { isAllowedBillingPdfUrl } from './email/billing-email.util';
import { TenantBillingErrorCode, tenantBillingError } from './domain/tenant-billing.errors';
import {
  TenantInvoiceDetailDto,
  TenantInvoiceListItemDto,
  TenantInvoiceQueryDto,
  TenantInvoiceUrlDto,
} from './dto/tenant-billing-invoices.dto';
import { parseTenantBillingListQuery } from './tenant-billing-list-query.util';
import {
  requireTenantMoney,
  resolveInvoiceDisplayLabel,
  resolveInvoiceNumberLabel,
  resolveInvoiceStatusLabel,
  toTenantMoney,
} from './tenant-billing.mapper';

type InvoiceRow = Prisma.BillingInvoiceGetPayload<{
  include: { lines: true; subscription: { select: { organizationId: true } } };
}>;

@Injectable()
export class TenantBillingInvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async listInvoices(
    organizationId: string,
    query: TenantInvoiceQueryDto = {},
  ): Promise<PaginatedResult<TenantInvoiceListItemDto>> {
    const subscriptionIds = await this.resolveSubscriptionIds(organizationId);
    const parsed = parseTenantBillingListQuery(query, {
      defaultSortField: 'invoiceDate',
      defaultSortOrder: 'desc',
      allowedSortFields: TenantInvoiceQueryDto.ALLOWED_SORT_FIELDS,
    });

    if (subscriptionIds.length === 0) {
      return buildPaginatedResult([], 0, { page: parsed.page, limit: parsed.limit });
    }

    const where = this.buildInvoiceWhere(subscriptionIds, query, parsed);

    const [rows, total] = await Promise.all([
      this.prisma.billingInvoice.findMany({
        where,
        skip: parsed.skip,
        take: parsed.take,
        orderBy: this.buildInvoiceOrderBy(parsed),
        include: {
          lines: true,
          subscription: { select: { organizationId: true } },
        },
      }),
      this.prisma.billingInvoice.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => this.mapListItem(row)),
      total,
      { page: parsed.page, limit: parsed.limit },
    );
  }

  async getInvoiceDetail(
    organizationId: string,
    invoiceId: string,
  ): Promise<TenantInvoiceDetailDto> {
    const invoice = await this.requireOrganizationInvoice(organizationId, invoiceId);
    return this.mapDetail(invoice);
  }

  async getHostedInvoiceUrl(
    organizationId: string,
    invoiceId: string,
  ): Promise<TenantInvoiceUrlDto> {
    const invoice = await this.requireOrganizationInvoice(organizationId, invoiceId);
    const url = invoice.hostedInvoiceUrl?.trim();
    if (!url || !isAllowedBillingPdfUrl(url)) {
      throw new NotFoundException(
        tenantBillingError(
          TenantBillingErrorCode.INVOICE_NOT_FOUND,
          'Hosted-Rechnung ist für diese Rechnung nicht verfügbar.',
        ),
      );
    }
    return { url };
  }

  async getInvoicePdfUrl(
    organizationId: string,
    invoiceId: string,
  ): Promise<TenantInvoiceUrlDto> {
    const invoice = await this.requireOrganizationInvoice(organizationId, invoiceId);
    const url = invoice.invoicePdfUrl?.trim();
    if (!url || !isAllowedBillingPdfUrl(url)) {
      throw new NotFoundException(
        tenantBillingError(
          TenantBillingErrorCode.INVOICE_PDF_UNAVAILABLE,
          'PDF ist für diese Rechnung nicht verfügbar.',
        ),
      );
    }
    return { url };
  }

  private async requireOrganizationInvoice(
    organizationId: string,
    invoiceId: string,
  ): Promise<InvoiceRow> {
    const invoice = await this.prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: true,
        subscription: { select: { organizationId: true } },
      },
    });

    if (!invoice || invoice.subscription.organizationId !== organizationId) {
      throw new NotFoundException(tenantBillingError(TenantBillingErrorCode.INVOICE_NOT_FOUND));
    }

    return invoice;
  }

  private async resolveSubscriptionIds(organizationId: string): Promise<string[]> {
    const subscriptions = await this.prisma.billingSubscription.findMany({
      where: { organizationId },
      select: { id: true },
    });
    return subscriptions.map((row) => row.id);
  }

  private buildInvoiceWhere(
    subscriptionIds: string[],
    query: TenantInvoiceQueryDto,
    parsed: ReturnType<typeof parseTenantBillingListQuery>,
  ): Prisma.BillingInvoiceWhereInput {
    const where: Prisma.BillingInvoiceWhereInput = {
      subscriptionId: { in: subscriptionIds },
    };

    if (query.status === 'OVERDUE') {
      where.status = InvoiceStatus.OPEN;
      where.dueDate = { lt: new Date() };
    } else if (query.status) {
      where.status = query.status as InvoiceStatus;
    }

    if (parsed.from || parsed.to) {
      where.invoiceDate = {};
      if (parsed.from) {
        where.invoiceDate.gte = parsed.from;
      }
      if (parsed.to) {
        where.invoiceDate.lte = parsed.to;
      }
    }

    if (parsed.search) {
      where.invoiceNumber = { contains: parsed.search, mode: 'insensitive' };
    }

    return where;
  }

  private buildInvoiceOrderBy(
    parsed: ReturnType<typeof parseTenantBillingListQuery>,
  ): Prisma.BillingInvoiceOrderByWithRelationInput[] {
    const dir = parsed.sortOrder;
    const stableId: Prisma.BillingInvoiceOrderByWithRelationInput = { id: dir };

    switch (parsed.sortField) {
      case 'dueDate':
        return [{ dueDate: { sort: dir, nulls: 'last' } }, stableId];
      case 'amount':
        return [{ amountCents: dir }, stableId];
      case 'status':
        return [{ status: dir }, stableId];
      case 'invoiceNumber':
        return [{ invoiceNumber: { sort: dir, nulls: 'last' } }, stableId];
      case 'invoiceDate':
      default:
        return [{ invoiceDate: dir }, stableId];
    }
  }

  private mapListItem(invoice: InvoiceRow): TenantInvoiceListItemDto {
    const currency = invoice.currency.toUpperCase();
    const netCents = invoice.netAmountCents ?? this.sumLineNet(invoice);
    const taxCents = invoice.taxAmountCents ?? this.sumLineTax(invoice);

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceNumberLabel: resolveInvoiceNumberLabel(invoice.invoiceNumber),
      invoiceDate: invoice.invoiceDate.toISOString(),
      periodStart: invoice.periodStart?.toISOString() ?? null,
      periodEnd: invoice.periodEnd?.toISOString() ?? null,
      status: invoice.status,
      statusLabel: resolveInvoiceDisplayLabel(invoice.status, invoice.dueDate),
      netAmount: requireTenantMoney(netCents, currency),
      taxAmount: toTenantMoney(taxCents, currency),
      grossAmount: requireTenantMoney(invoice.amountCents, currency),
      amountDue: toTenantMoney(invoice.amountDueCents, currency),
      amountRemaining: toTenantMoney(invoice.amountRemainingCents, currency),
      dueDate: invoice.dueDate?.toISOString() ?? null,
      paidAt: invoice.paidAt?.toISOString() ?? null,
      hasHostedInvoice: this.hasVerifiedUrl(invoice.hostedInvoiceUrl),
      hasPdf: this.hasVerifiedUrl(invoice.invoicePdfUrl),
    };
  }

  private mapDetail(invoice: InvoiceRow): TenantInvoiceDetailDto {
    const list = this.mapListItem(invoice);
    const currency = invoice.currency.toUpperCase();

    return {
      ...list,
      statusLabel: resolveInvoiceDisplayLabel(invoice.status, invoice.dueDate),
      amountPaid: toTenantMoney(invoice.amountPaidCents, currency),
      voidedAt: invoice.voidedAt?.toISOString() ?? null,
      lines: invoice.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitAmount: toTenantMoney(line.unitAmountCents, currency),
        netAmount: requireTenantMoney(line.netCents ?? line.subtotalCents, currency),
        taxAmount: toTenantMoney(line.taxCents, currency),
        grossAmount: requireTenantMoney(line.totalCents, currency),
        periodStart: line.periodStart?.toISOString() ?? null,
        periodEnd: line.periodEnd?.toISOString() ?? null,
      })),
    };
  }

  private sumLineNet(invoice: InvoiceRow): number {
    return invoice.lines.reduce(
      (sum, line) => sum + (line.netCents ?? line.subtotalCents),
      0,
    );
  }

  private sumLineTax(invoice: InvoiceRow): number {
    return invoice.lines.reduce((sum, line) => sum + (line.taxCents ?? 0), 0);
  }

  private hasVerifiedUrl(url: string | null | undefined): boolean {
    return Boolean(url?.trim() && isAllowedBillingPdfUrl(url));
  }
}
