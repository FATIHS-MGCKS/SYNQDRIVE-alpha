import { Injectable, Logger } from '@nestjs/common';
import { DashboardInsightsAnalyticsService } from './dashboard-insights-analytics.service';
import { EvaluationsAnalyticsSummaryRepository } from './evaluations-analytics-summary.repository';
import type {
  EvaluationsAnalyticsPeriod,
  EvaluationsAnalyticsSummaryQuery,
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
  deriveStrengthsAndWeaknesses,
  resolveAnalyticsPeriodWindows,
  sectionStatusFromResult,
  unwrapSectionResult,
  wrapSection,
  type EvaluationsSectionResult,
} from '@synq/evaluations-insights/evaluations-analytics-summary';

@Injectable()
export class EvaluationsAnalyticsSummaryService {
  private readonly logger = new Logger(EvaluationsAnalyticsSummaryService.name);

  constructor(
    private readonly repository: EvaluationsAnalyticsSummaryRepository,
    private readonly insightsAnalytics: DashboardInsightsAnalyticsService,
  ) {}

  async getSummary(
    organizationId: string,
    query: EvaluationsAnalyticsSummaryQuery = {},
  ): Promise<EvaluationsAnalyticsSummaryResponse> {
    const startedAt = Date.now();
    const generatedAt = new Date().toISOString();
    const period: EvaluationsAnalyticsPeriod = query.period ?? 'mtd';
    const stationId = query.stationId ?? null;

    const timezone = await this.repository.resolveOrgTimezone(organizationId);
    const { current, previous } = resolveAnalyticsPeriodWindows(period, timezone);

    const stationVehicleIds = stationId
      ? await this.repository.resolveStationVehicleIds(organizationId, stationId)
      : null;

    const scope = {
      organizationId,
      stationId,
      stationVehicleIds,
    };

    const [
      financialResult,
      bookingResult,
      fleetResult,
      insightsResult,
    ] = await Promise.all([
      this.safeSection('financial', () =>
        this.repository.loadFinancialSnapshot(scope, current, previous),
      ),
      this.safeSection('bookings', () =>
        this.repository.loadBookingSnapshot(scope, current, previous, timezone),
      ),
      this.safeSection('fleet', () =>
        this.repository.loadFleetSnapshot(scope, 7, timezone),
      ),
      this.safeSection('insights', () =>
        this.insightsAnalytics.getAnalyticsSummary(organizationId, {
          stationId,
        }),
      ),
    ]);

    const financial = unwrapSectionResult(financialResult);
    const bookings = unwrapSectionResult(bookingResult);
    const fleet = unwrapSectionResult(fleetResult);
    const insights = unwrapSectionResult(insightsResult);

    const financialSummary = financial ? buildFinancialSummary(financial) : null;
    const receivablesSummary = financial ? buildReceivablesSummary(financial) : null;
    const bookingSummary = bookings ? buildBookingSummary(bookings) : null;
    const fleetUtilization = fleet ? buildFleetUtilizationSummary(fleet) : null;
    const vehicleAvailability = fleet ? buildVehicleAvailabilitySummary(fleet) : null;
    const downtime = fleet ? buildDowntimeSummary(fleet) : null;
    const costs = financial ? buildCostsSummary(financial) : null;
    const activeRisks = insights ? buildActiveRisksSummary(insights) : null;
    const affectedEntities = insights ? affectedEntitiesFromInsights(insights) : null;

    const executive =
      financial && bookings && fleet && activeRisks
        ? buildExecutiveKpis(financial, bookings, fleet, activeRisks)
        : null;

    const highlights =
      financial && fleet && activeRisks && fleetUtilization
        ? deriveStrengthsAndWeaknesses({
            financial,
            fleet,
            risks: activeRisks,
            fleetUtilization,
          })
        : { strengths: [], weaknesses: [] };

    const sectionDefs: Array<{ key: string; status: EvaluationsSectionStatus }> = [
      { key: 'executive', status: executive ? 'OK' : sectionStatusFromResult(financialResult) },
      { key: 'financial', status: sectionStatusFromResult(financialResult) },
      { key: 'receivables', status: sectionStatusFromResult(financialResult) },
      { key: 'bookings', status: sectionStatusFromResult(bookingResult) },
      { key: 'fleetUtilization', status: sectionStatusFromResult(fleetResult) },
      { key: 'vehicleAvailability', status: sectionStatusFromResult(fleetResult) },
      { key: 'downtime', status: sectionStatusFromResult(fleetResult) },
      { key: 'costs', status: sectionStatusFromResult(financialResult) },
      { key: 'activeRisks', status: sectionStatusFromResult(insightsResult) },
      { key: 'affectedEntities', status: sectionStatusFromResult(insightsResult) },
      { key: 'strengths', status: executive ? 'OK' : 'PARTIAL' },
      { key: 'weaknesses', status: executive ? 'OK' : 'PARTIAL' },
      { key: 'insights', status: sectionStatusFromResult(insightsResult) },
    ];

    const dataQuality = buildDataQualitySummary({
      sectionStatuses: sectionDefs,
      insights: {
        stale: insights?.stale ?? true,
        lastRunAt: insights?.lastRunAt ?? null,
        hasRun: insights?.hasRun ?? false,
      },
      financialOk: financialResult.ok,
      fleetOk: fleetResult.ok,
    });

    const response: EvaluationsAnalyticsSummaryResponse = {
      organizationId,
      generatedAt,
      period: current,
      comparisonPeriod: previous,
      appliedFilters: { stationId, period },
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
      activeRisks: wrapSection(
        activeRisks,
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
      strengths: wrapSection(highlights.strengths, executive ? 'OK' : 'PARTIAL', generatedAt),
      weaknesses: wrapSection(highlights.weaknesses, executive ? 'OK' : 'PARTIAL', generatedAt),
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
        insights
          ? { stale: insights.stale, lastUpdatedAt: insights.lastRunAt }
          : undefined,
      ),
      metadata: buildSummaryMetadata(
        sectionDefs.map((s) => ({ status: s.status })),
        Date.now() - startedAt,
      ),
    };

    return response;
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
