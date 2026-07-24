import type {
  AnalyticsFxContext,
  FxConversionStatus,
  MultiCurrencyAnalyticsMeta,
  MultiCurrencyDataQuality,
} from './fx.contract';
import { convertMinorForReporting } from './fx.convert';

export function trackConversion(
  dataQuality: MultiCurrencyDataQuality,
  status: FxConversionStatus,
): void {
  switch (status) {
    case 'NATIVE':
      dataQuality.nativeCount += 1;
      break;
    case 'CONVERTED':
      dataQuality.convertedCount += 1;
      break;
    case 'EXCLUDED_MISSING_CURRENCY':
      dataQuality.missingCurrencyCount += 1;
      dataQuality.excludedCount += 1;
      dataQuality.incompatibleCurrencyCount += 1;
      break;
    case 'EXCLUDED_MISSING_RATE':
      dataQuality.missingRateCount += 1;
      dataQuality.excludedCount += 1;
      dataQuality.incompatibleCurrencyCount += 1;
      break;
    case 'EXCLUDED_STALE_RATE':
      dataQuality.staleRateCount += 1;
      dataQuality.excludedCount += 1;
      dataQuality.incompatibleCurrencyCount += 1;
      break;
    default:
      break;
  }
}

/**
 * Convert a document amount to reporting currency minor units.
 * Returns null when the row must be excluded from aggregated totals.
 */
export function resolveReportingAmountMinor(
  amountMinor: number,
  documentCurrency: string | null | undefined,
  asOf: Date,
  fxContext: AnalyticsFxContext | undefined,
  reportingCurrency: string,
  dataQuality: MultiCurrencyDataQuality,
): number | null {
  if (amountMinor === 0) return 0;

  if (!fxContext) {
    const normalized = (documentCurrency ?? '').trim().toUpperCase();
    if (!normalized) {
      trackConversion(dataQuality, 'EXCLUDED_MISSING_CURRENCY');
      return null;
    }
    const reporting = reportingCurrency.toUpperCase();
    if (normalized === reporting || normalized === '€') {
      trackConversion(dataQuality, 'NATIVE');
      return amountMinor;
    }
    trackConversion(dataQuality, 'EXCLUDED_MISSING_RATE');
    return null;
  }

  const result = convertMinorForReporting(amountMinor, documentCurrency, asOf, fxContext);
  trackConversion(dataQuality, result.conversionStatus);
  return result.convertedAmountMinor;
}

export function buildMultiCurrencyMeta(
  dataQuality: MultiCurrencyDataQuality,
  totalRowsConsidered: number,
): MultiCurrencyAnalyticsMeta {
  const reasons: string[] = [];
  let completeness: MultiCurrencyAnalyticsMeta['completeness'] = 'COMPLETE';

  if (dataQuality.missingCurrencyCount > 0) {
    reasons.push('documents_missing_currency');
    completeness = 'PARTIAL';
  }
  if (dataQuality.missingRateCount > 0) {
    reasons.push('fx_rate_unavailable');
    completeness = 'PARTIAL';
  }
  if (dataQuality.staleRateCount > 0) {
    reasons.push('fx_rate_stale');
    completeness = 'PARTIAL';
  }
  if (totalRowsConsidered > 0 && dataQuality.excludedCount === totalRowsConsidered) {
    completeness = 'UNAVAILABLE';
    reasons.push('all_rows_excluded_from_reporting_currency');
  }
  if (dataQuality.convertedCount > 0) {
    reasons.push('foreign_currency_converted_to_reporting');
  }

  return {
    reportingCurrency: dataQuality.reportingCurrency,
    reportingCurrencySource: dataQuality.reportingCurrencySource,
    roundingRule: 'HALF_UP_MINOR',
    rateDatePolicies: {
      accrual: 'invoice_date',
      cash: 'payment_date',
      receivablesSnapshot: 'snapshot_date',
    },
    dataQuality,
    completeness,
    completenessReasons: reasons,
  };
}

export function createAnalyticsFxContext(
  reportingCurrency: string,
  reportingCurrencySource: AnalyticsFxContext['reportingCurrencySource'],
  rateProvider: AnalyticsFxContext['rateProvider'],
  options?: Pick<AnalyticsFxContext, 'maxRateAgeDays' | 'roundingRule'>,
): AnalyticsFxContext {
  return {
    reportingCurrency: reportingCurrency.toUpperCase(),
    reportingCurrencySource,
    rateProvider,
    maxRateAgeDays: options?.maxRateAgeDays,
    roundingRule: options?.roundingRule ?? 'HALF_UP_MINOR',
  };
}
