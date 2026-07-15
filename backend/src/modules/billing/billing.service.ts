import { Injectable } from '@nestjs/common';
import {
  BillingSubscription,
  BillingInvoice,
  BillingStatus,
  InvoiceStatus,
  OrgProductPlan,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
} from '@shared/utils/pagination';
import { BillingUsageService } from './billing-usage.service';
import { PricebookService } from './pricebook.service';
import { BillingAuditService } from './billing-audit.service';
import { mapPrismaInvoiceToDisplayStatus } from './domain';

const PLAN_RANK: Record<string, number> = {
  STARTER: 0,
  BUSINESS: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
  CUSTOM: 4,
};

const PLAN_DISPLAY: Record<string, string> = {
  STARTER: 'Starter',
  BUSINESS: 'Business',
  PROFESSIONAL: 'Business',
  ENTERPRISE: 'Enterprise',
  CUSTOM: 'Custom',
};

const BILLING_STATUS_DISPLAY: Record<string, string> = {
  ACTIVE: 'Active',
  PAST_DUE: 'Past Due',
  CANCELLED: 'Cancelled',
  TRIALING: 'Trialing',
};

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usageService: BillingUsageService,
    private readonly pricebookService: PricebookService,
    private readonly audit: BillingAuditService,
  ) {}

  private mapInvoiceStatus(invoice: { status: InvoiceStatus; dueDate?: Date | null }): string {
    return mapPrismaInvoiceToDisplayStatus(invoice.status, {
      dueDate: invoice.dueDate ?? null,
    });
  }

  private computePlan(orgProducts: { plan: OrgProductPlan; status: string }[]): string {
    const activeProducts = orgProducts.filter(
      (p) => p.status === 'ACTIVE' || p.status === 'TRIAL',
    );
    if (activeProducts.length === 0) return 'Starter';

    let highest = activeProducts[0];
    for (const p of activeProducts) {
      if ((PLAN_RANK[p.plan] || 0) > (PLAN_RANK[highest.plan] || 0)) {
        highest = p;
      }
    }
    return PLAN_DISPLAY[highest.plan] || 'Starter';
  }

  private formatSubscription(
    sub: BillingSubscription & {
      invoices: BillingInvoice[];
      organization: { companyName: string; organizationProducts: { plan: OrgProductPlan; status: string }[] };
    },
  ) {
    const plan = this.computePlan(sub.organization.organizationProducts);
    const latestPaid = sub.invoices.find((i) => i.status === 'PAID');
    const mrr = latestPaid ? latestPaid.amountCents / 100 : 0;

    return {
      id: sub.id,
      organizationId: sub.organizationId,
      organizationName: sub.organization.companyName,
      plan,
      status: BILLING_STATUS_DISPLAY[sub.status] || sub.status,
      mrr,
      currentPeriodStart: sub.currentPeriodStart?.toISOString() || null,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() || null,
      billingModel: 'PER_CONNECTED_VEHICLE' as const,
      invoices: sub.invoices.map((inv) => ({
        id: inv.id,
        amount: inv.amountCents / 100,
        status: this.mapInvoiceStatus(inv),
        date: inv.invoiceDate.toISOString(),
        plan,
      })),
    };
  }

  async findSubscription(orgId: string) {
    const sub = await this.prisma.billingSubscription.findFirst({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        invoices: { take: 5, orderBy: { invoiceDate: 'desc' } },
        organization: {
          include: { organizationProducts: { select: { plan: true, status: true } } },
        },
      },
    });

    if (!sub) return null;
    const formatted = this.formatSubscription(sub);
    const usagePreview = await this.usageService.previewUsage(orgId);
    return {
      ...formatted,
      usagePreview,
      pricingConfigured: usagePreview.configured,
      pricingNotConfiguredReason: usagePreview.configured
        ? null
        : 'BILLING_PRICE_NOT_ASSIGNED',
      pricingErrorCode: usagePreview.priceVersionId ? null : 'BILLING_PRICE_NOT_ASSIGNED',
    };
  }

  async findAllSubscriptions(params?: PaginationParams) {
    const { skip, take } = parsePagination(params || {});
    const [subs, total] = await Promise.all([
      this.prisma.billingSubscription.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          invoices: { take: 5, orderBy: { invoiceDate: 'desc' } },
          organization: {
            include: { organizationProducts: { select: { plan: true, status: true } } },
          },
        },
      }),
      this.prisma.billingSubscription.count(),
    ]);

    const data = subs.map((sub) => this.formatSubscription(sub));
    return buildPaginatedResult(data, total, params || {});
  }

  async getRevenueStats() {
    const subs = await this.prisma.billingSubscription.findMany({
      include: {
        invoices: {
          take: 1,
          orderBy: { invoiceDate: 'desc' },
          where: { status: 'PAID' },
        },
      },
    });

    let totalMrr = 0;
    let activeCount = 0;
    let trialCount = 0;
    let pastDueCount = 0;

    for (const sub of subs) {
      if (sub.status === 'ACTIVE') activeCount++;
      if (sub.status === 'TRIALING') trialCount++;
      if (sub.status === 'PAST_DUE') pastDueCount++;

      const latestPaid = sub.invoices[0];
      if (latestPaid && (sub.status === 'ACTIVE' || sub.status === 'TRIALING')) {
        totalMrr += latestPaid.amountCents / 100;
      }
    }

    return { totalMrr, activeCount, trialCount, pastDueCount };
  }

  async findInvoices(orgId: string, params?: PaginationParams) {
    const subs = await this.prisma.billingSubscription.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    if (!subs.length) {
      return buildPaginatedResult([], 0, params || {});
    }
    const subscriptionIds = subs.map((s) => s.id);
    const { skip, take } = parsePagination(params || {});
    const [rows, total] = await Promise.all([
      this.prisma.billingInvoice.findMany({
        where: { subscriptionId: { in: subscriptionIds } },
        skip,
        take,
        orderBy: { invoiceDate: 'desc' },
        include: {
          lines: {
            include: {
              usageSnapshot: {
                select: {
                  id: true,
                  billableVehicleCount: true,
                  unitPriceCents: true,
                  calculationStatus: true,
                  periodStart: true,
                  periodEnd: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.billingInvoice.count({
        where: { subscriptionId: { in: subscriptionIds } },
      }),
    ]);

    const data = rows.map((inv) => this.formatInvoice(inv));
    return buildPaginatedResult(data, total, params || {});
  }

  formatInvoiceForApi(
    inv: BillingInvoice & {
      lines?: Array<{
        id: string;
        description: string;
        quantity: number;
        unitAmountCents: number | null;
        subtotalCents: number;
        taxRateBps: number | null;
        taxCents: number | null;
        totalCents: number;
        periodStart: Date | null;
        periodEnd: Date | null;
        usageSnapshot?: {
          id: string;
          billableVehicleCount: number;
          unitPriceCents: number | null;
          calculationStatus: string;
          periodStart: Date;
          periodEnd: Date;
        } | null;
      }>;
    },
  ) {
    return this.formatInvoice(inv);
  }

  private formatInvoice(
    inv: BillingInvoice & {
      invoiceNumber?: string | null;
      netAmountCents?: number | null;
      discountAmountCents?: number | null;
      taxAmountCents?: number | null;
      amountDueCents?: number | null;
      amountPaidCents?: number | null;
      amountRemainingCents?: number | null;
      periodStart?: Date | null;
      periodEnd?: Date | null;
      stripeCreatedAt?: Date | null;
      finalizedAt?: Date | null;
      voidedAt?: Date | null;
      hostedInvoiceUrl?: string | null;
      customerSnapshotJson?: unknown;
      companySnapshotJson?: unknown;
      billingAddressJson?: unknown;
      taxIdSnapshot?: string | null;
      lines?: Array<{
        id: string;
        description: string;
        quantity: number;
        unitAmountCents: number | null;
        discountCents?: number | null;
        subtotalCents: number;
        netCents?: number | null;
        taxRateBps: number | null;
        taxCents: number | null;
        totalCents: number;
        periodStart: Date | null;
        periodEnd: Date | null;
        productSnapshotJson?: unknown;
        priceSnapshotJson?: unknown;
        discountDetailsJson?: unknown;
        taxDetailsJson?: unknown;
        usageSnapshot?: {
          id: string;
          billableVehicleCount: number;
          unitPriceCents: number | null;
          calculationStatus: string;
          periodStart: Date;
          periodEnd: Date;
        } | null;
      }>;
    },
  ) {
    const linePeriodStart =
      inv.periodStart ?? inv.lines?.find((l) => l.periodStart)?.periodStart ?? null;
    const linePeriodEnd =
      inv.periodEnd ?? inv.lines?.find((l) => l.periodEnd)?.periodEnd ?? null;
    const netFromLines = inv.lines?.reduce((sum, l) => sum + (l.netCents ?? l.subtotalCents), 0) ?? null;
    const taxFromLines = inv.lines?.reduce((sum, l) => sum + (l.taxCents ?? 0), 0) ?? null;
    const discountFromLines =
      inv.lines?.reduce((sum, l) => sum + (l.discountCents ?? 0), 0) ?? null;

    return {
      id: inv.id,
      subscriptionId: inv.subscriptionId,
      stripeInvoiceId: inv.stripeInvoiceId,
      invoiceNumber: inv.invoiceNumber ?? null,
      invoiceNumberDisplay:
        inv.invoiceNumber?.trim() || 'Noch nicht finalisiert',
      amountCents: inv.amountCents,
      currency: inv.currency,
      status: inv.status,
      displayStatus: this.mapInvoiceStatus(inv),
      invoiceDate: inv.invoiceDate.toISOString(),
      stripeCreatedAt: inv.stripeCreatedAt?.toISOString() ?? inv.invoiceDate.toISOString(),
      finalizedAt: inv.finalizedAt?.toISOString() ?? null,
      dueDate: inv.dueDate?.toISOString() ?? null,
      paidAt: inv.paidAt?.toISOString() ?? null,
      voidedAt: inv.voidedAt?.toISOString() ?? null,
      hostedInvoiceUrl: inv.hostedInvoiceUrl ?? null,
      invoicePdfUrl: inv.invoicePdfUrl ?? null,
      periodStart: linePeriodStart?.toISOString() ?? null,
      periodEnd: linePeriodEnd?.toISOString() ?? null,
      netAmountCents: inv.netAmountCents ?? netFromLines ?? inv.amountCents,
      discountAmountCents: inv.discountAmountCents ?? discountFromLines ?? 0,
      taxAmountCents: inv.taxAmountCents ?? taxFromLines,
      grossAmountCents: inv.amountCents,
      amountDueCents: inv.amountDueCents ?? null,
      amountPaidCents: inv.amountPaidCents ?? null,
      amountRemainingCents: inv.amountRemainingCents ?? null,
      taxIdSnapshot: inv.taxIdSnapshot ?? null,
      customerSnapshot: inv.customerSnapshotJson ?? null,
      companySnapshot: inv.companySnapshotJson ?? null,
      billingAddress: inv.billingAddressJson ?? null,
      invoiceLines: (inv.lines ?? []).map((line) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity,
        unitAmountCents: line.unitAmountCents,
        discountCents: line.discountCents ?? 0,
        subtotalCents: line.subtotalCents,
        netCents: line.netCents ?? line.subtotalCents,
        taxRateBps: line.taxRateBps,
        taxCents: line.taxCents,
        totalCents: line.totalCents,
        periodStart: line.periodStart?.toISOString() ?? null,
        periodEnd: line.periodEnd?.toISOString() ?? null,
        productSnapshot: line.productSnapshotJson ?? null,
        priceSnapshot: line.priceSnapshotJson ?? null,
        discountDetails: line.discountDetailsJson ?? null,
        taxDetails: line.taxDetailsJson ?? null,
        usageSnapshot: line.usageSnapshot
          ? {
              id: line.usageSnapshot.id,
              billableVehicleCount: line.usageSnapshot.billableVehicleCount,
              unitPriceCents: line.usageSnapshot.unitPriceCents,
              calculationStatus: line.usageSnapshot.calculationStatus,
              periodStart: line.usageSnapshot.periodStart.toISOString(),
              periodEnd: line.usageSnapshot.periodEnd.toISOString(),
            }
          : null,
      })),
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
    };
  }

  async findSubscriptionById(id: string): Promise<BillingSubscription | null> {
    return this.prisma.billingSubscription.findUnique({
      where: { id },
      include: { invoices: true },
    });
  }

  async createSubscription(
    orgId: string,
    stripeCustomerId: string,
    stripeSubscriptionId: string,
    actorUserId?: string,
  ): Promise<BillingSubscription> {
    const sub = await this.prisma.billingSubscription.create({
      data: {
        organizationId: orgId,
        stripeCustomerId,
        stripeSubscriptionId,
        status: 'ACTIVE' as BillingStatus,
      },
    });
    await this.audit.log({
      organizationId: orgId,
      actorUserId,
      action: 'SUBSCRIPTION_CREATED',
      entityType: 'BillingSubscription',
      entityId: sub.id,
      after: sub,
    });
    return sub;
  }

  async updateSubscriptionStatus(
    subscriptionId: string,
    status: BillingStatus,
    actorUserId?: string,
  ): Promise<BillingSubscription> {
    const before = await this.prisma.billingSubscription.findUnique({
      where: { id: subscriptionId },
    });
    const updated = await this.prisma.billingSubscription.update({
      where: { id: subscriptionId },
      data: { status },
    });
    await this.audit.log({
      organizationId: before?.organizationId,
      actorUserId,
      action: 'SUBSCRIPTION_STATUS_UPDATED',
      entityType: 'BillingSubscription',
      entityId: subscriptionId,
      before,
      after: updated,
    });
    return updated;
  }

  async recordInvoice(
    subscriptionId: string,
    invoiceData: {
      stripeInvoiceId?: string;
      amountCents: number;
      currency?: string;
      status?: InvoiceStatus;
      invoiceDate: Date;
      dueDate?: Date;
      paidAt?: Date;
      invoicePdfUrl?: string;
      lines?: Array<{
        usageSnapshotId?: string;
        description: string;
        quantity: number;
        unitAmountCents?: number;
        subtotalCents: number;
        taxRateBps?: number;
        taxCents?: number;
        totalCents: number;
        periodStart?: Date;
        periodEnd?: Date;
      }>;
    },
  ): Promise<BillingInvoice> {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.billingInvoice.create({
        data: {
          subscriptionId,
          stripeInvoiceId: invoiceData.stripeInvoiceId,
          amountCents: invoiceData.amountCents,
          currency: invoiceData.currency ?? 'eur',
          status: (invoiceData.status ?? 'DRAFT') as InvoiceStatus,
          invoiceDate: invoiceData.invoiceDate,
          dueDate: invoiceData.dueDate,
          paidAt: invoiceData.paidAt,
          invoicePdfUrl: invoiceData.invoicePdfUrl,
        },
      });

      if (invoiceData.lines?.length) {
        await tx.billingInvoiceLine.createMany({
          data: invoiceData.lines.map((line) => ({
            invoiceId: invoice.id,
            usageSnapshotId: line.usageSnapshotId,
            description: line.description,
            quantity: line.quantity,
            unitAmountCents: line.unitAmountCents,
            subtotalCents: line.subtotalCents,
            taxRateBps: line.taxRateBps,
            taxCents: line.taxCents,
            totalCents: line.totalCents,
            periodStart: line.periodStart,
            periodEnd: line.periodEnd,
          })),
        });
      }

      return invoice;
    });
  }

  async findPaymentMethods(orgId: string) {
    return this.prisma.billingPaymentMethod.findMany({
      where: { organizationId: orgId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
