import { describe, expect, it } from 'vitest';
import {
  computeReceivablesAnalytics,
  computeRevenueCashflowContribution,
  expensesInRange,
  issuedRevenueInRange,
  mtdRevenueInRange,
  openOutgoingReceivables,
  overdueOutgoingReceivables,
  paidRevenueInRange,
  sumCents,
} from '../financial-insights.logic';
import {
  FIXTURE_MONTH_START,
  FIXTURE_NOW,
  SCENARIO_EMPTY,
  SCENARIO_FAILED_SOURCES,
  SCENARIO_FULL,
  SCENARIO_MULTI_CURRENCY,
  SCENARIO_OVERDUE_PARTIAL,
  SCENARIO_PARTIAL,
} from './evaluations-test-fixtures';

describe('financial-insights scenarios (characterization)', () => {
  it('empty organisation yields zero aggregates', () => {
    const { invoices } = SCENARIO_EMPTY;
    expect(sumCents(mtdRevenueInRange(invoices, FIXTURE_MONTH_START, FIXTURE_NOW))).toBe(0);
    expect(sumCents(expensesInRange(invoices, FIXTURE_MONTH_START, FIXTURE_NOW))).toBe(0);
    expect(openOutgoingReceivables(invoices, FIXTURE_NOW)).toHaveLength(0);
    expect(overdueOutgoingReceivables(invoices, FIXTURE_NOW)).toHaveLength(0);
  });

  it('failed API sources (empty invoice list) degrade to zero without throwing', () => {
    const { invoices } = SCENARIO_FAILED_SOURCES;
    expect(() => sumCents(mtdRevenueInRange(invoices, FIXTURE_MONTH_START, FIXTURE_NOW))).not.toThrow();
    expect(sumCents(mtdRevenueInRange(invoices, FIXTURE_MONTH_START, FIXTURE_NOW))).toBe(0);
  });

  it('strict invoiced MTD excludes prior-month invoice paid in current month', () => {
    const issued = issuedRevenueInRange(SCENARIO_FULL.invoices, FIXTURE_MONTH_START, FIXTURE_NOW);
    const rcx = computeRevenueCashflowContribution({
      invoices: SCENARIO_FULL.invoices,
      periodStart: FIXTURE_MONTH_START,
      periodEndInclusive: FIXTURE_NOW,
      timezone: 'Europe/Berlin',
    });
    expect(issued.map((r) => r.id).sort()).toEqual(['open-1', 'rev-1', 'rev-2']);
    expect(sumCents(issued)).toBe(92_000);
    expect(rcx.metrics.paymentReceipts.amountMinor).toBe(20_000);
    expect(rcx.dataQuality.priorMonthInvoicePaidInPeriodCount).toBe(1);
  });

  it('full organisation expenses MTD sums incoming EUR in month', () => {
    const exp = expensesInRange(SCENARIO_FULL.invoices, FIXTURE_MONTH_START, FIXTURE_NOW);
    expect(exp.map((r) => r.id)).toEqual(['exp-1']);
    expect(sumCents(exp)).toBe(15_000);
  });

  it('partial data: paid without paidAt is excluded from paid revenue MTD', () => {
    const paid = paidRevenueInRange(SCENARIO_PARTIAL.invoices, FIXTURE_MONTH_START, FIXTURE_NOW);
    expect(paid).toHaveLength(0);
  });

  it('partial data: invoice without effective date is excluded from MTD revenue', () => {
    const mtd = mtdRevenueInRange(SCENARIO_PARTIAL.invoices, FIXTURE_MONTH_START, FIXTURE_NOW);
    expect(mtd.map((r) => r.id)).not.toContain('no-date');
  });

  it('multi-currency: only EUR invoices contribute to MTD revenue', () => {
    const mtd = mtdRevenueInRange(SCENARIO_MULTI_CURRENCY.invoices, FIXTURE_MONTH_START, FIXTURE_NOW);
    expect(mtd.map((r) => r.id)).toEqual(['eur']);
    expect(sumCents(mtd)).toBe(10_000);
  });

  it('multi-currency: USD expense-like rows are excluded from EUR expense sum', () => {
    const exp = expensesInRange(SCENARIO_MULTI_CURRENCY.invoices, FIXTURE_MONTH_START, FIXTURE_NOW);
    expect(sumCents(exp)).toBe(2_000);
  });

  it('overdue and open receivables are classified separately by outstanding balance', () => {
    const invoices = [
      {
        ...SCENARIO_OVERDUE_PARTIAL.invoices[0],
        paidCents: 0,
        outstandingCents: 25_000,
      },
      {
        ...SCENARIO_OVERDUE_PARTIAL.invoices[1],
        paidCents: 0,
        outstandingCents: 10_000,
      },
    ];
    const analytics = computeReceivablesAnalytics({
      invoices,
      reference: FIXTURE_NOW,
      timezone: 'Europe/Berlin',
    });
    expect(analytics.metrics.overdue.invoiceCount).toBe(1);
    expect(analytics.metrics.overdue.amountMinor).toBe(25_000);
    expect(analytics.metrics.openNotDue.amountMinor).toBe(10_000);
    expect(analytics.metrics.openTotal.amountMinor).toBe(35_000);
  });

  it('profit characterization: periodic net minus expenses when cost basis complete', () => {
    const rcx = computeRevenueCashflowContribution({
      invoices: SCENARIO_FULL.invoices,
      periodStart: FIXTURE_MONTH_START,
      periodEndInclusive: FIXTURE_NOW,
      timezone: 'Europe/Berlin',
    });
    const expenses = rcx.metrics.operatingExpenses.netAmountMinor;
    expect(rcx.metrics.periodRevenue.netAmountMinor - expenses).toBe(77_000);
  });
});
