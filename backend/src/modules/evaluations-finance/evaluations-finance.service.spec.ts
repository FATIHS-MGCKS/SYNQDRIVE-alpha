import { EvaluationsAnalyticsScopeService } from '@modules/evaluations-analytics/evaluations-analytics-scope.service';
import { EvaluationsFinanceRepository } from './evaluations-finance.repository';
import {
  EVALUATIONS_FINANCE_METRIC_IDS,
  EvaluationsFinanceService,
} from './evaluations-finance.service';
import { isDisplayableEvaluationsMetricValue } from '@synq/evaluations-metrics/evaluations-metric-response.validator';

const REFERENCE = new Date('2026-07-20T12:00:00.000Z');

interface FakeInvoice {
  id: string;
  organizationId: string;
  type: string;
  status: string;
  currency: string;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  issuedAt: Date | null;
  invoiceDate: Date | null;
  dueDate: Date | null;
  paidAt: Date | null;
  createdAt: Date | null;
}
interface FakePayment {
  id: string;
  organizationId: string;
  invoiceId: string;
  amountCents: number;
  paidAt: Date;
  invoice: { type: string; currency: string };
}
interface FakeMembership {
  organizationId: string;
  userId: string;
  role: string;
  status: string;
  stationScope: string | null;
  stationIds: unknown;
}

interface FakeData {
  invoices: FakeInvoice[];
  payments: FakePayment[];
  memberships: FakeMembership[];
  accounts: { organizationId: string; defaultCurrency: string; createdAt: Date }[];
  organizations: { id: string; timezone: string | null }[];
}

function inWindow(date: Date | null, gte?: Date, lt?: Date): boolean {
  if (!date) return false;
  if (gte && date < gte) return false;
  if (lt && date >= lt) return false;
  return true;
}

function makePrisma(data: FakeData) {
  return {
    organizationMembership: {
      findFirst: async ({ where }: any) =>
        data.memberships.find(
          (m) =>
            m.userId === where.userId &&
            m.organizationId === where.organizationId &&
            m.status === where.status,
        ) ?? null,
    },
    organization: {
      findUnique: async ({ where }: any) =>
        data.organizations.find((o) => o.id === where.id) ?? null,
    },
    station: {
      findMany: async () => [],
      findFirst: async () => null,
    },
    orgInvoice: {
      findMany: async ({ where }: any) => {
        return data.invoices
          .filter((inv) => inv.organizationId === where.organizationId)
          .filter((inv) => {
            const or = where.OR as any[];
            if (!or) return true;
            return or.some((cond) => {
              if (cond.invoiceDate) {
                return inWindow(inv.invoiceDate, cond.invoiceDate.gte, cond.invoiceDate.lt);
              }
              if (cond.issuedAt) {
                return inWindow(inv.issuedAt, cond.issuedAt.gte, cond.issuedAt.lt);
              }
              if (cond.outstandingCents) return inv.outstandingCents > cond.outstandingCents.gt;
              return false;
            });
          })
          .map((inv) => ({ ...inv }));
      },
    },
    orgInvoicePayment: {
      findMany: async ({ where }: any) =>
        data.payments
          .filter((p) => p.organizationId === where.organizationId)
          .filter((p) => inWindow(p.paidAt, where.paidAt?.gte, where.paidAt?.lt))
          .map((p) => ({
            id: p.id,
            invoiceId: p.invoiceId,
            amountCents: p.amountCents,
            paidAt: p.paidAt,
            invoice: p.invoice,
          })),
    },
    organizationPaymentAccount: {
      findFirst: async ({ where }: any) =>
        data.accounts.find((a) => a.organizationId === where.organizationId) ?? null,
    },
  };
}

function buildService(data: FakeData) {
  const prisma = makePrisma(data) as any;
  const scope = new EvaluationsAnalyticsScopeService(prisma);
  const repo = new EvaluationsFinanceRepository(prisma);
  return new EvaluationsFinanceService(scope, repo);
}

function outgoing(partial: Partial<FakeInvoice> & Pick<FakeInvoice, 'id' | 'organizationId'>): FakeInvoice {
  return {
    type: 'OUTGOING_MANUAL',
    status: 'ISSUED',
    currency: 'EUR',
    totalCents: 10000,
    paidCents: 0,
    outstandingCents: 10000,
    issuedAt: new Date('2026-07-10T00:00:00.000Z'),
    invoiceDate: new Date('2026-07-10T00:00:00.000Z'),
    dueDate: new Date('2026-07-15T00:00:00.000Z'),
    paidAt: null,
    createdAt: new Date('2026-07-10T00:00:00.000Z'),
    ...partial,
  };
}

