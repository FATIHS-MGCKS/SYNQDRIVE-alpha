/**
 * Executive KPI strip registry contract (Prompt 31/54).
 * Configurable prioritization — consumers resolve cards via registry, not scattered hardcoding.
 */
import type { EvaluationsLineageFreshnessState } from './evaluations-lineage.contract';
import type { EvaluationsResolvedMetricState } from './evaluations-metric-state.contract';

export type ExecutiveKpiId =
  | 'revenue_mtd'
  | 'paid_revenue_mtd'
  | 'contribution_margin'
  | 'fleet_utilization'
  | 'fleet_availability'
  | 'unplanned_downtime'
  | 'financial_risk_exposure'
  | 'overdue_receivables';

/** How period-over-period change should be interpreted for accent coloring. */
export type ExecutiveKpiDeltaSemantics =
  | 'higher_is_better'
  | 'lower_is_better'
  | 'contextual'
  | 'neutral';

export type ExecutiveKpiValueUnit = 'currency_minor' | 'percent' | 'count';

export type ExecutiveKpiDrillDownSection =
  | 'finance'
  | 'fleet'
  | 'costs_downtime'
  | 'risks'
  | 'executive';

export interface ExecutiveKpiDefinition {
  id: ExecutiveKpiId;
  /** Lower number = higher priority (shown first). Max 8 cards rendered. */
  priority: number;
  lineageMetricKey: string;
  drillDownSection: ExecutiveKpiDrillDownSection;
  valueUnit: ExecutiveKpiValueUnit;
  deltaSemantics: ExecutiveKpiDeltaSemantics;
  /** Model-based / attributed exposure — not audited actuals. */
  isEstimate?: boolean;
  /** Forward-looking weakness deviation — not actuals. */
  isForecast?: boolean;
  zeroMeansNull?: boolean;
}

export type ExecutiveKpiDeltaTone = 'favorable' | 'unfavorable' | 'neutral' | 'hidden';

export interface ExecutiveKpiResolvedCard {
  id: ExecutiveKpiId;
  priority: number;
  drillDownSection: ExecutiveKpiDrillDownSection;
  lineageMetricKey: string;
  state: EvaluationsResolvedMetricState;
  valueUnit: ExecutiveKpiValueUnit;
  deltaSemantics: ExecutiveKpiDeltaSemantics;
  periodLabel: string | null;
  comparisonPeriodLabel: string | null;
  comparisonDisplay: string | null;
  absoluteDeltaDisplay: string | null;
  percentDelta: number | null;
  deltaTone: ExecutiveKpiDeltaTone;
  coveragePercent: number | null;
  freshnessState: EvaluationsLineageFreshnessState | null;
  isEstimate: boolean;
  isForecast: boolean;
}

export interface ExecutiveKpiStripResult {
  cards: ExecutiveKpiResolvedCard[];
  maxCards: number;
  periodLabel: string | null;
  comparisonPeriodLabel: string | null;
}
