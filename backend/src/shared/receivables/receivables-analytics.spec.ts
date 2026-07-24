import {
  computeReceivablesAnalytics,
  resolveOutstandingMinor,
} from '@synq/receivables/receivables-analytics';
import type { ReceivableInvoiceRow } from '@synq/receivables/receivables-invoice.contract';
import { daysOverdueInTimezone } from '@synq/receivables/receivables-zoned-due';

const REF = new Date('2026-06-16T12:00:00.000Z');
const TZ_BERLIN = 'Europe/Berlin';
const TZ_NYC = 'America/New_York';

function inv(overrides: Partial<ReceivableInvoiceRow> & { id: string }): ReceivableInvoiceRow {
  return {
    type: 'OUTGOING_BOOKING',
    status: 'SENT',
    totalCents: 10_000,
    paidCents: 0,
    outstandingCents: 10_000,
    currency: 'EUR',
    dueDate: '2026-06-20',
    paidAt: null,
    invoiceDate: '2026-06-01',
    createdAt: '2026-06-01',
    ...overrides,
  };
}

describe('computeReceivablesAnalytics', () => {
  it('sums open total from outstanding balances with partial payment', () => {
    const result = computeReceivablesAnalytics({
      invoices: [
        inv({
          id: 'partial',
          totalCents: 10_000,
          paidCents: 4_000,
          outstandingCents: 6_000,
          dueDate: '2026-06-30',
        }),
      ],
      reference: REF,
      timezone: TZ_BERLIN,
    });
    expect(result.metrics.openTotal.amountMinor).toBe(6_000);
    expect(result.metrics.partiallyPaid.amountMinor).toBe(6_000);
    expect(result.metrics.openNotDue.amountMinor).toBe(6_000);
    expect(result.metrics.overdue.amountMinor).toBe(0);
  });

  it('clamps overpayment to zero open balance and records data quality', () => {
    const result = computeReceivablesAnalytics({
      invoices: [
        inv({
          id: 'overpaid',
          status: 'SENT',
          totalCents: 5_000,
          paidCents: 7_000,
          outstandingCents: 0,
        }),
      ],
      reference: REF,
      timezone: TZ_BERLIN,
    });
    expect(result.metrics.openTotal.amountMinor).toBe(0);
    expect(result.dataQuality.overpaidCount).toBe(1);
    expect(result.dataQuality.overpaidTotalMinor).toBe(2_000);
  });

  it('excludes cancelled and credited invoices from open receivables', () => {
    const result = computeReceivablesAnalytics({
      invoices: [
        inv({ id: 'cancel', status: 'CANCELLED', totalCents: 8_000 }),
        inv({ id: 'credit', status: 'CREDITED', totalCents: 3_000 }),
        inv({ id: 'open', status: 'SENT', outstandingCents: 2_000, totalCents: 2_000 }),
      ],
      reference: REF,
      timezone: TZ_BERLIN,
    });
    expect(result.metrics.openTotal.amountMinor).toBe(2_000);
    expect(result.metrics.cancelled.amountMinor).toBe(8_000);
    expect(result.metrics.credits.amountMinor).toBe(3_000);
  });

  it('tracks refunds separately', () => {
    const result = computeReceivablesAnalytics({
      invoices: [inv({ id: 'ref', status: 'REFUNDED', totalCents: 4_500 })],
      reference: REF,
      timezone: TZ_BERLIN,
    });
    expect(result.metrics.refunds.amountMinor).toBe(4_500);
    expect(result.metrics.openTotal.amountMinor).toBe(0);
  });

  it('flags missing due dates without emitting null amounts', () => {
    const result = computeReceivablesAnalytics({
      invoices: [inv({ id: 'no-due', dueDate: null, outstandingCents: 1_500, totalCents: 1_500 })],
      reference: REF,
      timezone: TZ_BERLIN,
    });
    expect(result.dataQuality.missingDueDateCount).toBe(1);
    expect(result.dataQuality.missingDueDateOutstandingMinor).toBe(1_500);
    expect(result.metrics.openTotal.amountMinor).toBe(1_500);
    expect(result.aging.not_due.amountMinor).toBe(1_500);
  });

  it('assigns aging buckets by days overdue in org timezone', () => {
    const result = computeReceivablesAnalytics({
      invoices: [
        inv({ id: 'd7', outstandingCents: 1_000, dueDate: '2026-06-09' }),
        inv({ id: 'd20', outstandingCents: 2_000, dueDate: '2026-05-27' }),
        inv({ id: 'd45', outstandingCents: 3_000, dueDate: '2026-05-02' }),
        inv({ id: 'd75', outstandingCents: 4_000, dueDate: '2026-04-02' }),
        inv({ id: 'd120', outstandingCents: 5_000, dueDate: '2026-02-17' }),
        inv({ id: 'future', outstandingCents: 6_000, dueDate: '2026-06-30' }),
      ],
      reference: REF,
      timezone: TZ_BERLIN,
    });
    expect(result.aging.overdue_1_7.amountMinor).toBe(1_000);
    expect(result.aging.overdue_8_30.amountMinor).toBe(2_000);
    expect(result.aging.overdue_31_60.amountMinor).toBe(3_000);
    expect(result.aging.overdue_61_90.amountMinor).toBe(4_000);
    expect(result.aging.overdue_90_plus.amountMinor).toBe(5_000);
    expect(result.aging.not_due.amountMinor).toBe(6_000);
    expect(result.metrics.overdue.amountMinor).toBe(15_000);
  });

  it('uses timezone for due-day boundary (same instant, different calendar due days)', () => {
    const dueInstant = new Date('2026-06-15T23:30:00.000Z');
    const refInstant = new Date('2026-06-16T10:00:00.000Z');
    const berlinDays = daysOverdueInTimezone(dueInstant, refInstant, TZ_BERLIN);
    const nycDays = daysOverdueInTimezone(dueInstant, refInstant, TZ_NYC);
    expect(berlinDays).toBe(0);
    expect(nycDays).toBe(1);

    const resultBerlin = computeReceivablesAnalytics({
      invoices: [inv({ id: 'tz', outstandingCents: 9_000, dueDate: dueInstant })],
      reference: refInstant,
      timezone: TZ_BERLIN,
    });
    expect(resultBerlin.metrics.overdue.amountMinor).toBe(0);
    expect(resultBerlin.metrics.openNotDue.amountMinor).toBe(9_000);

    const resultNyc = computeReceivablesAnalytics({
      invoices: [inv({ id: 'tz', outstandingCents: 9_000, dueDate: dueInstant })],
      reference: refInstant,
      timezone: TZ_NYC,
    });
    expect(resultNyc.metrics.overdue.amountMinor).toBe(9_000);
    expect(resultNyc.metrics.openNotDue.amountMinor).toBe(0);
  });

  it('excludes non-reporting currencies and counts them in data quality', () => {
    const result = computeReceivablesAnalytics({
      invoices: [
        inv({ id: 'eur', outstandingCents: 1_000, currency: 'EUR' }),
        inv({ id: 'usd', outstandingCents: 9_999, currency: 'USD' }),
      ],
      reference: REF,
      timezone: TZ_BERLIN,
      reportingCurrency: 'EUR',
    });
    expect(result.metrics.openTotal.amountMinor).toBe(1_000);
    expect(result.dataQuality.incompatibleCurrencyCount).toBe(1);
  });

  it('resolves outstanding from total minus paid when outstandingCents missing', () => {
    expect(
      resolveOutstandingMinor({
        id: 'x',
        type: 'OUTGOING_MANUAL',
        status: 'SENT',
        totalCents: 10_000,
        paidCents: 3_500,
        currency: 'EUR',
      }),
    ).toBe(6_500);
  });
});
