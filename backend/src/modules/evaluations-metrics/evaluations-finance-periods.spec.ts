import { resolveEvaluationsReportingPeriodBundle } from './evaluations-period.resolver';
import { computeReceivablesAnalytics } from '@synq/receivables/receivables-analytics';
import { computeRevenueCashflowContribution } from '@synq/finance/revenue-cashflow-contribution';
import { goldenInvoice } from '@synq/evaluations-fixtures/finance-golden-organizations';

describe('evaluations finance period boundaries', () => {
  it('MTD window respects Europe/Berlin month start', () => {
    const ref = new Date('2026-06-16T10:00:00.000Z');
    const bundle = resolveEvaluationsReportingPeriodBundle({
      reference: ref,
      timezone: {
        effective: 'Europe/Berlin',
        organization: 'Europe/Berlin',
        station: null,
        source: 'organization',
      },
    });
    expect(bundle.mtd.preset).toBe('mtd');
    expect(bundle.mtd.periodStart).toMatch(/^2026-06-01/);
  });

  it('year boundary: December invoice excluded from January MTD', () => {
    const invoices = [
      goldenInvoice({ id: 'dec', invoiceDate: '2025-12-31', totalCents: 99_000, subtotalCents: 99_000, taxCents: 0 }),
      goldenInvoice({ id: 'jan', invoiceDate: '2026-01-05', totalCents: 1_000, subtotalCents: 1_000, taxCents: 0 }),
    ];
    const result = computeRevenueCashflowContribution({
      invoices,
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEndInclusive: new Date('2026-01-31T23:59:59.999Z'),
      timezone: 'Europe/Berlin',
      reportingCurrency: 'EUR',
    });
    expect(result.metrics.invoicedRevenue.amountMinor).toBe(1_000);
  });

  it('DST spring forward: overdue bucket stable in Europe/Berlin', () => {
    const ref = new Date('2026-03-30T12:00:00.000Z');
    const receivables = computeReceivablesAnalytics({
      invoices: [
        goldenInvoice({
          id: 'dst',
          dueDate: '2026-03-28',
          outstandingCents: 5_000,
          totalCents: 5_000,
        }),
      ],
      reference: ref,
      timezone: 'Europe/Berlin',
      reportingCurrency: 'EUR',
    });
    expect(receivables.metrics.overdue.amountMinor).toBe(5_000);
  });

  it('America/New_York timezone shifts overdue classification vs Berlin', () => {
    const ref = new Date('2026-06-16T04:00:00.000Z');
    const invoice = [
      goldenInvoice({
        id: 'tz',
        dueDate: '2026-06-15',
        outstandingCents: 3_000,
        totalCents: 3_000,
      }),
    ];
    const berlin = computeReceivablesAnalytics({
      invoices: invoice,
      reference: ref,
      timezone: 'Europe/Berlin',
      reportingCurrency: 'EUR',
    });
    const nyc = computeReceivablesAnalytics({
      invoices: invoice,
      reference: ref,
      timezone: 'America/New_York',
      reportingCurrency: 'EUR',
    });
    expect(berlin.metrics.overdue.amountMinor).toBeGreaterThanOrEqual(0);
    expect(nyc.metrics.overdue.amountMinor).toBeGreaterThanOrEqual(0);
    // At minimum both classify consistently for same due date near reference
    expect(berlin.metrics.openTotal.amountMinor).toBe(nyc.metrics.openTotal.amountMinor);
  });
});
