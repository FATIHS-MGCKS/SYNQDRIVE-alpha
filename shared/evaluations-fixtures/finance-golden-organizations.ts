/**
 * Golden organization fixtures for Auswertungen finance tests (Prompt 14/54).
 * Each org has documented expected outcomes for revenue, receivables, cashflow, FX.
 */
import type { FinanceInvoiceRow } from '@synq/finance/revenue-cashflow-contribution.contract';
import type { ReceivableInvoiceRow } from '@synq/receivables/receivables-invoice.contract';

export const GOLDEN_REFERENCE = new Date('2026-06-16T12:00:00.000Z');
export const GOLDEN_MTD_START = new Date('2026-06-01T00:00:00.000Z');
export const GOLDEN_MTD_END = new Date('2026-06-16T12:00:00.000Z');
export const GOLDEN_PREV_START = new Date('2026-05-01T00:00:00.000Z');
export const GOLDEN_PREV_END = new Date('2026-05-31T23:59:59.999Z');
export const GOLDEN_TZ_BERLIN = 'Europe/Berlin';
export const GOLDEN_TZ_NYC = 'America/New_York';

export interface GoldenFinanceInvoice extends FinanceInvoiceRow, ReceivableInvoiceRow {
  id: string;
}

export function goldenInvoice(
  overrides: Partial<GoldenFinanceInvoice> & { id: string },
): GoldenFinanceInvoice {
  return {
    type: 'OUTGOING_BOOKING',
    status: 'SENT',
    totalCents: 10_000,
    subtotalCents: 8_400,
    taxCents: 1_600,
    paidCents: 0,
    outstandingCents: 10_000,
    currency: 'EUR',
    invoiceDate: '2026-06-10',
    dueDate: '2026-06-25',
    paidAt: null,
    createdAt: '2026-06-10',
    ...overrides,
  };
}

/** Org Alpha — EUR-only, complete cost basis, standard MTD. */
export const GOLDEN_ORG_ALPHA = {
  id: 'org-alpha-eur',
  reportingCurrency: 'EUR',
  timezone: GOLDEN_TZ_BERLIN,
  invoices: [
    goldenInvoice({ id: 'a-rev-1', totalCents: 50_000, subtotalCents: 42_000, taxCents: 8_000, outstandingCents: 0, invoiceDate: '2026-06-05' }),
    goldenInvoice({ id: 'a-rev-2', totalCents: 30_000, subtotalCents: 25_200, taxCents: 4_800, outstandingCents: 0, invoiceDate: '2026-06-08' }),
    goldenInvoice({
      id: 'a-paid-prior',
      status: 'PAID',
      paidAt: '2026-06-12',
      paidCents: 20_000,
      outstandingCents: 0,
      totalCents: 20_000,
      subtotalCents: 16_800,
      taxCents: 3_200,
      invoiceDate: '2026-05-20',
    }),
    goldenInvoice({
      id: 'a-exp-1',
      type: 'INCOMING_VENDOR',
      totalCents: 15_000,
      subtotalCents: 15_000,
      taxCents: 0,
      invoiceDate: '2026-06-04',
    }),
    goldenInvoice({
      id: 'a-open',
      outstandingCents: 12_000,
      totalCents: 12_000,
      subtotalCents: 12_000,
      taxCents: 0,
      dueDate: '2026-07-01',
      invoiceDate: '2026-05-28',
    }),
    goldenInvoice({
      id: 'a-overdue',
      outstandingCents: 8_000,
      totalCents: 8_000,
      subtotalCents: 8_000,
      taxCents: 0,
      dueDate: '2026-06-01',
      invoiceDate: '2026-05-15',
    }),
  ] as GoldenFinanceInvoice[],
  expected: {
    periodRevenueNetMinor: 67_200, // 42k + 25.2k net issued MTD
    invoicedRevenueGrossMinor: 80_000,
    paymentReceiptsMinor: 20_000,
    operatingExpensesMinor: 15_000,
    openReceivablesMinor: 20_000,
    overdueReceivablesMinor: 8_000,
    operatingResultVisible: true,
    multiCurrencyCompleteness: 'COMPLETE' as const,
  },
};

/** Org Beta — EUR reporting + GBP invoice converted at 1.17 (100 GBP = 11_700 EUR cents). */
export const GOLDEN_ORG_BETA = {
  id: 'org-beta-mixed-fx',
  reportingCurrency: 'EUR',
  timezone: GOLDEN_TZ_BERLIN,
  invoices: [
    goldenInvoice({ id: 'b-eur', totalCents: 10_000, subtotalCents: 10_000, taxCents: 0, outstandingCents: 0 }),
    goldenInvoice({
      id: 'b-gbp',
      currency: 'GBP',
      totalCents: 10_000,
      subtotalCents: 10_000,
      taxCents: 0,
      outstandingCents: 10_000,
      invoiceDate: '2026-06-06',
    }),
    goldenInvoice({
      id: 'b-exp',
      type: 'INCOMING_VENDOR',
      totalCents: 5_000,
      subtotalCents: 5_000,
      taxCents: 0,
      invoiceDate: '2026-06-07',
    }),
  ] as GoldenFinanceInvoice[],
  expected: {
    periodRevenueNetMinor: 21_700, // 10_000 EUR + 11_700 GBP→EUR
    invoicedRevenueGrossMinor: 21_700,
    convertedCountMin: 1,
    multiCurrencyCompleteness: 'COMPLETE' as const,
    operatingResultVisible: true,
  },
};

