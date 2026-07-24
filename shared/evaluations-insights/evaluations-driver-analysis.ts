/**
 * Pure Ursachen- und Einflussanalyse engine (Prompt 25/54).
 */
import { deltaPercent } from './evaluations-analytics-summary';
import type { EvaluationsCostModelSnapshot } from './evaluations-cost-model.contract';
import type { EvaluationsUtilizationModelSummary } from './evaluations-utilization-model.contract';
import type { EvaluationsUtilizationSnapshot } from './evaluations-utilization-model.contract';
import type { EvaluationsActiveRisksSummary } from './evaluations-analytics-summary.contract';
import type { EvaluationsDetectedStrength } from './evaluations-strength-detection.contract';
import type { EvaluationsStrengthDetectionSummary } from './evaluations-strength-detection.contract';
import type { EvaluationsDetectedWeakness } from './evaluations-weakness-detection.contract';
import type { EvaluationsWeaknessDetectionSummary } from './evaluations-weakness-detection.contract';
import {
  DRIVER_ANALYSIS_DISCLAIMER,
  EVALUATIONS_DRIVER_ANALYSIS_VERSION,
  type EvaluationsDriverAnalysis,
  type EvaluationsDriverAnalysisSnapshot,
  type EvaluationsDriverAnalysisSummary,
  type EvaluationsDriverConfidence,
  type EvaluationsDriverFactor,
  type EvaluationsDriverHistoricalComparison,
  type EvaluationsDriverQuantitativeContribution,
  type EvaluationsDriverTrendDirection,
  type EvaluationsRiskDriverCategory,
  type EvaluationsRiskDriverOutcome,
} from './evaluations-driver-analysis.contract';
import type { EvaluationsStrengthId } from './evaluations-strength-detection.contract';
import type { EvaluationsWeaknessId } from './evaluations-weakness-detection.contract';

function safeRatio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function baseAnalysis(
  outcomeKind: EvaluationsDriverAnalysis['outcomeKind'],
  outcomeId: string,
  snapshot: EvaluationsDriverAnalysisSnapshot,
): Pick<
  EvaluationsDriverAnalysis,
  | 'calculationVersion'
  | 'outcomeKind'
  | 'outcomeId'
  | 'disclaimer'
  | 'affectedTimePeriods'
  | 'possibleConfounders'
  | 'dataQualityWarnings'
> {
  const warnings: string[] = [];
  if (snapshot.dataQuality.hasOverlappingBookings) {
    warnings.push('Overlapping booking intervals detected — utilization drivers may be unreliable.');
  }
  if (snapshot.dataQuality.insightsStale) {
    warnings.push('Insights data is stale — risk drivers may not reflect current state.');
  }
  if (snapshot.dataQuality.partialSectionCount > 0) {
    warnings.push(
      `Partial analytics sections: ${snapshot.dataQuality.partialSections.join(', ') || snapshot.dataQuality.partialSectionCount}.`,
    );
  }
  return {
    calculationVersion: EVALUATIONS_DRIVER_ANALYSIS_VERSION,
    outcomeKind,
    outcomeId,
    disclaimer: DRIVER_ANALYSIS_DISCLAIMER,
    affectedTimePeriods: [snapshot.period, snapshot.comparisonPeriod],
    possibleConfounders: [
      'Seasonality and calendar effects are not modeled.',
      'Fleet size changes may confound per-vehicle ratios.',
      'External market demand is not measured in this dataset.',
    ],
    dataQualityWarnings: warnings,
  };
}

function trendFromDelta(delta: number | null): {
  direction: EvaluationsDriverTrendDirection;
  label: string;
  confidence: EvaluationsDriverConfidence;
} {
  if (delta == null) {
    return { direction: 'UNKNOWN', label: 'No comparison baseline', confidence: 'LOW' };
  }
  if (delta > 2) {
    return { direction: 'IMPROVING', label: `+${delta}% vs comparison period`, confidence: 'HIGH' };
  }
  if (delta < -2) {
    return { direction: 'WORSENING', label: `${delta}% vs comparison period`, confidence: 'HIGH' };
  }
  return { direction: 'STABLE', label: 'Within ±2% of comparison period', confidence: 'MEDIUM' };
}

function historicalMetric(
  snapshot: EvaluationsDriverAnalysisSnapshot,
  metricKey: string,
  label: string,
  current: number,
  previous: number,
  unit: string,
): EvaluationsDriverHistoricalComparison {
  return {
    metricKey,
    label,
    currentValue: current,
    comparisonValue: previous,
    deltaPercent: deltaPercent(current, previous),
    unit,
    period: snapshot.period,
    comparisonPeriod: snapshot.comparisonPeriod,
  };
}

function finalizeAnalysis(
  base: ReturnType<typeof baseAnalysis>,
  partial: Omit<
    EvaluationsDriverAnalysis,
    | 'calculationVersion'
    | 'outcomeKind'
    | 'outcomeId'
    | 'disclaimer'
    | 'affectedTimePeriods'
    | 'overallConfidence'
  >,
): EvaluationsDriverAnalysis {
  const confidences = [
    ...partial.primaryFactors.map((f) => f.confidence),
    ...partial.secondaryFactors.map((f) => f.confidence),
    partial.trend.confidence,
  ];
  const overallConfidence: EvaluationsDriverConfidence = confidences.includes('LOW')
    ? 'LOW'
    : confidences.includes('MEDIUM')
      ? 'MEDIUM'
      : 'HIGH';
  return {
    ...base,
    ...partial,
    possibleConfounders: partial.possibleConfounders ?? base.possibleConfounders,
    dataQualityWarnings: partial.dataQualityWarnings ?? base.dataQualityWarnings,
    overallConfidence,
  };
}

