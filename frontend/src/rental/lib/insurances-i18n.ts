/**
 * Rental Insurances presentation helpers.
 * Machine status/inquiry values stay unchanged; labels resolve via TranslationKey.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  getFormattingLocale,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

/** Persisted fleet insurance status values — never translate for API payloads. */
export const INSURANCE_STATUS_VALUES = [
  'ACTIVE',
  'EXPIRING_SOON',
  'EXPIRED',
  'MISSING',
  'PENDING_INQUIRY',
] as const;

export type InsuranceStatusValue = (typeof INSURANCE_STATUS_VALUES)[number];

export const INSURANCE_STATUS_FILTER_OPTIONS = ['all', ...INSURANCE_STATUS_VALUES] as const;

export type InsuranceStatusFilter = (typeof INSURANCE_STATUS_FILTER_OPTIONS)[number];

export const INQUIRY_PURPOSE_VALUES = [
  'quote_standard',
  'quote_usage_based',
  'quote_kilometer_based',
  'quote_driving_score',
  'contract_optimization',
  'replacement_insurer',
  'dynamic_insurance_interest',
] as const;

export type InquiryPurposeValue = (typeof INQUIRY_PURPOSE_VALUES)[number];

export const TIME_RANGE_VALUES = [
  'last_30_days',
  'last_90_days',
  'last_6_months',
  'last_12_months',
  'custom',
] as const;

export type TimeRangeValue = (typeof TIME_RANGE_VALUES)[number];

export const REPORTING_FREQUENCY_VALUES = ['daily', 'weekly', 'monthly'] as const;
export type ReportingFrequencyValue = (typeof REPORTING_FREQUENCY_VALUES)[number];

export const AGGREGATION_LEVEL_VALUES = ['aggregated', 'detailed'] as const;
export type AggregationLevelValue = (typeof AGGREGATION_LEVEL_VALUES)[number];

export const HISTORICAL_DATA_GROUP_KEYS = [
  'mileageUsage',
  'tripDriving',
  'safetyEvents',
  'vehicleHealth',
] as const;

export const HISTORICAL_DATA_ITEM_KEYS = [
  'odometer_history',
  'mileage_summary',
  'average_monthly_mileage',
  'vehicle_utilization',
  'trip_history',
  'trip_distance_aggregates',
  'driving_score_history',
  'harsh_braking_events',
  'harsh_acceleration_events',
  'speeding_events',
  'nighttime_driving_share',
  'maintenance_summary',
  'vehicle_health_summary',
  'idle_time_summary',
] as const;

export type HistoricalDataItemKey = (typeof HISTORICAL_DATA_ITEM_KEYS)[number];

export const LIVE_DATA_ITEM_KEYS = [
  'odometer_updates',
  'trip_distance',
  'vehicle_utilization',
  'driving_score_updates',
  'speeding_summaries',
  'harsh_braking_summaries',
  'harsh_acceleration_summaries',
  'time_of_day_patterns',
  'trip_frequency',
] as const;

export type LiveDataItemKey = (typeof LIVE_DATA_ITEM_KEYS)[number];

export const INSURANCE_WIZARD_STEP_KEYS = [
  'vehicle',
  'insurers',
  'purpose',
  'historical',
  'timeRange',
  'liveData',
  'review',
  'submit',
] as const;

const INSURANCE_STATUS_LABEL_KEYS: Record<InsuranceStatusValue, TranslationKey> = {
  ACTIVE: 'insurances.status.ACTIVE',
  EXPIRING_SOON: 'insurances.status.EXPIRING_SOON',
  EXPIRED: 'insurances.status.EXPIRED',
  MISSING: 'insurances.status.MISSING',
  PENDING_INQUIRY: 'insurances.status.PENDING_INQUIRY',
};

const INQUIRY_PURPOSE_LABEL_KEYS: Record<InquiryPurposeValue, TranslationKey> = {
  quote_standard: 'insurances.inquiry.purpose.quote_standard.label',
  quote_usage_based: 'insurances.inquiry.purpose.quote_usage_based.label',
  quote_kilometer_based: 'insurances.inquiry.purpose.quote_kilometer_based.label',
  quote_driving_score: 'insurances.inquiry.purpose.quote_driving_score.label',
  contract_optimization: 'insurances.inquiry.purpose.contract_optimization.label',
  replacement_insurer: 'insurances.inquiry.purpose.replacement_insurer.label',
  dynamic_insurance_interest: 'insurances.inquiry.purpose.dynamic_insurance_interest.label',
};

