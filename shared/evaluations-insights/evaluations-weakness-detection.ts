/**
 * Pure rule engine for Auswertungen weakness detection (Prompt 24/54).
 */
import type { EvaluationsHighlightItem } from './evaluations-analytics-summary.contract';
import { deltaPercent } from './evaluations-analytics-summary';
import type { EvaluationsCostModelSummary } from './evaluations-cost-model.contract';
import type { EvaluationsUtilizationModelSummary } from './evaluations-utilization-model.contract';
import type { EvaluationsUtilizationSnapshot } from './evaluations-utilization-model.contract';
import {
  DEFAULT_WEAKNESS_ORG_TARGETS,
  EVALUATIONS_WEAKNESS_DETECTION_VERSION,
  type EvaluationsDetectedWeakness,
  type EvaluationsSuppressedWeaknessRule,
  type EvaluationsWeaknessDetectionSnapshot,
  type EvaluationsWeaknessDetectionSummary,
  type EvaluationsWeaknessId,
  type EvaluationsWeaknessOrgTargets,
  type EvaluationsWeaknessSeverity,
} from './evaluations-weakness-detection.contract';

const MS_HOUR = 60 * 60 * 1000;

const SEVERITY_RANK: Record<EvaluationsWeaknessSeverity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

/** Rules that must not fire when core data is unreliable (except POOR_DATA_QUALITY). */
const BUSINESS_RULE_IDS: EvaluationsWeaknessId[] = [
  'UNDERUTILIZATION',
  'DECLINING_REVENUE',
  'RISING_COSTS',
  'LOW_MARGIN',
  'HIGH_OVERDUE_RECEIVABLES',
  'HIGH_CANCELLATION_RATE',
  'HIGH_NO_SHOW_RATE',
  'LONG_TURNAROUND',
  'RECURRING_VEHICLE_BREAKDOWNS',
  'HIGH_DAMAGE_RATE',
  'STATION_BOTTLENECKS',
  'COMPLIANCE_RISKS',
];

/** Only one weakness per dedup group (most severe kept). */
const DEDUP_GROUPS: Record<string, EvaluationsWeaknessId[]> = {
  'utilization-pressure': ['UNDERUTILIZATION'],
  'booking-loss': ['HIGH_CANCELLATION_RATE', 'HIGH_NO_SHOW_RATE'],
  'fleet-downtime': ['RECURRING_VEHICLE_BREAKDOWNS', 'LONG_TURNAROUND'],
};

function safeRatio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function severityFromDeviation(
  deviationPercent: number,
  warningAt: number,
  criticalAt: number,
): EvaluationsWeaknessSeverity {
  if (deviationPercent >= criticalAt) return 'CRITICAL';
  if (deviationPercent >= warningAt) return 'WARNING';
  return 'INFO';
}

function priorityFor(severity: EvaluationsWeaknessSeverity, financialMinor: number | null): number {
  const base = SEVERITY_RANK[severity] * 1000;
  const financial = financialMinor != null ? Math.min(999, Math.floor(financialMinor / 10_000)) : 0;
  return base - financial;
}

