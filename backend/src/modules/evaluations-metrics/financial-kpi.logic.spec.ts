import {
  expensesInRange,
  issuedRevenueInRange,
  openOutgoingReceivables,
  overdueOutgoingReceivables,
  sumOutstandingCents,
  FINANCIAL_KPI_EXCLUSIONS,
} from './financial-kpi.logic';
import { GOLDEN_ORG_ALPHA, goldenInvoice } from '@synq/evaluations-fixtures/finance-golden-organizations';

const FROM = new Date('2026-06-01T00:00:00.000Z');
const TO = new Date('2026-06-16T12:00:00.000Z');
const REF = new Date('2026-06-16T12:00:00.000Z');

describe('financial-kpi.logic', () => {
  it('issuedRevenueInRange includes only EUR revenue invoices in period', () => {
    const invoices = [
      ...GOLDEN_ORG_ALPHA.invoices,
      goldenInvoice({ id: 'usd-skip', currency: 'USD', invoiceDate: '2026-06-09', outstandingCents: 0 }),
    ] as Parameters<typeof issuedRevenueInRange>[0];
    const rows = issuedRevenueInRange(invoices, FROM, TO);
    expect(rows.every((r) => (r.currency ?? '').toUpperCase() === 'EUR')).toBe(true);
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining(['a-rev-1', 'a-rev-2']));
    expect(rows.map((r) => r.id)).not.toContain('usd-skip');
  });

  it('expensesInRange excludes outgoing invoices', () => {
    const rows = expensesInRange(GOLDEN_ORG_ALPHA.invoices, FROM, TO);
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe('a-exp-1');
  });

  it('openOutgoingReceivables uses native currency filter', () => {
    const open = openOutgoingReceivables(GOLDEN_ORG_ALPHA.invoices, REF, 'EUR');
    expect(open.map((r) => r.id).sort()).toEqual(['a-open', 'a-overdue']);
    expect(sumOutstandingCents(open, 'EUR')).toBe(20_000);
  });

  it('overdueOutgoingReceivables respects org timezone', () => {
    const overdue = overdueOutgoingReceivables(
      GOLDEN_ORG_ALPHA.invoices,
      REF,
      'Europe/Berlin',
      'EUR',
    );
    expect(overdue.map((r) => r.id)).toEqual(['a-overdue']);
  });

  it('exposes non_eur exclusion key for API coverage', () => {
    expect(FINANCIAL_KPI_EXCLUSIONS.nonEur).toBe('non_eur_currency_rows');
  });
});
