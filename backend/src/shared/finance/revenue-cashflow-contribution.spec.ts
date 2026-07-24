import { computeRevenueCashflowContribution } from '@synq/finance/revenue-cashflow-contribution';
import type { FinanceInvoiceRow } from '@synq/finance/revenue-cashflow-contribution.contract';

const FROM = new Date('2026-06-01T00:00:00.000Z');
const TO = new Date('2026-06-30T23:59:59.999Z');

function inv(overrides: Partial<FinanceInvoiceRow> & { id: string }): FinanceInvoiceRow {
  return {
    type: 'OUTGOING_BOOKING',
    status: 'SENT',
    totalCents: 10_000,
    subtotalCents: 8_400,
    taxCents: 1_600,
    paidCents: 0,
    currency: 'EUR',
    invoiceDate: '2026-06-10',
    paidAt: null,
    createdAt: '2026-06-10',
    ...overrides,
  };
}

describe('computeRevenueCashflowContribution', () => {
  it('does not count prior-month invoice paid in current month as invoiced revenue', () => {
    const result = computeRevenueCashflowContribution({
      invoices: [
        inv({
          id: 'prior',
          invoiceDate: '2026-05-15',
          status: 'PAID',
          paidAt: '2026-06-12',
          paidCents: 10_000,
          totalCents: 10_000,
        }),
      ],
      periodStart: FROM,
      periodEndInclusive: TO,
    });
    expect(result.metrics.invoicedRevenue.invoiceCount).toBe(0);
    expect(result.metrics.paymentReceipts.amountMinor).toBe(10_000);
    expect(result.dataQuality.priorMonthInvoicePaidInPeriodCount).toBe(1);
  });

  it('counts invoice and payment in same month separately', () => {
    const result = computeRevenueCashflowContribution({
      invoices: [
        inv({
          id: 'same',
          invoiceDate: '2026-06-08',
          status: 'PAID',
          paidAt: '2026-06-15',
          paidCents: 10_000,
        }),
      ],
      periodStart: FROM,
      periodEndInclusive: TO,
    });
    expect(result.metrics.invoicedRevenue.amountMinor).toBe(10_000);
    expect(result.metrics.paymentReceipts.amountMinor).toBe(10_000);
  });

  it('handles partial payment by paidCents in payment receipts', () => {
    const result = computeRevenueCashflowContribution({
      invoices: [
        inv({
          id: 'partial',
          status: 'SENT',
          totalCents: 10_000,
          paidCents: 4_000,
          paidAt: '2026-06-14',
        }),
      ],
      periodStart: FROM,
      periodEndInclusive: TO,
    });
    expect(result.metrics.paymentReceipts.amountMinor).toBe(4_000);
    expect(result.metrics.invoicedRevenue.amountMinor).toBe(10_000);
  });

  it('tracks refunds and reduces net cashflow', () => {
    const result = computeRevenueCashflowContribution({
      invoices: [
        inv({
          id: 'ref',
          status: 'REFUNDED',
          totalCents: 5_000,
          subtotalCents: 4_200,
          taxCents: 800,
          invoiceDate: '2026-06-05',
        }),
      ],
      periodStart: FROM,
      periodEndInclusive: TO,
    });
    expect(result.metrics.refunds.amountMinor).toBe(5_000);
    expect(result.metrics.periodRevenue.netAmountMinor).toBe(0);
  });

  it('excludes credited invoices from period revenue', () => {
    const result = computeRevenueCashflowContribution({
      invoices: [
        inv({ id: 'issued', invoiceDate: '2026-06-04', totalCents: 10_000, subtotalCents: 10_000, taxCents: 0 }),
        inv({
          id: 'credit',
          status: 'CREDITED',
          creditedAt: '2026-06-20',
          totalCents: 3_000,
          subtotalCents: 3_000,
          taxCents: 0,
        }),
      ],
      periodStart: FROM,
      periodEndInclusive: TO,
    });
    expect(result.metrics.invoicedRevenue.netAmountMinor).toBe(10_000);
    expect(result.metrics.periodRevenue.netAmountMinor).toBe(7_000);
  });

  it('marks operating result hidden when expense source missing but revenue exists', () => {
    const result = computeRevenueCashflowContribution({
      invoices: [inv({ id: 'rev' })],
      periodStart: FROM,
      periodEndInclusive: TO,
    });
    expect(result.completeness.operatingResultVisible).toBe(false);
    expect(result.metrics.operatingResult).toBeNull();
    expect(result.completeness.costBasis).toBe('PARTIAL');
  });

  it('reports tax amounts separately from net revenue', () => {
    const result = computeRevenueCashflowContribution({
      invoices: [inv({ id: 'taxed', subtotalCents: 8_000, taxCents: 2_000, totalCents: 10_000 })],
      periodStart: FROM,
      periodEndInclusive: TO,
    });
    expect(result.metrics.invoicedRevenue.netAmountMinor).toBe(8_000);
    expect(result.metrics.invoicedRevenue.taxAmountMinor).toBe(2_000);
  });

  it('computes net cashflow with expense outflow', () => {
    const result = computeRevenueCashflowContribution({
      invoices: [
        inv({
          id: 'in',
          status: 'PAID',
          paidAt: '2026-06-10',
          paidCents: 10_000,
        }),
        inv({
          id: 'exp',
          type: 'INCOMING_VENDOR',
          status: 'PAID',
          invoiceDate: '2026-06-08',
          paidAt: '2026-06-09',
          paidCents: 3_000,
          totalCents: 3_000,
          subtotalCents: 3_000,
          taxCents: 0,
        }),
      ],
      periodStart: FROM,
      periodEndInclusive: TO,
    });
    expect(result.metrics.netCashflow.amountMinor).toBe(7_000);
    expect(result.completeness.operatingResultVisible).toBe(true);
  });

  it('excludes non-EUR invoices from reporting currency totals', () => {
    const result = computeRevenueCashflowContribution({
      invoices: [
        inv({ id: 'eur', totalCents: 1_000 }),
        inv({ id: 'usd', currency: 'USD', totalCents: 9_000 }),
      ],
      periodStart: FROM,
      periodEndInclusive: TO,
      reportingCurrency: 'EUR',
    });
    expect(result.metrics.invoicedRevenue.amountMinor).toBe(1_000);
    expect(result.dataQuality.incompatibleCurrencyCount).toBe(1);
  });
});
