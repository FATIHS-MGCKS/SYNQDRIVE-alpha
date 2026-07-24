/**
 * Pure helpers for canonical Auswertungen analytics summary (Prompt 17/54).
 */
import type {
  EvaluationsActiveRisksSummary,
  EvaluationsAnalyticsPeriod,
  EvaluationsAnalyticsPeriodWindow,
  EvaluationsAnalyticsSummaryResponse,
  EvaluationsBookingSnapshot,
  EvaluationsBookingSummary,
  EvaluationsCostsSummary,
  EvaluationsDataQualitySummary,
  EvaluationsDowntimeSummary,
  EvaluationsExecutiveKpis,
  EvaluationsFinancialSnapshot,
  EvaluationsFinancialSummary,
  EvaluationsFleetSnapshot,
  EvaluationsFleetUtilizationSummary,
  EvaluationsHighlightItem,
  EvaluationsReceivablesSummary,
  EvaluationsSectionEnvelope,
  EvaluationsSectionStatus,
  EvaluationsVehicleAvailabilitySummary,
} from './evaluations-analytics-summary.contract';
import type { InsightAnalyticsSummary } from './insights-analytics.contract';
import type { InsightEntityCountSummary } from './insight-entity-references.contract';

const PERIOD_LABELS: Record<EvaluationsAnalyticsPeriod, string> = {
  mtd: 'Month to date',
  last7d: 'Last 7 days',
  last30d: 'Last 30 days',
};

export function resolveAnalyticsPeriodWindows(
  period: EvaluationsAnalyticsPeriod,
  timezone: string,
  reference: Date = new Date(),
): { current: EvaluationsAnalyticsPeriodWindow; previous: EvaluationsAnalyticsPeriodWindow } {
  const to = reference;
  let from: Date;
  let previousFrom: Date;
  let previousTo: Date;

  const startOfMonth = (d: Date): Date => {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
  };

  switch (period) {
    case 'last7d':
      from = new Date(to.getTime() - 7 * 86400_000);
      previousTo = new Date(from.getTime() - 1);
      previousFrom = new Date(previousTo.getTime() - 7 * 86400_000);
      break;
    case 'last30d':
      from = new Date(to.getTime() - 30 * 86400_000);
      previousTo = new Date(from.getTime() - 1);
      previousFrom = new Date(previousTo.getTime() - 30 * 86400_000);
      break;
    case 'mtd':
    default:
      from = startOfMonth(to);
      previousTo = new Date(from.getTime() - 1);
      previousFrom = startOfMonth(previousTo);
      break;
  }

  const current: EvaluationsAnalyticsPeriodWindow = {
    key: period,
    label: PERIOD_LABELS[period],
    from: from.toISOString(),
    to: to.toISOString(),
    timezone,
  };

  const previous: EvaluationsAnalyticsPeriodWindow = {
    key: period,
    label: `Previous ${PERIOD_LABELS[period].toLowerCase()}`,
    from: previousFrom.toISOString(),
    to: previousTo.toISOString(),
    timezone,
  };

  return { current, previous };
}

export function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export function safePercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function buildFinancialSummary(snapshot: EvaluationsFinancialSnapshot): EvaluationsFinancialSummary {
  return {
    revenueMtdMinor: snapshot.revenueMtdMinor,
    revenuePreviousMinor: snapshot.revenuePreviousMinor,
    revenueDeltaPercent: deltaPercent(snapshot.revenueMtdMinor, snapshot.revenuePreviousMinor),
    expensesMtdMinor: snapshot.expensesMtdMinor,
    expensesPreviousMinor: snapshot.expensesPreviousMinor,
    expensesDeltaPercent: deltaPercent(snapshot.expensesMtdMinor, snapshot.expensesPreviousMinor),
    netMarginMinor: snapshot.revenueMtdMinor - snapshot.expensesMtdMinor,
    paidRevenueMtdMinor: snapshot.paidRevenueMtdMinor,
    currency: snapshot.currency,
  };
}

export function buildReceivablesSummary(snapshot: EvaluationsFinancialSnapshot): EvaluationsReceivablesSummary {
  return {
    openCount: snapshot.openReceivablesCount,
    openAmountMinor: snapshot.openReceivablesMinor,
    overdueCount: snapshot.overdueReceivablesCount,
    overdueAmountMinor: snapshot.overdueReceivablesMinor,
    currency: snapshot.currency,
  };
}

export function buildBookingSummary(snapshot: EvaluationsBookingSnapshot): EvaluationsBookingSummary {
  return {
    active: snapshot.active,
    pending: snapshot.pending,
    completed: snapshot.completed,
    revenueTodayMinor: snapshot.revenueTodayMinor,
    revenueMtdMinor: snapshot.revenueMtdMinor,
    revenuePreviousMinor: snapshot.revenuePreviousMinor,
    revenueDeltaPercent: deltaPercent(snapshot.revenueMtdMinor, snapshot.revenuePreviousMinor),
    currency: snapshot.currency,
  };
}

