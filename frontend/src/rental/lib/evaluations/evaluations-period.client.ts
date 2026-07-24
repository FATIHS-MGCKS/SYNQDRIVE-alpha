/**
 * Client helpers for canonical Auswertungen reporting periods (server-resolved).
 */
import type {
  EvaluationsPeriodWindow,
  EvaluationsReportingPeriodBundle,
} from '@synq/evaluations-periods/evaluations-period.contract';

export type { EvaluationsPeriodWindow, EvaluationsReportingPeriodBundle };

export function periodWindowToDateRange(window: EvaluationsPeriodWindow): {
  from: Date;
  to: Date;
} {
  return {
    from: new Date(window.periodStart),
    to: new Date(window.periodEndInclusive),
  };
}

export function reportingBundleToFinancialRanges(bundle: EvaluationsReportingPeriodBundle): {
  mtd: { from: Date; to: Date };
  prevMonth: { from: Date; to: Date };
  yoy: { from: Date; to: Date };
  timezone: string;
  reference: Date;
} {
  return {
    mtd: periodWindowToDateRange(bundle.mtd),
    prevMonth: periodWindowToDateRange(bundle.prevMonthSamePeriod),
    yoy: periodWindowToDateRange(bundle.yoySamePeriod),
    timezone: bundle.timezone.effective,
    reference: new Date(bundle.reference),
  };
}
