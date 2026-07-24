/**
 * Documented thresholds for Auswertungen data quality assessments (Prompt 26/54).
 */
import type { EvaluationsDataQualityThresholds } from './evaluations-data-quality.contract';

const MS_HOUR = 60 * 60 * 1000;

export const DEFAULT_EVALUATIONS_DATA_QUALITY_THRESHOLDS: EvaluationsDataQualityThresholds = {
  completeness: {
    goodMinPercent: 95,
    limitedMinPercent: 70,
    missingBelowPercent: 30,
  },
  coverage: {
    goodMinPercent: 90,
    limitedMinPercent: 60,
  },
  freshness: {
    staleAfterMs: 24 * MS_HOUR,
    insightsStaleAfterMs: 24 * MS_HOUR,
  },
  uniqueness: {
    overlappingBookingsWarningAt: 1,
    overlappingBookingsInvalidAt: 1,
  },
};
