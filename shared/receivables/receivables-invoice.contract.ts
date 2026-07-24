/**
 * Minimal invoice row for receivables analytics (Auswertungen).
 * Amounts are always integer minor units; currency is ISO-4217.
 */
export interface ReceivableInvoiceRow {
  id: string;
  type: string;
  status: string;
  totalCents: number | null;
  paidCents?: number | null;
  outstandingCents?: number | null;
  currency: string | null;
  dueDate?: string | Date | null;
  paidAt?: string | Date | null;
  invoiceDate?: string | Date | null;
  createdAt?: string | Date | null;
}

export const RECEIVABLES_AGING_BUCKETS = [
  'not_due',
  'overdue_1_7',
  'overdue_8_30',
  'overdue_31_60',
  'overdue_61_90',
  'overdue_90_plus',
] as const;

export type ReceivablesAgingBucket = (typeof RECEIVABLES_AGING_BUCKETS)[number];

export interface ReceivablesMoneyBucket {
  amountMinor: number;
  invoiceCount: number;
  currency: string;
}

export interface ReceivablesDataQuality {
  missingDueDateCount: number;
  missingDueDateOutstandingMinor: number;
  incompatibleCurrencyCount: number;
  overpaidCount: number;
  overpaidTotalMinor: number;
}

export interface ReceivablesAnalyticsResult {
  timezone: string;
  reportingCurrency: string;
  referenceInstant: string;
  metrics: {
    openTotal: ReceivablesMoneyBucket;
    openNotDue: ReceivablesMoneyBucket;
    overdue: ReceivablesMoneyBucket;
    partiallyPaid: ReceivablesMoneyBucket;
    disputed: ReceivablesMoneyBucket;
    deferred: ReceivablesMoneyBucket;
    uncollectible: ReceivablesMoneyBucket;
    cancelled: ReceivablesMoneyBucket;
    credits: ReceivablesMoneyBucket;
    refunds: ReceivablesMoneyBucket;
  };
  aging: Record<ReceivablesAgingBucket, ReceivablesMoneyBucket>;
  dataQuality: ReceivablesDataQuality;
}
