/**
 * In-memory harness for EvaluationsFinancialKpiService integration tests.
 * No external database — mirrors invoice-pipeline harness pattern.
 */
import type { FinancialKpiInvoiceRow } from './financial-kpi.logic';

type Row = Record<string, unknown>;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export interface FinanceKpiHarnessState {
  organizationId: string;
  organizationTimezone: string;
  invoices: FinancialKpiInvoiceRow[];
  paymentAccountDefaultCurrency?: string;
  priceBookCurrency?: string;
}

export function createFinanceKpiHarness(state: FinanceKpiHarnessState) {
  const orgInvoices = state.invoices.map((inv) => ({
    ...inv,
    organizationId: state.organizationId,
    invoiceDate: inv.invoiceDate ? new Date(String(inv.invoiceDate)) : null,
    dueDate: inv.dueDate ? new Date(String(inv.dueDate)) : null,
    paidAt: inv.paidAt ? new Date(String(inv.paidAt)) : null,
    createdAt: inv.createdAt ? new Date(String(inv.createdAt)) : new Date(),
    updatedAt: inv.updatedAt ? new Date(String(inv.updatedAt)) : new Date(),
    cancelledAt: inv.cancelledAt ? new Date(String(inv.cancelledAt)) : null,
    creditedAt: inv.creditedAt ? new Date(String(inv.creditedAt)) : null,
  }));

  const prisma = {
    orgInvoice: {
      findMany: jest.fn(async ({ where }: { where?: { organizationId?: string } }) => {
        if (where?.organizationId !== state.organizationId) return [];
        return clone(orgInvoices);
      }),
    },
    organization: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id !== state.organizationId) return null;
        return { timezone: state.organizationTimezone };
      }),
    },
    station: {
      findFirst: jest.fn(async () => null),
    },
    organizationPaymentAccount: {
      findFirst: jest.fn(async () =>
        state.paymentAccountDefaultCurrency
          ? { defaultCurrency: state.paymentAccountDefaultCurrency }
          : null,
      ),
    },
    priceBook: {
      findFirst: jest.fn(async () =>
        state.priceBookCurrency ? { currency: state.priceBookCurrency } : null,
      ),
    },
  };

  return { prisma, orgInvoices };
}