function dedupeAndPrioritize(
  weaknesses: EvaluationsDetectedWeakness[],
): EvaluationsDetectedWeakness[] {
  const byGroup = new Map<string, EvaluationsDetectedWeakness>();

  for (const weakness of weaknesses) {
    const groupKey =
      Object.entries(DEDUP_GROUPS).find(([, ids]) => ids.includes(weakness.id))?.[0] ??
      `${weakness.id}:${weakness.affectedEntities.dimensionKey ?? 'org'}`;
    const existing = byGroup.get(groupKey);
    if (!existing) {
      byGroup.set(groupKey, weakness);
      continue;
    }
    const keep =
      SEVERITY_RANK[weakness.severity] < SEVERITY_RANK[existing.severity]
        ? weakness
        : SEVERITY_RANK[weakness.severity] === SEVERITY_RANK[existing.severity] &&
            weakness.priority < existing.priority
          ? weakness
          : existing;
    byGroup.set(groupKey, keep);
  }

  const deduped = [...byGroup.values()];
  const seen = new Set<string>();
  const unique: EvaluationsDetectedWeakness[] = [];
  for (const w of deduped) {
    const key = `${w.id}:${w.affectedEntities.dimensionKey ?? 'org'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(w);
  }

  return unique.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    return a.priority - b.priority;
  });
}

function toHighlights(weaknesses: EvaluationsDetectedWeakness[]): EvaluationsHighlightItem[] {
  return weaknesses
    .filter((w) => w.affectedEntities.entityType === 'ORG' || w.affectedEntities.entityType === 'FLEET')
    .slice(0, 8)
    .map((w) => ({
      code: w.id,
      label: w.title,
      severity: 'negative' as const,
      metric: w.quantitativeDeviation.label,
    }));
}

export function detectOrganizationalWeaknesses(
  snapshot: EvaluationsWeaknessDetectionSnapshot,
  targets: EvaluationsWeaknessOrgTargets = DEFAULT_WEAKNESS_ORG_TARGETS,
): EvaluationsWeaknessDetectionSummary {
  const weaknesses: EvaluationsDetectedWeakness[] = [];
  const suppressed: EvaluationsSuppressedWeaknessRule[] = [];
  const ruleIds: EvaluationsWeaknessId[] = [...BUSINESS_RULE_IDS, 'POOR_DATA_QUALITY'];

  const dq = snapshot.dataQuality;
  const suppressBusiness =
    dq.overallStatus === 'ERROR' ||
    dq.unavailableSectionCount > 0 ||
    dq.hasOverlappingBookings;

  if (suppressBusiness) {
    for (const ruleId of BUSINESS_RULE_IDS) {
      suppressed.push({
        ruleId,
        reason: dq.hasOverlappingBookings
          ? 'Overlapping booking data — business weaknesses suppressed to avoid false deterioration signals.'
          : 'Critical data quality issues — business weaknesses suppressed.',
      });
    }
  }

  // POOR_DATA_QUALITY — separate from business deterioration
  if (
    dq.overallStatus !== 'OK' ||
    !dq.invoiceDataComplete ||
    !dq.fleetDataComplete ||
    dq.insightsStale ||
    dq.partialSectionCount > 0 ||
    dq.hasOverlappingBookings
  ) {
    weaknesses.push({
      id: 'POOR_DATA_QUALITY',
      category: 'DATA_QUALITY',
      severity: dq.overallStatus === 'ERROR' || dq.hasOverlappingBookings ? 'CRITICAL' : 'WARNING',
      title: 'Analytics data quality gaps',
      description:
        'Core analytics inputs are incomplete, stale, or inconsistent. Interpret operational KPIs with caution.',
      underlyingKpis: ['dataQuality.overallStatus', 'dataQuality.partialSections'],
      quantitativeDeviation: {
        value: dq.partialSectionCount + dq.unavailableSectionCount,
        unit: 'count',
        direction: 'worse',
        label: `${dq.partialSectionCount + dq.unavailableSectionCount} section issues`,
        kind: 'OBSERVATION',
      },
      period: snapshot.period,
      comparisonBasis: 'OBSERVED_THRESHOLD',
      affectedEntities: {
        entityType: 'ORG',
        vehicles: 0,
        stations: 0,
        bookings: 0,
        insightGroups: 0,
      },
      financialImpact: null,
      confidence: 'HIGH',
      dataCoverage: { numerator: 1, denominator: 1, percent: 100 },
      recommendedNextAnalysis:
        'Review dataQuality section, resolve overlapping bookings, and refresh insights before acting on revenue or utilization weaknesses.',
      priority: priorityFor(
        dq.overallStatus === 'ERROR' ? 'CRITICAL' : 'WARNING',
        null,
      ),
    });
  }

  if (suppressBusiness) {
    return finalize(snapshot, weaknesses, suppressed, ruleIds);
  }

  const util =
    snapshot.utilization.timeWeightedUtilizationPercent ??
    snapshot.utilization.operationalSnapshotUtilizationPercent;

  // UNDERUTILIZATION
  {
    const coverage = safeRatio(
      snapshot.utilization.vehiclesWithData,
      snapshot.utilization.vehicleCount,
    );
    if (!snapshot.utilization.available || snapshot.utilization.vehicleCount < 3) {
      suppressed.push({
        ruleId: 'UNDERUTILIZATION',
        reason: 'Minimum 3 vehicles with utilization data required.',
      });
    } else if (util != null && util < targets.minUtilizationPercent) {
      const gap = targets.minUtilizationPercent - util;
      const severity = severityFromDeviation(gap, 10, 25);
      weaknesses.push({
        id: 'UNDERUTILIZATION',
        category: 'UTILIZATION',
        severity,
        title: 'Fleet underutilization',
        description: `Fleet utilization is below the organization minimum target of ${targets.minUtilizationPercent}%.`,
        underlyingKpis: [
          'utilizationModel.metrics.UTILIZATION_PER_VEHICLE',
          'fleet.underutilized',
        ],
        quantitativeDeviation: {
          value: util,
          unit: 'percent',
          direction: 'worse',
          label: `${util}% utilization`,
          kind: 'OBSERVATION',
        },
        period: snapshot.period,
        comparisonBasis: 'ORG_TARGET',
        affectedEntities: {
          entityType: 'FLEET',
          vehicles: Math.max(snapshot.fleet.underutilized, snapshot.utilization.vehicleCount),
          stations: 0,
          bookings: 0,
          insightGroups: 0,
        },
        financialImpact: {
          kind: 'ESTIMATE',
          amountMinor: null,
          currency: snapshot.currency,
          label: 'Potential revenue gap not quantified without demand forecast.',
          notes: 'Underutilization opportunity cost is not modeled as actual cost in v1.',
        },
        confidence: coverage != null && coverage >= 90 ? 'HIGH' : 'MEDIUM',
        dataCoverage: {
          numerator: snapshot.utilization.vehiclesWithData,
          denominator: snapshot.utilization.vehicleCount,
          percent: coverage,
        },
        recommendedNextAnalysis:
          'Drill into utilizationModel by station and vehicle class; review LOW_UTILIZATION insights.',
        priority: priorityFor(severity, null),
      });
    }
  }

  // DECLINING_REVENUE
  {
    const growth = deltaPercent(
      snapshot.financial.revenueCurrentMinor,
      snapshot.financial.revenuePreviousMinor,
    );
    if (snapshot.financial.revenuePreviousMinor <= 0) {
      suppressed.push({
        ruleId: 'DECLINING_REVENUE',
        reason: 'No comparison-period revenue baseline.',
      });
    } else if (growth != null && growth <= targets.maxRevenueDeclinePercent) {
      const severity = severityFromDeviation(Math.abs(growth), 5, 15);
      weaknesses.push({
        id: 'DECLINING_REVENUE',
        category: 'REVENUE',
        severity,
        title: 'Revenue decline vs previous period',
        description: 'Period revenue decreased compared to the prior comparison window.',
        underlyingKpis: ['financial.revenueMtdMinor'],
        quantitativeDeviation: {
          value: growth,
          unit: 'percent',
          direction: 'worse',
          label: `${growth}% revenue`,
          kind: 'OBSERVATION',
        },
        period: snapshot.period,
        comparisonPeriod: snapshot.comparisonPeriod,
        comparisonBasis: 'HISTORICAL_PERIOD',
        affectedEntities: {
          entityType: 'ORG',
          vehicles: 0,
          stations: 0,
          bookings: 0,
          insightGroups: 0,
        },
        financialImpact: {
          kind: 'OBSERVATION',
          amountMinor: snapshot.financial.revenuePreviousMinor - snapshot.financial.revenueCurrentMinor,
          currency: snapshot.currency,
          label: 'Revenue shortfall vs comparison period',
        },
        confidence: 'HIGH',
        dataCoverage: {
          numerator: snapshot.financial.revenueCurrentMinor,
          denominator: snapshot.financial.revenuePreviousMinor,
          percent: 100,
        },
        recommendedNextAnalysis:
          'Compare bookings volume, cancellation rate, and station-level revenue breakdown.',
        priority: priorityFor(
          severity,
          snapshot.financial.revenuePreviousMinor - snapshot.financial.revenueCurrentMinor,
        ),
      });
    }
  }

  // RISING_COSTS
  {
    const costGrowth = deltaPercent(
      snapshot.financial.expensesCurrentMinor,
      snapshot.financial.expensesPreviousMinor,
    );
    if (snapshot.financial.expensesPreviousMinor <= 0) {
      suppressed.push({
        ruleId: 'RISING_COSTS',
        reason: 'No comparison-period expense baseline.',
      });
    } else if (costGrowth != null && costGrowth >= targets.maxCostGrowthPercent) {
      const severity = severityFromDeviation(costGrowth, targets.maxCostGrowthPercent, 25);
      weaknesses.push({
        id: 'RISING_COSTS',
        category: 'COST',
        severity,
        title: 'Rising operating costs',
        description: `Expenses grew faster than the organization target of +${targets.maxCostGrowthPercent}%.`,
        underlyingKpis: ['financial.expensesMtdMinor', 'costModel.totals.actualExpensesMinor'],
        quantitativeDeviation: {
          value: costGrowth,
          unit: 'percent',
          direction: 'worse',
          label: `+${costGrowth}% costs`,
          kind: 'OBSERVATION',
        },
        period: snapshot.period,
        comparisonPeriod: snapshot.comparisonPeriod,
        comparisonBasis: 'HISTORICAL_PERIOD',
        affectedEntities: { entityType: 'ORG', vehicles: 0, stations: 0, bookings: 0, insightGroups: 0 },
        financialImpact: {
          kind: 'OBSERVATION',
          amountMinor: snapshot.financial.expensesCurrentMinor - snapshot.financial.expensesPreviousMinor,
          currency: snapshot.currency,
          label: 'Expense increase vs comparison period',
        },
        confidence: snapshot.costs.available ? 'HIGH' : 'MEDIUM',
        dataCoverage: {
          numerator: snapshot.financial.expensesCurrentMinor,
          denominator: snapshot.financial.expensesPreviousMinor,
          percent: 100,
        },
        recommendedNextAnalysis: 'Review costModel breakdown by vendor category, damage, and service cases.',
        priority: priorityFor(
          severity,
          snapshot.financial.expensesCurrentMinor - snapshot.financial.expensesPreviousMinor,
        ),
      });
    }
  }

  // LOW_MARGIN
  {
    const revenue = snapshot.financial.revenueCurrentMinor;
    const marginMinor = revenue - snapshot.financial.expensesCurrentMinor;
    const marginPct = safeRatio(marginMinor, revenue);
    if (revenue <= 0) {
      suppressed.push({ ruleId: 'LOW_MARGIN', reason: 'No revenue in period.' });
    } else if (marginPct != null && marginPct < targets.minMarginPercent) {
      const gap = targets.minMarginPercent - marginPct;
      const severity = severityFromDeviation(gap, 5, 15);
      weaknesses.push({
        id: 'LOW_MARGIN',
        category: 'MARGIN',
        severity,
        title: 'Low net margin',
        description: `Net margin is below the organization target of ${targets.minMarginPercent}%.`,
        underlyingKpis: ['financial.revenueMtdMinor', 'financial.expensesMtdMinor'],
        quantitativeDeviation: {
          value: marginPct,
          unit: 'percent',
          direction: 'worse',
          label: `${marginPct}% margin`,
          kind: 'OBSERVATION',
        },
        period: snapshot.period,
        comparisonBasis: 'ORG_TARGET',
        affectedEntities: { entityType: 'ORG', vehicles: 0, stations: 0, bookings: 0, insightGroups: 0 },
        financialImpact: {
          kind: 'OBSERVATION',
          amountMinor: marginMinor,
          currency: snapshot.currency,
          label: 'Net margin in period',
        },
        confidence: 'MEDIUM',
        dataCoverage: { numerator: marginMinor, denominator: revenue, percent: marginPct },
        recommendedNextAnalysis: 'Correlate margin with costModel ratios and revenue per vehicle.',
        priority: priorityFor(severity, revenue - marginMinor),
      });
    }
  }

  // HIGH_OVERDUE_RECEIVABLES
  {
    const totalOpen = snapshot.financial.openReceivablesMinor;
    const overdueRate = safeRatio(snapshot.financial.overdueReceivablesMinor, totalOpen);
    if (snapshot.financial.overdueReceivablesMinor <= 0) {
      suppressed.push({
        ruleId: 'HIGH_OVERDUE_RECEIVABLES',
        reason: 'No overdue receivables.',
      });
    } else if (overdueRate != null && overdueRate > targets.maxOverdueRatePercent) {
      const severity =
        snapshot.financial.overdueReceivablesCount >= 5 || overdueRate >= 20
          ? 'CRITICAL'
          : overdueRate >= 10
            ? 'WARNING'
            : 'INFO';
      weaknesses.push({
        id: 'HIGH_OVERDUE_RECEIVABLES',
        category: 'RECEIVABLES',
        severity,
        title: 'High overdue receivables rate',
        description: 'Overdue receivables exceed the organization target share of open balances.',
        underlyingKpis: [
          'receivables.overdueAmountMinor',
          'receivables.openAmountMinor',
        ],
        quantitativeDeviation: {
          value: overdueRate,
          unit: 'percent',
          direction: 'worse',
          label: `${overdueRate}% overdue`,
          kind: 'OBSERVATION',
        },
        period: snapshot.period,
        comparisonBasis: 'ORG_TARGET',
        affectedEntities: {
          entityType: 'ORG',
          vehicles: 0,
          stations: 0,
          bookings: snapshot.financial.overdueReceivablesCount,
          insightGroups: 0,
        },
        financialImpact: {
          kind: 'OBSERVATION',
          amountMinor: snapshot.financial.overdueReceivablesMinor,
          currency: snapshot.currency,
          label: 'Overdue receivables outstanding',
        },
        confidence: snapshot.financial.openReceivablesCount >= 3 ? 'HIGH' : 'MEDIUM',
        dataCoverage: {
          numerator: snapshot.financial.overdueReceivablesMinor,
          denominator: totalOpen,
          percent: overdueRate,
        },
        recommendedNextAnalysis: 'Review receivables aging and revenueLeakage insights.',
        priority: priorityFor(severity, snapshot.financial.overdueReceivablesMinor),
      });
    } else if (snapshot.financial.overdueReceivablesMinor > 0) {
      weaknesses.push({
        id: 'HIGH_OVERDUE_RECEIVABLES',
        category: 'RECEIVABLES',
        severity: 'INFO',
        title: 'Overdue receivables outstanding',
        description: 'Some receivables are overdue but within target rate thresholds.',
        underlyingKpis: ['receivables.overdueAmountMinor'],
        quantitativeDeviation: {
          value: snapshot.financial.overdueReceivablesCount,
          unit: 'count',
          direction: 'worse',
          label: `${snapshot.financial.overdueReceivablesCount} overdue`,
          kind: 'OBSERVATION',
        },
        period: snapshot.period,
        comparisonBasis: 'OBSERVED_THRESHOLD',
        affectedEntities: {
          entityType: 'ORG',
          vehicles: 0,
          stations: 0,
          bookings: snapshot.financial.overdueReceivablesCount,
          insightGroups: 0,
        },
        financialImpact: {
          kind: 'OBSERVATION',
          amountMinor: snapshot.financial.overdueReceivablesMinor,
          currency: snapshot.currency,
          label: 'Overdue receivables outstanding',
        },
        confidence: 'HIGH',
        dataCoverage: {
          numerator: snapshot.financial.overdueReceivablesMinor,
          denominator: totalOpen,
          percent: overdueRate,
        },
        recommendedNextAnalysis: 'Monitor collection trend; not yet above overdue rate target.',
        priority: priorityFor('INFO', snapshot.financial.overdueReceivablesMinor),
      });
    }
  }

  // HIGH_CANCELLATION_RATE
  {
    const totalBookings =
      snapshot.bookings.completedInPeriod +
      snapshot.bookings.cancelledInPeriod +
      snapshot.bookings.noShowInPeriod;
    const cancelRate = safeRatio(snapshot.bookings.cancelledInPeriod, totalBookings);
    if (totalBookings < 10) {
      suppressed.push({
        ruleId: 'HIGH_CANCELLATION_RATE',
        reason: 'Minimum 10 booking outcomes in period required.',
      });
    } else if (cancelRate != null && cancelRate > targets.maxCancellationRatePercent) {
      const severity = severityFromDeviation(cancelRate - targets.maxCancellationRatePercent, 5, 15);
      weaknesses.push({
        id: 'HIGH_CANCELLATION_RATE',
        category: 'BOOKINGS',
        severity,
        title: 'High cancellation rate',
        description: 'Cancelled bookings exceed the organization target share of outcomes.',
        underlyingKpis: ['bookings.cancelled / total outcomes'],
        quantitativeDeviation: {
          value: cancelRate,
          unit: 'percent',
          direction: 'worse',
          label: `${cancelRate}% cancellations`,
          kind: 'OBSERVATION',
        },
        period: snapshot.period,
        comparisonBasis: 'ORG_TARGET',
        affectedEntities: {
          entityType: 'ORG',
          vehicles: 0,
          stations: 0,
          bookings: snapshot.bookings.cancelledInPeriod,
          insightGroups: 0,
        },
        financialImpact: {
          kind: 'ESTIMATE',
          amountMinor: null,
          currency: snapshot.currency,
          label: 'Lost revenue from cancellations not fully attributed in v1.',
        },
        confidence: totalBookings >= 30 ? 'HIGH' : 'MEDIUM',
        dataCoverage: {
          numerator: snapshot.bookings.cancelledInPeriod,
          denominator: totalBookings,
          percent: cancelRate,
        },
        recommendedNextAnalysis: 'Segment cancellations by station and lead time before start.',
        priority: priorityFor(severity, null),
      });
    }
  }

  // HIGH_NO_SHOW_RATE
  {
    const totalBookings =
      snapshot.bookings.completedInPeriod +
      snapshot.bookings.cancelledInPeriod +
      snapshot.bookings.noShowInPeriod;
    const noShowRate = safeRatio(snapshot.bookings.noShowInPeriod, totalBookings);
    if (totalBookings < 10) {
      suppressed.push({
        ruleId: 'HIGH_NO_SHOW_RATE',
        reason: 'Minimum 10 booking outcomes in period required.',
      });
    } else if (noShowRate != null && noShowRate > targets.maxNoShowRatePercent) {
      const severity = severityFromDeviation(noShowRate - targets.maxNoShowRatePercent, 3, 10);
      weaknesses.push({
        id: 'HIGH_NO_SHOW_RATE',
        category: 'BOOKINGS',
        severity,
        title: 'High no-show rate',
        description: 'No-show bookings exceed the organization target share of outcomes.',
        underlyingKpis: ['bookings.no_show / total outcomes'],
        quantitativeDeviation: {
          value: noShowRate,
          unit: 'percent',
          direction: 'worse',
          label: `${noShowRate}% no-shows`,
          kind: 'OBSERVATION',
        },
        period: snapshot.period,
        comparisonBasis: 'ORG_TARGET',
        affectedEntities: {
          entityType: 'ORG',
          vehicles: 0,
          stations: 0,
          bookings: snapshot.bookings.noShowInPeriod,
          insightGroups: 0,
        },
        financialImpact: {
          kind: 'ESTIMATE',
          amountMinor: null,
          currency: snapshot.currency,
          label: 'No-show revenue leakage estimated via insights exposure where available.',
          notes:
            snapshot.insights.estimatedExposureMinor > 0
              ? `Insight exposure reference: ${snapshot.insights.estimatedExposureMinor} minor units.`
              : undefined,
        },
        confidence: totalBookings >= 30 ? 'HIGH' : 'MEDIUM',
        dataCoverage: {
          numerator: snapshot.bookings.noShowInPeriod,
          denominator: totalBookings,
          percent: noShowRate,
        },
        recommendedNextAnalysis: 'Review pickup-overdue insights and booking confirmation workflow.',
        priority: priorityFor(severity, snapshot.insights.estimatedExposureMinor),
      });
    }
  }

  // LONG_TURNAROUND
  if (snapshot.utilization.turnaroundCount < 3 || snapshot.utilization.avgTurnaroundMs == null) {
    suppressed.push({
      ruleId: 'LONG_TURNAROUND',
      reason: 'Minimum 3 turnaround gaps between rentals required.',
    });
  } else {
    const avgHours = snapshot.utilization.avgTurnaroundMs / MS_HOUR;
    if (avgHours > targets.maxTurnaroundHours) {
      const severity = severityFromDeviation(avgHours - targets.maxTurnaroundHours, 12, 36);
      weaknesses.push({
        id: 'LONG_TURNAROUND',
        category: 'OPERATIONS',
        severity,
        title: 'Long turnaround between rentals',
        description: `Average idle gap between rentals exceeds ${targets.maxTurnaroundHours}h target.`,
        underlyingKpis: ['utilizationModel.totals.turnaroundMs / turnaroundCount'],
        quantitativeDeviation: {
          value: Math.round(avgHours * 10) / 10,
          unit: 'count',
          direction: 'worse',
          label: `${Math.round(avgHours * 10) / 10}h avg turnaround`,
          kind: 'OBSERVATION',
        },
        period: snapshot.period,
        comparisonBasis: 'ORG_TARGET',
        affectedEntities: {
          entityType: 'FLEET',
          vehicles: snapshot.utilization.vehicleCount,
          stations: 0,
          bookings: 0,
          insightGroups: 0,
        },
        financialImpact: null,
        confidence: snapshot.utilization.turnaroundCount >= 10 ? 'HIGH' : 'MEDIUM',
        dataCoverage: {
          numerator: snapshot.utilization.turnaroundCount,
          denominator: snapshot.utilization.vehicleCount,
          percent: null,
          notes: `${snapshot.utilization.turnaroundCount} turnaround gaps measured.`,
        },
        recommendedNextAnalysis: 'Inspect cleaning turnaround and tight-handover insights by station.',
        priority: priorityFor(severity, null),
      });
    }
  }

  // RECURRING_VEHICLE_BREAKDOWNS
  {
    const repeatVehicles = snapshot.utilization.vehiclesWithHighDowntime;
    if (!snapshot.utilization.available) {
      suppressed.push({
        ruleId: 'RECURRING_VEHICLE_BREAKDOWNS',
        reason: 'Utilization downtime data unavailable.',
      });
    } else if (repeatVehicles.length >= targets.minVehiclesWithRepeatDowntime) {
      const severity =
        repeatVehicles.length >= 5 ? 'CRITICAL' : repeatVehicles.length >= 3 ? 'WARNING' : 'INFO';
      weaknesses.push({
        id: 'RECURRING_VEHICLE_BREAKDOWNS',
        category: 'FLEET_HEALTH',
        severity,
        title: 'Recurring unplanned vehicle downtime',
        description: `${repeatVehicles.length} vehicles exceed unplanned downtime share thresholds.`,
        underlyingKpis: ['utilizationModel per-vehicle unplannedDowntimeMs'],
        quantitativeDeviation: {
          value: repeatVehicles.length,
          unit: 'count',
          direction: 'worse',
          label: `${repeatVehicles.length} vehicles`,
          kind: 'OBSERVATION',
        },
        period: snapshot.period,
        comparisonBasis: 'OBSERVED_THRESHOLD',
        affectedEntities: {
          entityType: 'FLEET',
          vehicles: repeatVehicles.length,
          stations: 0,
          bookings: 0,
          insightGroups: 0,
        },
        financialImpact: {
          kind: 'ESTIMATE',
          amountMinor: null,
          currency: snapshot.currency,
          label: 'Downtime cost not fully attributed per vehicle in v1.',
        },
        confidence: 'MEDIUM',
        dataCoverage: {
          numerator: repeatVehicles.length,
          denominator: snapshot.utilization.vehicleCount,
          percent: safeRatio(repeatVehicles.length, snapshot.utilization.vehicleCount),
        },
        recommendedNextAnalysis:
          'Drill into UNPLANNED_DOWNTIME utilization metric and service case history per vehicle.',
        priority: priorityFor(severity, null),
      });
    }
  }

  // HIGH_DAMAGE_RATE
  if (!snapshot.costs.available || snapshot.costs.revenueCurrentMinor <= 0) {
    suppressed.push({
      ruleId: 'HIGH_DAMAGE_RATE',
      reason: 'Damage cost or revenue data unavailable.',
    });
  } else {
    const damageRatio = safeRatio(
      snapshot.costs.recordedDamageCostsMinor,
      snapshot.costs.revenueCurrentMinor,
    );
    if (damageRatio != null && damageRatio > targets.maxDamageCostRatioPercent) {
      const severity = severityFromDeviation(
        damageRatio - targets.maxDamageCostRatioPercent,
        3,
        10,
      );
      weaknesses.push({
        id: 'HIGH_DAMAGE_RATE',
        category: 'DAMAGE',
        severity,
        title: 'High damage cost ratio',
        description: 'Recorded damage repair costs exceed the organization target share of revenue.',
        underlyingKpis: ['costModel.totals.recordedDamageCostsMinor / revenue'],
        quantitativeDeviation: {
          value: damageRatio,
          unit: 'percent',
          direction: 'worse',
          label: `${damageRatio}% damage/revenue`,
          kind: 'OBSERVATION',
        },
        period: snapshot.period,
        comparisonBasis: 'ORG_TARGET',
        affectedEntities: { entityType: 'ORG', vehicles: 0, stations: 0, bookings: 0, insightGroups: 0 },
        financialImpact: {
          kind: 'OBSERVATION',
          amountMinor: snapshot.costs.recordedDamageCostsMinor,
          currency: snapshot.currency,
          label: 'Recorded damage repair costs in period',
        },
        confidence: snapshot.costs.recordedDamageCostsMinor > 0 ? 'HIGH' : 'LOW',
        dataCoverage: {
          numerator: snapshot.costs.recordedDamageCostsMinor,
          denominator: snapshot.costs.revenueCurrentMinor,
          percent: damageRatio,
        },
        recommendedNextAnalysis: 'Review damages module and costModel DAMAGE_REPAIR_COSTS KPI.',
        priority: priorityFor(severity, snapshot.costs.recordedDamageCostsMinor),
      });
    }
  }

  // STATION_BOTTLENECKS
  {
    const bottlenecks = snapshot.utilization.stationBottlenecks;
    if (!snapshot.utilization.available) {
      suppressed.push({
        ruleId: 'STATION_BOTTLENECKS',
        reason: 'Utilization station bottleneck data unavailable.',
      });
    } else if (bottlenecks.length > 0) {
      const severity = bottlenecks.length >= 3 ? 'CRITICAL' : bottlenecks.length >= 2 ? 'WARNING' : 'INFO';
      weaknesses.push({
        id: 'STATION_BOTTLENECKS',
        category: 'CAPACITY',
        severity,
        title: 'Station capacity bottlenecks',
        description: `${bottlenecks.length} station(s) show low spare capacity at period end.`,
        underlyingKpis: ['utilizationModel.metrics.CAPACITY_BOTTLENECKS'],
        quantitativeDeviation: {
          value: bottlenecks.length,
          unit: 'count',
          direction: 'worse',
          label: `${bottlenecks.length} stations`,
          kind: 'OBSERVATION',
        },
        period: snapshot.period,
        comparisonBasis: 'OBSERVED_THRESHOLD',
        affectedEntities: {
          entityType: 'STATION',
          vehicles: bottlenecks.reduce((s, b) => s + b.totalVehicles, 0),
          stations: bottlenecks.length,
          bookings: 0,
          insightGroups: 0,
        },
        financialImpact: {
          kind: 'ESTIMATE',
          amountMinor: null,
          currency: snapshot.currency,
          label: 'Revenue at risk from capacity constraints not quantified in v1.',
        },
        confidence: 'MEDIUM',
        dataCoverage: {
          numerator: bottlenecks.length,
          denominator: snapshot.utilization.weakStations.length || bottlenecks.length,
          percent: null,
        },
        recommendedNextAnalysis:
          'Review STATION_SHORTAGE insights and utilization drill-down CAPACITY_BOTTLENECKS.',
        priority: priorityFor(severity, null),
      });
    }
  }

  // COMPLIANCE_RISKS
  {
    const complianceCount = snapshot.insights.complianceInsightGroups;
    if (complianceCount <= 0 && snapshot.insights.criticalInsights <= 0) {
      suppressed.push({
        ruleId: 'COMPLIANCE_RISKS',
        reason: 'No active compliance or critical operational insights.',
      });
    } else if (complianceCount > 0) {
      const severity =
        complianceCount >= 5 ? 'CRITICAL' : complianceCount >= 2 ? 'WARNING' : 'INFO';
      weaknesses.push({
        id: 'COMPLIANCE_RISKS',
        category: 'COMPLIANCE',
        severity,
        title: 'Compliance and inspection risks active',
        description: `${complianceCount} active compliance-related insight group(s) require attention.`,
        underlyingKpis: ['insights.complianceInsightGroups', 'insights.criticalInsights'],
        quantitativeDeviation: {
          value: complianceCount,
          unit: 'count',
          direction: 'worse',
          label: `${complianceCount} compliance groups`,
          kind: 'OBSERVATION',
        },
        period: snapshot.period,
        comparisonBasis: 'OBSERVED_THRESHOLD',
        affectedEntities: {
          entityType: 'ORG',
          vehicles: snapshot.insights.affectedVehicles,
          stations: snapshot.insights.affectedStations,
          bookings: snapshot.insights.affectedBookings,
          insightGroups: complianceCount,
        },
        financialImpact: {
          kind: 'ESTIMATE',
          amountMinor: snapshot.insights.estimatedExposureMinor,
          currency: snapshot.insights.exposureCurrency,
          label: 'Estimated insight financial exposure (partial attribution).',
          notes: 'Exposure aggregates business risk and revenue leakage insights, not compliance-only.',
        },
        confidence: 'HIGH',
        dataCoverage: {
          numerator: complianceCount,
          denominator: snapshot.insights.businessRiskGroups + snapshot.insights.revenueLeakageGroups,
          percent: safeRatio(
            complianceCount,
            snapshot.insights.businessRiskGroups + snapshot.insights.revenueLeakageGroups,
          ),
        },
        recommendedNextAnalysis:
          'Filter insights by TUV_OVERDUE, BOKRAFT_OVERDUE, and service compliance types.',
        priority: priorityFor(severity, snapshot.insights.estimatedExposureMinor),
      });
    }
  }

  return finalize(snapshot, weaknesses, suppressed, ruleIds);
}

function finalize(
  snapshot: EvaluationsWeaknessDetectionSnapshot,
  weaknesses: EvaluationsDetectedWeakness[],
  suppressed: EvaluationsSuppressedWeaknessRule[],
  ruleIds: EvaluationsWeaknessId[],
): EvaluationsWeaknessDetectionSummary {
  const prioritized = dedupeAndPrioritize(weaknesses);
  return {
    calculationVersion: EVALUATIONS_WEAKNESS_DETECTION_VERSION,
    period: snapshot.period,
    comparisonPeriod: snapshot.comparisonPeriod,
    weaknesses: prioritized,
    rulesEvaluated: ruleIds.length,
    rulesSuppressed: suppressed,
    highlights: toHighlights(prioritized),
  };
}

export function weaknessDetectionSectionStatus(
  summary: EvaluationsWeaknessDetectionSummary,
): 'OK' | 'PARTIAL' | 'UNAVAILABLE' {
  if (
    summary.weaknesses.length === 0 &&
    summary.rulesSuppressed.length >= summary.rulesEvaluated - 1
  ) {
    return 'UNAVAILABLE';
  }
  if (summary.weaknesses.some((w) => w.severity === 'CRITICAL')) return 'PARTIAL';
  if (summary.weaknesses.length > 0) return 'PARTIAL';
  return 'OK';
}

export const COMPLIANCE_INSIGHT_TYPES = [
  'TUV_OVERDUE',
  'BOKRAFT_OVERDUE',
  'HM_SERVICE_NO_TRACKING',
] as const;

export function countComplianceInsightGroups(
  rows: Array<{ type: string; groupCount?: number }>,
): number {
  return rows.filter((r) =>
    COMPLIANCE_INSIGHT_TYPES.includes(r.type as (typeof COMPLIANCE_INSIGHT_TYPES)[number]),
  ).length;
}

export function buildWeaknessDetectionSnapshot(input: {
  period: EvaluationsWeaknessDetectionSnapshot['period'];
  comparisonPeriod: EvaluationsWeaknessDetectionSnapshot['comparisonPeriod'];
  currency: string;
  financial: EvaluationsWeaknessDetectionSnapshot['financial'] | null;
  bookings: EvaluationsWeaknessDetectionSnapshot['bookings'] | null;
  fleet: EvaluationsWeaknessDetectionSnapshot['fleet'] | null;
  utilizationModel: EvaluationsUtilizationModelSummary | null;
  utilizationSnapshot: EvaluationsUtilizationSnapshot | null;
  costModel: EvaluationsCostModelSummary | null;
  insights: EvaluationsWeaknessDetectionSnapshot['insights'];
  dataQuality: EvaluationsWeaknessDetectionSnapshot['dataQuality'];
  vehiclesWithUtilizationData: number;
  turnaroundCount: number;
  overlappingBookingCount: number;
}): EvaluationsWeaknessDetectionSnapshot {
  const utilMetric = input.utilizationModel?.metrics.find(
    (m) => m.key === 'UTILIZATION_PER_VEHICLE',
  );
  const opMetric = input.utilizationModel?.metrics.find(
    (m) => m.key === 'OPERATIONAL_SNAPSHOT_UTILIZATION',
  );
  const stationMetric = input.utilizationModel?.metrics.find(
    (m) => m.key === 'UTILIZATION_BY_STATION',
  );
  const vehicleCount = utilMetric?.coverage.vehicleCount ?? 0;
  const downtimeThreshold = DEFAULT_WEAKNESS_ORG_TARGETS.vehicleDowntimeShareThresholdPercent;

  const vehiclesWithHighDowntime =
    input.utilizationSnapshot?.vehicles
      .filter((v) => v.capacityMs > 0)
      .map((v) => ({
        vehicleId: v.vehicleId,
        label: v.label,
        unplannedDowntimeMs: v.unplannedDowntimeMs,
        capacityMs: v.capacityMs,
        downtimeSharePercent: safeRatio(v.unplannedDowntimeMs, v.capacityMs) ?? 0,
      }))
      .filter((v) => v.downtimeSharePercent >= downtimeThreshold) ?? [];

  const orgUtil =
    utilMetric?.valuePercent ?? opMetric?.valuePercent ?? null;
  const weakStations =
    stationMetric?.breakdown
      ?.filter(
        (b) =>
          b.utilizationPercent != null &&
          orgUtil != null &&
          orgUtil - b.utilizationPercent >= 10,
      )
      .map((b) => ({
        stationId: b.key,
        stationName: b.label,
        utilizationPercent: b.utilizationPercent,
        vehicleCount: b.vehicleCount,
      })) ?? [];

  return {
    period: input.period,
    comparisonPeriod: input.comparisonPeriod,
    currency: input.currency,
    financial: input.financial ?? {
      revenueCurrentMinor: 0,
      revenuePreviousMinor: 0,
      expensesCurrentMinor: 0,
      expensesPreviousMinor: 0,
      paidRevenueCurrentMinor: 0,
      openReceivablesMinor: 0,
      overdueReceivablesMinor: 0,
      openReceivablesCount: 0,
      overdueReceivablesCount: 0,
    },
    bookings: input.bookings ?? {
      completedInPeriod: 0,
      cancelledInPeriod: 0,
      noShowInPeriod: 0,
    },
    fleet: input.fleet ?? {
      total: 0,
      available: 0,
      maintenance: 0,
      blocked: 0,
      readyPercent: null,
      underutilized: 0,
    },
    utilization: {
      available: input.utilizationModel != null,
      timeWeightedUtilizationPercent: utilMetric?.valuePercent ?? null,
      operationalSnapshotUtilizationPercent: opMetric?.valuePercent ?? null,
      vehiclesWithData: input.vehiclesWithUtilizationData,
      vehicleCount,
      unplannedDowntimeMs: input.utilizationModel?.totals.unplannedDowntimeMs ?? 0,
      fleetCapacityMs: input.utilizationModel?.totals.fleetCapacityMs ?? 0,
      avgTurnaroundMs:
        input.turnaroundCount > 0 && input.utilizationModel
          ? input.utilizationModel.totals.turnaroundMs / input.turnaroundCount
          : null,
      turnaroundCount: input.turnaroundCount,
      stationBottlenecks: input.utilizationSnapshot?.stationBottlenecks ?? [],
      vehiclesWithHighDowntime,
      weakStations,
    },
    costs: {
      available: input.costModel != null,
      recordedDamageCostsMinor: input.costModel?.totals.recordedDamageCostsMinor ?? 0,
      actualExpensesMinor: input.costModel?.totals.actualExpensesMinor ?? 0,
      revenueCurrentMinor: input.financial?.revenueCurrentMinor ?? 0,
    },
    insights: input.insights,
    dataQuality: {
      ...input.dataQuality,
      hasOverlappingBookings: input.overlappingBookingCount > 0,
    },
  };
}
