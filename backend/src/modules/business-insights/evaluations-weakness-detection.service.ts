import { Injectable } from '@nestjs/common';
import type { EvaluationsCostModelSnapshot } from '@synq/evaluations-insights/evaluations-cost-model.contract';
import type { EvaluationsCostModelSummary } from '@synq/evaluations-insights/evaluations-cost-model.contract';
import type {
  EvaluationsActiveRisksSummary,
  EvaluationsDataQualitySummary,
  EvaluationsFinancialSnapshot,
  EvaluationsFleetSnapshot,
} from '@synq/evaluations-insights/evaluations-analytics-summary.contract';
import type { InsightEntityCountSummary } from '@synq/evaluations-insights/insight-entity-references.contract';
import type { EvaluationsUtilizationModelSummary } from '@synq/evaluations-insights/evaluations-utilization-model.contract';
import type { EvaluationsUtilizationSnapshot } from '@synq/evaluations-insights/evaluations-utilization-model.contract';
import type { EvaluationsTimePeriod } from '@synq/evaluations-insights/evaluations-analytics-primitives.contract';
import {
  buildWeaknessDetectionSnapshot,
  detectOrganizationalWeaknesses,
  weaknessDetectionSectionStatus,
} from '@synq/evaluations-insights/evaluations-weakness-detection';
import type { EvaluationsWeaknessDetectionSummary } from '@synq/evaluations-insights/evaluations-weakness-detection.contract';

export interface EvaluationsWeaknessDetectionInput {
  period: EvaluationsTimePeriod;
  comparisonPeriod: EvaluationsTimePeriod;
  financial: EvaluationsFinancialSnapshot | null;
  fleet: EvaluationsFleetSnapshot | null;
  costModelSummary: EvaluationsCostModelSummary | null;
  costModelSnapshot: EvaluationsCostModelSnapshot | null;
  utilizationModelSummary: EvaluationsUtilizationModelSummary | null;
  utilizationSnapshot: EvaluationsUtilizationSnapshot | null;
  activeRisks: EvaluationsActiveRisksSummary | null;
  affectedEntities: InsightEntityCountSummary | null;
  dataQuality: EvaluationsDataQualitySummary;
}

@Injectable()
export class EvaluationsWeaknessDetectionService {
  detect(input: EvaluationsWeaknessDetectionInput): EvaluationsWeaknessDetectionSummary {
    const readyPercent =
      input.fleet && input.fleet.total > 0
        ? Math.round((input.fleet.available / input.fleet.total) * 1000) / 10
        : null;

    const turnaroundCount =
      input.utilizationSnapshot?.vehicles.reduce((s, v) => s + v.turnaroundCount, 0) ?? 0;

    const vehiclesWithUtilizationData =
      input.utilizationSnapshot?.vehicles.filter((v) => v.capacityMs > 0).length ?? 0;

    const snapshot = buildWeaknessDetectionSnapshot({
      period: input.period,
      comparisonPeriod: input.comparisonPeriod,
      currency: input.financial?.currency ?? 'EUR',
      financial: input.financial
        ? {
            revenueCurrentMinor: input.financial.revenueMtdMinor,
            revenuePreviousMinor: input.financial.revenuePreviousMinor,
            expensesCurrentMinor: input.financial.expensesMtdMinor,
            expensesPreviousMinor: input.financial.expensesPreviousMinor,
            paidRevenueCurrentMinor: input.financial.paidRevenueMtdMinor,
            openReceivablesMinor: input.financial.openReceivablesMinor,
            overdueReceivablesMinor: input.financial.overdueReceivablesMinor,
            openReceivablesCount: input.financial.openReceivablesCount,
            overdueReceivablesCount: input.financial.overdueReceivablesCount,
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
            maintenance: input.fleet.maintenance,
            blocked: input.fleet.blocked,
            readyPercent,
            underutilized: input.fleet.underutilized,
          }
        : null,
      utilizationModel: input.utilizationModelSummary,
      utilizationSnapshot: input.utilizationSnapshot,
      costModel: input.costModelSummary,
      insights: {
        businessRiskGroups: input.activeRisks?.businessRiskGroups ?? 0,
        revenueLeakageGroups: input.activeRisks?.revenueLeakageGroups ?? 0,
        criticalInsights: input.activeRisks?.criticalInsights ?? 0,
        criticalBookings: input.activeRisks?.criticalBookings ?? 0,
        complianceInsightGroups: input.activeRisks?.complianceInsightGroups ?? 0,
        estimatedExposureMinor: input.activeRisks?.estimatedExposureMinor ?? 0,
        exposureCurrency: input.activeRisks?.exposureCurrency ?? 'EUR',
        affectedVehicles: input.affectedEntities?.affectedVehicles ?? 0,
        affectedStations: input.affectedEntities?.affectedStations ?? 0,
        affectedBookings: input.affectedEntities?.affectedBookings ?? 0,
      },
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
      overlappingBookingCount: input.utilizationSnapshot?.overlappingBookingIds.length ?? 0,
    });

    return detectOrganizationalWeaknesses(snapshot);
  }

  sectionStatus(summary: EvaluationsWeaknessDetectionSummary): 'OK' | 'PARTIAL' | 'UNAVAILABLE' {
    return weaknessDetectionSectionStatus(summary);
  }
}
