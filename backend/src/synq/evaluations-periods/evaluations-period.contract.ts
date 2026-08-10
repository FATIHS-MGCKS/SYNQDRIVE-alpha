/**
 * Canonical business-period contract for SynqDrive Evaluations.
 *
 * Technical timestamps are UTC ISO-8601 instants. Calendar boundaries are
 * resolved in the recorded IANA timezone; browser timezone is presentation only.
 */

export const EVALUATIONS_PERIOD_TYPES = [
  'DAY',
  'WEEK',
  'MONTH',
  'QUARTER',
  'YEAR',
  'MTD',
  'QTD',
  'YTD',
  'ROLLING_7_DAYS',
  'ROLLING_30_DAYS',
  'ROLLING_60_DAYS',
  'ROLLING_90_DAYS',
  'ROLLING_365_DAYS',
] as const;

export type EvaluationsPeriodType = (typeof EVALUATIONS_PERIOD_TYPES)[number];

export const EVALUATIONS_COMPARISON_TYPES = [
  'PREVIOUS_COMPARABLE_PERIOD',
  'PREVIOUS_FULL_PERIOD',
  'YEAR_OVER_YEAR',
  'TARGET',
] as const;

export type EvaluationsComparisonType = (typeof EVALUATIONS_COMPARISON_TYPES)[number];

/** Legacy-only fallback for records that predate organization/station timezone data. */
export const EVALUATIONS_PLATFORM_FALLBACK_TIMEZONE = 'Europe/Berlin' as const;

export const EVALUATIONS_TIMEZONE_SOURCES = [
  'REPORT_SCOPE',
  'STATION',
  'ORGANIZATION',
  'PLATFORM_FALLBACK',
] as const;

export type EvaluationsTimezoneSource = (typeof EVALUATIONS_TIMEZONE_SOURCES)[number];

export interface EvaluationsTimezoneContext {
  /** IANA timezone used to resolve all local calendar boundaries. */
  readonly effectiveTimezone: string;
  readonly source: EvaluationsTimezoneSource;
  readonly reportTimezone: string | null;
  readonly stationTimezone: string | null;
  readonly organizationTimezone: string | null;
}

/**
 * Query interval uses `[start, endExclusive)` semantics.
 * `reference` is the UTC as-of instant used to resolve partial periods.
 */
export interface EvaluationsPeriodWindow {
  readonly periodType: EvaluationsPeriodType;
  readonly start: string;
  readonly endExclusive: string;
  readonly reference: string;
  readonly timezone: EvaluationsTimezoneContext;
  readonly comparisonBasis: EvaluationsComparisonType | null;
}

export interface EvaluationsComparisonPeriodPair {
  readonly comparisonType: EvaluationsComparisonType;
  readonly currentPeriod: EvaluationsPeriodWindow;
  readonly comparisonPeriod: EvaluationsPeriodWindow;
}
