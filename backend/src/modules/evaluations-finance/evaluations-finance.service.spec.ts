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
  invoice: { type: string; currency: string; organizationId: string };
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
  accounts: {
    organizationId: string;
    defaultCurrency: string;
    createdAt: Date;
    status?: string;
    chargesEnabled?: boolean;
    lastSyncedAt?: Date | null;
  }[];
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
        data.accounts.find(
          (a) =>
            a.organizationId === where.organizationId &&
            (where.status === undefined || a.status === where.status) &&
            (where.chargesEnabled === undefined || a.chargesEnabled === where.chargesEnabled),
        ) ?? null,
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
  accounts: [
    {
      organizationId: 'ORG_A',
      defaultCurrency: 'EUR',
      createdAt: new Date('2026-01-01'),
      status: 'ACTIVE',
      chargesEnabled: true,
      lastSyncedAt: new Date('2026-06-01'),
    },
  ],
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
    now: REFERENCE,
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
    now: REFERENCE,
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
    now: REFERENCE,
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
    now: REFERENCE,
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
    now: REFERENCE,
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
    now: REFERENCE,
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
    now: REFERENCE,
    });
    const revenue = result.metrics[EVALUATIONS_FINANCE_METRIC_IDS.issuedRevenue];
    expect(revenue.status).toBe('UNAVAILABLE');
    expect(revenue.value).toBeNull();
  });

  it('propagates STATION_SCOPED_FINANCE_UNSUPPORTED to every metric reason (E3.4)', async () => {
    const data = baseData();
    data.memberships.push({
      organizationId: 'ORG_A',
      userId: 'worker-1',
      role: 'WORKER',
      status: 'ACTIVE',
      stationScope: null,
      stationIds: ['station-1'],
    });
    const service = buildService(data);
    const result = await service.computeFinancialInsights({
      actor: { id: 'worker-1', platformRole: null },
      orgId: 'ORG_A',
      requestedStationIds: null,
      reference: REFERENCE,
      now: REFERENCE,
    });
    for (const metricId of Object.values(EVALUATIONS_FINANCE_METRIC_IDS)) {
      const m = result.metrics[metricId];
      expect(m.status).toBe('UNAVAILABLE');
      expect(m.warnings).toContain('STATION_SCOPED_FINANCE_UNSUPPORTED');
      expect(m.warnings).not.toContain('FINANCE_SOURCE_UNAVAILABLE');
    }
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
    now: REFERENCE,
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
      invoice: { type: 'OUTGOING_MANUAL', currency: 'EUR', organizationId: 'ORG_A' },
    });
    const service = buildService(data);
    const result = await service.computeFinancialInsights({
      actor: { id: 'user-admin', platformRole: null },
      orgId: 'ORG_A',
      requestedStationIds: null,
      reference: REFERENCE,
      now: REFERENCE,
    });
    expect(result.metrics[EVALUATIONS_FINANCE_METRIC_IDS.paidRevenue].value).toEqual({
      amountMinor: 3000,
      currency: 'EUR',
    });
  });

  // ── E3.1 corrections ──────────────────────────────────────────────────────

  async function run(data: FakeData, over?: Partial<{ reference: Date; now: Date }>) {
    const service = buildService(data);
    return service.computeFinancialInsights({
      actor: { id: 'user-admin', platformRole: null },
      orgId: 'ORG_A',
      requestedStationIds: null,
      reference: over?.reference ?? REFERENCE,
      now: over?.now ?? REFERENCE,
    });
  }

  it('serves a negative profit margin as SIGNED_PERCENT (loss not hidden)', async () => {
    const data = baseData();
    data.memberships.push(ORG_ADMIN('ORG_A'));
    data.invoices.push(outgoing({ id: 'r', organizationId: 'ORG_A', totalCents: 10000 }));
    data.invoices.push(
      outgoing({ id: 'e', organizationId: 'ORG_A', type: 'INCOMING_VENDOR', status: 'APPROVED', totalCents: 15000 }),
    );
    const margin = (await run(data)).metrics[EVALUATIONS_FINANCE_METRIC_IDS.profitMargin];
    expect(margin.status).toBe('AVAILABLE');
    expect(margin.valueType).toBe('SIGNED_PERCENT');
    expect(margin.value).toBe(-50);
  });

  it('serves a margin below -100% (deep loss)', async () => {
    const data = baseData();
    data.memberships.push(ORG_ADMIN('ORG_A'));
    data.invoices.push(outgoing({ id: 'r', organizationId: 'ORG_A', totalCents: 10000 }));
    data.invoices.push(
      outgoing({ id: 'e', organizationId: 'ORG_A', type: 'INCOMING_VENDOR', status: 'APPROVED', totalCents: 30000 }),
    );
    const margin = (await run(data)).metrics[EVALUATIONS_FINANCE_METRIC_IDS.profitMargin];
    expect(margin.status).toBe('AVAILABLE');
    expect(margin.value).toBe(-200);
  });

  it('excludes OUTGOING+NEEDS_REVIEW from revenue (positive allowlist)', async () => {
    const data = baseData();
    data.memberships.push(ORG_ADMIN('ORG_A'));
    data.invoices.push(outgoing({ id: 'nr', organizationId: 'ORG_A', status: 'NEEDS_REVIEW', totalCents: 5000 }));
    const revenue = (await run(data)).metrics[EVALUATIONS_FINANCE_METRIC_IDS.issuedRevenue];
    expect(revenue.value).toEqual({ amountMinor: 0, currency: 'EUR' });
  });

  it('excludes INCOMING+UPLOADED and INCOMING+REJECTED from expenses', async () => {
    const data = baseData();
    data.memberships.push(ORG_ADMIN('ORG_A'));
    data.invoices.push(
      outgoing({ id: 'u', organizationId: 'ORG_A', type: 'INCOMING_UPLOADED', status: 'UPLOADED', totalCents: 5000 }),
    );
    data.invoices.push(
      outgoing({ id: 'rj', organizationId: 'ORG_A', type: 'INCOMING_VENDOR', status: 'REJECTED', totalCents: 7000 }),
    );
    const expenses = (await run(data)).metrics[EVALUATIONS_FINANCE_METRIC_IDS.expenses];
    expect(expenses.value).toEqual({ amountMinor: 0, currency: 'EUR' });
  });

  it('counts APPROVED incoming invoices as expenses', async () => {
    const data = baseData();
    data.memberships.push(ORG_ADMIN('ORG_A'));
    data.invoices.push(
      outgoing({ id: 'e', organizationId: 'ORG_A', type: 'INCOMING_VENDOR', status: 'APPROVED', totalCents: 4200 }),
    );
    const expenses = (await run(data)).metrics[EVALUATIONS_FINANCE_METRIC_IDS.expenses];
    expect(expenses.value).toEqual({ amountMinor: 4200, currency: 'EUR' });
  });

  it('does not consume a payment whose parent invoice is another tenant (corrupt relation)', async () => {
    const data = baseData();
    data.memberships.push(ORG_ADMIN('ORG_A'));
    data.payments.push({
      id: 'p-foreign',
      organizationId: 'ORG_A',
      invoiceId: 'b-invoice',
      amountCents: 99999,
      paidAt: new Date('2026-07-05T00:00:00.000Z'),
      invoice: { type: 'OUTGOING_MANUAL', currency: 'USD', organizationId: 'ORG_B' },
    });
    const paid = (await run(data)).metrics[EVALUATIONS_FINANCE_METRIC_IDS.paidRevenue];
    // Empty (complete) period → AVAILABLE 0 in the org reporting currency, never
    // the foreign 99999 USD.
    expect(paid.value).toEqual({ amountMinor: 0, currency: 'EUR' });
  });

  it('is UNAVAILABLE for zero period when only a PENDING (non-active) account exists', async () => {
    const data = baseData();
    data.accounts = [
      {
        organizationId: 'ORG_A',
        defaultCurrency: 'EUR',
        createdAt: new Date('2026-01-01'),
        status: 'PENDING',
        chargesEnabled: false,
      },
    ];
    data.memberships.push(ORG_ADMIN('ORG_A'));
    const revenue = (await run(data)).metrics[EVALUATIONS_FINANCE_METRIC_IDS.issuedRevenue];
    expect(revenue.status).toBe('UNAVAILABLE');
    expect(revenue.value).toBeNull();
  });

  it('reports current partial-payment receivable = 70 (current-only)', async () => {
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
    const total = (await run(data)).metrics[EVALUATIONS_FINANCE_METRIC_IDS.totalOutstanding];
    expect(total.value).toEqual({ amountMinor: 7000, currency: 'EUR' });
  });

  it('fails closed for historical receivable references (future payment cannot zero the past)', async () => {
    // Reference 20 July, but "now" is 1 August → historical reference.
    const data = baseData();
    data.memberships.push(ORG_ADMIN('ORG_A'));
    data.invoices.push(
      outgoing({
        id: 'a1',
        organizationId: 'ORG_A',
        status: 'PAID',
        totalCents: 10000,
        paidCents: 10000,
        outstandingCents: 0,
        paidAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    );
    const result = await run(data, {
      reference: new Date('2026-07-20T12:00:00.000Z'),
      now: new Date('2026-08-01T12:00:00.000Z'),
    });
    const total = result.metrics[EVALUATIONS_FINANCE_METRIC_IDS.totalOutstanding];
    expect(total.status).toBe('UNAVAILABLE');
    expect(total.value).toBeNull();
    expect(total.warnings).toContain('HISTORICAL_RECEIVABLE_RECONSTRUCTION_UNAVAILABLE');
  });

  it('serves the expected E3.1 calculation versions', async () => {
    const data = baseData();
    data.memberships.push(ORG_ADMIN('ORG_A'));
    const metrics = (await run(data)).metrics;
    expect(metrics[EVALUATIONS_FINANCE_METRIC_IDS.issuedRevenue].calculationVersion).toBe('1.0.0');
    expect(metrics[EVALUATIONS_FINANCE_METRIC_IDS.paidRevenue].calculationVersion).toBe('2.0.0');
    expect(metrics[EVALUATIONS_FINANCE_METRIC_IDS.expenses].calculationVersion).toBe('2.0.0');
    expect(metrics[EVALUATIONS_FINANCE_METRIC_IDS.netResult].calculationVersion).toBe('2.0.0');
    expect(metrics[EVALUATIONS_FINANCE_METRIC_IDS.profitMargin].calculationVersion).toBe('2.0.0');
    expect(metrics[EVALUATIONS_FINANCE_METRIC_IDS.openReceivables].calculationVersion).toBe('2.0.0');
  });
});