function contribution(
  factorKey: string,
  label: string,
  value: number,
  unit: EvaluationsDriverQuantitativeContribution['unit'],
  total: number,
  direction: EvaluationsDriverQuantitativeContribution['direction'],
  dataSource: string,
  confidence: EvaluationsDriverConfidence = 'MEDIUM',
): EvaluationsDriverQuantitativeContribution {
  return {
    factorKey,
    label,
    value,
    unit,
    sharePercent: safeRatio(Math.abs(value), total),
    direction,
    dataSource,
    confidence,
  };
}

function factor(
  role: EvaluationsDriverFactor['role'],
  key: string,
  label: string,
  description: string,
  dataSource: string,
  confidence: EvaluationsDriverConfidence,
  quantitativeContribution: EvaluationsDriverQuantitativeContribution | null = null,
): EvaluationsDriverFactor {
  return { role, key, label, description, dataSource, confidence, quantitativeContribution };
}

function analyzeUtilizationDrivers(
  snapshot: EvaluationsDriverAnalysisSnapshot,
  outcomeKind: 'STRENGTH' | 'WEAKNESS',
  outcomeId: string,
  preferHigh: boolean,
): EvaluationsDriverAnalysis {
  const base = baseAnalysis(outcomeKind, outcomeId, snapshot);
  const org = snapshot.utilization.orgUtilizationPercent;
  const sorted = [...snapshot.utilization.stationBreakdown].sort((a, b) => {
    const av = a.utilizationPercent ?? 0;
    const bv = b.utilizationPercent ?? 0;
    return preferHigh ? bv - av : av - bv;
  });
  const topStations = sorted.filter((s) => s.utilizationPercent != null).slice(0, 3);
  const sortedClasses = [...snapshot.utilization.classBreakdown].sort((a, b) => {
    const av = a.utilizationPercent ?? 0;
    const bv = b.utilizationPercent ?? 0;
    return preferHigh ? bv - av : av - bv;
  });
  const topClasses = sortedClasses.filter((c) => c.utilizationPercent != null).slice(0, 2);

  const primaryFactors: EvaluationsDriverFactor[] = topStations.map((s) =>
    factor(
      'PRIMARY',
      `station:${s.stationId}`,
      `Station ${s.stationName}`,
      `Utilization ${s.utilizationPercent}% (${s.deltaVsOrgPercentPoints != null ? `${s.deltaVsOrgPercentPoints > 0 ? '+' : ''}${s.deltaVsOrgPercentPoints}pp vs org` : 'org baseline unavailable'}).`,
      'utilizationModel.metrics.UTILIZATION_BY_STATION',
      s.vehicleCount >= 3 ? 'MEDIUM' : 'LOW',
      s.utilizationPercent != null
        ? contribution(
            `station:${s.stationId}`,
            s.stationName,
            s.utilizationPercent,
            'percent',
            org ?? 100,
            preferHigh ? 'positive' : 'negative',
            'utilizationModel.metrics.UTILIZATION_BY_STATION',
          )
        : null,
    ),
  );

  if (primaryFactors.length === 0 && snapshot.fleet.underutilized > 0) {
    primaryFactors.push(
      factor(
        'PRIMARY',
        'fleet.underutilized',
        'Underutilized vehicles',
        `${snapshot.fleet.underutilized} vehicles flagged with low booking activity in scope.`,
        'fleet.underutilized',
        'MEDIUM',
        contribution(
          'fleet.underutilized',
          'Underutilized vehicles',
          snapshot.fleet.underutilized,
          'count',
          snapshot.fleet.total,
          'negative',
          'fleet snapshot',
        ),
      ),
    );
  }

  const secondaryFactors: EvaluationsDriverFactor[] = topClasses.map((c) =>
    factor(
      'SECONDARY',
      `class:${c.vehicleClassId}`,
      `Class ${c.vehicleClassName}`,
      `Class utilization ${c.utilizationPercent}% across ${c.vehicleCount} vehicles.`,
      'utilizationModel.metrics.UTILIZATION_BY_VEHICLE_CLASS',
      'MEDIUM',
    ),
  );

  return finalizeAnalysis(base, {
    primaryFactors,
    secondaryFactors,
    quantitativeContributions: primaryFactors
      .map((f) => f.quantitativeContribution)
      .filter((c): c is EvaluationsDriverQuantitativeContribution => c != null),
    affectedStations: topStations.map((s) => ({
      entityType: 'STATION',
      entityId: s.stationId,
      label: s.stationName,
      metricLabel: 'utilizationPercent',
      metricValue: s.utilizationPercent,
    })),
    affectedVehicleClasses: topClasses.map((c) => ({
      entityType: 'VEHICLE_CLASS',
      entityId: c.vehicleClassId,
      label: c.vehicleClassName,
      metricLabel: 'utilizationPercent',
      metricValue: c.utilizationPercent,
    })),
    affectedVehicles: [],
    trend: {
      direction: 'UNKNOWN',
      label: 'Period-over-period utilization trend not persisted in v1',
      confidence: 'LOW',
      notes: 'Historical utilization comparison requires stored time-series (data gap).',
    },
    historicalComparison: org != null
      ? [
          historicalMetric(
            snapshot,
            'utilization.org',
            'Fleet utilization (current period)',
            org,
            org,
            'percent',
          ),
        ]
      : [],
    possibleConfounders: [
      ...base.possibleConfounders,
      'Station home-base grouping may not reflect temporary transfers.',
    ],
    dataQualityWarnings: base.dataQualityWarnings,
  });
}

