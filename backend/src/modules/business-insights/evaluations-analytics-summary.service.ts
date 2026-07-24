import { Injectable, Logger } from '@nestjs/common';
import { DashboardInsightsAnalyticsService } from './dashboard-insights-analytics.service';
import { EvaluationsAnalyticsSummaryRepository } from './evaluations-analytics-summary.repository';
import type { ResolvedEvaluationsAnalyticsFilters } from '@synq/evaluations-insights/evaluations-analytics-filters.contract';
import type {
  EvaluationsAnalyticsSummaryResponse,
  EvaluationsSectionStatus,
} from '@synq/evaluations-insights/evaluations-analytics-summary.contract';
import {
  affectedEntitiesFromInsights,
  buildActiveRisksSummary,
  buildBookingSummary,
  buildCostsSummary,
  buildDataQualitySummary,
  buildDowntimeSummary,
  buildExecutiveKpis,
  buildFinancialSummary,
  buildFleetUtilizationSummary,
  buildReceivablesSummary,
  buildSummaryMetadata,
  buildVehicleAvailabilitySummary,
  computeOverallStatus,
  sectionStatusFromResult,
  unwrapSectionResult,
  wrapSection,
  type EvaluationsSectionResult,
} from '@synq/evaluations-insights/evaluations-analytics-summary';
import { toAppliedFilters } from '@synq/evaluations-insights/evaluations-analytics-filters';
import { buildCostModelSummary, costModelSectionStatus } from '@synq/evaluations-insights/evaluations-cost-model';
import {
  buildUtilizationModelSummary,
  utilizationModelSectionStatus,
} from '@synq/evaluations-insights/evaluations-utilization-model';
import { EvaluationsUtilizationSnapshotService } from './evaluations-utilization-snapshot.service';
import { EvaluationsStrengthDetectionService } from './evaluations-strength-detection.service';
import { EvaluationsWeaknessDetectionService } from './evaluations-weakness-detection.service';
import { EvaluationsDriverAnalysisService } from './evaluations-driver-analysis.service';
import type { EvaluationsStrengthDetectionSummary } from '@synq/evaluations-insights/evaluations-strength-detection.contract';
import type { EvaluationsWeaknessDetectionSummary } from '@synq/evaluations-insights/evaluations-weakness-detection.contract';
import type { EvaluationsDriverAnalysisSummary } from '@synq/evaluations-insights/evaluations-driver-analysis.contract';
import type { EvaluationsSectionEnvelope } from '@synq/evaluations-insights/evaluations-analytics-primitives.contract';

@Injectable()
export class EvaluationsAnalyticsSummaryService {
  private readonly logger = new Logger(EvaluationsAnalyticsSummaryService.name);

  constructor(
    private readonly repository: EvaluationsAnalyticsSummaryRepository,
    private readonly insightsAnalytics: DashboardInsightsAnalyticsService,
    private readonly utilizationSnapshot: EvaluationsUtilizationSnapshotService,
    private readonly strengthDetection: EvaluationsStrengthDetectionService,
    private readonly weaknessDetection: EvaluationsWeaknessDetectionService,
    private readonly driverAnalysis: EvaluationsDriverAnalysisService,
  ) {}

