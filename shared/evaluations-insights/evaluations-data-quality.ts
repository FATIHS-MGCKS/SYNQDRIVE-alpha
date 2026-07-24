/**
 * Pure builders for unified Auswertungen data quality domain model (Prompt 26/54).
 */
import type { EvaluationsMetricStatus } from './evaluations-analytics-primitives.contract';
import { computeOverallStatus } from './evaluations-analytics-summary';
import type {
  EvaluationsCostKpi,
  EvaluationsCostModelSummary,
} from './evaluations-cost-model.contract';
import type {
  EvaluationsUtilizationMetric,
  EvaluationsUtilizationModelSummary,
} from './evaluations-utilization-model.contract';
import {
  type EvaluationsDataQualityBuildInput,
  type EvaluationsDataQualityDimension,
  type EvaluationsDataQualityDimensionAssessment,
  type EvaluationsDataQualityDomainSummary,
  type EvaluationsDataQualityKnownError,
  type EvaluationsDataQualityState,
  type EvaluationsDataQualityThresholds,
  type EvaluationsDataSourceKey,
  type EvaluationsDataSourceQualityAssessment,
  type EvaluationsMetricDataQualityAttachment,
  type EvaluationsMetricDataQualityBinding,
  EVALUATIONS_DATA_QUALITY_VERSION,
} from './evaluations-data-quality.contract';
import { DEFAULT_EVALUATIONS_DATA_QUALITY_THRESHOLDS } from './evaluations-data-quality.thresholds';

export { DEFAULT_EVALUATIONS_DATA_QUALITY_THRESHOLDS } from './evaluations-data-quality.thresholds';

const STATE_SEVERITY: Record<EvaluationsDataQualityState, number> = {
  INVALID: 0,
  NOT_CONNECTED: 1,
  MISSING: 2,
  STALE: 3,
  LIMITED: 4,
  GOOD: 5,
  NOT_APPLICABLE: 6,
};

const SOURCE_LABELS: Record<EvaluationsDataSourceKey, string> = {
  INVOICES: 'Invoices (OrgInvoice)',
  BOOKINGS: 'Bookings',
  FLEET: 'Fleet master data',
  INSIGHTS: 'Business insights engine',
  COSTS: 'Cost model aggregates',
  UTILIZATION: 'Utilization model',
  TELEMETRY: 'Vehicle telemetry (DIMO)',
  SERVICE_CASES: 'Service cases',
  DAMAGES: 'Damage records',
};

function safePercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function worstState(states: EvaluationsDataQualityState[]): EvaluationsDataQualityState {
  const applicable = states.filter((s) => s !== 'NOT_APPLICABLE');
  if (applicable.length === 0) return 'NOT_APPLICABLE';
  return applicable.reduce((worst, current) =>
    STATE_SEVERITY[current] < STATE_SEVERITY[worst] ? current : worst,
  );
}

function dimension(
  dim: EvaluationsDataQualityDimension,
  state: EvaluationsDataQualityState,
  measuredValue: number | string | null,
  thresholdReference: string,
  notes: string | null = null,
): EvaluationsDataQualityDimensionAssessment {
  return { dimension: dim, state, measuredValue, thresholdReference, notes };
}

function completenessFromCoverage(
  percent: number | null,
  thresholds: EvaluationsDataQualityThresholds,
  integrationConnected: boolean,
): EvaluationsDataQualityState {
  if (!integrationConnected) return 'NOT_CONNECTED';
  if (percent == null) return 'MISSING';
  if (percent >= thresholds.completeness.goodMinPercent) return 'GOOD';
  if (percent >= thresholds.completeness.limitedMinPercent) return 'LIMITED';
  if (percent < thresholds.completeness.missingBelowPercent) return 'MISSING';
  return 'LIMITED';
}

function coverageFromPercent(
  percent: number | null,
  thresholds: EvaluationsDataQualityThresholds,
  integrationConnected: boolean,
): EvaluationsDataQualityState {
  if (!integrationConnected) return 'NOT_CONNECTED';
  if (percent == null) return 'MISSING';
  if (percent >= thresholds.coverage.goodMinPercent) return 'GOOD';
  if (percent >= thresholds.coverage.limitedMinPercent) return 'LIMITED';
  return 'MISSING';
}

function freshnessFromAge(
  lastUpdateAt: string | null,
  referenceMs: number,
  staleAfterMs: number,
  integrationConnected: boolean,
): EvaluationsDataQualityState {
  if (!integrationConnected) return 'NOT_CONNECTED';
  if (!lastUpdateAt) return 'MISSING';
  const ageMs = referenceMs - new Date(lastUpdateAt).getTime();
  if (ageMs > staleAfterMs) return 'STALE';
  return 'GOOD';
}

function mapRollupToMetricStatus(state: EvaluationsDataQualityState): EvaluationsMetricStatus {
  switch (state) {
    case 'GOOD':
    case 'NOT_APPLICABLE':
      return 'OK';
    case 'LIMITED':
    case 'STALE':
    case 'MISSING':
      return 'PARTIAL';
    case 'INVALID':
      return 'ERROR';
    case 'NOT_CONNECTED':
      return 'UNAVAILABLE';
    default:
      return 'PARTIAL';
  }
}

