import { Injectable } from '@nestjs/common';
import type { EvaluationsCostModelSnapshot } from '@synq/evaluations-insights/evaluations-cost-model.contract';
import type { EvaluationsCostModelSummary } from '@synq/evaluations-insights/evaluations-cost-model.contract';
import type {
  EvaluationsDataQualitySummary,
  EvaluationsFinancialSnapshot,
  EvaluationsFleetSnapshot,
} from '@synq/evaluations-insights/evaluations-analytics-summary.contract';
import type { EvaluationsUtilizationModelSummary } from '@synq/evaluations-insights/evaluations-utilization-model.contract';
import type { EvaluationsUtilizationSnapshot } from '@synq/evaluations-insights/evaluations-utilization-model.contract';
import type { EvaluationsTimePeriod } from '@synq/evaluations-insights/evaluations-analytics-primitives.contract';
import {
  buildStrengthDetectionSnapshot,
  detectOrganizationalStrengths,
  strengthDetectionSectionStatus,
} from '@synq/evaluations-insights/evaluations-strength-detection';
import type { EvaluationsStrengthDetectionSummary } from '@synq/evaluations-insights/evaluations-strength-detection.contract';

export interface EvaluationsStrengthDetectionInput {
  period: EvaluationsTimePeriod;
  comparisonPeriod: EvaluationsTimePeriod;
  financial: EvaluationsFinancialSnapshot | null;
  fleet: EvaluationsFleetSnapshot | null;
  costModelSummary: EvaluationsCostModelSummary | null;
  costModelSnapshot: EvaluationsCostModelSnapshot | null;
  utilizationModelSummary: EvaluationsUtilizationModelSummary | null;
  utilizationSnapshot: EvaluationsUtilizationSnapshot | null;
  dataQuality: EvaluationsDataQualitySummary;
}

@Injectable()
export class EvaluationsStrengthDetectionService {
  detect(input: EvaluationsStrengthDetectionInput): EvaluationsStrengthDetectionSummary {
    const readyPercent =
      input.fleet && input.fleet.total > 0
        ? Math.round((input.fleet.available / input.fleet.total) * 1000) / 10
        : null;

    const turnaroundCount =
      input.utilizationSnapshot?.vehicles.reduce((s, v) => s + v.turnaroundCount, 0) ?? 0;

    const vehiclesWithUtilizationData =
      input.utilizationSnapshot?.vehicles.filter((v) => v.capacityMs > 0).length ?? 0;

    const snapshot = buildStrengthDetectionSnapshot({
      period: input.period,
      comparisonPeriod: input.comparisonPeriod,
      currency: input.financial?.currency ?? 'EUR',
      financial: input.financial
        ? {
            revenueCurrentMinor: input.financial.revenueMtdMinor,
            revenuePreviousMinor: input.financial.revenuePreviousMinor,
            paidRevenueCurrentMinor: input.financial.paidRevenueMtdMinor,
            openReceivablesMinor: input.financial.openReceivablesMinor,
            overdueReceivablesMinor: input.financial.overdueReceivablesMinor,
            openReceivablesCount: input.financial.openReceivablesCount,
          }
        : null,
      bookings: input.costModelSnapshot
        ? {
            completedInPeriod: input.costModelSnapshot.completedBookingsInPeriod,
            cancelledInPeriod: input.costModelSnapshot.cancelledBookingsInPeriod,
            noShowInPeriod: input.costModelSnapshot.noShowBookingsInPeriod,
          }
        : null,
      fleet: input.fleet
        ? {
            total: input.fleet.total,
            available: input.fleet.available,
            readyPercent,
            underutilized: input.fleet.underutilized,
          }
        : null,
      utilizationModel: input.utilizationModelSummary,
      costModel: input.costModelSummary,
      dataQuality: {
        overallStatus: input.dataQuality.overallStatus,
        invoiceDataComplete: input.dataQuality.invoiceDataComplete,
        fleetDataComplete: input.dataQuality.fleetDataComplete,
        insightsStale: input.dataQuality.insightsStale,
        partialSectionCount: input.dataQuality.partialSections.length,
        unavailableSectionCount: input.dataQuality.unavailableSections.length,
        hasOverlappingBookings: false,
      },
      vehiclesWithUtilizationData,
      turnaroundCount,
      overlappingBookingCount:
        input.utilizationSnapshot?.overlappingBookingIds.length ?? 0,
    });

    return detectOrganizationalStrengths(snapshot);
  }

  sectionStatus(summary: EvaluationsStrengthDetectionSummary): 'OK' | 'PARTIAL' | 'UNAVAILABLE' {
    return strengthDetectionSectionStatus(summary);
  }
}