  async getSummary(
    organizationId: string,
    resolved: ResolvedEvaluationsAnalyticsFilters,
  ): Promise<EvaluationsAnalyticsSummaryResponse> {
    const startedAt = Date.now();
    const generatedAt = new Date().toISOString();

    const [financialResult, bookingResult, fleetResult, insightsResult, costModelResult, utilizationResult] =
      await Promise.all([
      this.safeSection('financial', () => this.repository.loadFinancialSnapshot(resolved)),
      this.safeSection('bookings', () => this.repository.loadBookingSnapshot(resolved)),
      this.safeSection('fleet', () => this.repository.loadFleetSnapshot(resolved, 7)),
      this.safeSection('insights', () =>
        this.insightsAnalytics.getAnalyticsSummary(organizationId, resolved),
      ),
      this.safeSection('costModel', () => this.repository.loadCostModelSnapshot(resolved)),
      this.safeSection('utilizationModel', () =>
        this.utilizationSnapshot.loadSnapshot(resolved),
      ),
    ]);

    const financial = unwrapSectionResult(financialResult);
    const bookings = unwrapSectionResult(bookingResult);
    const fleet = unwrapSectionResult(fleetResult);
    const insights = unwrapSectionResult(insightsResult);
    const costModelSnapshot = unwrapSectionResult(costModelResult);
    const utilizationSnapshot = unwrapSectionResult(utilizationResult);

    const periodWindow = {
      key: resolved.period.key,
      label: resolved.period.key === 'mtd' ? 'Month to date' : resolved.period.key,
      from: resolved.period.from,
      to: resolved.period.to,
      timezone: resolved.period.timezone,
    };

    const utilizationModelSummary = utilizationSnapshot
      ? buildUtilizationModelSummary(utilizationSnapshot, periodWindow)
      : null;
    const costModelSummary = costModelSnapshot
      ? buildCostModelSummary(costModelSnapshot, periodWindow)
      : null;

    const financialSummary = financial ? buildFinancialSummary(financial) : null;
    const receivablesSummary = financial ? buildReceivablesSummary(financial) : null;
    const bookingSummary = bookings ? buildBookingSummary(bookings) : null;
    const fleetUtilization = fleet ? buildFleetUtilizationSummary(fleet) : null;
    const vehicleAvailability = fleet ? buildVehicleAvailabilitySummary(fleet) : null;
    const downtime = fleet ? buildDowntimeSummary(fleet) : null;
    const costs = financial
      ? buildCostsSummary(
          financial,
          costModelSummary?.totals.estimatedFixedCostsMinor ?? null,
        )
      : null;
    const activeRisks = insights ? buildActiveRisksSummary(insights) : null;
    const affectedEntities = insights ? affectedEntitiesFromInsights(insights) : null;

    const executive =
      financial && bookings && fleet && activeRisks
        ? buildExecutiveKpis(financial, bookings, fleet, activeRisks)
        : null;

    const loaderSectionDefs: Array<{ key: string; status: EvaluationsSectionStatus }> = [
      { key: 'executive', status: executive ? 'OK' : sectionStatusFromResult(financialResult) },
      { key: 'financial', status: sectionStatusFromResult(financialResult) },
      { key: 'receivables', status: sectionStatusFromResult(financialResult) },
      { key: 'bookings', status: sectionStatusFromResult(bookingResult) },
      { key: 'fleetUtilization', status: sectionStatusFromResult(fleetResult) },
      { key: 'vehicleAvailability', status: sectionStatusFromResult(fleetResult) },
      { key: 'downtime', status: sectionStatusFromResult(fleetResult) },
      { key: 'costs', status: sectionStatusFromResult(financialResult) },
      {
        key: 'costModel',
        status: costModelSummary
          ? costModelSectionStatus(costModelSummary)
          : sectionStatusFromResult(costModelResult),
      },
      {
        key: 'utilizationModel',
        status: utilizationModelSummary
          ? utilizationModelSectionStatus(utilizationModelSummary)
          : sectionStatusFromResult(utilizationResult),
      },
      { key: 'activeRisks', status: sectionStatusFromResult(insightsResult) },
      { key: 'affectedEntities', status: sectionStatusFromResult(insightsResult) },
      { key: 'insights', status: sectionStatusFromResult(insightsResult) },
    ];

    const dataQuality = buildDataQualitySummary({
      sectionStatuses: loaderSectionDefs,
      insights: {
        stale: insights?.stale ?? true,
        lastRunAt: insights?.lastRunAt ?? null,
        hasRun: insights?.hasRun ?? false,
      },
      financialOk: financialResult.ok,
      fleetOk: fleetResult.ok,
    });

    const strengthSummary = this.strengthDetection.detect({
      period: periodWindow,
      comparisonPeriod: {
        key: resolved.comparisonPeriod.key,
        label: `Previous ${resolved.comparisonPeriod.key}`,
        from: resolved.comparisonPeriod.from,
        to: resolved.comparisonPeriod.to,
        timezone: resolved.comparisonPeriod.timezone,
      },
      financial,
      fleet,
      costModelSummary,
      costModelSnapshot,
      utilizationModelSummary,
      utilizationSnapshot,
      dataQuality,
    });
    const strengthStatus = this.strengthDetection.sectionStatus(strengthSummary);
    const weaknessSummary = this.weaknessDetection.detect({
      period: periodWindow,
      comparisonPeriod: {
        key: resolved.comparisonPeriod.key,
        label: `Previous ${resolved.comparisonPeriod.key}`,
        from: resolved.comparisonPeriod.from,
        to: resolved.comparisonPeriod.to,
        timezone: resolved.comparisonPeriod.timezone,
      },
      financial,
      fleet,
      costModelSummary,
      costModelSnapshot,
      utilizationModelSummary,
      utilizationSnapshot,
      activeRisks,
      affectedEntities,
      dataQuality,
    });
    const weaknessStatus = this.weaknessDetection.sectionStatus(weaknessSummary);

    const comparisonPeriodWindow = {
      key: resolved.comparisonPeriod.key,
      label: `Previous ${resolved.comparisonPeriod.key}`,
      from: resolved.comparisonPeriod.from,
      to: resolved.comparisonPeriod.to,
      timezone: resolved.comparisonPeriod.timezone,
    };

    const driverInput = {
      period: periodWindow,
      comparisonPeriod: comparisonPeriodWindow,
      financial,
      fleet,
      costModelSummary,
      costModelSnapshot,
      utilizationModelSummary,
      utilizationSnapshot,
      activeRisks,
      affectedEntities,
      dataQuality,
      overlappingBookingCount: utilizationSnapshot?.overlappingBookingIds.length ?? 0,
      strengths: strengthSummary.strengths,
      weaknesses: weaknessSummary.weaknesses,
    };

    const driverSnapshot = this.driverAnalysis.buildSnapshot(driverInput);
    const enrichedStrengthSummary = this.driverAnalysis.enrichStrengths(strengthSummary, driverSnapshot);
    const enrichedWeaknessSummary = this.driverAnalysis.enrichWeaknesses(weaknessSummary, driverSnapshot);
    const enrichedActiveRisks = activeRisks
      ? this.driverAnalysis.enrichRisks(activeRisks, driverSnapshot)
      : null;
    const driverAnalysisSummary = this.driverAnalysis.analyze({
      ...driverInput,
      strengths: enrichedStrengthSummary.strengths,
      weaknesses: enrichedWeaknessSummary.weaknesses,
    });
    const driverAnalysisStatus = this.driverAnalysis.sectionStatus(driverAnalysisSummary);

    const sectionDefs: Array<{ key: string; status: EvaluationsSectionStatus }> = [
      ...loaderSectionDefs,
      { key: 'strengths', status: strengthStatus },
      { key: 'weaknesses', status: weaknessStatus },
      { key: 'driverAnalysis', status: driverAnalysisStatus },
    ];

    return {
      organizationId,
      generatedAt,
      period: periodWindow,
      comparisonPeriod: {
        key: resolved.comparisonPeriod.key,
        label: `Previous ${resolved.comparisonPeriod.key}`,
        from: resolved.comparisonPeriod.from,
        to: resolved.comparisonPeriod.to,
        timezone: resolved.comparisonPeriod.timezone,
      },
      appliedFilters: toAppliedFilters(resolved),
      overallStatus: computeOverallStatus(sectionDefs),
      executive: wrapSection(executive, executive ? 'OK' : 'PARTIAL', generatedAt),
      financial: wrapSection(
        financialSummary,
        sectionStatusFromResult(financialResult),
        generatedAt,
        financialResult.ok ? null : financialResult.error,
      ),
      receivables: wrapSection(
        receivablesSummary,
        sectionStatusFromResult(financialResult),
        generatedAt,
        financialResult.ok ? null : financialResult.error,
      ),
      bookings: wrapSection(
        bookingSummary,
        sectionStatusFromResult(bookingResult),
        generatedAt,
        bookingResult.ok ? null : bookingResult.error,
      ),
      fleetUtilization: wrapSection(
        fleetUtilization,
        sectionStatusFromResult(fleetResult),
        generatedAt,
        fleetResult.ok ? null : fleetResult.error,
      ),
      vehicleAvailability: wrapSection(
        vehicleAvailability,
        sectionStatusFromResult(fleetResult),
        generatedAt,
        fleetResult.ok ? null : fleetResult.error,
      ),
      downtime: wrapSection(
        downtime,
        sectionStatusFromResult(fleetResult),
        generatedAt,
        fleetResult.ok ? null : fleetResult.error,
      ),
      costs: wrapSection(
        costs,
        sectionStatusFromResult(financialResult),
        generatedAt,
        financialResult.ok ? null : financialResult.error,
      ),
      costModel: wrapSection(
        costModelSummary,
        costModelSummary
          ? costModelSectionStatus(costModelSummary)
          : sectionStatusFromResult(costModelResult),
        generatedAt,
        costModelResult.ok ? null : costModelResult.error,
      ),
      utilizationModel: wrapSection(
        utilizationModelSummary,
        utilizationModelSummary
          ? utilizationModelSectionStatus(utilizationModelSummary)
          : sectionStatusFromResult(utilizationResult),
        generatedAt,
        utilizationResult.ok ? null : utilizationResult.error,
      ),
      activeRisks: wrapSection(
        enrichedActiveRisks,
        sectionStatusFromResult(insightsResult),
        generatedAt,
        insightsResult.ok ? null : insightsResult.error,
      ),
      affectedEntities: wrapSection(
        affectedEntities,
        sectionStatusFromResult(insightsResult),
        generatedAt,
        insightsResult.ok ? null : insightsResult.error,
      ),
      strengths: wrapSection(enrichedStrengthSummary, strengthStatus, generatedAt),
      weaknesses: wrapSection(enrichedWeaknessSummary, weaknessStatus, generatedAt),
      driverAnalysis: wrapSection(driverAnalysisSummary, driverAnalysisStatus, generatedAt),
      dataQuality: wrapSection(dataQuality, dataQuality.overallStatus, generatedAt),
      insights: wrapSection(
        insights
          ? {
              hasRun: insights.hasRun,
              lastRunAt: insights.lastRunAt,
              stale: insights.stale,
              error: insights.error,
            }
          : null,
        sectionStatusFromResult(insightsResult),
        generatedAt,
        insightsResult.ok ? null : insightsResult.error,
        insights ? { stale: insights.stale, lastUpdatedAt: insights.lastRunAt } : undefined,
      ),
      metadata: buildSummaryMetadata(
        sectionDefs.map((s) => ({ status: s.status })),
        Date.now() - startedAt,
      ),
    };
  }