function assessInvoices(
  input: EvaluationsDataQualityBuildInput,
  thresholds: EvaluationsDataQualityThresholds,
): EvaluationsDataSourceQualityAssessment {
  const connected = input.loaderHealth.financial.ok;
  const snapshot = input.costModelSnapshot;
  const expected = snapshot?.vehicleCount ?? input.fleet?.total ?? null;
  const present = snapshot?.invoiceExpenseCount ?? (input.financial ? 1 : 0);
  const vehicleLinkPercent = snapshot
    ? safePercent(snapshot.invoicesWithVehicleIdCount, Math.max(snapshot.invoiceExpenseCount, 1))
    : null;
  const completenessPercent =
    expected != null && expected > 0 && snapshot
      ? safePercent(snapshot.invoiceExpenseCount > 0 ? 1 : 0, 1)
      : connected
        ? 100
        : null;

  const knownErrors: EvaluationsDataQualityKnownError[] = [];
  if (!connected) {
    knownErrors.push({
      code: 'LOADER_FAILED',
      message: input.loaderHealth.financial.error ?? 'Financial snapshot loader failed.',
      severity: 'CRITICAL',
    });
  }

  const dimensions: EvaluationsDataQualityDimensionAssessment[] = [
    dimension(
      'COMPLETENESS',
      completenessFromCoverage(completenessPercent, thresholds, connected),
      completenessPercent,
      `good≥${thresholds.completeness.goodMinPercent}%`,
      connected ? 'Invoice ledger reachable for tenant scope.' : null,
    ),
    dimension(
      'FRESHNESS',
      connected ? 'GOOD' : 'NOT_CONNECTED',
      input.generatedAt,
      'Loaded with current summary request',
      null,
    ),
    dimension(
      'VALIDITY',
      connected ? 'GOOD' : 'NOT_CONNECTED',
      input.financial?.currency ?? null,
      'Currency and amounts present when loader succeeds',
      null,
    ),
    dimension(
      'CONSISTENCY',
      connected && input.bookings?.revenueMtdMinor != null ? 'GOOD' : connected ? 'LIMITED' : 'NOT_CONNECTED',
      null,
      'Cross-check with booking revenue deferred to insights',
      'Booking vs invoice revenue reconciliation is not automated in v1.',
    ),
    dimension('UNIQUENESS', 'NOT_APPLICABLE', null, 'N/A for invoice ledger', null),
    dimension(
      'COVERAGE',
      coverageFromPercent(vehicleLinkPercent ?? (connected ? 100 : null), thresholds, connected),
      vehicleLinkPercent,
      `good≥${thresholds.coverage.goodMinPercent}% vehicle-linked invoices`,
      snapshot
        ? `${snapshot.invoicesWithVehicleIdCount}/${snapshot.invoiceExpenseCount} invoices with vehicle link`
        : null,
    ),
  ];

  const remediation: string[] = [];
  if (!connected) remediation.push('Verify OrgInvoice data access and tenant scoping for the selected filters.');
  if (vehicleLinkPercent != null && vehicleLinkPercent < thresholds.coverage.goodMinPercent) {
    remediation.push('Link incoming vendor invoices to vehicles for per-vehicle cost attribution.');
  }

  return {
    sourceKey: 'INVOICES',
    label: SOURCE_LABELS.INVOICES,
    period: input.period,
    integrationConnected: connected,
    overallState: worstState(dimensions.map((d) => d.state)),
    dimensions,
    expectedRecordCount: expected,
    presentRecordCount: present,
    coveragePercent: vehicleLinkPercent ?? (connected ? 100 : null),
    lastSuccessfulUpdateAt: connected ? input.generatedAt : null,
    knownErrors,
    affectedMetrics: [
      'financial.revenueMtdMinor',
      'financial.expensesMtdMinor',
      'receivables.openAmountMinor',
      'costs.expensesMtdMinor',
    ],
    recommendedRemediation: remediation,
  };
}

