import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  isOutgoingInvoiceType,
  isIncomingInvoiceType,
} from '@modules/invoices/invoice-domain.util';
import type {
  EvaluationsInvoiceFact,
  EvaluationsPaymentFact,
} from '@synq/evaluations-finance/evaluations-finance-facts';
import { normalizeMoneyCurrency } from '@synq/evaluations-finance/evaluations-money';

export interface FinanceSourceWindow {
  readonly start: Date;
  readonly endExclusive: Date;
}

/**
 * Tenant-scoped access to the canonical finance sources (org invoices and
 * confirmed invoice payments). Every query is filtered by `organizationId`; no
 * query trusts a client-supplied organization.
 */
@Injectable()
export class EvaluationsFinanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Invoices needed for both period metrics (issued revenue / expenses in
   * window) and point-in-time receivables (any currently-open outgoing invoice).
   */
  async loadInvoiceFacts(
    organizationId: string,
    window: FinanceSourceWindow,
  ): Promise<EvaluationsInvoiceFact[]> {
    const rows = await this.prisma.orgInvoice.findMany({
      where: {
        organizationId,
        OR: [
          { invoiceDate: { gte: window.start, lt: window.endExclusive } },
          { issuedAt: { gte: window.start, lt: window.endExclusive } },
          { outstandingCents: { gt: 0 } },
        ],
      },
      select: {
        id: true,
        type: true,
        status: true,
        currency: true,
        totalCents: true,
        paidCents: true,
        outstandingCents: true,
        issuedAt: true,
        invoiceDate: true,
        dueDate: true,
        paidAt: true,
        createdAt: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      direction: isIncomingInvoiceType(row.type) ? 'INCOMING' : 'OUTGOING',
      status: row.status,
      currency: normalizeCurrencySafe(row.currency),
      totalMinor: row.totalCents,
      paidMinor: row.paidCents,
      outstandingMinor: row.outstandingCents,
      issuedAt: toIso(row.issuedAt),
      invoiceDate: toIso(row.invoiceDate),
      dueDate: toIso(row.dueDate),
      paidAt: toIso(row.paidAt),
      createdAt: toIso(row.createdAt),
    }));
  }

  /**
   * Settled customer payments on outgoing invoices (cash inflow). Payment
   * currency is inherited from the paid invoice — never defaulted. Deposits and
   * authorizations are not part of this ledger and are excluded by construction.
   */
  async loadPaymentFacts(
    organizationId: string,
    window: FinanceSourceWindow,
  ): Promise<EvaluationsPaymentFact[]> {
    const rows = await this.prisma.orgInvoicePayment.findMany({
      where: {
        organizationId,
        paidAt: { gte: window.start, lt: window.endExclusive },
      },
      select: {
        id: true,
        invoiceId: true,
        amountCents: true,
        paidAt: true,
        invoice: { select: { type: true, currency: true } },
      },
    });

    const facts: EvaluationsPaymentFact[] = [];
    for (const row of rows) {
      if (!isOutgoingInvoiceType(row.invoice.type)) continue;
      facts.push({
        id: row.id,
        invoiceId: row.invoiceId,
        currency: normalizeCurrencySafe(row.invoice.currency),
        amountMinor: row.amountCents,
        kind: 'PAYMENT',
        settledAt: toIso(row.paidAt),
      });
    }
    return facts;
  }

  /**
   * Authoritative organization reporting currency from finance settings. Used
   * only to express a true-zero period; never used to override an invoice's own
   * currency. Returns null when no settings authority exists (fail closed).
   */
  async resolveReportingCurrency(organizationId: string): Promise<string | null> {
    const account = await this.prisma.organizationPaymentAccount.findFirst({
      where: { organizationId },
      select: { defaultCurrency: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!account?.defaultCurrency) return null;
    try {
      return normalizeMoneyCurrency(account.defaultCurrency);
    } catch {
      return null;
    }
  }
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** Legacy rows may store lowercase / non-ISO currencies; normalize best-effort. */
function normalizeCurrencySafe(currency: string | null | undefined): string {
  const raw = (currency ?? '').trim().toUpperCase();
  return raw;
}