  async getStrengthDetection(
    organizationId: string,
    resolved: ResolvedEvaluationsAnalyticsFilters,
  ): Promise<{
    organizationId: string;
    generatedAt: string;
    period: EvaluationsStrengthDetectionSummary['period'];
    comparisonPeriod: EvaluationsStrengthDetectionSummary['comparisonPeriod'];
    appliedFilters: ReturnType<typeof toAppliedFilters>;
    strengths: EvaluationsSectionEnvelope<EvaluationsStrengthDetectionSummary>;
  }> {
    const summary = await this.getSummary(organizationId, resolved);
    return {
      organizationId: summary.organizationId,
      generatedAt: summary.generatedAt,
      period: summary.period,
      comparisonPeriod: summary.comparisonPeriod,
      appliedFilters: summary.appliedFilters,
      strengths: summary.strengths,
    };
  }

  async getWeaknessDetection(
    organizationId: string,
    resolved: ResolvedEvaluationsAnalyticsFilters,
  ): Promise<{
    organizationId: string;
    generatedAt: string;
    period: EvaluationsWeaknessDetectionSummary['period'];
    comparisonPeriod: EvaluationsWeaknessDetectionSummary['comparisonPeriod'];
    appliedFilters: ReturnType<typeof toAppliedFilters>;
    weaknesses: EvaluationsSectionEnvelope<EvaluationsWeaknessDetectionSummary>;
  }> {
    const summary = await this.getSummary(organizationId, resolved);
    return {
      organizationId: summary.organizationId,
      generatedAt: summary.generatedAt,
      period: summary.period,
      comparisonPeriod: summary.comparisonPeriod,
      appliedFilters: summary.appliedFilters,
      weaknesses: summary.weaknesses,
    };
  }