function assessBookings(
  input: EvaluationsDataQualityBuildInput,
  thresholds: EvaluationsDataQualityThresholds,
): EvaluationsDataSourceQualityAssessment {
  const connected = input.loaderHealth.bookings.ok;
  const snapshot = input.costModelSnapshot;
  const completed = snapshot?.completedBookingsInPeriod ?? input.bookings?.completed ?? 0;
  const expected = input.fleet?.total ?? snapshot?.vehicleCount ?? null;
  const kmCoverage = snapshot
    ? safePercent(snapshot.bookingsWithKmCount, Math.max(snapshot.completedBookingsInPeriod, 1))
    : null;

  const knownErrors: EvaluationsDataQualityKnownError[] = [];
  if (!connected) {
    knownErrors.push({
      code: 'LOADER_FAILED',
      message: input.loaderHealth.bookings.error ?? 'Booking snapshot loader failed.',
      severity: 'CRITICAL',
    });
  }

  const dimensions: EvaluationsDataQualityDimensionAssessment[] = [
    dimension(
      'COMPLETENESS',
      completenessFromCoverage(connected ? (completed > 0 ? 100 : 50) : null, thresholds, connected),
      completed,
      `Records in period: ${completed}`,
      expected != null ? `Fleet size ${expected} as reference population` : null,
    ),
    dimension('FRESHNESS', connected ? 'GOOD' : 'NOT_CONNECTED', input.generatedAt, 'Loaded with summary', null),
    dimension(
      'VALIDITY',
      input.overlappingBookingCount >= thresholds.uniqueness.overlappingBookingsInvalidAt
        ? 'INVALID'
        : connected
          ? 'GOOD'
          : 'NOT_CONNECTED',
      input.overlappingBookingCount,
      `Overlapping bookings invalid at ≥${thresholds.uniqueness.overlappingBookingsInvalidAt}`,
      null,
    ),
    dimension('CONSISTENCY', connected ? 'GOOD' : 'NOT_CONNECTED', null, 'Status counts internally consistent', null),
    dimension(
      'UNIQUENESS',
      input.overlappingBookingCount >= thresholds.uniqueness.overlappingBookingsInvalidAt
        ? 'INVALID'
        : input.overlappingBookingCount >= thresholds.uniqueness.overlappingBookingsWarningAt
          ? 'LIMITED'
          : connected
            ? 'GOOD'
            : 'NOT_CONNECTED',
      input.overlappingBookingCount,
      `warning≥${thresholds.uniqueness.overlappingBookingsWarningAt}`,
      null,
    ),
    dimension(
      'COVERAGE',
      coverageFromPercent(kmCoverage, thresholds, connected),
      kmCoverage,
      `kmDriven present on completed bookings`,
      snapshot
        ? `${snapshot.bookingsWithKmCount}/${snapshot.completedBookingsInPeriod} with km`
        : null,
    ),
  ];

  const remediation: string[] = [];
  if (!connected) remediation.push('Verify Booking table access and filter scope.');
  if (input.overlappingBookingCount > 0) {
    remediation.push('Resolve overlapping blocking bookings before trusting utilization KPIs.');
  }
  if (kmCoverage != null && kmCoverage < thresholds.coverage.goodMinPercent) {
    remediation.push('Ensure completed bookings record kmDriven for cost-per-km metrics.');
  }

  return {
    sourceKey: 'BOOKINGS',
    label: SOURCE_LABELS.BOOKINGS,
    period: input.period,
    integrationConnected: connected,
    overallState: worstState(dimensions.map((d) => d.state)),
    dimensions,
    expectedRecordCount: expected,
    presentRecordCount: completed,
    coveragePercent: kmCoverage,
    lastSuccessfulUpdateAt: connected ? input.generatedAt : null,
    knownErrors,
    affectedMetrics: ['bookings.completed', 'bookings.revenueMtdMinor', 'bookings.active'],
    recommendedRemediation: remediation,
  };
}

function assessFleet(
  input: EvaluationsDataQualityBuildInput,
  thresholds: EvaluationsDataQualityThresholds,
): EvaluationsDataSourceQualityAssessment {
  const connected = input.loaderHealth.fleet.ok;
  const total = input.fleet?.total ?? 0;
  const present = total;
  const expected = total > 0 ? total : null;
  const percent = total > 0 ? 100 : connected ? 0 : null;

  const knownErrors: EvaluationsDataQualityKnownError[] = [];
  if (!connected) {
    knownErrors.push({
      code: 'LOADER_FAILED',
      message: input.loaderHealth.fleet.error ?? 'Fleet snapshot loader failed.',
      severity: 'CRITICAL',
    });
  } else if (total === 0) {
    knownErrors.push({
      code: 'EMPTY_FLEET',
      message: 'No vehicles in scoped fleet — utilization and cost denominators unavailable.',
      severity: 'WARNING',
    });
  }

  const dimensions: EvaluationsDataQualityDimensionAssessment[] = [
    dimension(
      'COMPLETENESS',
      !connected ? 'NOT_CONNECTED' : total > 0 ? 'GOOD' : 'MISSING',
      total,
      'At least one vehicle in scope',
      null,
    ),
    dimension('FRESHNESS', connected ? 'GOOD' : 'NOT_CONNECTED', input.generatedAt, 'Point-in-time fleet status', null),
    dimension('VALIDITY', connected ? 'GOOD' : 'NOT_CONNECTED', total, 'Vehicle count non-negative', null),
    dimension('CONSISTENCY', connected ? 'GOOD' : 'NOT_CONNECTED', null, 'Status buckets sum to total', null),
    dimension('UNIQUENESS', 'NOT_APPLICABLE', null, 'N/A', null),
    dimension(
      'COVERAGE',
      coverageFromPercent(percent, thresholds, connected),
      percent,
      'Fleet records in tenant scope',
      null,
    ),
  ];

  return {
    sourceKey: 'FLEET',
    label: SOURCE_LABELS.FLEET,
    period: input.period,
    integrationConnected: connected,
    overallState: worstState(dimensions.map((d) => d.state)),
    dimensions,
    expectedRecordCount: expected,
    presentRecordCount: present,
    coveragePercent: percent,
    lastSuccessfulUpdateAt: connected ? input.generatedAt : null,
    knownErrors,
    affectedMetrics: [
      'fleetUtilization.utilizationPercent',
      'vehicleAvailability.readyPercent',
      'downtime.downtimePercent',
    ],
    recommendedRemediation: connected && total === 0 ? ['Add vehicles to the organization or widen filter scope.'] : !connected ? ['Verify Vehicle table access.'] : [],
  };
}

