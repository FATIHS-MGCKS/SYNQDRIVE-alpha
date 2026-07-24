/**
 * Pure rule engine for Auswertungen strength detection (Prompt 23/54).
 */
import type { EvaluationsHighlightItem } from './evaluations-analytics-summary.contract';
import { deltaPercent } from './evaluations-analytics-summary';
import type { EvaluationsCostModelSummary } from './evaluations-cost-model.contract';
import type { EvaluationsUtilizationModelSummary } from './evaluations-utilization-model.contract';
import {
  DEFAULT_STRENGTH_ORG_TARGETS,
  EVALUATIONS_STRENGTH_DETECTION_VERSION,
  type EvaluationsDetectedStrength,
  type EvaluationsStrengthDetectionSnapshot,
  type EvaluationsStrengthDetectionSummary,
  type EvaluationsStrengthId,
  type EvaluationsStrengthOrgTargets,
  type EvaluationsSuppressedStrengthRule,
} from './evaluations-strength-detection.contract';

const MS_HOUR = 60 * 60 * 1000;

function safeRatio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function dedupeStrengths(strengths: EvaluationsDetectedStrength[]): EvaluationsDetectedStrength[] {
  const seen = new Set<string>();
  const result: EvaluationsDetectedStrength[] = [];
  for (const s of strengths) {
    const key = `${s.id}:${s.dimensionKey ?? 'org'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(s);
  }
  return result;
}

function toHighlights(strengths: EvaluationsDetectedStrength[]): EvaluationsHighlightItem[] {
  return strengths
    .filter((s) => s.affectedDimension === 'ORG' || s.affectedDimension === 'FLEET')
    .map((s) => ({
      code: s.id,
      label: s.title,
      severity: 'positive' as const,
      metric:
        s.quantitativeImprovement != null
          ? `${s.quantitativeImprovement.value}${s.quantitativeImprovement.unit === 'percent' ? '%' : ''}`
          : undefined,
    }));
}

export function detectOrganizationalStrengths(
  snapshot: EvaluationsStrengthDetectionSnapshot,
  targets: EvaluationsStrengthOrgTargets = DEFAULT_STRENGTH_ORG_TARGETS,
): EvaluationsStrengthDetectionSummary {
  const strengths: EvaluationsDetectedStrength[] = [];
  const suppressed: EvaluationsSuppressedStrengthRule[] = [];
  const ruleIds: EvaluationsStrengthId[] = [
    'HIGH_UTILIZATION',
    'REVENUE_GROWTH',
    'HIGH_PAYMENT_COLLECTION',
    'LOW_OVERDUE_RATE',
    'LOW_CANCELLATION_RATE',
    'LOW_UNPLANNED_DOWNTIME',
    'SHORT_TURNAROUND',
    'LOW_DAMAGE_RATE',
    'STABLE_VEHICLE_AVAILABILITY',
    'GOOD_DATA_QUALITY',
    'STRONG_STATION',
    'STRONG_VEHICLE_CLASS',
  ];

  const dq = snapshot.dataQuality;
  if (
    dq.overallStatus === 'ERROR' ||
    dq.unavailableSectionCount > 0 ||
    dq.hasOverlappingBookings
  ) {
    for (const ruleId of ruleIds) {
      suppressed.push({
        ruleId,
        reason: dq.hasOverlappingBookings
          ? 'Overlapping booking data errors — strengths suppressed.'
          : 'Critical data quality issues — strengths suppressed.',
      });
    }
    return {
      calculationVersion: EVALUATIONS_STRENGTH_DETECTION_VERSION,
      period: snapshot.period,
      comparisonPeriod: snapshot.comparisonPeriod,
      strengths: [],
      rulesEvaluated: ruleIds.length,
      rulesSuppressed: suppressed,
      highlights: [],
    };
  }

  // HIGH_UTILIZATION
  {
    const util =
      snapshot.utilization.timeWeightedUtilizationPercent ??
      snapshot.utilization.operationalSnapshotUtilizationPercent;
    const coverage = safeRatio(
      snapshot.utilization.vehiclesWithData,
      snapshot.utilization.vehicleCount,
    );
    if (!snapshot.utilization.available || snapshot.utilization.vehicleCount < 3) {
      suppressed.push({
        ruleId: 'HIGH_UTILIZATION',
        reason: 'Minimum 3 vehicles with utilization data required.',
      });
    } else if (util == null || (coverage != null && coverage < targets.minDataCoveragePercent)) {
      suppressed.push({
        ruleId: 'HIGH_UTILIZATION',
        reason: 'Insufficient utilization data coverage.',
      });
    } else if (util >= targets.utilizationPercent) {
      strengths.push({
        id: 'HIGH_UTILIZATION',
        title: 'High fleet utilization',
        description: `Time-weighted or operational utilization is at or above the organization target of ${targets.utilizationPercent}%.`,
        underlyingKpi: 'utilizationModel.metrics.UTILIZATION_PER_VEHICLE',
        comparisonBasis: 'ORG_TARGET',
        threshold: `>= ${targets.utilizationPercent}%`,
        period: snapshot.period,
        affectedDimension: 'FLEET',
        quantitativeImprovement: {
          value: util,
          unit: 'percent',
          direction: 'better',
          label: `${util}% utilization`,
        },
        confidence: coverage != null && coverage >= 90 ? 'HIGH' : 'MEDIUM',
        dataCoverage: {
          numerator: snapshot.utilization.vehiclesWithData,
          denominator: snapshot.utilization.vehicleCount,
          percent: coverage,
        },
        rationale: `Utilization ${util}% meets org target ${targets.utilizationPercent}% with ${coverage ?? 0}% vehicle coverage.`,
      });
    }
  }

  // REVENUE_GROWTH
  {
    const growth = deltaPercent(
      snapshot.financial.revenueCurrentMinor,
      snapshot.financial.revenuePreviousMinor,
    );
    if (snapshot.financial.revenuePreviousMinor <= 0) {
      suppressed.push({
        ruleId: 'REVENUE_GROWTH',
        reason: 'No comparison-period revenue baseline.',
      });
    } else if (growth != null && growth >= targets.revenueGrowthPercent) {
      strengths.push({
        id: 'REVENUE_GROWTH',
        title: 'Revenue growth vs previous period',
        description: 'Revenue increased compared to the prior comparison window.',
        underlyingKpi: 'financial.revenueMtdMinor',
        comparisonBasis: 'HISTORICAL_PERIOD',
        threshold: `>= +${targets.revenueGrowthPercent}% vs comparison period`,
        period: snapshot.period,
        comparisonPeriod: snapshot.comparisonPeriod,
        affectedDimension: 'ORG',
        quantitativeImprovement: {
          value: growth,
          unit: 'percent',
          direction: 'better',
          label: `+${growth}% revenue`,
        },
        confidence: 'HIGH',
        dataCoverage: {
          numerator: snapshot.financial.revenueCurrentMinor,
          denominator: snapshot.financial.revenuePreviousMinor,
          percent: 100,
        },
        rationale: `Revenue grew ${growth}% vs comparison period (${snapshot.financial.revenuePreviousMinor} → ${snapshot.financial.revenueCurrentMinor} minor units).`,
      });
    }
  }

  // HIGH_PAYMENT_COLLECTION
  {
    const collectionRate = safeRatio(
      snapshot.financial.paidRevenueCurrentMinor,
      snapshot.financial.revenueCurrentMinor,
    );
    if (snapshot.financial.revenueCurrentMinor <= 0) {
      suppressed.push({
        ruleId: 'HIGH_PAYMENT_COLLECTION',
        reason: 'No revenue in period.',
      });
    } else if (collectionRate != null && collectionRate >= targets.paymentCollectionPercent) {
      strengths.push({
        id: 'HIGH_PAYMENT_COLLECTION',
        title: 'Strong payment collection',
        description: 'A high share of period revenue has been collected.',
        underlyingKpi: 'financial.paidRevenueMtdMinor / financial.revenueMtdMinor',
        comparisonBasis: 'ORG_TARGET',
        threshold: `>= ${targets.paymentCollectionPercent}% collected`,
        period: snapshot.period,
        affectedDimension: 'ORG',
        quantitativeImprovement: {
          value: collectionRate,
          unit: 'percent',
          direction: 'better',
          label: `${collectionRate}% collected`,
        },
        confidence: 'HIGH',
        dataCoverage: {
          numerator: snapshot.financial.paidRevenueCurrentMinor,
          denominator: snapshot.financial.revenueCurrentMinor,
          percent: collectionRate,
        },
        rationale: `Payment collection rate ${collectionRate}% exceeds target ${targets.paymentCollectionPercent}%.`,
      });
    }
  }

  // LOW_OVERDUE_RATE
  {
    const totalOpen = snapshot.financial.openReceivablesMinor;
    const overdueRate = safeRatio(snapshot.financial.overdueReceivablesMinor, totalOpen);
    if (totalOpen <= 0) {
      strengths.push({
        id: 'LOW_OVERDUE_RATE',
        title: 'No open receivables overdue',
        description: 'There are no overdue receivables outstanding.',
        underlyingKpi: 'receivables.overdueAmountMinor',
        comparisonBasis: 'ORG_TARGET',
        threshold: `0 overdue (target max ${targets.maxOverdueRatePercent}% of open)`,
        period: snapshot.period,
        affectedDimension: 'ORG',
        quantitativeImprovement: {
          value: 0,
          unit: 'percent',
          direction: 'better',
          label: '0% overdue',
        },
        confidence: 'HIGH',
        dataCoverage: {
          numerator: 0,
          denominator: 0,
          percent: 100,
          notes: 'Zero open receivables overdue.',
        },
        rationale: 'No overdue receivables in the current open balance.',
      });
    } else if (overdueRate != null && overdueRate <= targets.maxOverdueRatePercent) {
      strengths.push({
        id: 'LOW_OVERDUE_RATE',
        title: 'Low overdue receivables rate',
        description: 'Overdue receivables are a small share of open balances.',
        underlyingKpi: 'receivables.overdueAmountMinor / receivables.openAmountMinor',
        comparisonBasis: 'ORG_TARGET',
        threshold: `<= ${targets.maxOverdueRatePercent}%`,
        period: snapshot.period,
        affectedDimension: 'ORG',
        quantitativeImprovement: {
          value: overdueRate,
          unit: 'percent',
          direction: 'better',
          label: `${overdueRate}% overdue rate`,
        },
        confidence: snapshot.financial.openReceivablesCount >= 3 ? 'HIGH' : 'MEDIUM',
        dataCoverage: {
          numerator: snapshot.financial.overdueReceivablesMinor,
          denominator: totalOpen,
          percent: overdueRate,
        },
        rationale: `Overdue rate ${overdueRate}% is below target maximum ${targets.maxOverdueRatePercent}%.`,
      });
    }
  }

  // LOW_CANCELLATION_RATE
  {
    const totalBookings =
      snapshot.bookings.completedInPeriod +
      snapshot.bookings.cancelledInPeriod +
      snapshot.bookings.noShowInPeriod;
    const cancelRate = safeRatio(
      snapshot.bookings.cancelledInPeriod + snapshot.bookings.noShowInPeriod,
      totalBookings,
    );
    if (totalBookings < 10) {
      suppressed.push({
        ruleId: 'LOW_CANCELLATION_RATE',
        reason: 'Minimum 10 booking outcomes in period required.',
      });
    } else if (cancelRate != null && cancelRate <= targets.maxCancellationRatePercent) {
      strengths.push({
        id: 'LOW_CANCELLATION_RATE',
        title: 'Low cancellation and no-show rate',
        description: 'Cancellations and no-shows are a small share of booking outcomes.',
        underlyingKpi: '(cancelled + no_show) / total booking outcomes',
        comparisonBasis: 'ORG_TARGET',
        threshold: `<= ${targets.maxCancellationRatePercent}%`,
        period: snapshot.period,
        affectedDimension: 'ORG',
        quantitativeImprovement: {
          value: cancelRate,
          unit: 'percent',
          direction: 'better',
          label: `${cancelRate}% cancellation rate`,
        },
        confidence: totalBookings >= 30 ? 'HIGH' : 'MEDIUM',
        dataCoverage: {
          numerator: snapshot.bookings.cancelledInPeriod + snapshot.bookings.noShowInPeriod,
          denominator: totalBookings,
          percent: cancelRate,
        },
        rationale: `Cancellation/no-show rate ${cancelRate}% is below target ${targets.maxCancellationRatePercent}% (${totalBookings} outcomes).`,
      });
    }
  }

  // LOW_UNPLANNED_DOWNTIME
  if (!snapshot.utilization.available || snapshot.utilization.fleetCapacityMs <= 0) {
    suppressed.push({
      ruleId: 'LOW_UNPLANNED_DOWNTIME',
      reason: 'Utilization downtime data unavailable.',
    });
  } else {
    const downtimePct = safeRatio(
      snapshot.utilization.unplannedDowntimeMs,
      snapshot.utilization.fleetCapacityMs,
    );
    if (downtimePct != null && downtimePct <= targets.maxUnplannedDowntimePercent) {
      strengths.push({
        id: 'LOW_UNPLANNED_DOWNTIME',
        title: 'Low unplanned downtime',
        description: 'Unplanned repair/diagnostic downtime is within the organization target.',
        underlyingKpi: 'utilizationModel.totals.unplannedDowntimeMs / fleetCapacityMs',
        comparisonBasis: 'ORG_TARGET',
        threshold: `<= ${targets.maxUnplannedDowntimePercent}% of fleet capacity time`,
        period: snapshot.period,
        affectedDimension: 'FLEET',
        quantitativeImprovement: {
          value: downtimePct,
          unit: 'percent',
          direction: 'better',
          label: `${downtimePct}% unplanned downtime`,
        },
        confidence: snapshot.utilization.vehiclesWithData >= 3 ? 'MEDIUM' : 'LOW',
        dataCoverage: {
          numerator: snapshot.utilization.unplannedDowntimeMs,
          denominator: snapshot.utilization.fleetCapacityMs,
          percent: downtimePct,
        },
        rationale: `Unplanned downtime ${downtimePct}% of capacity is below target ${targets.maxUnplannedDowntimePercent}%.`,
      });
    }
  }

  // SHORT_TURNAROUND
  if (
    snapshot.utilization.turnaroundCount < 3 ||
    snapshot.utilization.avgTurnaroundMs == null
  ) {
    suppressed.push({
      ruleId: 'SHORT_TURNAROUND',
      reason: 'Minimum 3 turnaround gaps between rentals required.',
    });
  } else {
    const avgHours = snapshot.utilization.avgTurnaroundMs / MS_HOUR;
    if (avgHours <= targets.maxTurnaroundHours) {
      strengths.push({
        id: 'SHORT_TURNAROUND',
        title: 'Short turnaround between rentals',
        description: 'Average idle gap between consecutive rentals is within target.',
        underlyingKpi: 'utilizationModel.totals.turnaroundMs / turnaroundCount',
        comparisonBasis: 'ORG_TARGET',
        threshold: `<= ${targets.maxTurnaroundHours} hours average`,
        period: snapshot.period,
        affectedDimension: 'FLEET',
        quantitativeImprovement: {
          value: Math.round(avgHours * 10) / 10,
          unit: 'count',
          direction: 'better',
          label: `${Math.round(avgHours * 10) / 10}h avg turnaround`,
        },
        confidence: snapshot.utilization.turnaroundCount >= 10 ? 'HIGH' : 'MEDIUM',
        dataCoverage: {
          numerator: snapshot.utilization.turnaroundCount,
          denominator: snapshot.utilization.vehicleCount,
          percent: null,
          notes: `${snapshot.utilization.turnaroundCount} turnaround gaps measured.`,
        },
        rationale: `Average turnaround ${avgHours.toFixed(1)}h meets target <= ${targets.maxTurnaroundHours}h.`,
      });
    }
  }

  // LOW_DAMAGE_RATE
  if (!snapshot.costs.available || snapshot.costs.revenueCurrentMinor <= 0) {
    suppressed.push({
      ruleId: 'LOW_DAMAGE_RATE',
      reason: 'Damage cost or revenue data unavailable.',
    });
  } else {
    const damageRatio = safeRatio(
      snapshot.costs.recordedDamageCostsMinor,
      snapshot.costs.revenueCurrentMinor,
    );
    if (damageRatio != null && damageRatio <= targets.maxDamageCostRatioPercent) {
      strengths.push({
        id: 'LOW_DAMAGE_RATE',
        title: 'Low damage cost ratio',
        description: 'Recorded damage repair costs are a small share of revenue.',
        underlyingKpi: 'costModel.totals.recordedDamageCostsMinor / financial.revenueMtdMinor',
        comparisonBasis: 'ORG_TARGET',
        threshold: `<= ${targets.maxDamageCostRatioPercent}% of revenue`,
        period: snapshot.period,
        affectedDimension: 'ORG',
        quantitativeImprovement: {
          value: damageRatio,
          unit: 'percent',
          direction: 'better',
          label: `${damageRatio}% damage/revenue`,
        },
        confidence: snapshot.costs.recordedDamageCostsMinor > 0 ? 'MEDIUM' : 'LOW',
        dataCoverage: {
          numerator: snapshot.costs.recordedDamageCostsMinor,
          denominator: snapshot.costs.revenueCurrentMinor,
          percent: damageRatio,
          notes:
            snapshot.costs.recordedDamageCostsMinor === 0
              ? 'No recorded damage costs — low confidence without explicit repair records.'
              : undefined,
        },
        rationale: `Damage cost ratio ${damageRatio}% is below target ${targets.maxDamageCostRatioPercent}%.`,
      });
    }
  }

  // STABLE_VEHICLE_AVAILABILITY
  if (snapshot.fleet.total < 5) {
    suppressed.push({
      ruleId: 'STABLE_VEHICLE_AVAILABILITY',
      reason: 'Minimum 5 vehicles in scoped fleet required.',
    });
  } else if (
    snapshot.fleet.readyPercent != null &&
    snapshot.fleet.readyPercent >= targets.minVehicleReadyPercent
  ) {
    strengths.push({
      id: 'STABLE_VEHICLE_AVAILABILITY',
      title: 'Stable vehicle availability',
      description: 'A high share of the fleet is in an available operational state.',
      underlyingKpi: 'vehicleAvailability.readyPercent',
      comparisonBasis: 'ORG_TARGET',
      threshold: `>= ${targets.minVehicleReadyPercent}% ready`,
      period: snapshot.period,
      affectedDimension: 'FLEET',
      quantitativeImprovement: {
        value: snapshot.fleet.readyPercent,
        unit: 'percent',
        direction: 'better',
        label: `${snapshot.fleet.readyPercent}% ready`,
      },
      confidence: 'MEDIUM',
      dataCoverage: {
        numerator: snapshot.fleet.available,
        denominator: snapshot.fleet.total,
        percent: snapshot.fleet.readyPercent,
      },
      rationale: `Fleet ready rate ${snapshot.fleet.readyPercent}% meets target ${targets.minVehicleReadyPercent}%.`,
    });
  }

  // GOOD_DATA_QUALITY
  if (
    dq.overallStatus === 'OK' &&
    dq.invoiceDataComplete &&
    dq.fleetDataComplete &&
    !dq.insightsStale &&
    dq.partialSectionCount === 0
  ) {
    strengths.push({
      id: 'GOOD_DATA_QUALITY',
      title: 'Good analytics data quality',
      description: 'Core analytics sections are complete and insights are fresh.',
      underlyingKpi: 'dataQuality.overallStatus',
      comparisonBasis: 'ORG_TARGET',
      threshold: 'overallStatus OK, no partial sections, insights not stale',
      period: snapshot.period,
      affectedDimension: 'ORG',
      quantitativeImprovement: null,
      confidence: 'HIGH',
      dataCoverage: {
        numerator: 1,
        denominator: 1,
        percent: 100,
      },
      rationale: 'All core data quality gates passed for the selected period and filters.',
    });
  } else {
    suppressed.push({
      ruleId: 'GOOD_DATA_QUALITY',
      reason: 'Data quality gates not fully met (partial sections, stale insights, or incomplete data).',
    });
  }

  // STRONG_STATION / STRONG_VEHICLE_CLASS — peer comparison within org
  const orgUtil =
    snapshot.utilization.timeWeightedUtilizationPercent ??
    snapshot.utilization.operationalSnapshotUtilizationPercent;

  if (orgUtil != null && snapshot.utilization.stationBreakdown.length >= 2) {
    for (const station of snapshot.utilization.stationBreakdown) {
      if (station.vehicleCount < 2 || station.utilizationPercent == null) continue;
      const delta = station.utilizationPercent - orgUtil;
      if (delta >= targets.peerOutperformancePercentPoints) {
        strengths.push({
          id: 'STRONG_STATION',
          title: `Strong station: ${station.stationName}`,
          description: `Station utilization outperforms the org average by ${Math.round(delta * 10) / 10} percentage points.`,
          underlyingKpi: 'utilizationModel.metrics.UTILIZATION_BY_STATION',
          comparisonBasis: 'PEER_STATIONS',
          threshold: `>= +${targets.peerOutperformancePercentPoints}pp vs org average`,
          period: snapshot.period,
          affectedDimension: 'STATION',
          dimensionKey: station.stationId,
          dimensionLabel: station.stationName,
          quantitativeImprovement: {
            value: Math.round(delta * 10) / 10,
            unit: 'percent',
            direction: 'better',
            label: `+${Math.round(delta * 10) / 10}pp vs org`,
          },
          confidence: station.vehicleCount >= 3 ? 'MEDIUM' : 'LOW',
          dataCoverage: {
            numerator: station.vehicleCount,
            denominator: snapshot.utilization.vehicleCount,
            percent: safeRatio(station.vehicleCount, snapshot.utilization.vehicleCount),
          },
          rationale: `Station ${station.stationName} at ${station.utilizationPercent}% vs org ${orgUtil}%.`,
        });
      }
    }
  } else {
    suppressed.push({
      ruleId: 'STRONG_STATION',
      reason: 'Need org utilization and at least 2 stations with data for peer comparison.',
    });
  }

  if (orgUtil != null && snapshot.utilization.classBreakdown.length >= 2) {
    for (const cls of snapshot.utilization.classBreakdown) {
      if (cls.vehicleCount < 2 || cls.utilizationPercent == null) continue;
      const delta = cls.utilizationPercent - orgUtil;
      if (delta >= targets.peerOutperformancePercentPoints) {
        strengths.push({
          id: 'STRONG_VEHICLE_CLASS',
          title: `Strong vehicle class: ${cls.vehicleClassName}`,
          description: `Class utilization outperforms the org average by ${Math.round(delta * 10) / 10} percentage points.`,
          underlyingKpi: 'utilizationModel.metrics.UTILIZATION_BY_VEHICLE_CLASS',
          comparisonBasis: 'PEER_STATIONS',
          threshold: `>= +${targets.peerOutperformancePercentPoints}pp vs org average`,
          period: snapshot.period,
          affectedDimension: 'VEHICLE_CLASS',
          dimensionKey: cls.vehicleClassId,
          dimensionLabel: cls.vehicleClassName,
          quantitativeImprovement: {
            value: Math.round(delta * 10) / 10,
            unit: 'percent',
            direction: 'better',
            label: `+${Math.round(delta * 10) / 10}pp vs org`,
          },
          confidence: cls.vehicleCount >= 3 ? 'MEDIUM' : 'LOW',
          dataCoverage: {
            numerator: cls.vehicleCount,
            denominator: snapshot.utilization.vehicleCount,
            percent: safeRatio(cls.vehicleCount, snapshot.utilization.vehicleCount),
          },
          rationale: `Class ${cls.vehicleClassName} at ${cls.utilizationPercent}% vs org ${orgUtil}%.`,
        });
      }
    }
  } else {
    suppressed.push({
      ruleId: 'STRONG_VEHICLE_CLASS',
      reason: 'Need org utilization and at least 2 vehicle classes with data.',
    });
  }

  const deduped = dedupeStrengths(strengths);

  return {
    calculationVersion: EVALUATIONS_STRENGTH_DETECTION_VERSION,
    period: snapshot.period,
    comparisonPeriod: snapshot.comparisonPeriod,
    strengths: deduped,
    rulesEvaluated: ruleIds.length,
    rulesSuppressed: suppressed,
    highlights: toHighlights(deduped),
  };
}

export function strengthDetectionSectionStatus(
  summary: EvaluationsStrengthDetectionSummary,
): 'OK' | 'PARTIAL' | 'UNAVAILABLE' {
  if (summary.strengths.length === 0 && summary.rulesSuppressed.length === summary.rulesEvaluated) {
    return 'UNAVAILABLE';
  }
  if (summary.strengths.some((s) => s.confidence === 'LOW')) return 'PARTIAL';
  if (summary.rulesSuppressed.length > 0) return 'PARTIAL';
  return 'OK';
}

export function buildStrengthDetectionSnapshot(input: {
  period: EvaluationsStrengthDetectionSnapshot['period'];
  comparisonPeriod: EvaluationsStrengthDetectionSnapshot['comparisonPeriod'];
  currency: string;
  financial: EvaluationsStrengthDetectionSnapshot['financial'] | null;
  bookings: EvaluationsStrengthDetectionSnapshot['bookings'] | null;
  fleet: EvaluationsStrengthDetectionSnapshot['fleet'] | null;
  utilizationModel: EvaluationsUtilizationModelSummary | null;
  costModel: EvaluationsCostModelSummary | null;
  dataQuality: EvaluationsStrengthDetectionSnapshot['dataQuality'];
  vehiclesWithUtilizationData: number;
  turnaroundCount: number;
  overlappingBookingCount: number;
}): EvaluationsStrengthDetectionSnapshot {
  const utilMetric = input.utilizationModel?.metrics.find(
    (m) => m.key === 'UTILIZATION_PER_VEHICLE',
  );
  const opMetric = input.utilizationModel?.metrics.find(
    (m) => m.key === 'OPERATIONAL_SNAPSHOT_UTILIZATION',
  );
  const stationMetric = input.utilizationModel?.metrics.find(
    (m) => m.key === 'UTILIZATION_BY_STATION',
  );
  const classMetric = input.utilizationModel?.metrics.find(
    (m) => m.key === 'UTILIZATION_BY_VEHICLE_CLASS',
  );
  const vehicleCount = utilMetric?.coverage.vehicleCount ?? 0;
  const turnaroundCount = input.turnaroundCount;

  return {
    period: input.period,
    comparisonPeriod: input.comparisonPeriod,
    currency: input.currency,
    financial: input.financial ?? {
      revenueCurrentMinor: 0,
      revenuePreviousMinor: 0,
      paidRevenueCurrentMinor: 0,
      openReceivablesMinor: 0,
      overdueReceivablesMinor: 0,
      openReceivablesCount: 0,
    },
    bookings: input.bookings ?? {
      completedInPeriod: 0,
      cancelledInPeriod: 0,
      noShowInPeriod: 0,
    },
    fleet: input.fleet ?? {
      total: 0,
      available: 0,
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
        turnaroundCount > 0 && input.utilizationModel
          ? input.utilizationModel.totals.turnaroundMs / turnaroundCount
          : null,
      turnaroundCount,
      stationBreakdown:
        stationMetric?.breakdown?.map((b) => ({
          stationId: b.key,
          stationName: b.label,
          utilizationPercent: b.utilizationPercent,
          vehicleCount: b.vehicleCount,
        })) ?? [],
      classBreakdown:
        classMetric?.breakdown?.map((b) => ({
          vehicleClassId: b.key,
          vehicleClassName: b.label,
          utilizationPercent: b.utilizationPercent,
          vehicleCount: b.vehicleCount,
        })) ?? [],
    },
    costs: {
      available: input.costModel != null,
      recordedDamageCostsMinor: input.costModel?.totals.recordedDamageCostsMinor ?? 0,
      revenueCurrentMinor: input.financial?.revenueCurrentMinor ?? 0,
    },
    dataQuality: {
      ...input.dataQuality,
      hasOverlappingBookings: input.overlappingBookingCount > 0,
    },
  };
}
