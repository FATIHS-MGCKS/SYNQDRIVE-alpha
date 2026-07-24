/**
 * Canonical period presets for Auswertungen (evaluations / analytics).
 * @see docs/architecture/analytics/evaluations-timezone-period-model.md
 */

export const EVALUATIONS_PERIOD_PRESETS = [
  'today',
  'mtd',
  'qtd',
  'ytd',
  'calendar_week',
  'calendar_month',
  'rolling_7d',
  'rolling_30d',
  'rolling_60d',
  'rolling_90d',
  'rolling_365d',
  'prev_month_same_period',
  'yoy_same_period',
] as const;

export type EvaluationsPeriodPreset = (typeof EVALUATIONS_PERIOD_PRESETS)[number];

export type EvaluationsTimezoneSource = 'organization' | 'station';

export interface EvaluationsTimezoneContext {
  /** Timezone used for period boundaries in this response. */
  readonly effective: string;
  readonly organization: string;
  readonly station: string | null;
  readonly source: EvaluationsTimezoneSource;
}

export interface EvaluationsPeriodWindow {
  readonly preset: EvaluationsPeriodPreset;
  /** Reference instant the period was resolved against (UTC ISO-8601). */
  readonly reference: string;
  /** Inclusive UTC instant — first moment inside the period. */
  readonly periodStart: string;
  /** Inclusive UTC instant — last moment inside the period (typically the reference instant for partial periods). */
  readonly periodEndInclusive: string;
  /** Exclusive UTC instant — first moment after the period (for `[start, end)` queries). */
  readonly periodEndExclusive: string;
  readonly timezone: EvaluationsTimezoneContext;
  readonly calendar: {
    readonly referenceDateOnly: string;
    readonly weekStartDateOnly: string;
    readonly monthStartDateOnly: string;
    readonly monthEndDateOnly: string;
    readonly quarterStartDateOnly: string;
    readonly yearStartDateOnly: string;
  };
}

/** Standard financial reporting bundle for Auswertungen MTD + comparisons. */
export interface EvaluationsReportingPeriodBundle {
  readonly generatedAt: string;
  readonly reference: string;
  readonly timezone: EvaluationsTimezoneContext;
  readonly mtd: EvaluationsPeriodWindow;
  readonly prevMonthSamePeriod: EvaluationsPeriodWindow;
  readonly yoySamePeriod: EvaluationsPeriodWindow;
}
