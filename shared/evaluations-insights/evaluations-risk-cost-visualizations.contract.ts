/**
 * Risk, cost & downtime visualization contracts (Prompt 33/54).
 */
import type { EvaluationsTimePeriod } from './evaluations-analytics-primitives.contract';
import type { EvaluationsRiskDriverCategory } from './evaluations-driver-analysis.contract';

export const EVALUATIONS_RISK_COST_VIZ_VERSION = 'risk-cost-viz-v1';

export type VizConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface VizPeriodContext {
  period: EvaluationsTimePeriod;
  comparisonPeriod: EvaluationsTimePeriod;
  currency: string;
}

/** Risk matrix cell — probability × impact (1–5 scales). */
export interface RiskMatrixPoint {
  id: string;
  category: EvaluationsRiskDriverCategory;
  label: string;
  probability: number;
  impact: number;
  groupCount: number;
  exposureMinor: number | null;
  currency: string;
  isEstimate: boolean;
  confidence: VizConfidence;
  drillDownSection: 'risks' | 'finance' | 'fleet' | 'costs_downtime';
}

export interface RiskMatrixResult {
  points: RiskMatrixPoint[];
  periodLabel: string;
  hasData: boolean;
}

export interface WaterfallStep {
  key: string;
  label: string;
  valueMinor: number | null;
  startMinor: number | null;
  endMinor: number | null;
  kind: 'start' | 'increment' | 'decrement' | 'total';
  isEstimate: boolean;
  status: 'ACTUAL' | 'ESTIMATED' | 'PARTIAL' | 'UNAVAILABLE';
}

export interface CostWaterfallResult {
  steps: WaterfallStep[];
  currency: string;
  periodLabel: string;
  hasData: boolean;
}

export interface ParetoItem {
  key: string;
  label: string;
  valueMinor: number;
  cumulativePercent: number;
  sharePercent: number;
}

export interface CostParetoResult {
  items: ParetoItem[];
  dimension: 'STATION' | 'VEHICLE_CLASS' | 'VENDOR_CATEGORY';
  currency: string;
  periodLabel: string;
  hasData: boolean;
  isEstimate: boolean;
}

export interface TimeSeriesPoint {
  key: string;
  label: string;
  costsMinor: number | null;
  downtimePercent: number | null;
  confidenceLow?: number | null;
  confidenceHigh?: number | null;
  isEstimate: boolean;
}

export interface CostDowntimeSeriesResult {
  points: TimeSeriesPoint[];
  currency: string;
  periodLabel: string;
  hasData: boolean;
}

export interface AgingBucket {
  key: string;
  label: string;
  amountMinor: number;
  count: number;
  sharePercent: number | null;
}

export interface ReceivablesAgingResult {
  buckets: AgingBucket[];
  currency: string;
  periodLabel: string;
  totalOpenMinor: number;
  hasData: boolean;
}

export interface FleetFailurePoint {
  key: string;
  label: string;
  maintenanceVehicles: number | null;
  blockedVehicles: number | null;
  cleaningVehicles: number | null;
  downtimePercent: number | null;
  isEstimate: boolean;
}

export interface FleetFailureTrendResult {
  points: FleetFailurePoint[];
  periodLabel: string;
  hasData: boolean;
}

export interface DimensionComparisonItem {
  key: string;
  label: string;
  value: number | null;
  unit: 'currency_minor' | 'percent';
  vehicleCount: number | null;
  deltaVsOrg: number | null;
}

export type DimensionComparisonMode = 'STATION' | 'VEHICLE_CLASS';

export interface DimensionComparisonResult {
  mode: DimensionComparisonMode;
  items: DimensionComparisonItem[];
  currency: string;
  periodLabel: string;
  hasData: boolean;
  isEstimate: boolean;
}

export interface RiskCostVisualizationBundle {
  calculationVersion: string;
  periodContext: VizPeriodContext;
  riskMatrix: RiskMatrixResult;
  costWaterfall: CostWaterfallResult;
  costPareto: CostParetoResult;
  costDowntimeSeries: CostDowntimeSeriesResult;
  receivablesAging: ReceivablesAgingResult;
  fleetFailureTrend: FleetFailureTrendResult;
  dimensionComparison: DimensionComparisonResult;
}