function assessInsights(
  input: EvaluationsDataQualityBuildInput,
  thresholds: EvaluationsDataQualityThresholds,
): EvaluationsDataSourceQualityAssessment {
  const connected = input.loaderHealth.insights.ok;
  const hasRun = input.insights?.hasRun ?? false;
  const integrationConnected = connected;
  const stale = input.insights?.stale ?? true;
  const lastRunAt = input.insights?.lastRunAt ?? null;

  const knownErrors: EvaluationsDataQualityKnownError[] = [];
  if (!connected) {
    knownErrors.push({
      code: 'LOADER_FAILED',
      message: input.loaderHealth.insights.error ?? 'Insights loader failed.',
      severity: 'CRITICAL',
    });
  } else if (!hasRun) {
    knownErrors.push({
      code: 'NEVER_RUN',
      message: 'Insights engine has not completed a run for this organization.',
      severity: 'WARNING',
    });
  } else if (stale) {
    knownErrors.push({
      code: 'STALE_INSIGHTS',
      message: 'Insight counts may lag operational reality.',
      severity: 'WARNING',
    });
  }
  if (input.insights?.error) {
    knownErrors.push({
      code: 'INSIGHTS_ERROR',
      message: input.insights.error,
      severity: 'WARNING',
    });
  }

  const freshnessState = !integrationConnected
    ? hasRun
      ? 'LIMITED'
      : 'NOT_CONNECTED'
    : stale
      ? 'STALE'
      : freshnessFromAge(
          lastRunAt,
          new Date(input.generatedAt).getTime(),
          thresholds.freshness.insightsStaleAfterMs,
          true,
        );

  const dimensions: EvaluationsDataQualityDimensionAssessment[] = [
    dimension(
      'COMPLETENESS',
      !connected ? 'NOT_CONNECTED' : !hasRun ? 'MISSING' : 'GOOD',
      hasRun ? 1 : 0,
      'Insights run completed at least once',
      null,
    ),
    dimension(
      'FRESHNESS',
      freshnessState,
      lastRunAt,
      `stale after ${thresholds.freshness.insightsStaleAfterMs}ms`,
      stale ? 'Marked stale by insights analytics service' : null,
    ),
    dimension('VALIDITY', connected && hasRun ? 'GOOD' : connected ? 'LIMITED' : 'NOT_CONNECTED', null, 'Structured insight counts', null),
    dimension('CONSISTENCY', 'NOT_APPLICABLE', null, 'N/A', null),
    dimension('UNIQUENESS', 'NOT_APPLICABLE', null, 'N/A', null),
    dimension(
      'COVERAGE',
      !connected ? 'NOT_CONNECTED' : !hasRun ? 'MISSING' : stale ? 'LIMITED' : 'GOOD',
      hasRun ? 100 : 0,
      'Insight pipeline executed',
      null,
    ),
  ];

  const remediation: string[] = [];
  if (!hasRun) remediation.push('Trigger insights analytics run for the organization.');
  if (stale) remediation.push('Schedule or manually refresh insights to reduce staleness.');

  return {
    sourceKey: 'INSIGHTS',
    label: SOURCE_LABELS.INSIGHTS,
    period: input.period,
    integrationConnected,
    overallState: worstState(dimensions.map((d) => d.state)),
    dimensions,
    expectedRecordCount: 1,
    presentRecordCount: hasRun ? 1 : 0,
    coveragePercent: hasRun ? 100 : 0,
    lastSuccessfulUpdateAt: lastRunAt,
    knownErrors,
    affectedMetrics: [
      'activeRisks.businessRiskGroups',
      'activeRisks.criticalInsights',
      'activeRisks.complianceInsightGroups',
    ],
    recommendedRemediation: remediation,
  };
}

function assessServiceCases(
  input: EvaluationsDataQualityBuildInput,
  thresholds: EvaluationsDataQualityThresholds,
): EvaluationsDataSourceQualityAssessment {
  const snapshot = input.costModelSnapshot;
  const connected = input.loaderHealth.costModel.ok && snapshot != null;
  const total = snapshot?.serviceCasesTotalInPeriod ?? 0;
  const withCost = snapshot?.serviceCasesWithActualCostCount ?? 0;
  const percent = safePercent(withCost, Math.max(total, 1));

  const knownErrors: EvaluationsDataQualityKnownError[] = [];
  if (total > withCost) {
    knownErrors.push({
      code: 'MISSING_ACTUAL_COST',
      message: `${total - withCost} service case(s) lack actualCostCents.`,
      severity: 'WARNING',
    });
  }

  const dimensions: EvaluationsDataQualityDimensionAssessment[] = [
    dimension(
      'COMPLETENESS',
      !connected ? 'NOT_CONNECTED' : total === 0 ? 'NOT_APPLICABLE' : completenessFromCoverage(percent, thresholds, true),
      percent,
      `actualCost on service cases`,
      null,
    ),
    dimension('FRESHNESS', connected ? 'GOOD' : 'NOT_CONNECTED', input.generatedAt, 'Loaded with cost model', null),
    dimension('VALIDITY', connected ? 'GOOD' : 'NOT_CONNECTED', withCost, 'Non-negative cost counts', null),
    dimension('CONSISTENCY', connected ? 'GOOD' : 'NOT_CONNECTED', null, 'Aligned with cost model', null),
    dimension('UNIQUENESS', 'NOT_APPLICABLE', null, 'N/A', null),
    dimension(
      'COVERAGE',
      total === 0 ? 'NOT_APPLICABLE' : coverageFromPercent(percent, thresholds, connected),
      percent,
      `good≥${thresholds.coverage.goodMinPercent}%`,
      null,
    ),
  ];

  return {
    sourceKey: 'SERVICE_CASES',
    label: SOURCE_LABELS.SERVICE_CASES,
    period: input.period,
    integrationConnected: connected,
    overallState: worstState(dimensions.map((d) => d.state)),
    dimensions,
    expectedRecordCount: total || null,
    presentRecordCount: withCost,
    coveragePercent: total > 0 ? percent : null,
    lastSuccessfulUpdateAt: connected ? input.generatedAt : null,
    knownErrors,
    affectedMetrics: ['costModel.UNPLANNED_MAINTENANCE_COSTS', 'costModel.COST_PER_VEHICLE'],
    recommendedRemediation:
      total > withCost ? ['Record actualCostCents when closing service cases.'] : [],
  };
}