const ORG_ADMIN = (organizationId: string, userId = 'user-admin'): FakeMembership => ({
  organizationId,
  userId,
  role: 'ORG_ADMIN',
  status: 'ACTIVE',
  stationScope: null,
  stationIds: [],
});

const baseData = (): FakeData => ({
  invoices: [],
  payments: [],
  memberships: [],
  accounts: [{ organizationId: 'ORG_A', defaultCurrency: 'EUR', createdAt: new Date('2026-01-01') }],
  organizations: [
    { id: 'ORG_A', timezone: 'Europe/Berlin' },
    { id: 'ORG_B', timezone: 'Europe/Berlin' },
  ],
});

describe('EvaluationsFinanceService (E3)', () => {
  it('computes single-currency issued revenue as AVAILABLE money', async () => {
    const data = baseData();
    data.memberships.push(ORG_ADMIN('ORG_A'));
    data.invoices.push(outgoing({ id: 'a1', organizationId: 'ORG_A', totalCents: 25000 }));
    const service = buildService(data);
    const result = await service.computeFinancialInsights({
      actor: { id: 'user-admin', platformRole: null },
      orgId: 'ORG_A',
      requestedStationIds: null,
      reference: REFERENCE,
    });
    const revenue = result.metrics[EVALUATIONS_FINANCE_METRIC_IDS.issuedRevenue];
    expect(revenue.status).toBe('AVAILABLE');
    expect(revenue.value).toEqual({ amountMinor: 25000, currency: 'EUR' });
  });

  it('does not leak another tenant\u2019s invoices (cross-tenant read = 0)', async () => {
    const data = baseData();
    data.memberships.push(ORG_ADMIN('ORG_A'));
    data.invoices.push(outgoing({ id: 'a1', organizationId: 'ORG_A', totalCents: 10000 }));
    data.invoices.push(outgoing({ id: 'b1', organizationId: 'ORG_B', totalCents: 99999 }));
    const service = buildService(data);
    const result = await service.computeFinancialInsights({
      actor: { id: 'user-admin', platformRole: null },
      orgId: 'ORG_A',
      requestedStationIds: null,
      reference: REFERENCE,
    });
    expect(result.metrics[EVALUATIONS_FINANCE_METRIC_IDS.issuedRevenue].value).toEqual({
      amountMinor: 10000,
      currency: 'EUR',
    });
  });

  it('reports open receivables from the authoritative outstanding balance (partial payment)', async () => {
    const data = baseData();
    data.memberships.push(ORG_ADMIN('ORG_A'));
    data.invoices.push(
      outgoing({
        id: 'a1',
        organizationId: 'ORG_A',
        status: 'PARTIALLY_PAID',
        totalCents: 10000,
        paidCents: 3000,
        outstandingCents: 7000,
        dueDate: new Date('2026-07-30T00:00:00.000Z'),
      }),
    );
    const service = buildService(data);
    const result = await service.computeFinancialInsights({
      actor: { id: 'user-admin', platformRole: null },
      orgId: 'ORG_A',
      requestedStationIds: null,
      reference: REFERENCE,
    });
    expect(result.metrics[EVALUATIONS_FINANCE_METRIC_IDS.openReceivables].value).toEqual({
      amountMinor: 7000,
      currency: 'EUR',
    });
    expect(result.metrics[EVALUATIONS_FINANCE_METRIC_IDS.totalOutstanding].value).toEqual({
      amountMinor: 7000,
      currency: 'EUR',
    });
    expect(result.metrics[EVALUATIONS_FINANCE_METRIC_IDS.overdueReceivables].value).toEqual({
      amountMinor: 0,
      currency: 'EUR',
    });
  });

  it('returns AVAILABLE zero for a true empty period with a known reporting currency', async () => {
    const data = baseData();
    data.memberships.push(ORG_ADMIN('ORG_A'));
    const service = buildService(data);
    const result = await service.computeFinancialInsights({
      actor: { id: 'user-admin', platformRole: null },
      orgId: 'ORG_A',
      requestedStationIds: null,
      reference: REFERENCE,
    });
    const revenue = result.metrics[EVALUATIONS_FINANCE_METRIC_IDS.issuedRevenue];
    expect(revenue.status).toBe('AVAILABLE');
    expect(revenue.value).toEqual({ amountMinor: 0, currency: 'EUR' });
  });

  it('is UNAVAILABLE (not false zero) when no reporting currency authority exists', async () => {
    const data = baseData();
    data.accounts = [];
    data.memberships.push(ORG_ADMIN('ORG_A'));
    const service = buildService(data);
    const result = await service.computeFinancialInsights({
      actor: { id: 'user-admin', platformRole: null },
      orgId: 'ORG_A',
      requestedStationIds: null,
      reference: REFERENCE,
    });
    const revenue = result.metrics[EVALUATIONS_FINANCE_METRIC_IDS.issuedRevenue];
    expect(revenue.status).toBe('UNAVAILABLE');
    expect(revenue.value).toBeNull();
  });

  it('is UNAVAILABLE for mixed currencies without a reporting authority (no false total)', async () => {
    const data = baseData();
    data.memberships.push(ORG_ADMIN('ORG_A'));
    data.invoices.push(outgoing({ id: 'a1', organizationId: 'ORG_A', currency: 'EUR', totalCents: 10000 }));
    data.invoices.push(outgoing({ id: 'a2', organizationId: 'ORG_A', currency: 'USD', totalCents: 10000 }));
    const service = buildService(data);
    const result = await service.computeFinancialInsights({
      actor: { id: 'user-admin', platformRole: null },
      orgId: 'ORG_A',
      requestedStationIds: null,
      reference: REFERENCE,
    });
    const revenue = result.metrics[EVALUATIONS_FINANCE_METRIC_IDS.issuedRevenue];
    expect(revenue.status).toBe('UNAVAILABLE');
    expect(isDisplayableEvaluationsMetricValue(revenue)).toBe(false);
  });

  it('fails closed for a station-scoped actor (no org-wide finance leak)', async () => {
    const data = baseData();
    data.memberships.push({
      organizationId: 'ORG_A',
      userId: 'worker-1',
      role: 'WORKER',
      status: 'ACTIVE',
      stationScope: null,
      stationIds: ['station-1'],
    });
    data.invoices.push(outgoing({ id: 'a1', organizationId: 'ORG_A', totalCents: 50000 }));
    const service = buildService(data);
    const result = await service.computeFinancialInsights({
      actor: { id: 'worker-1', platformRole: null },
      orgId: 'ORG_A',
      requestedStationIds: null,
      reference: REFERENCE,
    });
    const revenue = result.metrics[EVALUATIONS_FINANCE_METRIC_IDS.issuedRevenue];
    expect(revenue.status).toBe('UNAVAILABLE');
    expect(revenue.value).toBeNull();
  });

  it('profit margin is NOT_APPLICABLE for zero revenue', async () => {
    const data = baseData();
    data.memberships.push(ORG_ADMIN('ORG_A'));
    // expense only, no revenue
    data.invoices.push(
      outgoing({
        id: 'e1',
        organizationId: 'ORG_A',
        type: 'INCOMING_VENDOR',
        status: 'APPROVED',
        totalCents: 4000,
      }),
    );
    const service = buildService(data);
    const result = await service.computeFinancialInsights({
      actor: { id: 'user-admin', platformRole: null },
      orgId: 'ORG_A',
      requestedStationIds: null,
      reference: REFERENCE,
    });
    const margin = result.metrics[EVALUATIONS_FINANCE_METRIC_IDS.profitMargin];
    expect(margin.status).toBe('NOT_APPLICABLE');
    expect(margin.value).toBeNull();
  });

  it('counts settled customer payments as paid revenue (cash inflow)', async () => {
    const data = baseData();
    data.memberships.push(ORG_ADMIN('ORG_A'));
    data.payments.push({
      id: 'p1',
      organizationId: 'ORG_A',
      invoiceId: 'a1',
      amountCents: 3000,
      paidAt: new Date('2026-07-05T00:00:00.000Z'),
      invoice: { type: 'OUTGOING_MANUAL', currency: 'EUR' },
    });
    const service = buildService(data);
    const result = await service.computeFinancialInsights({
      actor: { id: 'user-admin', platformRole: null },
      orgId: 'ORG_A',
      requestedStationIds: null,
      reference: REFERENCE,
    });
    expect(result.metrics[EVALUATIONS_FINANCE_METRIC_IDS.paidRevenue].value).toEqual({
      amountMinor: 3000,
      currency: 'EUR',
    });
  });
});