function analyzeStrength(strength: EvaluationsDetectedStrength, snapshot: EvaluationsDriverAnalysisSnapshot): EvaluationsDriverAnalysis | null {
  const base = baseAnalysis('STRENGTH', strength.id, snapshot);

  switch (strength.id) {
    case 'HIGH_UTILIZATION':
    case 'STRONG_STATION':
    case 'STRONG_VEHICLE_CLASS':
      return analyzeUtilizationDrivers(snapshot, 'STRENGTH', strength.id, true);
    case 'REVENUE_GROWTH': {
      const growth = deltaPercent(
        snapshot.financial.revenueCurrentMinor,
        snapshot.financial.revenuePreviousMinor,
      );
      return finalizeAnalysis(base, {
        primaryFactors: [
          factor(
            'PRIMARY',
            'financial.revenue',
            'Revenue vs comparison period',
            `Revenue ${snapshot.financial.revenueCurrentMinor} vs ${snapshot.financial.revenuePreviousMinor} minor units.`,
            'financial.revenueMtdMinor',
            'HIGH',
            growth != null
              ? contribution(
                  'financial.revenue',
                  'Revenue growth',
                  growth,
                  'percent',
                  100,
                  'positive',
                  'financial.revenueMtdMinor',
                  'HIGH',
                )
              : null,
          ),
        ],
        secondaryFactors: [
          factor(
            'SECONDARY',
            'bookings.completed',
            'Completed bookings',
            `${snapshot.bookings.completedInPeriod} completed bookings in period.`,
            'costModel.completedBookingsInPeriod',
            snapshot.bookings.completedInPeriod > 0 ? 'MEDIUM' : 'LOW',
          ),
        ],
        quantitativeContributions: [],
        affectedStations: [],
        affectedVehicleClasses: [],
        affectedVehicles: [],
        trend: trendFromDelta(growth),
        historicalComparison: [
          historicalMetric(
            snapshot,
            'financial.revenue',
            'Revenue',
            snapshot.financial.revenueCurrentMinor,
            snapshot.financial.revenuePreviousMinor,
            snapshot.currency,
          ),
        ],
        possibleConfounders: base.possibleConfounders,
        dataQualityWarnings: base.dataQualityWarnings,
      });
    }
  }

  return finalizeAnalysis(base, {
    primaryFactors: [
      factor(
        'PRIMARY',
        strength.underlyingKpi,
        strength.title,
        strength.rationale,
        strength.underlyingKpi,
        strength.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM',
      ),
    ],
    secondaryFactors: [],
    quantitativeContributions: [],
    affectedStations: [],
    affectedVehicleClasses: [],
    affectedVehicles: [],
    trend: { direction: 'UNKNOWN', label: 'No trend decomposition for this strength', confidence: 'LOW' },
    historicalComparison: [],
    possibleConfounders: base.possibleConfounders,
    dataQualityWarnings: base.dataQualityWarnings,
  });
}