  async getDriverAnalysis(
    organizationId: string,
    resolved: ResolvedEvaluationsAnalyticsFilters,
  ): Promise<{
    organizationId: string;
    generatedAt: string;
    period: EvaluationsDriverAnalysisSummary['period'];
    comparisonPeriod: EvaluationsDriverAnalysisSummary['comparisonPeriod'];
    appliedFilters: ReturnType<typeof toAppliedFilters>;
    driverAnalysis: EvaluationsSectionEnvelope<EvaluationsDriverAnalysisSummary>;
  }> {
    const summary = await this.getSummary(organizationId, resolved);
    return {
      organizationId: summary.organizationId,
      generatedAt: summary.generatedAt,
      period: summary.period,
      comparisonPeriod: summary.comparisonPeriod,
      appliedFilters: summary.appliedFilters,
      driverAnalysis: summary.driverAnalysis,
    };
  }

  private async safeSection<T>(
    key: string,
    loader: () => Promise<T>,
  ): Promise<EvaluationsSectionResult<T>> {
    try {
      const data = await loader();
      return { ok: true, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Evaluations analytics section "${key}" failed: ${message}`);
      const unavailable =
        message.toLowerCase().includes('not found') ||
        message.toLowerCase().includes('forbidden');
      return { ok: false, error: message, unavailable };
    }
  }
}