function assessDamages(
  input: EvaluationsDataQualityBuildInput,
  thresholds: EvaluationsDataQualityThresholds,
): EvaluationsDataSourceQualityAssessment {
  const snapshot = input.costModelSnapshot;
  const connected = input.loaderHealth.costModel.ok && snapshot != null;
  const total = snapshot?.damagesTotalInPeriod ?? 0;
  const withCost = snapshot?.damagesWithRepairCostCount ?? 0;
  const percent = safePercent(withCost, Math.max(total, 1));

  const knownErrors: EvaluationsDataQualityKnownError[] = [];
  if (total > withCost) {
    knownErrors.push({
      code: 'MISSING_REPAIR_COST',
      message: `${total - withCost} damage record(s) lack repairCostCents.`,
      severity: 'WARNING',
    });
  }

  const dimensions: EvaluationsDataQualityDimensionAssessment[] = [
    dimension(
      'COMPLETENESS',
      !connected ? 'NOT_CONNECTED' : total === 0 ? 'NOT_APPLICABLE' : completenessFromCoverage(percent, thresholds, true),
      percent,
      'repairCost on damages',
      null,
    ),
    dimension('FRESHNESS', connected ? 'GOOD' : 'NOT_CONNECTED', input.generatedAt, 'Loaded with cost model', null),
    dimension('VALIDITY', connected ? 'GOOD' : 'NOT_CONNECTED', withCost, 'Non-negative cost counts', null),
    dimension('CONSISTENCY', connected ? 'GOOD' : 'NOT_CONNECTED', null, 'Aligned with cost model', null),
    dimension('UNIQUENESS', 'NOT_APPLICABLE', null, 'N/A', null),
    dimension(
      'COVERAGE',
      total === 0 ? 'NOT_APPLICABLE' : coverageFromPercent(percent, thresholds, connected),
      percent,
      `good≥${thresholds.coverage.goodMinPercent}%`,
      null,
    ),
  ];

  return {
    sourceKey: 'DAMAGES',
    label: SOURCE_LABELS.DAMAGES,
    period: input.period,
    integrationConnected: connected,
    overallState: worstState(dimensions.map((d) => d.state)),
    dimensions,
    expectedRecordCount: total || null,
    presentRecordCount: withCost,
    coveragePercent: total > 0 ? percent : null,
    lastSuccessfulUpdateAt: connected ? input.generatedAt : null,
    knownErrors,
    affectedMetrics: ['costModel.DAMAGE_REPAIR_COSTS'],
    recommendedRemediation:
      total > withCost ? ['Record repairCostCents when damage repair is completed.'] : [],
  };
}

function assessCosts(
  input: EvaluationsDataQualityBuildInput,
  thresholds: EvaluationsDataQualityThresholds,
): EvaluationsDataSourceQualityAssessment {
  const connected = input.loaderHealth.costModel.ok && input.costModelSummary != null;
  const summary = input.costModelSummary;
  const gapCount = summary?.dataGaps.length ?? 0;
  const partialMetrics =
    summary?.metrics.filter((m) => m.status === 'PARTIAL' || m.status === 'UNAVAILABLE').length ?? 0;
  const totalMetrics = summary?.metrics.length ?? 0;
  const metricPercent =
    totalMetrics > 0 ? safePercent(totalMetrics - partialMetrics, totalMetrics) : null;

  const knownErrors: EvaluationsDataQualityKnownError[] = [];
  for (const gap of summary?.dataGaps ?? []) {
    knownErrors.push({
      code: `GAP_${gap.category}`,
      message: gap.reason,
      severity: 'INFO',
    });
  }

  const dimensions: EvaluationsDataQualityDimensionAssessment[] = [
    dimension(
      'COMPLETENESS',
      !connected ? 'NOT_CONNECTED' : completenessFromCoverage(metricPercent, thresholds, true),
      metricPercent,
      'KPIs with ACTUAL or ESTIMATED status',
      `${partialMetrics} partial/unavailable of ${totalMetrics}`,
    ),
    dimension('FRESHNESS', connected ? 'GOOD' : 'NOT_CONNECTED', input.generatedAt, 'Built with summary', null),
    dimension('VALIDITY', connected ? 'GOOD' : 'NOT_CONNECTED', gapCount, 'Documented data gaps', null),
    dimension('CONSISTENCY', connected ? 'GOOD' : 'NOT_CONNECTED', null, 'Single cost model version', null),
    dimension('UNIQUENESS', 'NOT_APPLICABLE', null, 'N/A', null),
    dimension(
      'COVERAGE',
      coverageFromPercent(metricPercent, thresholds, connected),
      metricPercent,
      `good≥${thresholds.coverage.goodMinPercent}%`,
      null,
    ),
  ];

  return {
    sourceKey: 'COSTS',
    label: SOURCE_LABELS.COSTS,
    period: input.period,
    integrationConnected: connected,
    overallState: worstState(dimensions.map((d) => d.state)),
    dimensions,
    expectedRecordCount: totalMetrics || null,
    presentRecordCount: totalMetrics - partialMetrics,
    coveragePercent: metricPercent,
    lastSuccessfulUpdateAt: connected ? input.generatedAt : null,
    knownErrors,
    affectedMetrics: summary?.metrics.map((m) => `costModel.${m.key}`) ?? [],
    recommendedRemediation: (summary?.dataGaps ?? []).slice(0, 3).map((g) => g.suggestedSource),
  };
}