function analyzeWeakness(weakness: EvaluationsDetectedWeakness, snapshot: EvaluationsDriverAnalysisSnapshot): EvaluationsDriverAnalysis | null {
  const base = baseAnalysis('WEAKNESS', weakness.id, snapshot);

  switch (weakness.id) {
    case 'UNDERUTILIZATION':
      return analyzeUtilizationDrivers(snapshot, 'WEAKNESS', weakness.id, false);
    case 'DECLINING_REVENUE': {
      const growth = deltaPercent(
        snapshot.financial.revenueCurrentMinor,
        snapshot.financial.revenuePreviousMinor,
      );
      return finalizeAnalysis(base, {
        primaryFactors: [
          factor(
            'PRIMARY',
            'financial.revenue',
            'Revenue decline vs comparison',
            `Revenue dropped from ${snapshot.financial.revenuePreviousMinor} to ${snapshot.financial.revenueCurrentMinor} minor units.`,
            'financial.revenueMtdMinor',
            'HIGH',
          ),
        ],
        secondaryFactors: snapshot.utilization.stationBreakdown
          .filter((s) => (s.deltaVsOrgPercentPoints ?? 0) < -5)
          .slice(0, 2)
          .map((s) =>
            factor(
              'SECONDARY',
              `station:${s.stationId}`,
              `Station ${s.stationName}`,
              `Station utilization ${s.utilizationPercent}% (${s.deltaVsOrgPercentPoints}pp vs org).`,
              'utilizationModel.metrics.UTILIZATION_BY_STATION',
              'MEDIUM',
            ),
          ),
        quantitativeContributions: [],
        affectedStations: snapshot.utilization.stationBreakdown
          .filter((s) => (s.deltaVsOrgPercentPoints ?? 0) < -5)
          .map((s) => ({
            entityType: 'STATION' as const,
            entityId: s.stationId,
            label: s.stationName,
            metricValue: s.utilizationPercent,
          })),
        affectedVehicleClasses: [],
        affectedVehicles: [],
        trend: trendFromDelta(growth),
        historicalComparison: [
          historicalMetric(
            snapshot,
            'financial.revenue',
            'Revenue',
            snapshot.financial.revenueCurrentMinor,
            snapshot.financial.revenuePreviousMinor,
            snapshot.currency,
          ),
        ],
        possibleConfounders: [
          ...base.possibleConfounders,
          'Declining utilization at specific stations may correlate with revenue decline.',
        ],
        dataQualityWarnings: base.dataQualityWarnings,
      });
    }
    case 'RISING_COSTS': {
      const costGrowth = deltaPercent(
        snapshot.financial.expensesCurrentMinor,
        snapshot.financial.expensesPreviousMinor,
      );
      const categories = Object.entries(snapshot.costs.vendorCategoryExpenses)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);
      const totalExpenses = snapshot.financial.expensesCurrentMinor;
      const costPerVehicle =
        snapshot.costs.vehicleCount > 0
          ? Math.round(totalExpenses / snapshot.costs.vehicleCount)
          : null;

      return finalizeAnalysis(base, {
        primaryFactors: categories.map(([key, amount], index) =>
          factor(
            index === 0 ? 'PRIMARY' : 'SECONDARY',
            `vendor:${key}`,
            `Vendor category ${key}`,
            `${amount} minor units (${safeRatio(amount, totalExpenses) ?? 0}% of expenses).`,
            'costModel.vendorCategoryExpenses',
            'HIGH',
            contribution(
              `vendor:${key}`,
              key,
              amount,
              'currency_minor',
              totalExpenses,
              'negative',
              'costModel.vendorCategoryExpenses',
            ),
          ),
        ),
        secondaryFactors:
          costPerVehicle != null && snapshot.costs.vehicleCount < snapshot.fleet.total
            ? [
                factor(
                  'SECONDARY',
                  'cost.per_vehicle',
                  'Higher cost per vehicle',
                  `${costPerVehicle} minor units/vehicle across ${snapshot.costs.vehicleCount} cost-attributed vehicles (fleet total ${snapshot.fleet.total}).`,
                  'costModel.denominators.vehicleCount',
                  'MEDIUM',
                ),
              ]
            : [],
        quantitativeContributions: categories.map(([key, amount]) =>
          contribution(
            `vendor:${key}`,
            key,
            amount,
            'currency_minor',
            totalExpenses,
            'negative',
            'costModel.vendorCategoryExpenses',
          ),
        ),
        affectedStations: snapshot.costs.expensesByStation.slice(0, 3).map((s) => ({
          entityType: 'STATION',
          entityId: s.stationId,
          label: s.stationName,
          metricValue: s.expensesMinor,
        })),
        affectedVehicleClasses: snapshot.costs.expensesByVehicleClass.slice(0, 2).map((c) => ({
          entityType: 'VEHICLE_CLASS',
          entityId: c.vehicleClassId,
          label: c.vehicleClassName,
          metricValue: c.expensesMinor,
        })),
        affectedVehicles: [],
        trend: trendFromDelta(costGrowth != null ? -costGrowth : null),
        historicalComparison: [
          historicalMetric(
            snapshot,
            'financial.expenses',
            'Expenses',
            snapshot.financial.expensesCurrentMinor,
            snapshot.financial.expensesPreviousMinor,
            snapshot.currency,
          ),
        ],
        possibleConfounders: [
          ...base.possibleConfounders,
          'Fewer vehicles in scope can increase per-vehicle cost ratios without absolute spend rising.',
        ],
        dataQualityWarnings: snapshot.costs.available
          ? base.dataQualityWarnings
          : [...base.dataQualityWarnings, 'Cost model data partially unavailable.'],
      });
    }
    case 'HIGH_OVERDUE_RECEIVABLES': {
      const buckets = snapshot.financial.receivablesAgingBuckets;
      const totalOpen = snapshot.financial.openReceivablesMinor;
      return finalizeAnalysis(base, {
        primaryFactors: buckets.map((b, index) =>
          factor(
            index === 0 ? 'PRIMARY' : 'SECONDARY',
            `aging:${b.bucketKey}`,
            b.label,
            `${b.amountMinor} minor units across ${b.count} open items (${safeRatio(b.amountMinor, totalOpen) ?? 0}% of open).`,
            'financial.receivablesAgingBuckets',
            'HIGH',
            contribution(
              `aging:${b.bucketKey}`,
              b.label,
              b.amountMinor,
              'currency_minor',
              totalOpen,
              b.bucketKey === 'overdue' ? 'negative' : 'neutral',
              'orgInvoice.outstandingCents',
            ),
          ),
        ),
        secondaryFactors: [],
        quantitativeContributions: buckets.map((b) =>
          contribution(
            `aging:${b.bucketKey}`,
            b.label,
            b.amountMinor,
            'currency_minor',
            totalOpen,
            'negative',
            'orgInvoice.outstandingCents',
          ),
        ),
        affectedStations: [],
        affectedVehicleClasses: [],
        affectedVehicles: [],
        trend: { direction: 'UNKNOWN', label: 'Receivables aging trend requires historical snapshots', confidence: 'LOW' },
        historicalComparison: [],
        possibleConfounders: base.possibleConfounders,
        dataQualityWarnings: base.dataQualityWarnings,
      });
    }
    case 'RECURRING_VEHICLE_BREAKDOWNS': {
      const vehicles = snapshot.utilization.vehiclesWithHighDowntime;
      const totalDowntime = snapshot.utilization.unplannedDowntimeMs;
      return finalizeAnalysis(base, {
        primaryFactors: vehicles.slice(0, 3).map((v, index) =>
          factor(
            index === 0 ? 'PRIMARY' : 'SECONDARY',
            `vehicle:${v.vehicleId}`,
            v.label,
            `Unplanned downtime ${v.downtimeSharePercent}% of vehicle capacity (${v.unplannedDowntimeMs}ms).`,
            'utilizationModel per-vehicle unplannedDowntimeMs',
            'MEDIUM',
            contribution(
              `vehicle:${v.vehicleId}`,
              v.label,
              v.unplannedDowntimeMs,
              'ms',
              totalDowntime,
              'negative',
              'utilizationSnapshot.vehicles',
            ),
          ),
        ),
        secondaryFactors: [
          factor(
            'SECONDARY',
            'service.unplanned_repair',
            'Unplanned repair costs',
            `${snapshot.costs.unplannedRepairCostsMinor} minor units recorded in period.`,
            'costModel.unplannedRepairCostsMinor',
            snapshot.costs.available ? 'MEDIUM' : 'LOW',
          ),
        ],
        quantitativeContributions: [],
        affectedStations: [],
        affectedVehicleClasses: [],
        affectedVehicles: vehicles.map((v) => ({
          entityType: 'VEHICLE',
          entityId: v.vehicleId,
          label: v.label,
          metricValue: v.downtimeSharePercent,
        })),
        trend: { direction: 'WORSENING', label: 'Elevated unplanned downtime share in period', confidence: 'MEDIUM' },
        historicalComparison: [],
        possibleConfounders: [
          ...base.possibleConfounders,
          'Repeated service cases on the same vehicle may indicate correlated root causes not isolated here.',
        ],
        dataQualityWarnings: base.dataQualityWarnings,
      });
    }
    case 'STATION_BOTTLENECKS':
      return finalizeAnalysis(base, {
        primaryFactors: snapshot.utilization.stationBottlenecks.map((s, index) =>
          factor(
            index === 0 ? 'PRIMARY' : 'SECONDARY',
            `station:${s.stationId}`,
            s.stationName,
            `${s.availableVehicles} available of ${s.totalVehicles} vehicles at period end.`,
            'utilizationSnapshot.stationBottlenecks',
            'HIGH',
          ),
        ),
        secondaryFactors: [],
        quantitativeContributions: [],
        affectedStations: snapshot.utilization.stationBottlenecks.map((s) => ({
          entityType: 'STATION',
          entityId: s.stationId,
          label: s.stationName,
          metricValue: s.availableVehicles,
        })),
        affectedVehicleClasses: [],
        affectedVehicles: [],
        trend: { direction: 'WORSENING', label: 'Low spare capacity at period end', confidence: 'MEDIUM' },
        historicalComparison: [],
        possibleConfounders: base.possibleConfounders,
        dataQualityWarnings: base.dataQualityWarnings,
      });
    case 'POOR_DATA_QUALITY':
      return finalizeAnalysis(base, {
        primaryFactors: [
          factor(
            'PRIMARY',
            'dataQuality.sections',
            'Incomplete analytics sections',
            `${snapshot.dataQuality.partialSectionCount} partial, ${snapshot.dataQuality.unavailableSectionCount} unavailable.`,
            'dataQuality.partialSections',
            'HIGH',
          ),
        ],
        secondaryFactors: snapshot.dataQuality.hasOverlappingBookings
          ? [
              factor(
                'SECONDARY',
                'utilization.overlapping_bookings',
                'Overlapping bookings',
                'Booking interval overlaps detected on scoped vehicles.',
                'utilizationSnapshot.overlappingBookingIds',
                'HIGH',
              ),
            ]
          : [],
        quantitativeContributions: [],
        affectedStations: [],
        affectedVehicleClasses: [],
        affectedVehicles: [],
        trend: { direction: 'UNKNOWN', label: 'Data quality is a snapshot diagnostic', confidence: 'HIGH' },
        historicalComparison: [],
        possibleConfounders: [],
        dataQualityWarnings: base.dataQualityWarnings,
      });
    case 'COMPLIANCE_RISKS':
      return analyzeRiskCategory('COMPLIANCE', snapshot, snapshot.insights.complianceInsightGroups);
  }

  return finalizeAnalysis(base, {
    primaryFactors: [
      factor(
        'PRIMARY',
        weakness.underlyingKpis[0] ?? weakness.id,
        weakness.title,
        weakness.description,
        weakness.underlyingKpis.join(', '),
        weakness.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM',
      ),
    ],
    secondaryFactors: [],
    quantitativeContributions: [],
    affectedStations: [],
    affectedVehicleClasses: [],
    affectedVehicles: [],
    trend: { direction: 'UNKNOWN', label: 'No dedicated driver decomposition', confidence: 'LOW' },
    historicalComparison: [],
    possibleConfounders: base.possibleConfounders,
    dataQualityWarnings: base.dataQualityWarnings,
  });
}