export function buildFleetUtilizationSummary(fleet: EvaluationsFleetSnapshot): EvaluationsFleetUtilizationSummary {
  const totalOperational = fleet.available + fleet.rented + fleet.reserved;
  return {
    totalOperational,
    rented: fleet.rented,
    available: fleet.available,
    reserved: fleet.reserved,
    utilizationPercent: safePercent(fleet.rented, totalOperational),
    underutilizedVehicles: fleet.underutilized,
  };
}

export function buildVehicleAvailabilitySummary(fleet: EvaluationsFleetSnapshot): EvaluationsVehicleAvailabilitySummary {
  const ready = fleet.available;
  return {
    total: fleet.total,
    available: fleet.available,
    rented: fleet.rented,
    reserved: fleet.reserved,
    maintenance: fleet.maintenance,
    blocked: fleet.blocked,
    other: fleet.other,
    readyPercent: safePercent(ready, fleet.total),
  };
}

export function buildDowntimeSummary(fleet: EvaluationsFleetSnapshot): EvaluationsDowntimeSummary {
  const totalDowntime = fleet.maintenance + fleet.blocked + fleet.cleaningRequired;
  return {
    maintenanceVehicles: fleet.maintenance,
    blockedVehicles: fleet.blocked,
    cleaningRequiredVehicles: fleet.cleaningRequired,
    totalDowntimeVehicles: totalDowntime,
    downtimePercent: safePercent(totalDowntime, fleet.total),
  };
}

export function buildCostsSummary(snapshot: EvaluationsFinancialSnapshot): EvaluationsCostsSummary {
  return {
    expensesMtdMinor: snapshot.expensesMtdMinor,
    expensesPreviousMinor: snapshot.expensesPreviousMinor,
    expensesDeltaPercent: deltaPercent(snapshot.expensesMtdMinor, snapshot.expensesPreviousMinor),
    fixedCostsMtdMinor: null,
    variableCostsMtdMinor: snapshot.expensesMtdMinor,
    currency: snapshot.currency,
  };
}

export function buildActiveRisksSummary(
  insightSummary: InsightAnalyticsSummary,
): EvaluationsActiveRisksSummary {
  const entities = insightSummary.counts.entities;
  return {
    businessRiskGroups: insightSummary.counts.businessRisks,
    revenueLeakageGroups: insightSummary.counts.revenueLeakage,
    criticalInsights: insightSummary.counts.criticalInsights,
    criticalBookings: insightSummary.counts.criticalBookings,
    estimatedExposureMinor: insightSummary.estimatedFinancialExposureMinor,
    exposureCurrency: insightSummary.estimatedFinancialExposureCurrency,
    orgWideRisks: entities.orgWideRisks,
    bookingScopedRisks: entities.bookingScopedRisks,
  };
}

export function buildExecutiveKpis(
  financial: EvaluationsFinancialSnapshot,
  bookings: EvaluationsBookingSnapshot,
  fleet: EvaluationsFleetSnapshot,
  risks: EvaluationsActiveRisksSummary,
): EvaluationsExecutiveKpis {
  const totalOperational = fleet.available + fleet.rented + fleet.reserved;
  return {
    revenueMtdMinor: financial.revenueMtdMinor,
    expensesMtdMinor: financial.expensesMtdMinor,
    netMarginMinor: financial.revenueMtdMinor - financial.expensesMtdMinor,
    openReceivablesMinor: financial.openReceivablesMinor,
    overdueReceivablesMinor: financial.overdueReceivablesMinor,
    activeBookings: bookings.active,
    fleetUtilizationPercent: safePercent(fleet.rented, totalOperational),
    criticalRisks: risks.criticalInsights,
    currency: financial.currency,
  };
}