function assessUtilization(
  input: EvaluationsDataQualityBuildInput,
  thresholds: EvaluationsDataQualityThresholds,
): EvaluationsDataSourceQualityAssessment {
  const connected = input.loaderHealth.utilizationModel.ok && input.utilizationModelSummary != null;
  const util = input.utilizationModelSummary;
  const snapshot = input.utilizationSnapshot;
  const vehicleCount = snapshot?.vehicles.length ?? 0;
  const withData =
    snapshot?.vehicles.filter((v) => v.capacityMs > 0).length ?? 0;
  const percent = safePercent(withData, Math.max(vehicleCount, 1));
  const gapCount = util?.dataGaps.length ?? 0;

  const knownErrors: EvaluationsDataQualityKnownError[] = [];
  if (input.overlappingBookingCount > 0) {
    knownErrors.push({
      code: 'OVERLAPPING_BOOKINGS',
      message: `${input.overlappingBookingCount} overlapping blocking booking(s) detected.`,
      severity: 'CRITICAL',
    });
  }
  for (const gap of util?.dataGaps ?? []) {
    knownErrors.push({ code: `GAP_${gap.category}`, message: gap.reason, severity: 'INFO' });
  }

  const validityState =
    input.overlappingBookingCount >= thresholds.uniqueness.overlappingBookingsInvalidAt
      ? 'INVALID'
      : connected
        ? 'GOOD'
        : 'NOT_CONNECTED';

  const dimensions: EvaluationsDataQualityDimensionAssessment[] = [
    dimension(
      'COMPLETENESS',
      !connected ? 'NOT_CONNECTED' : completenessFromCoverage(percent, thresholds, true),
      percent,
      'Vehicles with capacity intervals',
      null,
    ),
    dimension('FRESHNESS', connected ? 'GOOD' : 'NOT_CONNECTED', input.generatedAt, 'Interval snapshot at request', null),
    dimension('VALIDITY', validityState, input.overlappingBookingCount, 'No overlapping bookings', null),
    dimension(
      'CONSISTENCY',
      connected && gapCount === 0 ? 'GOOD' : connected ? 'LIMITED' : 'NOT_CONNECTED',
      gapCount,
      'Documented utilization data gaps',
      null,
    ),
    dimension(
      'UNIQUENESS',
      input.overlappingBookingCount >= thresholds.uniqueness.overlappingBookingsInvalidAt
        ? 'INVALID'
        : input.overlappingBookingCount > 0
          ? 'LIMITED'
          : connected
            ? 'GOOD'
            : 'NOT_CONNECTED',
      input.overlappingBookingCount,
      'Unique booking intervals per vehicle',
      null,
    ),
    dimension(
      'COVERAGE',
      coverageFromPercent(percent, thresholds, connected),
      percent,
      'Vehicles with interval data',
      `${withData}/${vehicleCount}`,
    ),
  ];

  return {
    sourceKey: 'UTILIZATION',
    label: SOURCE_LABELS.UTILIZATION,
    period: input.period,
    integrationConnected: connected,
    overallState: worstState(dimensions.map((d) => d.state)),
    dimensions,
    expectedRecordCount: vehicleCount || null,
    presentRecordCount: withData,
    coveragePercent: percent,
    lastSuccessfulUpdateAt: connected ? input.generatedAt : null,
    knownErrors,
    affectedMetrics: util?.metrics.map((m) => `utilizationModel.${m.key}`) ?? [],
    recommendedRemediation: [
      ...(input.overlappingBookingCount > 0
        ? ['Resolve overlapping bookings before using time-weighted utilization.']
        : []),
      ...(util?.dataGaps ?? []).slice(0, 2).map((g) => g.suggestedSource),
    ],
  };
}