function analyzeRiskCategory(
  category: EvaluationsRiskDriverCategory,
  snapshot: EvaluationsDriverAnalysisSnapshot,
  count: number,
): EvaluationsDriverAnalysis {
  const base = baseAnalysis('RISK', category, snapshot);
  const titles: Record<EvaluationsRiskDriverCategory, string> = {
    BUSINESS_RISK: 'Business risk insights',
    REVENUE_LEAKAGE: 'Revenue leakage insights',
    COMPLIANCE: 'Compliance insights',
    CRITICAL_INSIGHTS: 'Critical insights',
  };

  return finalizeAnalysis(base, {
    primaryFactors: [
      factor(
        'PRIMARY',
        `insights.${category}`,
        titles[category],
        `${count} active insight groups in filtered scope.`,
        'insights analytics counts',
        'HIGH',
        contribution(
          `insights.${category}`,
          titles[category],
          count,
          'count',
          snapshot.insights.businessRiskGroups +
            snapshot.insights.revenueLeakageGroups +
            snapshot.insights.complianceInsightGroups,
          'negative',
          'insights analytics',
        ),
      ),
    ],
    secondaryFactors: [
      factor(
        'SECONDARY',
        'insights.exposure',
        'Estimated financial exposure',
        `${snapshot.insights.estimatedExposureMinor} ${snapshot.insights.exposureCurrency} (partial attribution across insight types).`,
        'insights.estimatedFinancialExposureMinor',
        'MEDIUM',
      ),
    ],
    quantitativeContributions: [],
    affectedStations: Array.from({ length: Math.min(snapshot.insights.affectedStations, 5) }).map(
      (_, i) => ({
        entityType: 'STATION' as const,
        entityId: `aggregated-${i + 1}`,
        label: `Affected station (${snapshot.insights.affectedStations} total)`,
      }),
    ),
    affectedVehicleClasses: [],
    affectedVehicles: Array.from({ length: Math.min(snapshot.insights.affectedVehicles, 5) }).map(
      (_, i) => ({
        entityType: 'VEHICLE' as const,
        entityId: `aggregated-${i + 1}`,
        label: `Affected vehicle (${snapshot.insights.affectedVehicles} total)`,
      }),
    ),
    trend: { direction: 'UNKNOWN', label: 'Insight trend requires historical insight runs', confidence: 'LOW' },
    historicalComparison: [],
    possibleConfounders: [
      ...base.possibleConfounders,
      'Insight exposure aggregates multiple insight types — not isolated to this category.',
    ],
    dataQualityWarnings: snapshot.dataQuality.insightsStale
      ? [...base.dataQualityWarnings, 'Insights stale — counts may lag operational reality.']
      : base.dataQualityWarnings,
  });
}