export function deriveStrengthsAndWeaknesses(input: {
  financial: EvaluationsFinancialSnapshot;
  fleet: EvaluationsFleetSnapshot;
  risks: EvaluationsActiveRisksSummary;
  fleetUtilization: EvaluationsFleetUtilizationSummary;
}): { strengths: EvaluationsHighlightItem[]; weaknesses: EvaluationsHighlightItem[] } {
  const strengths: EvaluationsHighlightItem[] = [];
  const weaknesses: EvaluationsHighlightItem[] = [];

  if (input.fleetUtilization.utilizationPercent != null && input.fleetUtilization.utilizationPercent >= 70) {
    strengths.push({
      code: 'HIGH_UTILIZATION',
      label: 'Fleet utilization above 70%',
      severity: 'positive',
      metric: `${input.fleetUtilization.utilizationPercent}%`,
    });
  } else if (input.fleetUtilization.utilizationPercent != null && input.fleetUtilization.utilizationPercent < 40) {
    weaknesses.push({
      code: 'LOW_UTILIZATION',
      label: 'Fleet utilization below 40%',
      severity: 'negative',
      metric: `${input.fleetUtilization.utilizationPercent}%`,
    });
  }

  if (input.financial.overdueReceivablesMinor === 0) {
    strengths.push({
      code: 'NO_OVERDUE_RECEIVABLES',
      label: 'No overdue receivables',
      severity: 'positive',
    });
  } else if (input.financial.overdueReceivablesMinor > 0) {
    weaknesses.push({
      code: 'OVERDUE_RECEIVABLES',
      label: 'Overdue receivables outstanding',
      severity: 'negative',
      metric: `${input.financial.overdueReceivablesCount} open`,
    });
  }

  if (input.risks.criticalInsights === 0) {
    strengths.push({
      code: 'NO_CRITICAL_INSIGHTS',
      label: 'No critical business insights',
      severity: 'positive',
    });
  } else {
    weaknesses.push({
      code: 'CRITICAL_INSIGHTS',
      label: 'Critical business insights active',
      severity: 'negative',
      metric: String(input.risks.criticalInsights),
    });
  }

  if (input.fleet.underutilized > 0) {
    weaknesses.push({
      code: 'UNDERUTILIZED_VEHICLES',
      label: 'Vehicles with low booking activity',
      severity: 'negative',
      metric: String(input.fleet.underutilized),
    });
  }

  if (input.financial.revenueMtdMinor > input.financial.revenuePreviousMinor && input.financial.revenuePreviousMinor > 0) {
    strengths.push({
      code: 'REVENUE_GROWTH',
      label: 'Revenue up vs comparison period',
      severity: 'positive',
    });
  }

  return { strengths, weaknesses };
}

export function wrapSection<T>(
  data: T | null,
  status: EvaluationsSectionStatus,
  generatedAt: string,
  error: string | null = null,
  freshness?: EvaluationsSectionEnvelope<T>['freshness'],
): EvaluationsSectionEnvelope<T> {
  return { status, data, error, generatedAt, freshness };
}

export function computeOverallStatus(
  sections: Array<{ key: string; status: EvaluationsSectionStatus }>,
): EvaluationsSectionStatus {
  const statuses = sections.map((s) => s.status);
  if (statuses.every((s) => s === 'OK')) return 'OK';
  if (statuses.some((s) => s === 'ERROR') && statuses.every((s) => s === 'ERROR' || s === 'UNAVAILABLE')) {
    return 'ERROR';
  }
  if (statuses.some((s) => s === 'OK' || s === 'PARTIAL')) return 'PARTIAL';
  return 'UNAVAILABLE';
}

export function buildDataQualitySummary(input: {
  sectionStatuses: Array<{ key: string; status: EvaluationsSectionStatus }>;
  insights: Pick<InsightAnalyticsSummary, 'stale' | 'lastRunAt' | 'hasRun'>;
  financialOk: boolean;
  fleetOk: boolean;
}): EvaluationsDataQualitySummary {
  const partialSections = input.sectionStatuses
    .filter((s) => s.status === 'PARTIAL')
    .map((s) => s.key);
  const unavailableSections = input.sectionStatuses
    .filter((s) => s.status === 'UNAVAILABLE' || s.status === 'ERROR')
    .map((s) => s.key);

  const overallStatus = computeOverallStatus(input.sectionStatuses);

  return {
    overallStatus,
    insightsStale: input.insights.stale,
    insightsLastRunAt: input.insights.lastRunAt,
    invoiceDataComplete: input.financialOk,
    fleetDataComplete: input.fleetOk,
    partialSections,
    unavailableSections,
  };
}

export function buildSummaryMetadata(
  sections: Array<{ status: EvaluationsSectionStatus }>,
  generationDurationMs: number,
): EvaluationsAnalyticsSummaryResponse['metadata'] {
  return {
    generationDurationMs,
    sectionCount: sections.length,
    okSections: sections.filter((s) => s.status === 'OK').length,
    partialSections: sections.filter((s) => s.status === 'PARTIAL').length,
    errorSections: sections.filter((s) => s.status === 'ERROR').length,
    unavailableSections: sections.filter((s) => s.status === 'UNAVAILABLE').length,
  };
}

export type EvaluationsSectionResult<T> =
  | { ok: true; data: T; partial?: boolean }
  | { ok: false; error: string; unavailable?: boolean };

export function sectionStatusFromResult<T>(result: EvaluationsSectionResult<T>): EvaluationsSectionStatus {
  if (result.ok) return result.partial ? 'PARTIAL' : 'OK';
  return result.unavailable ? 'UNAVAILABLE' : 'ERROR';
}

export function unwrapSectionResult<T>(result: EvaluationsSectionResult<T>): T | null {
  return result.ok ? result.data : null;
}

export function affectedEntitiesFromInsights(
  insightSummary: InsightAnalyticsSummary,
): InsightEntityCountSummary {
  return insightSummary.counts.entities;
}
