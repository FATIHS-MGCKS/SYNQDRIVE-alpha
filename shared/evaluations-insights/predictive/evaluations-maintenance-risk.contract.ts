/**
 * Maintenance / failure / cost risk forecast contracts (Prompt 43/54).
 * Conservative, explainable rule-based and statistical baselines only.
 */

import { FEATURE_SET_VERSION } from './evaluations-feature-store.contract';

export const RISK_FORECAST_PLATFORM_VERSION = 'risk-forecast-baseline-v1';

export const MAINTENANCE_COST_MODEL_VERSION = 'maintenance-cost-baseline-v1.0';
export const UNPLANNED_FAILURE_MODEL_VERSION = 'unplanned-failure-baseline-v1.0';
export const EXPECTED_DOWNTIME_MODEL_VERSION = 'expected-downtime-baseline-v1.0';
export const CAPACITY_RISK_MODEL_VERSION = 'capacity-risk-baseline-v1.0';
export const COST_RISK_MODEL_VERSION = 'cost-risk-baseline-v1.0';

export const RISK_FORECAST_HORIZONS_DAYS = [30, 90] as const;
export type RiskForecastHorizonDays = (typeof RISK_FORECAST_HORIZONS_DAYS)[number];

export type RiskForecastTarget =
  | 'MAINTENANCE_COST'
  | 'UNPLANNED_FAILURE'
  | 'EXPECTED_DOWNTIME'
  | 'CAPACITY_RISK'
  | 'COST_RISK';

export type RiskInferenceTier = 'RULE_BASED' | 'STATISTICAL';

export type RiskForecastStatus =
  | 'AVAILABLE'
  | 'INSUFFICIENT_DATA'
  | 'SUPPRESSED'
  | 'FALLBACK';

export type RiskVehicleHealthSignal = {
  vehicleId: string;
  vehicleClassId: string | null;
  modelYear: number | null;
  odometerKm: number | null;
  tireCondition: 'critical' | 'warning' | 'good' | 'unknown';
  brakeCondition: 'critical' | 'warning' | 'good' | 'unknown';
  batteryCondition: 'critical' | 'warning' | 'good' | 'unknown';
  activeSafetyDtcCount: number;
  serviceOverdue: boolean;
  telemetryDataAvailable: boolean;
  hasHealthSignal: boolean;
};

export type RiskServiceCaseRow = {
  id: string;
  vehicleId: string;
  category: string;
  openedAt: string;
  completedAt: string | null;
  actualCostCents: number | null;
  downtimeStart: string | null;
  downtimeEnd: string | null;
  blocksRental: boolean;
  isUnplanned: boolean;
};

export type RiskTimeSeriesPoint = { date: string; value: number };

export type MaintenanceRiskFleetInput = {
  organizationId: string;
  asOfDate: string;
  timezone: string;
  horizonDays: RiskForecastHorizonDays;
  fleetVehicleCount: number;
  vehicles: RiskVehicleHealthSignal[];
  serviceCases: RiskServiceCaseRow[];
  maintenanceCostSeries: RiskTimeSeriesPoint[];
  downtimeMinutesSeries: RiskTimeSeriesPoint[];
  scheduledCasesInHorizon: number;
  scheduledDowntimeMinutesInHorizon: number;
  healthCoveragePercent: number;
};

export type RiskEvaluationMetrics = {
  method: string;
  holdoutDays: number;
  mape: number | null;
  sampleSize: number;
};

export type RiskExplainability = {
  inferenceTier: RiskInferenceTier;
  method: string;
  topFactors: Array<{ factor: string; impact: string }>;
  limitations: string[];
};

export type RiskSafetyBoundaries = {
  notForAutonomousSafetyDecisions: true;
  telemetryOfflineExcludedFromFailure: true;
  serviceOverdueNotAutoFailure: true;
  disclaimer: string;
};

export type MaintenanceRiskForecastResult = {
  riskKey: RiskForecastTarget;
  horizonDays: RiskForecastHorizonDays;
  modelVersion: string;
  featureSetVersion: string;
  inferenceTier: RiskInferenceTier;
  timezone: string;
  currency: string | null;
  asOfDate: string;
  horizonStartDate: string;
  horizonEndDate: string;
  unit: string;
  status: RiskForecastStatus;
  suppressedReason: string | null;
  dataCoveragePercent: number;
  probabilityEstimate: number | null;
  impactEstimate: number | null;
  costP50Minor: number | null;
  costP90Minor: number | null;
  pointEstimate: number | null;
  intervalLow: number | null;
  intervalHigh: number | null;
  evaluation: RiskEvaluationMetrics;
  explainability: RiskExplainability;
  safetyBoundaries: RiskSafetyBoundaries;
  lineage: {
    platformVersion: string;
    featureSetVersion: string;
    fleetVehicleCount: number;
    healthCoveragePercent: number;
    unplannedCasesInHistory: number;
    featuresUsed: string[];
  };
  isForecast: true;
  isRiskForecast: true;
};

export const RISK_MODEL_VERSIONS: Record<RiskForecastTarget, string> = {
  MAINTENANCE_COST: MAINTENANCE_COST_MODEL_VERSION,
  UNPLANNED_FAILURE: UNPLANNED_FAILURE_MODEL_VERSION,
  EXPECTED_DOWNTIME: EXPECTED_DOWNTIME_MODEL_VERSION,
  CAPACITY_RISK: CAPACITY_RISK_MODEL_VERSION,
  COST_RISK: COST_RISK_MODEL_VERSION,
};

export const RISK_MIN_REQUIREMENTS: Record<
  RiskForecastTarget,
  { minHistoryDays: number; minEvents: number; minHealthCoverage: number }
> = {
  MAINTENANCE_COST: { minHistoryDays: 90, minEvents: 10, minHealthCoverage: 0 },
  UNPLANNED_FAILURE: { minHistoryDays: 180, minEvents: 5, minHealthCoverage: 50 },
  EXPECTED_DOWNTIME: { minHistoryDays: 60, minEvents: 3, minHealthCoverage: 0 },
  CAPACITY_RISK: { minHistoryDays: 30, minEvents: 0, minHealthCoverage: 0 },
  COST_RISK: { minHistoryDays: 90, minEvents: 5, minHealthCoverage: 0 },
};

export const DEFAULT_SAFETY_BOUNDARIES: RiskSafetyBoundaries = {
  notForAutonomousSafetyDecisions: true,
  telemetryOfflineExcludedFromFailure: true,
  serviceOverdueNotAutoFailure: true,
  disclaimer:
    'Risk estimates support operational planning only. They must not replace inspections, safety protocols, or human judgment.',
};