export function buildDriverAnalysisSnapshot(input: {
  period: EvaluationsDriverAnalysisSnapshot['period'];
  comparisonPeriod: EvaluationsDriverAnalysisSnapshot['comparisonPeriod'];
  currency: string;
  financial: {
    revenueCurrentMinor: number;
    revenuePreviousMinor: number;
    expensesCurrentMinor: number;
    expensesPreviousMinor: number;
    openReceivablesMinor: number;
    overdueReceivablesMinor: number;
    openReceivablesCount: number;
    overdueReceivablesCount: number;
  } | null;
  bookings: EvaluationsDriverAnalysisSnapshot['bookings'] | null;
  fleet: EvaluationsDriverAnalysisSnapshot['fleet'] | null;
  utilizationModel: EvaluationsUtilizationModelSummary | null;
  utilizationSnapshot: EvaluationsUtilizationSnapshot | null;
  costModelSnapshot: EvaluationsCostModelSnapshot | null;
  insights: EvaluationsDriverAnalysisSnapshot['insights'];
  dataQuality: EvaluationsDriverAnalysisSnapshot['dataQuality'];
}): EvaluationsDriverAnalysisSnapshot {
  const utilMetric = input.utilizationModel?.metrics.find((m) => m.key === 'UTILIZATION_PER_VEHICLE');
  const stationMetric = input.utilizationModel?.metrics.find((m) => m.key === 'UTILIZATION_BY_STATION');
  const classMetric = input.utilizationModel?.metrics.find((m) => m.key === 'UTILIZATION_BY_VEHICLE_CLASS');
  const orgUtil = utilMetric?.valuePercent ?? null;
  const downtimeThreshold = 15;

  const open = input.financial?.openReceivablesMinor ?? 0;
  const overdue = input.financial?.overdueReceivablesMinor ?? 0;
  const currentNotOverdue = Math.max(0, open - overdue);

  const totalExpenses = input.financial?.expensesCurrentMinor ?? 0;
  const expensesByStation =
    input.costModelSnapshot?.expensesByStation.map((s) => ({
      ...s,
      sharePercent: safeRatio(s.expensesMinor, totalExpenses),
    })) ?? [];
  const expensesByVehicleClass =
    input.costModelSnapshot?.expensesByVehicleClass.map((c) => ({
      ...c,
      sharePercent: safeRatio(c.expensesMinor, totalExpenses),
    })) ?? [];

  return {
    period: input.period,
    comparisonPeriod: input.comparisonPeriod,
    currency: input.currency,
    financial: {
      revenueCurrentMinor: input.financial?.revenueCurrentMinor ?? 0,
      revenuePreviousMinor: input.financial?.revenuePreviousMinor ?? 0,
      expensesCurrentMinor: input.financial?.expensesCurrentMinor ?? 0,
      expensesPreviousMinor: input.financial?.expensesPreviousMinor ?? 0,
      openReceivablesMinor: open,
      overdueReceivablesMinor: overdue,
      openReceivablesCount: input.financial?.openReceivablesCount ?? 0,
      overdueReceivablesCount: input.financial?.overdueReceivablesCount ?? 0,
      receivablesAgingBuckets: [
        {
          bucketKey: 'overdue',
          label: 'Overdue (past due date)',
          amountMinor: overdue,
          count: input.financial?.overdueReceivablesCount ?? 0,
        },
        {
          bucketKey: 'current',
          label: 'Current (not yet overdue)',
          amountMinor: currentNotOverdue,
          count: Math.max(
            0,
            (input.financial?.openReceivablesCount ?? 0) - (input.financial?.overdueReceivablesCount ?? 0),
          ),
        },
      ],
    },
    bookings: input.bookings ?? { completedInPeriod: 0, cancelledInPeriod: 0, noShowInPeriod: 0 },
    fleet: input.fleet ?? { total: 0, underutilized: 0, maintenance: 0, blocked: 0 },
    utilization: {
      available: input.utilizationModel != null,
      orgUtilizationPercent: orgUtil,
      stationBreakdown:
        stationMetric?.breakdown?.map((b) => ({
          stationId: b.key,
          stationName: b.label,
          utilizationPercent: b.utilizationPercent,
          vehicleCount: b.vehicleCount,
          deltaVsOrgPercentPoints:
            b.utilizationPercent != null && orgUtil != null
              ? Math.round((b.utilizationPercent - orgUtil) * 10) / 10
              : null,
        })) ?? [],
      classBreakdown:
        classMetric?.breakdown?.map((b) => ({
          vehicleClassId: b.key,
          vehicleClassName: b.label,
          utilizationPercent: b.utilizationPercent,
          vehicleCount: b.vehicleCount,
          deltaVsOrgPercentPoints:
            b.utilizationPercent != null && orgUtil != null
              ? Math.round((b.utilizationPercent - orgUtil) * 10) / 10
              : null,
        })) ?? [],
      vehiclesWithHighDowntime:
        input.utilizationSnapshot?.vehicles
          .filter((v) => v.capacityMs > 0)
          .map((v) => ({
            vehicleId: v.vehicleId,
            label: v.label,
            unplannedDowntimeMs: v.unplannedDowntimeMs,
            downtimeSharePercent: safeRatio(v.unplannedDowntimeMs, v.capacityMs) ?? 0,
          }))
          .filter((v) => v.downtimeSharePercent >= downtimeThreshold) ?? [],
      stationBottlenecks:
        input.utilizationSnapshot?.stationBottlenecks.map((s) => ({
          stationId: s.stationId,
          stationName: s.stationName,
          availableVehicles: s.availableVehicles,
          totalVehicles: s.totalVehicles,
        })) ?? [],
      unplannedDowntimeMs: input.utilizationModel?.totals.unplannedDowntimeMs ?? 0,
      fleetCapacityMs: input.utilizationModel?.totals.fleetCapacityMs ?? 0,
      avgTurnaroundMs:
        input.utilizationSnapshot && input.utilizationSnapshot.vehicles.length > 0
          ? input.utilizationModel?.totals.turnaroundMs != null
            ? input.utilizationModel.totals.turnaroundMs /
              Math.max(
                1,
                input.utilizationSnapshot.vehicles.reduce((s, v) => s + v.turnaroundCount, 0),
              )
            : null
          : null,
    },
    costs: {
      available: input.costModelSnapshot != null,
      vehicleCount: input.costModelSnapshot?.vehicleCount ?? 0,
      vendorCategoryExpenses: input.costModelSnapshot?.vendorCategoryExpenses ?? {},
      expensesByStation,
      expensesByVehicleClass,
      recordedDamageCostsMinor: input.costModelSnapshot?.damageRepairCostsMinor ?? 0,
      unplannedRepairCostsMinor: input.costModelSnapshot?.unplannedRepairCostsMinor ?? 0,
      serviceCaseCostsMinor: input.costModelSnapshot?.serviceCaseCostsMinor ?? 0,
    },
    insights: input.insights,
    dataQuality: input.dataQuality,
  };
}

