import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  mapPrismaInvoiceStatusToDomain,
  mapPrismaInvoiceToDisplayStatus,
} from '../domain';
import {
  ResolvedInvoice,
  ResolvedInvoiceLine,
  ResolvedInvoicePaymentState,
  ResolvedPaymentMethod,
} from '../domain/billing-resolver.types';

export interface ResolveInvoicesOptions {
  limit?: number;
  subscriptionId?: string;
}

@Injectable()
export class InvoiceResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveInvoices(
    organizationId: string,
    opts: ResolveInvoicesOptions = {},
  ): Promise<ResolvedInvoice[]> {
    const limit = opts.limit ?? 20;

    const subscriptions = await this.prisma.billingSubscription.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const subscriptionIds = opts.subscriptionId
      ? [opts.subscriptionId]
      : subscriptions.map((s) => s.id);

    if (subscriptionIds.length === 0) return [];

    const invoices = await this.prisma.billingInvoice.findMany({
      where: { subscriptionId: { in: subscriptionIds } },
      include: { lines: true },
      orderBy: { invoiceDate: 'desc' },
      take: limit,
    });

    return invoices.map((inv) => this.mapInvoice(inv));
  }

  async resolveInvoicePaymentState(organizationId: string): Promise<ResolvedInvoicePaymentState> {
    const [defaultPm, recentInvoices] = await Promise.all([
      this.prisma.billingPaymentMethod.findFirst({
        where: { organizationId, isDefault: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.resolveInvoices(organizationId, { limit: 5 }),
    ]);

    return {
      organizationId,
      defaultPaymentMethod: defaultPm ? this.mapPaymentMethod(defaultPm) : null,
      recentInvoices,
      resolvedAt: new Date(),
    };
  }

  private mapInvoice(invoice: {
    id: string;
    subscriptionId: string;
    stripeInvoiceId: string | null;
    amountCents: number;
    currency: string;
    status: string;
    invoiceDate: Date;
    dueDate: Date | null;
    paidAt: Date | null;
    lines: Array<{
      id: string;
      description: string;
      quantity: number;
      unitAmountCents: number | null;
      subtotalCents: number;
      totalCents: number;
      periodStart: Date | null;
      periodEnd: Date | null;
    }>;
  }): ResolvedInvoice {
    const domainStatus = mapPrismaInvoiceStatusToDomain(invoice.status as never);
    const displayStatus = mapPrismaInvoiceToDisplayStatus(invoice.status as never, {
      dueDate: invoice.dueDate,
    });

    return {
      id: invoice.id,
      subscriptionId: invoice.subscriptionId,
      stripeInvoiceId: invoice.stripeInvoiceId,
      amountCents: invoice.amountCents,
      currency: invoice.currency,
      status: domainStatus,
      displayStatus,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt,
      lines: invoice.lines.map((line) => this.mapLine(line)),
    };
  }

  private mapLine(line: {
    id: string;
    description: string;
    quantity: number;
    unitAmountCents: number | null;
    subtotalCents: number;
    totalCents: number;
    periodStart: Date | null;
    periodEnd: Date | null;
  }): ResolvedInvoiceLine {
    return {
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitAmountCents: line.unitAmountCents,
      subtotalCents: line.subtotalCents,
      totalCents: line.totalCents,
      periodStart: line.periodStart,
      periodEnd: line.periodEnd,
    };
  }

  private mapPaymentMethod(pm: {
    id: string;
    type: string;
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    isDefault: boolean;
    status: string;
  }): ResolvedPaymentMethod {
    return {
      id: pm.id,
      type: pm.type,
      brand: pm.brand,
      last4: pm.last4,
      expMonth: pm.expMonth,
      expYear: pm.expYear,
      isDefault: pm.isDefault,
      status: pm.status,
    };
  }
}
