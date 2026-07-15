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
    if (subscriptionIds.length === 0) {
      return buildPaginatedResult([], 0, this.paginationParams(query));
    }

    const where = this.buildInvoiceWhere(subscriptionIds, query);
    const pagination = this.paginationParams(query);

    const [rows, total] = await Promise.all([
      this.prisma.billingInvoice.findMany({
        where,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: { invoiceDate: 'desc' },
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
      pagination,
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
  ): Prisma.BillingInvoiceWhereInput {
    const where: Prisma.BillingInvoiceWhereInput = {
      subscriptionId: { in: subscriptionIds },
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.from || query.to) {
      where.invoiceDate = {};
      if (query.from) {
        where.invoiceDate.gte = new Date(query.from);
      }
      if (query.to) {
        where.invoiceDate.lte = new Date(query.to);
      }
    }

    const search = query.search?.trim();
    if (search) {
      where.invoiceNumber = { contains: search, mode: 'insensitive' };
    }

    return where;
  }

  private paginationParams(query: TenantInvoiceQueryDto) {
    return {
      page: query.page ?? 1,
      limit: query.pageSize ?? query.limit ?? 20,
    };
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
      statusLabel: resolveInvoiceStatusLabel(invoice.status),
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
