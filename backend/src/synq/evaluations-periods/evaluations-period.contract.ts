/**
 * Backend build mirror of the canonical contract in
 * `shared/evaluations-periods/evaluations-period.contract.ts`.
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

export const EVALUATIONS_TIMEZONE_SOURCES = [
  'REPORT_SCOPE',
  'STATION',
  'ORGANIZATION',
  'PLATFORM_FALLBACK',
] as const;

export type EvaluationsTimezoneSource = (typeof EVALUATIONS_TIMEZONE_SOURCES)[number];

export interface EvaluationsTimezoneContext {
  readonly effectiveTimezone: string;
  readonly source: EvaluationsTimezoneSource;
  readonly reportTimezone: string | null;
  readonly stationTimezone: string | null;
  readonly organizationTimezone: string | null;
}

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
