import { describe, expect, it } from 'vitest';
import {
  expensesInRange,
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

  it('full organisation MTD revenue includes issued rows in month (incl. open SENT)', () => {
    const mtd = mtdRevenueInRange(SCENARIO_FULL.invoices, FIXTURE_MONTH_START, FIXTURE_NOW);
    const ids = mtd.map((r) => r.id).sort();
    expect(ids).toContain('rev-1');
    expect(ids).toContain('rev-2');
    expect(ids).toContain('paid-1');
    expect(ids).toContain('open-1');
    // characterization: open SENT outgoing in MTD counts toward issued revenue (not only paid/closed)
    expect(sumCents(mtd)).toBe(112_000);
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

  it('overdue and open receivables are classified separately', () => {
    const open = openOutgoingReceivables(SCENARIO_OVERDUE_PARTIAL.invoices, FIXTURE_NOW);
    const overdue = overdueOutgoingReceivables(SCENARIO_OVERDUE_PARTIAL.invoices, FIXTURE_NOW);
    expect(overdue.map((r) => r.id)).toEqual(['overdue']);
    expect(open.map((r) => r.id)).toEqual(['open-ok']);
    expect(sumCents(overdue)).toBe(25_000);
    expect(sumCents(open)).toBe(10_000);
  });

  it('profit characterization: revenue minus expenses for full scenario', () => {
    const revenue = sumCents(mtdRevenueInRange(SCENARIO_FULL.invoices, FIXTURE_MONTH_START, FIXTURE_NOW));
    const expenses = sumCents(expensesInRange(SCENARIO_FULL.invoices, FIXTURE_MONTH_START, FIXTURE_NOW));
    expect(revenue - expenses).toBe(97_000);
  });
});