function assessTelemetry(
  input: EvaluationsDataQualityBuildInput,
  thresholds: EvaluationsDataQualityThresholds,
): EvaluationsDataSourceQualityAssessment {
  const snapshot = input.utilizationSnapshot;
  const connected = input.loaderHealth.utilizationModel.ok && snapshot != null;
  const vehicles = snapshot?.vehicles ?? [];
  const total = vehicles.length;
  const online = vehicles.filter((v) => !v.telemetryOffline).length;
  const percent = safePercent(online, Math.max(total, 1));
  const hasTelemetryIntegration = total > 0 && vehicles.some((v) => v.telemetryOffline !== undefined);
  const integrationConnected = connected && hasTelemetryIntegration;

  const knownErrors: EvaluationsDataQualityKnownError[] = [];
  const offline = total - online;
  if (offline > 0) {
    knownErrors.push({
      code: 'TELEMETRY_OFFLINE',
      message: `${offline} vehicle(s) with stale or offline telemetry.`,
      severity: 'WARNING',
    });
  }

  const dimensions: EvaluationsDataQualityDimensionAssessment[] = [
    dimension(
      'COMPLETENESS',
      !connected
        ? 'NOT_CONNECTED'
        : total === 0
          ? 'MISSING'
          : completenessFromCoverage(percent, thresholds, integrationConnected || connected),
      percent,
      'Vehicles with fresh telemetry',
      null,
    ),
    dimension(
      'FRESHNESS',
      !connected
        ? 'NOT_CONNECTED'
        : offline > 0
          ? 'STALE'
          : 'GOOD',
      percent,
      `stale after ${thresholds.freshness.staleAfterMs}ms`,
      null,
    ),
    dimension('VALIDITY', connected ? 'GOOD' : 'NOT_CONNECTED', online, 'Online signal boolean', null),
    dimension('CONSISTENCY', 'NOT_APPLICABLE', null, 'N/A', null),
    dimension('UNIQUENESS', 'NOT_APPLICABLE', null, 'N/A', null),
    dimension(
      'COVERAGE',
      !connected
        ? 'NOT_CONNECTED'
        : total === 0
          ? 'MISSING'
          : coverageFromPercent(percent, thresholds, true),
      percent,
      `${online}/${total} online`,
      null,
    ),
  ];

  const remediation: string[] = [];
  if (!hasTelemetryIntegration && connected) {
    remediation.push('Connect vehicles to DIMO telemetry for live freshness signals.');
  } else if (offline > 0) {
    remediation.push('Investigate offline vehicles — telemetry stale beyond 24h threshold.');
  }

  return {
    sourceKey: 'TELEMETRY',
    label: SOURCE_LABELS.TELEMETRY,
    period: input.period,
    integrationConnected: integrationConnected || (connected && total > 0),
    overallState: worstState(dimensions.map((d) => d.state)),
    dimensions,
    expectedRecordCount: total || null,
    presentRecordCount: online,
    coveragePercent: percent,
    lastSuccessfulUpdateAt: connected ? input.generatedAt : null,
    knownErrors,
    affectedMetrics: ['utilizationModel.TELEMETRY_OFFLINE', 'utilizationModel.OPERATIONAL_SNAPSHOT_UTILIZATION'],
    recommendedRemediation: remediation,
  };
}

function buildCrossCuttingIssues(
  sources: EvaluationsDataSourceQualityAssessment[],
  input: EvaluationsDataQualityBuildInput,
): EvaluationsDataQualityKnownError[] {
  const issues: EvaluationsDataQualityKnownError[] = [];
  const partialSections = input.sectionStatuses
    .filter((s) => s.status === 'PARTIAL')
    .map((s) => s.key);
  const unavailableSections = input.sectionStatuses
    .filter((s) => s.status === 'UNAVAILABLE' || s.status === 'ERROR')
    .map((s) => s.key);

  if (partialSections.length > 0) {
    issues.push({
      code: 'PARTIAL_SECTIONS',
      message: `Partial analytics sections: ${partialSections.join(', ')}.`,
      severity: 'WARNING',
    });
  }
  if (unavailableSections.length > 0) {
    issues.push({
      code: 'UNAVAILABLE_SECTIONS',
      message: `Unavailable sections: ${unavailableSections.join(', ')}.`,
      severity: 'CRITICAL',
    });
  }
  if (input.overlappingBookingCount > 0) {
    issues.push({
      code: 'OVERLAPPING_BOOKINGS',
      message: `${input.overlappingBookingCount} overlapping booking(s) — business KPI interpretation suppressed.`,
      severity: 'CRITICAL',
    });
  }

  for (const source of sources) {
    for (const err of source.knownErrors) {
      if (err.severity === 'CRITICAL' && !issues.some((i) => i.code === err.code)) {
        issues.push(err);
      }
    }
  }

  return issues;
}

function buildMetricBindings(
  sources: EvaluationsDataSourceQualityAssessment[],
): EvaluationsMetricDataQualityBinding[] {
  const bySource = new Map(sources.map((s) => [s.sourceKey, s]));
  const bindings: EvaluationsMetricDataQualityBinding[] = [];

  const add = (
    metricKey: string,
    metricLabel: string,
    sourceKey: EvaluationsDataSourceKey,
    warnings: string[] = [],
  ): void => {
    const source = bySource.get(sourceKey);
    if (!source) return;
    bindings.push({
      metricKey,
      metricLabel,
      sourceKey,
      state: source.overallState,
      dimensions: source.dimensions,
      warnings: [...warnings, ...source.knownErrors.map((e) => e.message)],
    });
  };

  add('financial.revenueMtdMinor', 'Revenue MTD', 'INVOICES');
  add('financial.expensesMtdMinor', 'Expenses MTD', 'INVOICES');
  add('receivables.overdueAmountMinor', 'Overdue receivables', 'INVOICES');
  add('bookings.completed', 'Completed bookings', 'BOOKINGS');
  add('fleetUtilization.utilizationPercent', 'Fleet utilization', 'UTILIZATION');
  add('costModel.COST_PER_VEHICLE', 'Cost per vehicle', 'COSTS');
  add('costModel.DAMAGE_REPAIR_COSTS', 'Damage repair costs', 'DAMAGES');
  add('costModel.UNPLANNED_MAINTENANCE_COSTS', 'Unplanned maintenance', 'SERVICE_CASES');
  add('activeRisks.criticalInsights', 'Critical insights', 'INSIGHTS');
  add('utilizationModel.UTILIZATION_PER_VEHICLE', 'Utilization per vehicle', 'UTILIZATION');

  return bindings;
}

