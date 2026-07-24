/**
 * Strengths & weaknesses cockpit contract (Prompt 32/54).
 * Unified findings for management cockpit — deduped, categorized, sortable.
 */
import type { EvaluationsDriverAnalysis } from './evaluations-driver-analysis.contract';
import type { EvaluationsStrengthId } from './evaluations-strength-detection.contract';
import type { EvaluationsWeaknessId } from './evaluations-weakness-detection.contract';
import type { ExecutiveKpiDrillDownSection } from './evaluations-executive-kpi-registry.contract';

export const EVALUATIONS_SW_COCKPIT_VERSION = 'sw-cockpit-v1';

export type SwCockpitCategory =
  | 'STRENGTH'
  | 'IMPROVEMENT_POTENTIAL'
  | 'OBSERVATION'
  | 'RISK'
  | 'CRITICAL_RISK';

export type SwCockpitSourceKind = 'STRENGTH' | 'WEAKNESS';

export type SwCockpitConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type SwCockpitDrillDownSection = ExecutiveKpiDrillDownSection | 'data_quality' | 'actions';

export type SwCockpitComparisonBasisKey =
  | 'HISTORICAL_PERIOD'
  | 'ORG_TARGET'
  | 'PEER_STATIONS'
  | 'OBSERVED_THRESHOLD';

export type SwCockpitDimensionKey =
  | 'ORG'
  | 'STATION'
  | 'VEHICLE_CLASS'
  | 'FLEET'
  | 'VEHICLE';

export type SwCockpitImpactKind = 'financial' | 'operational' | 'none';

export interface SwCockpitEntitySummary {
  entityType: SwCockpitDimensionKey;
  vehicles: number;
  stations: number;
  bookings: number;
  insightGroups: number;
  dimensionKey?: string;
  dimensionLabel?: string;
  /** True when grouped counts represent multiple entities of the same type. */
  isGrouped: boolean;
}

export interface SwCockpitImpact {
  kind: SwCockpitImpactKind;
  label: string;
  amountMinor: number | null;
  currency: string | null;
  isEstimate: boolean;
  isForecast: boolean;
}

export interface SwCockpitDataCoverage {
  numerator: number;
  denominator: number;
  percent: number | null;
  label: string;
  isPartial: boolean;
  notes?: string;
}

export interface SwCockpitFinding {
  /** Stable dedupe key across strength/weakness sources. */
  key: string;
  sourceKind: SwCockpitSourceKind;
  sourceId: EvaluationsStrengthId | EvaluationsWeaknessId;
  category: SwCockpitCategory;
  categoryRank: number;
  title: string;
  explanation: string;
  quantitativeBasis: string | null;
  comparisonBasisKey: SwCockpitComparisonBasisKey;
  periodLabel: string;
  comparisonPeriodLabel: string | null;
  affectedDimensionKey: SwCockpitDimensionKey;
  dimensionLabel: string | null;
  impact: SwCockpitImpact | null;
  confidence: SwCockpitConfidence;
  dataCoverage: SwCockpitDataCoverage;
  underlyingKpis: string[];
  recommendation: string | null;
  rationale: string | null;
  driverAnalysis: EvaluationsDriverAnalysis | null;
  entitySummary: SwCockpitEntitySummary;
  drillDownSection: SwCockpitDrillDownSection;
  /** Lower = higher priority after category rank. */
  sortPriority: number;
  impactScore: number;
  urgencyScore: number;
  dedupeGroup: string | null;
}

export type SwCockpitEmptyReason =
  | 'NO_FINDINGS'
  | 'INSUFFICIENT_DATA'
  | 'SECTION_ERROR'
  | 'SECTION_UNAVAILABLE';

export interface SwCockpitResult {
  calculationVersion: string;
  findings: SwCockpitFinding[];
  categoryCounts: Record<SwCockpitCategory, number>;
  emptyReason: SwCockpitEmptyReason | null;
  strengthsStatus: string | null;
  weaknessesStatus: string | null;
  suppressedDuplicates: number;
}

export interface ResolveSwCockpitInput {
  strengths: import('./evaluations-strength-detection.contract').EvaluationsDetectedStrength[] | null | undefined;
  weaknesses: import('./evaluations-weakness-detection.contract').EvaluationsDetectedWeakness[] | null | undefined;
  strengthsStatus?: string | null;
  weaknessesStatus?: string | null;
  locale?: 'de' | 'en';
}