const INQUIRY_PURPOSE_DESC_KEYS: Record<InquiryPurposeValue, TranslationKey> = {
  quote_standard: 'insurances.inquiry.purpose.quote_standard.desc',
  quote_usage_based: 'insurances.inquiry.purpose.quote_usage_based.desc',
  quote_kilometer_based: 'insurances.inquiry.purpose.quote_kilometer_based.desc',
  quote_driving_score: 'insurances.inquiry.purpose.quote_driving_score.desc',
  contract_optimization: 'insurances.inquiry.purpose.contract_optimization.desc',
  replacement_insurer: 'insurances.inquiry.purpose.replacement_insurer.desc',
  dynamic_insurance_interest: 'insurances.inquiry.purpose.dynamic_insurance_interest.desc',
};

const TIME_RANGE_LABEL_KEYS: Record<TimeRangeValue, TranslationKey> = {
  last_30_days: 'insurances.timeRange.last_30_days',
  last_90_days: 'insurances.timeRange.last_90_days',
  last_6_months: 'insurances.timeRange.last_6_months',
  last_12_months: 'insurances.timeRange.last_12_months',
  custom: 'insurances.timeRange.custom',
};

const HISTORICAL_GROUP_LABEL_KEYS: Record<(typeof HISTORICAL_DATA_GROUP_KEYS)[number], TranslationKey> = {
  mileageUsage: 'insurances.historical.group.mileageUsage',
  tripDriving: 'insurances.historical.group.tripDriving',
  safetyEvents: 'insurances.historical.group.safetyEvents',
  vehicleHealth: 'insurances.historical.group.vehicleHealth',
};

const HISTORICAL_ITEM_LABEL_KEYS = Object.fromEntries(
  HISTORICAL_DATA_ITEM_KEYS.map((key) => [key, `insurances.historical.${key}.label` as TranslationKey]),
) as Record<HistoricalDataItemKey, TranslationKey>;

const HISTORICAL_ITEM_DESC_KEYS = Object.fromEntries(
  HISTORICAL_DATA_ITEM_KEYS.map((key) => [key, `insurances.historical.${key}.desc` as TranslationKey]),
) as Record<HistoricalDataItemKey, TranslationKey>;

const LIVE_DATA_LABEL_KEYS = Object.fromEntries(
  LIVE_DATA_ITEM_KEYS.map((key) => [key, `insurances.live.${key}.label` as TranslationKey]),
) as Record<LiveDataItemKey, TranslationKey>;

const LIVE_DATA_DESC_KEYS = Object.fromEntries(
  LIVE_DATA_ITEM_KEYS.map((key) => [key, `insurances.live.${key}.desc` as TranslationKey]),
) as Record<LiveDataItemKey, TranslationKey>;

const WIZARD_STEP_LABEL_KEYS = Object.fromEntries(
  INSURANCE_WIZARD_STEP_KEYS.map((key) => [key, `insurances.wizard.step.${key}` as TranslationKey]),
) as Record<(typeof INSURANCE_WIZARD_STEP_KEYS)[number], TranslationKey>;

export const HISTORICAL_DATA_GROUPS: {
  groupKey: (typeof HISTORICAL_DATA_GROUP_KEYS)[number];
  items: HistoricalDataItemKey[];
}[] = [
  { groupKey: 'mileageUsage', items: ['odometer_history', 'mileage_summary', 'average_monthly_mileage', 'vehicle_utilization'] },
  { groupKey: 'tripDriving', items: ['trip_history', 'trip_distance_aggregates', 'driving_score_history'] },
  { groupKey: 'safetyEvents', items: ['harsh_braking_events', 'harsh_acceleration_events', 'speeding_events', 'nighttime_driving_share'] },
  { groupKey: 'vehicleHealth', items: ['maintenance_summary', 'vehicle_health_summary', 'idle_time_summary'] },
];

export const TIME_RANGE_OPTIONS: { value: TimeRangeValue; days: number }[] = [
  { value: 'last_30_days', days: 30 },
  { value: 'last_90_days', days: 90 },
  { value: 'last_6_months', days: 183 },
  { value: 'last_12_months', days: 365 },
  { value: 'custom', days: 0 },
];