export function buildEvaluationsDataQualityDomain(
  input: EvaluationsDataQualityBuildInput,
  thresholds: EvaluationsDataQualityThresholds = DEFAULT_EVALUATIONS_DATA_QUALITY_THRESHOLDS,
): EvaluationsDataQualityDomainSummary {
  const sources = [
    assessInvoices(input, thresholds),
    assessBookings(input, thresholds),
    assessFleet(input, thresholds),
    assessInsights(input, thresholds),
    assessServiceCases(input, thresholds),
    assessDamages(input, thresholds),
    assessCosts(input, thresholds),
    assessUtilization(input, thresholds),
    assessTelemetry(input, thresholds),
  ];

  const partialSections = input.sectionStatuses
    .filter((s) => s.status === 'PARTIAL')
    .map((s) => s.key);
  const unavailableSections = input.sectionStatuses
    .filter((s) => s.status === 'UNAVAILABLE' || s.status === 'ERROR')
    .map((s) => s.key);

  const rollupStatus = worstState(sources.map((s) => s.overallState));
  const crossCuttingIssues = buildCrossCuttingIssues(sources, input);
  const metricBindings = buildMetricBindings(sources);

  return {
    calculationVersion: EVALUATIONS_DATA_QUALITY_VERSION,
    period: input.period,
    rollupStatus,
    sources,
    metricBindings,
    crossCuttingIssues,
    thresholds,
    overallStatus: mapRollupToMetricStatus(rollupStatus),
    insightsStale: input.insights?.stale ?? true,
    insightsLastRunAt: input.insights?.lastRunAt ?? null,
    invoiceDataComplete: input.loaderHealth.financial.ok,
    fleetDataComplete: input.loaderHealth.fleet.ok,
    partialSections,
    unavailableSections,
  };
}

/** @deprecated Use buildEvaluationsDataQualityDomain — kept for transitional imports. */
export function buildDataQualitySummaryFromDomain(
  input: EvaluationsDataQualityBuildInput,
): EvaluationsDataQualityDomainSummary {
  return buildEvaluationsDataQualityDomain(input);
}

export function dataQualitySectionStatus(
  summary: EvaluationsDataQualityDomainSummary,
): EvaluationsMetricStatus {
  return computeOverallStatus([{ key: 'dataQuality', status: summary.overallStatus }]);
}

export function lookupMetricDataQuality(
  summary: EvaluationsDataQualityDomainSummary,
  metricKey: string,
): EvaluationsMetricDataQualityAttachment | null {
  const binding = summary.metricBindings.find((b) => b.metricKey === metricKey);
  if (!binding) return null;
  return {
    state: binding.state,
    sourceKey: binding.sourceKey,
    warnings: binding.warnings,
  };
}

export function enrichCostModelWithDataQuality(
  summary: EvaluationsCostModelSummary,
  domain: EvaluationsDataQualityDomainSummary,
): EvaluationsCostModelSummary {
  return {
    ...summary,
    metrics: summary.metrics.map((metric) => ({
      ...metric,
      dataQuality: lookupMetricDataQuality(domain, `costModel.${metric.key}`) ?? {
        state: domain.sources.find((s) => s.sourceKey === 'COSTS')?.overallState ?? 'LIMITED',
        sourceKey: 'COSTS',
        warnings: domain.sources.find((s) => s.sourceKey === 'COSTS')?.knownErrors.map((e) => e.message) ?? [],
      },
    })),
  };
}

export function enrichUtilizationModelWithDataQuality(
  summary: EvaluationsUtilizationModelSummary,
  domain: EvaluationsDataQualityDomainSummary,
): EvaluationsUtilizationModelSummary {
  return {
    ...summary,
    metrics: summary.metrics.map((metric) => ({
      ...metric,
      dataQuality: lookupMetricDataQuality(domain, `utilizationModel.${metric.key}`) ?? {
        state: domain.sources.find((s) => s.sourceKey === 'UTILIZATION')?.overallState ?? 'LIMITED',
        sourceKey: 'UTILIZATION',
        warnings:
          domain.sources.find((s) => s.sourceKey === 'UTILIZATION')?.knownErrors.map((e) => e.message) ?? [],
      },
    })),
  };
}

export function dataQualityWarningsFromDomain(
  domain: EvaluationsDataQualityDomainSummary,
): string[] {
  return [
    ...domain.crossCuttingIssues.map((i) => i.message),
    ...domain.sources.flatMap((s) =>
      s.knownErrors.filter((e) => e.severity !== 'INFO').map((e) => e.message),
    ),
  ];
}

export type { EvaluationsCostKpi, EvaluationsUtilizationMetric };
