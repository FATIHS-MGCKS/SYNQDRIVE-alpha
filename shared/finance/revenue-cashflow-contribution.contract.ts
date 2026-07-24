import type { MultiCurrencyAnalyticsMeta } from '@synq/fx/fx.contract';

/**
 * Revenue / cashflow / contribution model for Auswertungen (Prompt 12/54).
 * Amounts are integer minor units; currency is ISO-4217.
 */

export type FinanceCompletenessStatus = 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';

export interface FinanceInvoiceRow {
  id: string;
  type: string;
  status: string;
  totalCents: number | null;
  subtotalCents?: number | null;
  taxCents?: number | null;
  paidCents?: number | null;
  outstandingCents?: number | null;
  currency: string | null;
  invoiceDate?: string | Date | null;
  paidAt?: string | Date | null;
  createdAt?: string | Date | null;
  cancelledAt?: string | Date | null;
  creditedAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

export interface FinanceMoneyBucket {
  amountMinor: number;
  netAmountMinor: number;
  taxAmountMinor: number;
  invoiceCount: number;
  currency: string;
}

export interface RevenueCashflowCompleteness {
  costBasis: FinanceCompletenessStatus;
  variableCostBasis: FinanceCompletenessStatus;
  operatingResultVisible: boolean;
  reasons: string[];
}

export interface RevenueCashflowDataQuality {
  missingPaidAtCount: number;
  missingSubtotalCount: number;
  /** @deprecated Prefer multiCurrency.dataQuality.excludedCount */
  incompatibleCurrencyCount: number;
  priorMonthInvoicePaidInPeriodCount: number;
  missingExpenseSource: boolean;
}

export interface RevenueCashflowContributionResult {
  reportingCurrency: string;
  timezone: string;
  periodStart: string;
  periodEndInclusive: string;
  accrualPolicy: 'invoice_date_net_with_period_adjustments';
  metrics: {
    invoicedRevenue: FinanceMoneyBucket;
    periodRevenue: FinanceMoneyBucket;
    paymentReceipts: FinanceMoneyBucket;
    refunds: FinanceMoneyBucket;
    operatingExpenses: FinanceMoneyBucket;
    netCashflow: FinanceMoneyBucket;
    directVariableCosts: FinanceMoneyBucket;
    contributionMargin: FinanceMoneyBucket;
    operatingResult: FinanceMoneyBucket | null;
  };
  completeness: RevenueCashflowCompleteness;
  dataQuality: RevenueCashflowDataQuality;
  multiCurrency: MultiCurrencyAnalyticsMeta;
}

export const FINANCE_METRIC_IDS = [
  'invoicedRevenue',
  'periodRevenue',
  'paymentReceipts',
  'refunds',
  'operatingExpenses',
  'netCashflow',
  'directVariableCosts',
  'contributionMargin',
  'operatingResult',
] as const;

export type FinanceMetricId = (typeof FINANCE_METRIC_IDS)[number];
