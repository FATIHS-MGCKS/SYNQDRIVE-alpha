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
  PaginatedResult,
} from '@shared/utils/pagination';

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
  constructor(private readonly prisma: PrismaService) {}

  private mapInvoiceStatus(invoice: { status: InvoiceStatus; dueDate?: Date | null }): string {
    switch (invoice.status) {
      case 'PAID':
        return 'Paid';
      case 'OPEN':
        return invoice.dueDate && new Date(invoice.dueDate) < new Date() ? 'Overdue' : 'Pending';
      case 'DRAFT':
        return 'Pending';
      case 'VOID':
        return 'Paid';
      case 'UNCOLLECTIBLE':
        return 'Overdue';
      default:
        return 'Pending';
    }
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
    return this.formatSubscription(sub);
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

  async findInvoices(
    orgId: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<BillingInvoice>> {
    const sub = await this.prisma.billingSubscription.findFirst({
      where: { organizationId: orgId },
      select: { id: true },
    });
    if (!sub) {
      return buildPaginatedResult([], 0, params || {});
    }
    const { skip, take } = parsePagination(params || {});
    const [data, total] = await Promise.all([
      this.prisma.billingInvoice.findMany({
        where: { subscriptionId: sub.id },
        skip,
        take,
        orderBy: { invoiceDate: 'desc' },
      }),
      this.prisma.billingInvoice.count({ where: { subscriptionId: sub.id } }),
    ]);
    return buildPaginatedResult(data, total, params || {});
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
  ): Promise<BillingSubscription> {
    return this.prisma.billingSubscription.create({
      data: {
        organizationId: orgId,
        stripeCustomerId,
        stripeSubscriptionId,
        status: 'ACTIVE' as BillingStatus,
      },
    });
  }

  async updateSubscriptionStatus(
    subscriptionId: string,
    status: BillingStatus,
  ): Promise<BillingSubscription> {
    return this.prisma.billingSubscription.update({
      where: { id: subscriptionId },
      data: { status },
    });
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
    },
  ): Promise<BillingInvoice> {
    return this.prisma.billingInvoice.create({
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
  }
}
