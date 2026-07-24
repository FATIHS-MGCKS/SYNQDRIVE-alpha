/**
 * Conservative maintenance / failure / cost risk baselines — pure functions.
 */

import {
  DEFAULT_SAFETY_BOUNDARIES,
  RISK_FORECAST_PLATFORM_VERSION,
  RISK_MIN_REQUIREMENTS,
  RISK_MODEL_VERSIONS,
  type MaintenanceRiskFleetInput,
  type MaintenanceRiskForecastResult,
  type RiskForecastTarget,
  type RiskInferenceTier,
  type RiskTimeSeriesPoint,
} from './evaluations-maintenance-risk.contract';
import { FEATURE_SET_VERSION } from './evaluations-feature-store.contract';

const UNPLANNED_CATEGORIES = new Set(['REPAIR', 'DIAGNOSTIC', 'DAMAGE']);

function shiftDate(dateOnly: string, offset: number): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

function horizonDates(asOfDate: string, horizonDays: number): string[] {
  const dates: string[] = [];
  for (let i = 1; i <= horizonDays; i += 1) dates.push(shiftDate(asOfDate, i));
  return dates;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function monthlyBuckets(series: RiskTimeSeriesPoint[]): number[] {
  const buckets = new Map<string, number>();
  for (const point of series) {
    const month = point.date.slice(0, 7);
    buckets.set(month, (buckets.get(month) ?? 0) + point.value);
  }
  return [...buckets.values()];
}

function baseMeta(input: MaintenanceRiskFleetInput, target: RiskForecastTarget) {
  const horizon = horizonDates(input.asOfDate, input.horizonDays);
  const unplanned = input.serviceCases.filter((c) => c.isUnplanned);
  return {
    riskKey: target,
    horizonDays: input.horizonDays,
    modelVersion: RISK_MODEL_VERSIONS[target],
    featureSetVersion: FEATURE_SET_VERSION,
    timezone: input.timezone,
    currency: 'EUR',
    asOfDate: input.asOfDate,
    horizonStartDate: horizon[0] ?? input.asOfDate,
    horizonEndDate: horizon[horizon.length - 1] ?? input.asOfDate,
    safetyBoundaries: DEFAULT_SAFETY_BOUNDARIES,
    lineage: {
      platformVersion: RISK_FORECAST_PLATFORM_VERSION,
      featureSetVersion: FEATURE_SET_VERSION,
      fleetVehicleCount: input.fleetVehicleCount,
      healthCoveragePercent: input.healthCoveragePercent,
      unplannedCasesInHistory: unplanned.length,
      featuresUsed: [] as string[],
    },
    isForecast: true as const,
    isRiskForecast: true as const,
  };
}

function insufficient(
  input: MaintenanceRiskFleetInput,
  target: RiskForecastTarget,
  reason: string,
  unit: string,
): MaintenanceRiskForecastResult {
  const meta = baseMeta(input, target);
  return {
    ...meta,
    unit,
    status: 'INSUFFICIENT_DATA',
    suppressedReason: reason,
    dataCoveragePercent: input.healthCoveragePercent,
    probabilityEstimate: null,
    impactEstimate: null,
    costP50Minor: null,
    costP90Minor: null,
    pointEstimate: null,
    intervalLow: null,
    intervalHigh: null,
    inferenceTier: 'RULE_BASED',
    evaluation: { method: 'suppressed', holdoutDays: 0, mape: null, sampleSize: 0 },
    explainability: {
      inferenceTier: 'RULE_BASED',
      method: 'suppressed',
      topFactors: [],
      limitations: [reason],
    },
  };
}

function criticalHealthCount(vehicles: MaintenanceRiskFleetInput['vehicles']): number {
  return vehicles.filter(
    (v) =>
      v.tireCondition === 'critical' ||
      v.brakeCondition === 'critical' ||
      v.batteryCondition === 'critical' ||
      v.activeSafetyDtcCount > 0,
  ).length;
}

function warningHealthCount(vehicles: MaintenanceRiskFleetInput['vehicles']): number {
  return vehicles.filter(
    (v) =>
      v.tireCondition === 'warning' ||
      v.brakeCondition === 'warning' ||
      v.batteryCondition === 'warning',
  ).length;
}

export function runMaintenanceCostRiskForecast(
  input: MaintenanceRiskFleetInput,
): MaintenanceRiskForecastResult {
  const target: RiskForecastTarget = 'MAINTENANCE_COST';
  const req = RISK_MIN_REQUIREMENTS[target];
  const costsWithValues = input.serviceCases.filter((c) => c.actualCostCents != null && c.actualCostCents > 0);
  const meta = baseMeta(input, target);
  meta.lineage.featuresUsed = [
    'maintenance.cost_minor',
    'service_case.actual_cost',
    'historical_maintenance_series',
  ];

  if (
    input.maintenanceCostSeries.length < req.minHistoryDays ||
    costsWithValues.length < req.minEvents
  ) {
    return insufficient(
      input,
      target,
      `Requires ≥${req.minHistoryDays} days history and ≥${req.minEvents} costed service cases.`,
      'EUR_minor',
    );
  }

  const monthly = monthlyBuckets(input.maintenanceCostSeries);
  const tier: RiskInferenceTier = monthly.length >= 6 ? 'STATISTICAL' : 'RULE_BASED';
  const p50Monthly = percentile(monthly, 50);
  const p90Monthly = percentile(monthly, 90);
  const months = input.horizonDays / 30;
  const costP50 = Math.round(p50Monthly * months);
  const costP90 = Math.round(p90Monthly * months * 1.15);
  const scheduledAdd = input.scheduledCasesInHorizon * (p50Monthly / Math.max(1, monthly.length));

  return {
    ...meta,
    unit: 'EUR_minor',
    status: tier === 'STATISTICAL' ? 'AVAILABLE' : 'FALLBACK',
    suppressedReason: null,
    dataCoveragePercent: Math.round((costsWithValues.length / Math.max(1, input.serviceCases.length)) * 100),
    probabilityEstimate: null,
    impactEstimate: null,
    costP50Minor: costP50 + Math.round(scheduledAdd * 0.5),
    costP90Minor: costP90 + Math.round(scheduledAdd),
    pointEstimate: costP50,
    intervalLow: Math.round(costP50 * 0.7),
    intervalHigh: costP90,
    inferenceTier: tier,
    evaluation: {
      method: tier === 'STATISTICAL' ? 'monthly_median_p50_p90' : 'trailing_average',
      holdoutDays: 0,
      mape: null,
      sampleSize: monthly.length,
    },
    explainability: {
      inferenceTier: tier,
      method: tier === 'STATISTICAL' ? 'monthly_median_p50_p90' : 'trailing_average',
      topFactors: [
        { factor: 'historical_maintenance_cost', impact: `${monthly.length} monthly buckets` },
        { factor: 'scheduled_service_cases', impact: `${input.scheduledCasesInHorizon} in horizon` },
      ],
      limitations: [
        'Wide intervals expected for maintenance spend.',
        'Tire/brake/battery module costs may be underrepresented.',
      ],
    },
  };
}

export function runUnplannedFailureRiskForecast(
  input: MaintenanceRiskFleetInput,
): MaintenanceRiskForecastResult {
  const target: RiskForecastTarget = 'UNPLANNED_FAILURE';
  const req = RISK_MIN_REQUIREMENTS[target];
  const meta = baseMeta(input, target);
  meta.lineage.featuresUsed = [
    'health.tire_brake_battery',
    'dtc.safety_active',
    'service_case.unplanned_history',
    'vehicle.odometer',
  ];

  if (input.fleetVehicleCount < 5) {
    return insufficient(input, target, 'Fleet smaller than minimum 5 vehicles.', 'probability');
  }
  if (input.healthCoveragePercent < req.minHealthCoverage) {
    return insufficient(
      input,
      target,
      `Health coverage ${input.healthCoveragePercent}% below ${req.minHealthCoverage}% minimum.`,
      'probability',
    );
  }

  const unplanned = input.serviceCases.filter((c) => c.isUnplanned);
  if (unplanned.length < req.minEvents) {
    return insufficient(
      input,
      target,
      `Requires ≥${req.minEvents} historical unplanned service cases.`,
      'probability',
    );
  }

  const critical = criticalHealthCount(input.vehicles);
  const warning = warningHealthCount(input.vehicles);
  const historicalRate = unplanned.length / Math.max(1, input.fleetVehicleCount) / 12;
  const healthFactor = (critical * 0.08 + warning * 0.03) / Math.max(1, input.fleetVehicleCount);
  const probability = Math.min(0.85, Math.round((historicalRate + healthFactor) * 1000) / 1000);
  const avgImpact =
    unplanned.filter((c) => c.blocksRental).length / Math.max(1, unplanned.length);
  const impactEstimate = Math.round(probability * input.fleetVehicleCount * avgImpact * 10) / 10;

  return {
    ...meta,
    unit: 'probability',
    status: 'AVAILABLE',
    suppressedReason: null,
    dataCoveragePercent: input.healthCoveragePercent,
    probabilityEstimate: probability,
    impactEstimate,
    costP50Minor: null,
    costP90Minor: null,
    pointEstimate: probability,
    intervalLow: Math.max(0, Math.round((probability - 0.1) * 1000) / 1000),
    intervalHigh: Math.min(1, Math.round((probability + 0.15) * 1000) / 1000),
    inferenceTier: 'RULE_BASED',
    evaluation: {
      method: 'rule_based_health_and_history',
      holdoutDays: 0,
      mape: null,
      sampleSize: unplanned.length,
    },
    explainability: {
      inferenceTier: 'RULE_BASED',
      method: 'rule_based_health_and_history',
      topFactors: [
        { factor: 'critical_health_signals', impact: `${critical} vehicles` },
        { factor: 'warning_health_signals', impact: `${warning} vehicles` },
        { factor: 'historical_unplanned_rate', impact: `${unplanned.length} cases / 12mo` },
      ],
      limitations: [
        'Probability is a fleet risk score, not a calibrated per-vehicle failure model.',
        'Telemetry offline is excluded from failure signals.',
        'Service overdue alone does not increase failure probability.',
      ],
    },
  };
}

export function runExpectedDowntimeRiskForecast(
  input: MaintenanceRiskFleetInput,
): MaintenanceRiskForecastResult {
  const target: RiskForecastTarget = 'EXPECTED_DOWNTIME';
  const req = RISK_MIN_REQUIREMENTS[target];
  const meta = baseMeta(input, target);
  meta.lineage.featuresUsed = ['downtime.minutes', 'service_case.downtime', 'scheduled_downtime'];

  if (input.downtimeMinutesSeries.length < req.minHistoryDays) {
    return insufficient(
      input,
      target,
      `Requires ≥${req.minHistoryDays} days downtime history.`,
      'minutes',
    );
  }

  const dailyAvg =
    input.downtimeMinutesSeries.reduce((a, p) => a + p.value, 0) /
    Math.max(1, input.downtimeMinutesSeries.length);
  const scheduled = input.scheduledDowntimeMinutesInHorizon;
  const unplannedAvg = dailyAvg * input.horizonDays;
  const point = Math.round(scheduled + unplannedAvg);
  const tier: RiskInferenceTier = input.downtimeMinutesSeries.length >= 90 ? 'STATISTICAL' : 'RULE_BASED';

  return {
    ...meta,
    unit: 'minutes',
    status: 'AVAILABLE',
    suppressedReason: null,
    dataCoveragePercent: Math.round(
      (input.downtimeMinutesSeries.filter((p) => p.value > 0).length /
        input.downtimeMinutesSeries.length) *
        100,
    ),
    probabilityEstimate: null,
    impactEstimate: point,
    costP50Minor: null,
    costP90Minor: null,
    pointEstimate: point,
    intervalLow: Math.round(point * 0.6),
    intervalHigh: Math.round(point * 1.4),
    inferenceTier: tier,
    evaluation: {
      method: 'scheduled_plus_trailing_daily_avg',
      holdoutDays: 0,
      mape: null,
      sampleSize: input.downtimeMinutesSeries.length,
    },
    explainability: {
      inferenceTier: tier,
      method: 'scheduled_plus_trailing_daily_avg',
      topFactors: [
        { factor: 'scheduled_downtime', impact: `${scheduled} minutes in horizon` },
        { factor: 'trailing_unplanned_rate', impact: `${Math.round(dailyAvg)} min/day` },
      ],
      limitations: ['Status-transition gaps may undercount downtime without ServiceCase intervals.'],
    },
  };
}

export function runCapacityRiskForecast(
  input: MaintenanceRiskFleetInput,
): MaintenanceRiskForecastResult {
  const target: RiskForecastTarget = 'CAPACITY_RISK';
  const meta = baseMeta(input, target);
  meta.lineage.featuresUsed = [
    'fleet.vehicle_count',
    'service_case.blocks_rental',
    'health.rental_blocked_signals',
  ];

  if (input.fleetVehicleCount < 3) {
    return insufficient(input, target, 'Fleet too small for capacity risk estimate.', 'score');
  }

  const blockedByHealth = input.vehicles.filter(
    (v) =>
      v.tireCondition === 'critical' ||
      v.brakeCondition === 'critical' ||
      v.activeSafetyDtcCount > 0,
  ).length;
  const scheduledBlocks = input.scheduledCasesInHorizon;
  const pressure = (blockedByHealth + scheduledBlocks) / Math.max(1, input.fleetVehicleCount);
  const probability = Math.min(0.95, Math.round(pressure * 100) / 100);
  const impactEstimate = Math.round(probability * input.fleetVehicleCount);

  return {
    ...meta,
    unit: 'score',
    status: 'AVAILABLE',
    suppressedReason: null,
    dataCoveragePercent: 100,
    probabilityEstimate: probability,
    impactEstimate,
    costP50Minor: null,
    costP90Minor: null,
    pointEstimate: Math.round(probability * 100),
    intervalLow: Math.max(0, Math.round(probability * 80)),
    intervalHigh: Math.min(100, Math.round(probability * 120)),
    inferenceTier: 'RULE_BASED',
    evaluation: {
      method: 'rule_based_capacity_pressure',
      holdoutDays: 0,
      mape: null,
      sampleSize: input.fleetVehicleCount,
    },
    explainability: {
      inferenceTier: 'RULE_BASED',
      method: 'rule_based_capacity_pressure',
      topFactors: [
        { factor: 'health_blocked_vehicles', impact: `${blockedByHealth}` },
        { factor: 'scheduled_service_load', impact: `${scheduledBlocks} cases` },
        { factor: 'fleet_size', impact: `${input.fleetVehicleCount} vehicles` },
      ],
      limitations: [
        'Capacity risk is operational headroom, not revenue forecast.',
        'Does not use telemetry offline as immobilization.',
      ],
    },
  };
}

export function runCostRiskForecast(
  input: MaintenanceRiskFleetInput,
): MaintenanceRiskForecastResult {
  const maintenance = runMaintenanceCostRiskForecast(input);
  const target: RiskForecastTarget = 'COST_RISK';
  const meta = baseMeta(input, target);
  meta.lineage.featuresUsed = [
    'maintenance_cost_forecast',
    'open_service_estimated_cost',
    'health_critical_multiplier',
  ];

  if (maintenance.status === 'INSUFFICIENT_DATA') {
    return insufficient(input, target, maintenance.suppressedReason ?? 'Insufficient maintenance history.', 'EUR_minor');
  }

  const openEstimated = input.serviceCases
    .filter((c) => !c.completedAt && c.actualCostCents == null)
    .length;
  const critical = criticalHealthCount(input.vehicles);
  const uplift = 1 + critical * 0.05;
  const p50 = Math.round((maintenance.costP50Minor ?? 0) * uplift + openEstimated * 25_000);
  const p90 = Math.round((maintenance.costP90Minor ?? 0) * uplift + openEstimated * 45_000);

  return {
    ...meta,
    unit: 'EUR_minor',
    status: maintenance.status,
    suppressedReason: null,
    dataCoveragePercent: maintenance.dataCoveragePercent,
    probabilityEstimate: null,
    impactEstimate: null,
    costP50Minor: p50,
    costP90Minor: p90,
    pointEstimate: p50,
    intervalLow: Math.round(p50 * 0.75),
    intervalHigh: p90,
    inferenceTier: 'RULE_BASED',
    evaluation: {
      method: 'maintenance_forecast_plus_open_cases',
      holdoutDays: 0,
      mape: null,
      sampleSize: input.serviceCases.length,
    },
    explainability: {
      inferenceTier: 'RULE_BASED',
      method: 'maintenance_forecast_plus_open_cases',
      topFactors: [
        { factor: 'maintenance_baseline_p50', impact: `${maintenance.costP50Minor ?? 0} minor` },
        { factor: 'critical_health_uplift', impact: `${critical} critical vehicles` },
        { factor: 'open_service_cases', impact: `${openEstimated} cases` },
      ],
      limitations: [
        'Cost risk combines maintenance forecast with open-case exposure — not liquidity forecast.',
      ],
    },
  };
}

export function runAllMaintenanceRiskForecasts(
  input: MaintenanceRiskFleetInput,
): MaintenanceRiskForecastResult[] {
  return [
    runMaintenanceCostRiskForecast(input),
    runUnplannedFailureRiskForecast(input),
    runExpectedDowntimeRiskForecast(input),
    runCapacityRiskForecast(input),
    runCostRiskForecast(input),
  ];
}

export function isUnplannedServiceCategory(category: string): boolean {
  return UNPLANNED_CATEGORIES.has(category);
}