export const STATUS_ORDER: Record<string, number> = {
  EXPIRED: 0,
  MISSING: 1,
  EXPIRING_SOON: 2,
  PENDING_INQUIRY: 3,
  ACTIVE: 4,
};

export function resolveInsurancesLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function ii(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveInsurancesLocale(locale), key, vars).text;
}

export function insurancesFormattingLocale(locale: string): string {
  return getFormattingLocale(resolveInsurancesLocale(locale));
}

export function formatInsuranceDate(locale: string, iso: string | null): string {
  if (!iso) return ii(locale, 'insurances.emptyValue');
  return new Date(iso).toLocaleDateString(insurancesFormattingLocale(locale), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function labelInsuranceStatus(locale: string, status: string): string {
  const key = INSURANCE_STATUS_LABEL_KEYS[status as InsuranceStatusValue];
  return key ? ii(locale, key) : status;
}

export function labelInquiryPurpose(locale: string, value: string): string {
  const key = INQUIRY_PURPOSE_LABEL_KEYS[value as InquiryPurposeValue];
  return key ? ii(locale, key) : value;
}

export function descInquiryPurpose(locale: string, value: string): string {
  const key = INQUIRY_PURPOSE_DESC_KEYS[value as InquiryPurposeValue];
  return key ? ii(locale, key) : '';
}

export function labelTimeRange(locale: string, value: string): string {
  const key = TIME_RANGE_LABEL_KEYS[value as TimeRangeValue];
  return key ? ii(locale, key) : value;
}

export function labelHistoricalGroup(locale: string, groupKey: string): string {
  const key = HISTORICAL_GROUP_LABEL_KEYS[groupKey as (typeof HISTORICAL_DATA_GROUP_KEYS)[number]];
  return key ? ii(locale, key) : groupKey;
}

export function labelHistoricalItem(locale: string, itemKey: string): string {
  const key = HISTORICAL_ITEM_LABEL_KEYS[itemKey as HistoricalDataItemKey];
  return key ? ii(locale, key) : itemKey;
}

export function descHistoricalItem(locale: string, itemKey: string): string {
  const key = HISTORICAL_ITEM_DESC_KEYS[itemKey as HistoricalDataItemKey];
  return key ? ii(locale, key) : '';
}

export function labelLiveDataItem(locale: string, itemKey: string): string {
  const key = LIVE_DATA_LABEL_KEYS[itemKey as LiveDataItemKey];
  return key ? ii(locale, key) : itemKey;
}

export function descLiveDataItem(locale: string, itemKey: string): string {
  const key = LIVE_DATA_DESC_KEYS[itemKey as LiveDataItemKey];
  return key ? ii(locale, key) : '';
}

export function labelWizardStep(locale: string, stepKey: string): string {
  const key = WIZARD_STEP_LABEL_KEYS[stepKey as (typeof INSURANCE_WIZARD_STEP_KEYS)[number]];
  return key ? ii(locale, key) : stepKey;
}

export function labelReportingFrequency(locale: string, value: string): string {
  if (value === 'daily') return ii(locale, 'insurances.frequency.daily');
  if (value === 'weekly') return ii(locale, 'insurances.frequency.weekly');
  if (value === 'monthly') return ii(locale, 'insurances.frequency.monthly');
  return value;
}

export function labelAggregationLevel(locale: string, value: string): string {
  if (value === 'aggregated') return ii(locale, 'insurances.aggregation.aggregated');
  if (value === 'detailed') return ii(locale, 'insurances.aggregation.detailed');
  return value;
}

export function labelInquiryStatus(locale: string, status: string): string {
  if (status === 'completed') return ii(locale, 'insurances.inquiryStatus.completed');
  if (status === 'failed') return ii(locale, 'insurances.inquiryStatus.failed');
  return ii(locale, 'insurances.inquiryStatus.pending');
}

export function labelSortKey(locale: string, sortKey: string): string {
  if (sortKey === 'status') return ii(locale, 'insurances.sort.byStatus');
  if (sortKey === 'expiry') return ii(locale, 'insurances.sort.byExpiry');
  if (sortKey === 'vehicle') return ii(locale, 'insurances.sort.byVehicle');
  return sortKey;
}