export function buildDriverAnalysisSummary(input: {
  snapshot: EvaluationsDriverAnalysisSnapshot;
  strengths: EvaluationsDetectedStrength[];
  weaknesses: EvaluationsDetectedWeakness[];
  activeRisks: EvaluationsActiveRisksSummary | null;
}): EvaluationsDriverAnalysisSummary {
  const skipped: EvaluationsDriverAnalysisSummary['analysesSkipped'] = [];
  const strengthDrivers: EvaluationsDriverAnalysisSummary['strengthDrivers'] = [];
  const weaknessDrivers: EvaluationsDriverAnalysisSummary['weaknessDrivers'] = [];
  const riskDrivers: EvaluationsRiskDriverOutcome[] = [];

  for (const strength of input.strengths) {
    const driverAnalysis = analyzeStrength(strength, input.snapshot);
    if (driverAnalysis) {
      strengthDrivers.push({ strengthId: strength.id, driverAnalysis });
    } else {
      skipped.push({ outcomeKind: 'STRENGTH', outcomeId: strength.id, reason: 'Insufficient data for driver analysis.' });
    }
  }

  for (const weakness of input.weaknesses) {
    const driverAnalysis = analyzeWeakness(weakness, input.snapshot);
    if (driverAnalysis) {
      weaknessDrivers.push({ weaknessId: weakness.id, driverAnalysis });
    } else {
      skipped.push({ outcomeKind: 'WEAKNESS', outcomeId: weakness.id, reason: 'Insufficient data for driver analysis.' });
    }
  }

  if (input.activeRisks) {
    const riskCategories: Array<{ category: EvaluationsRiskDriverCategory; count: number; title: string }> = [
      { category: 'BUSINESS_RISK', count: input.activeRisks.businessRiskGroups, title: 'Business risks' },
      { category: 'REVENUE_LEAKAGE', count: input.activeRisks.revenueLeakageGroups, title: 'Revenue leakage' },
      { category: 'COMPLIANCE', count: input.activeRisks.complianceInsightGroups, title: 'Compliance risks' },
      { category: 'CRITICAL_INSIGHTS', count: input.activeRisks.criticalInsights, title: 'Critical insights' },
    ];
    for (const risk of riskCategories) {
      if (risk.count <= 0) continue;
      riskDrivers.push({
        category: risk.category,
        title: risk.title,
        insightGroupCount: risk.count,
        driverAnalysis: analyzeRiskCategory(risk.category, input.snapshot, risk.count),
      });
    }
  }

  return {
    calculationVersion: EVALUATIONS_DRIVER_ANALYSIS_VERSION,
    period: input.snapshot.period,
    comparisonPeriod: input.snapshot.comparisonPeriod,
    disclaimer: DRIVER_ANALYSIS_DISCLAIMER,
    strengthDrivers,
    weaknessDrivers,
    riskDrivers,
    analysesProduced: strengthDrivers.length + weaknessDrivers.length + riskDrivers.length,
    analysesSkipped: skipped,
  };
}

