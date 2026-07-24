import { Injectable } from '@nestjs/common';
import type { EvaluationsCostModelSnapshot } from '@synq/evaluations-insights/evaluations-cost-model.contract';
import type { EvaluationsCostModelSummary } from '@synq/evaluations-insights/evaluations-cost-model.contract';
import type {
  EvaluationsActiveRisksSummary,
  EvaluationsFinancialSnapshot,
  EvaluationsFleetSnapshot,
} from '@synq/evaluations-insights/evaluations-analytics-summary.contract';
import type { EvaluationsDataQualityDomainSummary } from '@synq/evaluations-insights/evaluations-data-quality.contract';
import type { EvaluationsUtilizationModelSummary } from '@synq/evaluations-insights/evaluations-utilization-model.contract';
import type { EvaluationsUtilizationSnapshot } from '@synq/evaluations-insights/evaluations-utilization-model.contract';
import type { EvaluationsTimePeriod } from '@synq/evaluations-insights/evaluations-analytics-primitives.contract';
import type { EvaluationsDetectedStrength } from '@synq/evaluations-insights/evaluations-strength-detection.contract';
import type { EvaluationsStrengthDetectionSummary } from '@synq/evaluations-insights/evaluations-strength-detection.contract';
import type { EvaluationsDetectedWeakness } from '@synq/evaluations-insights/evaluations-weakness-detection.contract';
import type { EvaluationsWeaknessDetectionSummary } from '@synq/evaluations-insights/evaluations-weakness-detection.contract';
import {
  attachDriverAnalysisToRisks,
  attachDriverAnalysisToStrengths,
  attachDriverAnalysisToWeaknesses,
  buildDriverAnalysisSnapshot,
  buildDriverAnalysisSummary,
  driverAnalysisSectionStatus,
} from '@synq/evaluations-insights/evaluations-driver-analysis';
import type { EvaluationsDriverAnalysisSummary } from '@synq/evaluations-insights/evaluations-driver-analysis.contract';
import type { InsightEntityCountSummary } from '@synq/evaluations-insights/insight-entity-references.contract';

export interface EvaluationsDriverAnalysisInput {
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
  dataQuality: EvaluationsDataQualityDomainSummary;
  overlappingBookingCount?: number;
  strengths: EvaluationsDetectedStrength[];
  weaknesses: EvaluationsDetectedWeakness[];
}

@Injectable()
export class EvaluationsDriverAnalysisService {
  buildSnapshot(input: Omit<EvaluationsDriverAnalysisInput, 'strengths' | 'weaknesses'>): ReturnType<typeof buildDriverAnalysisSnapshot> {
    return buildDriverAnalysisSnapshot({
      period: input.period,
      comparisonPeriod: input.comparisonPeriod,
      currency: input.financial?.currency ?? 'EUR',
      financial: input.financial
        ? {
            revenueCurrentMinor: input.financial.revenueMtdMinor,
            revenuePreviousMinor: input.financial.revenuePreviousMinor,
            expensesCurrentMinor: input.financial.expensesMtdMinor,
            expensesPreviousMinor: input.financial.expensesPreviousMinor,
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
            underutilized: input.fleet.underutilized,
            maintenance: input.fleet.maintenance,
            blocked: input.fleet.blocked,
          }
        : null,
      utilizationModel: input.utilizationModelSummary,
      utilizationSnapshot: input.utilizationSnapshot,
      costModelSnapshot: input.costModelSnapshot,
      insights: {
        businessRiskGroups: input.activeRisks?.businessRiskGroups ?? 0,
        revenueLeakageGroups: input.activeRisks?.revenueLeakageGroups ?? 0,
        complianceInsightGroups: input.activeRisks?.complianceInsightGroups ?? 0,
        criticalInsights: input.activeRisks?.criticalInsights ?? 0,
        affectedVehicles: input.affectedEntities?.affectedVehicles ?? 0,
        affectedStations: input.affectedEntities?.affectedStations ?? 0,
        affectedBookings: input.affectedEntities?.affectedBookings ?? 0,
        estimatedExposureMinor: input.activeRisks?.estimatedExposureMinor ?? 0,
        exposureCurrency: input.activeRisks?.exposureCurrency ?? 'EUR',
      },
      dataQuality: {
        overallStatus: input.dataQuality.overallStatus,
        partialSectionCount: input.dataQuality.partialSections.length,
        unavailableSectionCount: input.dataQuality.unavailableSections.length,
        hasOverlappingBookings: (input.overlappingBookingCount ?? 0) > 0,
        insightsStale: input.dataQuality.insightsStale,
        partialSections: input.dataQuality.partialSections,
      },
    });
  }

  analyze(input: EvaluationsDriverAnalysisInput): EvaluationsDriverAnalysisSummary {
    const snapshot = this.buildSnapshot(input);
    return buildDriverAnalysisSummary({
      snapshot,
      strengths: input.strengths,
      weaknesses: input.weaknesses,
      activeRisks: input.activeRisks,
    });
  }

  enrichStrengths(
    summary: EvaluationsStrengthDetectionSummary,
    snapshot: ReturnType<typeof buildDriverAnalysisSnapshot>,
  ): EvaluationsStrengthDetectionSummary {
    return attachDriverAnalysisToStrengths(summary, snapshot);
  }

  enrichWeaknesses(
    summary: EvaluationsWeaknessDetectionSummary,
    snapshot: ReturnType<typeof buildDriverAnalysisSnapshot>,
  ): EvaluationsWeaknessDetectionSummary {
    return attachDriverAnalysisToWeaknesses(summary, snapshot);
  }

  enrichRisks(
    risks: EvaluationsActiveRisksSummary,
    snapshot: ReturnType<typeof buildDriverAnalysisSnapshot>,
  ): EvaluationsActiveRisksSummary {
    return attachDriverAnalysisToRisks(risks, snapshot);
  }

  sectionStatus(summary: EvaluationsDriverAnalysisSummary): 'OK' | 'PARTIAL' | 'UNAVAILABLE' {
    return driverAnalysisSectionStatus(summary);
  }
}
