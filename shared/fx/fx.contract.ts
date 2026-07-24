/**
 * Multi-currency FX contracts for Auswertungen analytics (Prompt 13/54).
 * Reporting-layer only — operational flows stay single-currency per Money domain rules.
 */

export type FxRoundingRule = 'HALF_UP_MINOR';

export type FxConversionStatus =
  | 'NATIVE'
  | 'CONVERTED'
  | 'EXCLUDED_MISSING_CURRENCY'
  | 'EXCLUDED_MISSING_RATE'
  | 'EXCLUDED_STALE_RATE';

export type FxRateDatePolicy = 'invoice_date' | 'payment_date' | 'snapshot_date';

export type OrgReportingCurrencySource =
  | 'organization_explicit'
  | 'payment_account_default'
  | 'price_book_primary'
  | 'platform_default';

export interface FxRateQuote {
  fromCurrency: string;
  toCurrency: string;
  /** 1 major unit of fromCurrency = rateNumerator / rateDenominator major units of toCurrency */
  rateNumerator: number;
  rateDenominator: number;
  /** ISO date-only (YYYY-MM-DD) when this rate was effective */
  effectiveDate: string;
  source: string;
  fetchedAt?: string;
}

export interface FxRateProvider {
  getRate(fromCurrency: string, toCurrency: string, asOf: Date): FxRateQuote | null;
}

export interface FxConversionResult {
  originalCurrency: string;
  originalAmountMinor: number;
  reportingCurrency: string;
  convertedAmountMinor: number | null;
  exchangeRate: { numerator: number; denominator: number } | null;
  exchangeRateDate: string | null;
  exchangeRateSource: string | null;
  conversionStatus: FxConversionStatus;
  roundingRule: FxRoundingRule;
}

export interface AnalyticsFxContext {
  reportingCurrency: string;
  reportingCurrencySource: OrgReportingCurrencySource;
  rateProvider: FxRateProvider;
  /** Days after effectiveDate before a rate is considered stale for asOf. Default 7. */
  maxRateAgeDays?: number;
  roundingRule?: FxRoundingRule;
}

export interface MultiCurrencyDataQuality {
  reportingCurrency: string;
  reportingCurrencySource: OrgReportingCurrencySource;
  missingCurrencyCount: number;
  missingRateCount: number;
  staleRateCount: number;
  convertedCount: number;
  nativeCount: number;
  excludedCount: number;
  /** @deprecated Use excludedCount + conversion breakdown — kept for migration */
  incompatibleCurrencyCount: number;
}

export interface MultiCurrencyAnalyticsMeta {
  reportingCurrency: string;
  reportingCurrencySource: OrgReportingCurrencySource;
  roundingRule: FxRoundingRule;
  rateDatePolicies: {
    accrual: 'invoice_date';
    cash: 'payment_date';
    receivablesSnapshot: 'snapshot_date';
  };
  dataQuality: MultiCurrencyDataQuality;
  completeness: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
  completenessReasons: string[];
}

/** ISO-4217 currencies supported in analytics FX tables (extend as markets are added). */
export const SUPPORTED_ANALYTICS_CURRENCIES = [
  'EUR',
  'GBP',
  'USD',
  'CHF',
  'PLN',
  'CZK',
  'JPY',
  'BHD',
] as const;

export type SupportedAnalyticsCurrency = (typeof SUPPORTED_ANALYTICS_CURRENCIES)[number];

export function emptyMultiCurrencyDataQuality(
  reportingCurrency: string,
  reportingCurrencySource: OrgReportingCurrencySource,
): MultiCurrencyDataQuality {
  return {
    reportingCurrency,
    reportingCurrencySource,
    missingCurrencyCount: 0,
    missingRateCount: 0,
    staleRateCount: 0,
    convertedCount: 0,
    nativeCount: 0,
    excludedCount: 0,
    incompatibleCurrencyCount: 0,
  };
}