export function attachDriverAnalysisToStrengths(
  summary: EvaluationsStrengthDetectionSummary,
  snapshot: EvaluationsDriverAnalysisSnapshot,
): EvaluationsStrengthDetectionSummary {
  const driverSummary = buildDriverAnalysisSummary({
    snapshot,
    strengths: summary.strengths,
    weaknesses: [],
    activeRisks: null,
  });
  const byId = new Map(driverSummary.strengthDrivers.map((d) => [d.strengthId, d.driverAnalysis]));
  return {
    ...summary,
    strengths: summary.strengths.map((s) => ({
      ...s,
      driverAnalysis: byId.get(s.id) ?? null,
    })),
  };
}

export function attachDriverAnalysisToWeaknesses(
  summary: EvaluationsWeaknessDetectionSummary,
  snapshot: EvaluationsDriverAnalysisSnapshot,
): EvaluationsWeaknessDetectionSummary {
  const driverSummary = buildDriverAnalysisSummary({
    snapshot,
    strengths: [],
    weaknesses: summary.weaknesses,
    activeRisks: null,
  });
  const byId = new Map(driverSummary.weaknessDrivers.map((d) => [d.weaknessId, d.driverAnalysis]));
  return {
    ...summary,
    weaknesses: summary.weaknesses.map((w) => ({
      ...w,
      driverAnalysis: byId.get(w.id) ?? null,
    })),
  };
}

export function attachDriverAnalysisToRisks(
  risks: EvaluationsActiveRisksSummary,
  snapshot: EvaluationsDriverAnalysisSnapshot,
): EvaluationsActiveRisksSummary & { driverOutcomes: EvaluationsRiskDriverOutcome[] } {
  const driverSummary = buildDriverAnalysisSummary({
    snapshot,
    strengths: [],
    weaknesses: [],
    activeRisks: risks,
  });
  return { ...risks, driverOutcomes: driverSummary.riskDrivers };
}

export function driverAnalysisSectionStatus(
  summary: EvaluationsDriverAnalysisSummary,
): 'OK' | 'PARTIAL' | 'UNAVAILABLE' {
  if (summary.analysesProduced === 0) return 'UNAVAILABLE';
  if (summary.analysesSkipped.length > 0) return 'PARTIAL';
  if (
    summary.strengthDrivers.some((d) => d.driverAnalysis.overallConfidence === 'LOW') ||
    summary.weaknessDrivers.some((d) => d.driverAnalysis.overallConfidence === 'LOW')
  ) {
    return 'PARTIAL';
  }
  return 'OK';
}