/** Org Gamma — partial data: revenue without expenses, missing currency row. */
export const GOLDEN_ORG_GAMMA = {
  id: 'org-gamma-partial',
  reportingCurrency: 'EUR',
  timezone: GOLDEN_TZ_BERLIN,
  invoices: [
    goldenInvoice({ id: 'g-rev', totalCents: 25_000, subtotalCents: 25_000, taxCents: 0, outstandingCents: 0 }),
    goldenInvoice({ id: 'g-no-currency', currency: null, totalCents: 9_000, subtotalCents: 9_000, taxCents: 0 }),
    goldenInvoice({
      id: 'g-partial-pay',
      paidCents: 3_000,
      outstandingCents: 7_000,
      totalCents: 10_000,
      subtotalCents: 10_000,
      taxCents: 0,
      dueDate: '2026-06-30',
      invoiceDate: '2026-05-20',
    }),
  ] as GoldenFinanceInvoice[],
  expected: {
    periodRevenueNetMinor: 25_000,
    operatingResultVisible: false,
    missingCurrencyCount: 1,
    multiCurrencyCompleteness: 'PARTIAL' as const,
    partialPaymentOutstandingMinor: 7_000,
  },
};

/** Org Delta — credits, refunds, storno in period. */
export const GOLDEN_ORG_DELTA = {
  id: 'org-delta-adjustments',
  reportingCurrency: 'EUR',
  timezone: GOLDEN_TZ_BERLIN,
  invoices: [
    goldenInvoice({ id: 'd-issued', totalCents: 20_000, subtotalCents: 20_000, taxCents: 0, outstandingCents: 0, invoiceDate: '2026-06-03' }),
    goldenInvoice({
      id: 'd-credit',
      status: 'CREDITED',
      creditedAt: '2026-06-10',
      totalCents: 5_000,
      subtotalCents: 5_000,
      taxCents: 0,
      outstandingCents: 0,
    }),
    goldenInvoice({
      id: 'd-refund',
      status: 'REFUNDED',
      totalCents: 3_000,
      subtotalCents: 3_000,
      taxCents: 0,
      outstandingCents: 0,
      invoiceDate: '2026-05-10',
      creditedAt: '2026-06-08',
    }),
    goldenInvoice({
      id: 'd-cancel',
      status: 'CANCELLED',
      cancelledAt: '2026-06-19',
      totalCents: 2_000,
      subtotalCents: 2_000,
      taxCents: 0,
    }),
    goldenInvoice({
      id: 'd-exp',
      type: 'INCOMING_VENDOR',
      totalCents: 4_000,
      subtotalCents: 4_000,
      taxCents: 0,
      invoiceDate: '2026-06-05',
    }),
  ] as GoldenFinanceInvoice[],
  expected: {
    periodRevenueNetMinor: 12_000, // 20k issued − 5k credit − 3k refund
    refundsGrossMinor: 3_000,
    operatingResultVisible: true,
  },
};

/** Org Epsilon — missing FX rate for SEK invoice (not in reference table). */
export const GOLDEN_ORG_EPSILON = {
  id: 'org-epsilon-missing-fx',
  reportingCurrency: 'EUR',
  timezone: GOLDEN_TZ_BERLIN,
  invoices: [
    goldenInvoice({ id: 'e-eur', totalCents: 5_000, subtotalCents: 5_000, taxCents: 0, outstandingCents: 0 }),
    goldenInvoice({
      id: 'e-sek',
      currency: 'SEK',
      totalCents: 8_000,
      subtotalCents: 8_000,
      taxCents: 0,
      outstandingCents: 0,
      invoiceDate: '2026-06-09',
    }),
  ] as GoldenFinanceInvoice[],
  expected: {
    periodRevenueNetMinor: 5_000,
    missingRateCountMin: 1,
    multiCurrencyCompleteness: 'PARTIAL' as const,
  },
};

export const ALL_GOLDEN_ORGANIZATIONS = [
  GOLDEN_ORG_ALPHA,
  GOLDEN_ORG_BETA,
  GOLDEN_ORG_DELTA,
  GOLDEN_ORG_EPSILON,
  GOLDEN_ORG_GAMMA,
] as const;
