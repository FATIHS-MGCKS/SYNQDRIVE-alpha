/**
 * Executive KPI registry tests (Prompt 31/54).
 */
import {
  EXECUTIVE_KPI_MAX_CARDS,
  EXECUTIVE_KPI_REGISTRY,
  formatExecutiveKpiCoverage,
  formatExecutiveKpiFreshness,
  getExecutiveKpiRegistry,
  resolveExecutiveKpiStrip,
} from './evaluations-executive-kpi-registry';
import type { EvaluationsAnalyticsSummaryResponse } from './evaluations-analytics-summary.contract';
import type { EvaluationsLineageSummary } from './evaluations-lineage.contract';

const envelopeOk = <T>(data: T) => ({
  status: 'OK' as const,
  data,
  error: null,
  generatedAt: '2026-07-24T10:00:00.000Z',
});

function baseSummary(overrides: Partial<EvaluationsAnalyticsSummaryResponse> = {}): EvaluationsAnalyticsSummaryResponse {
  return {
    organizationId: 'org-1',
    generatedAt: '2026-07-24T10:00:00.000Z',
    period: { key: 'mtd', label: 'Juli 2026', from: '2026-07-01', to: '2026-07-24', timezone: 'UTC' },
    comparisonPeriod: { key: 'prev_mtd', label: 'Juni 2026', from: '2026-06-01', to: '2026-06-30', timezone: 'UTC' },
    appliedFilters: {},
    overallStatus: 'OK',
    executive: envelopeOk({
      revenueMtdMinor: 500_000,
      expensesMtdMinor: 200_000,
      netMarginMinor: 300_000,
      openReceivablesMinor: 50_000,
      overdueReceivablesMinor: 10_000,
      activeBookings: 5,
      fleetUtilizationPercent: 72.5,
      criticalRisks: 1,
      currency: 'EUR',
    }),
    financial: envelopeOk({
      revenueMtdMinor: 500_000,
      revenuePreviousMinor: 400_000,
      revenueDeltaPercent: 25,
      expensesMtdMinor: 200_000,
      expensesPreviousMinor: 180_000,
      expensesDeltaPercent: 11.1,
      netMarginMinor: 300_000,
      paidRevenueMtdMinor: 420_000,
      currency: 'EUR',
    }),
    receivables: envelopeOk({
      openCount: 3,
      openAmountMinor: 50_000,
      overdueCount: 1,
      overdueAmountMinor: 10_000,
      currency: 'EUR',
    }),
    bookings: envelopeOk({
      active: 5,
      pending: 1,
      completed: 20,
      revenueTodayMinor: 5_000,
      revenueMtdMinor: 500_000,
      revenuePreviousMinor: 400_000,
      revenueDeltaPercent: 25,
      currency: 'EUR',
    }),
    fleetUtilization: envelopeOk({
      totalOperational: 100,
      rented: 72,
      available: 20,
      reserved: 8,
      utilizationPercent: 72.5,
      underutilizedVehicles: 12,
    }),
    vehicleAvailability: envelopeOk({
      total: 100,
      available: 20,
      rented: 72,
      reserved: 8,
      maintenance: 5,
      blocked: 2,
      other: 1,
      readyPercent: 88.0,
    }),
    downtime: envelopeOk({
      maintenanceVehicles: 5,
      blockedVehicles: 2,
      cleaningRequiredVehicles: 1,
      totalDowntimeVehicles: 8,
      downtimePercent: 8.0,
    }),
    costs: envelopeOk({
      expensesMtdMinor: 200_000,
      expensesPreviousMinor: 180_000,
      expensesDeltaPercent: 11.1,
      fixedCostsMtdMinor: 80_000,
      variableCostsMtdMinor: 120_000,
      currency: 'EUR',
    }),
    costModel: envelopeOk({
      calculationVersion: 'cost-model-v1',
      currency: 'EUR',
      period: { key: 'mtd', label: 'Juli 2026', from: '2026-07-01', to: '2026-07-24', timezone: 'UTC' },
      totals: {
        actualExpensesMinor: 200_000,
        estimatedFixedCostsMinor: 80_000,
        recordedDamageCostsMinor: 5_000,
        recordedMaintenanceCostsMinor: 15_000,
        invoiceExpenseCount: 12,
        invoicesWithVehicleLinkCount: 10,
      },
      denominators: { vehicleCount: 100, completedBookings: 20, fleetCapacityMs: 1, rentedMs: 1 },
      metrics: [],
      dataGaps: [],
    }),
    utilizationModel: envelopeOk({
      calculationVersion: 'util-v1',
      currency: 'EUR',
      period: { key: 'mtd', label: 'Juli 2026', from: '2026-07-01', to: '2026-07-24', timezone: 'UTC' },
      totals: {
        periodMs: 1,
        fleetCapacityMs: 1,
        rentedMs: 1,
        availableMs: 1,
        maintenanceMs: 0,
        blockedMs: 0,
        unplannedDowntimeMs: 0,
        turnaroundMs: 0,
        standstillMs: 0,
        bookedNotRealizedMs: 0,
        availableNotRentableCount: 0,
        capacityBottleneckStations: 0,
        overlappingBookingCount: 0,
        telemetryOfflineCount: 0,
      },
      operationalSnapshot: {
        activeRented: 72,
        reserved: 8,
        available: 20,
        maintenance: 5,
        blocked: 2,
        unknown: 0,
        utilizationPercent: 72.5,
      },
      metrics: [],
      dataGaps: [],
    }),
    activeRisks: envelopeOk({
      businessRiskGroups: 2,
      revenueLeakageGroups: 1,
      complianceInsightGroups: 0,
      criticalInsights: 1,
      criticalBookings: 1,
      estimatedExposureMinor: 25_000,
      exposureCurrency: 'EUR',
      orgWideRisks: 1,
      bookingScopedRisks: 2,
    }),
    affectedEntities: envelopeOk({ uniqueEntities: 3, vehicles: 1, bookings: 2, customers: 0, stations: 0 }),
    strengths: envelopeOk({ calculationVersion: 'v1', strengths: [], suppressedRules: [] }),
    weaknesses: envelopeOk({ calculationVersion: 'v1', weaknesses: [], suppressedRules: [] }),
    driverAnalysis: envelopeOk({ calculationVersion: 'v1', outcomes: [] }),
    dataQuality: envelopeOk({
      calculationVersion: 'dq-v1',
      period: { key: 'mtd', label: 'Juli 2026', from: '2026-07-01', to: '2026-07-24', timezone: 'UTC' },
      rollupStatus: 'GOOD',
      sources: [],
      metricBindings: [],
      crossCuttingIssues: [],
      thresholds: {
        completeness: { goodMinPercent: 95, limitedMinPercent: 70, missingBelowPercent: 30 },
        coverage: { goodMinPercent: 90, limitedMinPercent: 60 },
        freshness: { staleAfterMs: 86400000, insightsStaleAfterMs: 86400000 },
        uniqueness: { overlappingBookingsWarningAt: 1, overlappingBookingsInvalidAt: 1 },
      },
      overallStatus: 'OK',
      insightsStale: false,
    }),
    lineage: envelopeOk({
      calculationVersion: 'lineage-v1',
      calculatedAt: '2026-07-24T10:00:00.000Z',
      period: { key: 'mtd', label: 'Juli 2026', from: '2026-07-01', to: '2026-07-24', timezone: 'UTC' },
      audience: 'STANDARD',
      metrics: [
        {
          metricKey: 'financial.revenueMtdMinor',
          metricLabel: 'Revenue MTD',
          dataSources: ['INVOICES'],
          oldestIncludedRecordAt: '2026-07-01T00:00:00.000Z',
          newestIncludedRecordAt: '2026-07-24T00:00:00.000Z',
          lastSuccessfulImportAt: '2026-07-24T09:00:00.000Z',
          lastSuccessfulBackgroundJobAt: null,
          calculatedAt: '2026-07-24T10:00:00.000Z',
          calculationVersion: 'financial-summary-v1',
          excludedRecordCount: 0,
          exclusionReasons: [],
          dataCoverage: { percent: 100, includedCount: 50, eligibleCount: 50 },
          freshness: { state: 'FRESH', staleThresholdMs: 86400000, staleThresholdLabel: '24h' },
          sourceErrors: [],
        },
      ],
      sections: [],
      sourceErrors: [],
      sourcesWithoutLineage: [],
      freshnessPolicyReference: 'policy-v1',
    }),
    insights: envelopeOk({ hasRun: true, lastRunAt: '2026-07-24T09:00:00.000Z', stale: false, error: null }),
    metadata: {
      generationDurationMs: 120,
      sectionCount: 10,
      okSections: 10,
      partialSections: 0,
      errorSections: 0,
      unavailableSections: 0,
    },
    ...overrides,
  } as EvaluationsAnalyticsSummaryResponse;
}

describe('EXECUTIVE_KPI_REGISTRY', () => {
  it('defines at most eight prioritized KPIs', () => {
    expect(EXECUTIVE_KPI_REGISTRY.length).toBeLessThanOrEqual(EXECUTIVE_KPI_MAX_CARDS);
    expect(EXECUTIVE_KPI_REGISTRY.map((d) => d.id)).toContain('revenue_mtd');
  });

  it('supports configurable priority overrides', () => {
    const ordered = getExecutiveKpiRegistry({ overdue_receivables: 5, revenue_mtd: 99 })
      .slice()
      .sort((a, b) => a.priority - b.priority);
    expect(ordered[0]?.id).toBe('overdue_receivables');
  });
});

describe('resolveExecutiveKpiStrip', () => {
  it('resolves full data with comparison and favorable revenue delta', () => {
    const strip = resolveExecutiveKpiStrip({
      summary: baseSummary(),
      lineage: baseSummary().lineage.data,
      fetchPhase: 'ready',
      fetchError: null,
      locale: 'de',
    });
    expect(strip.cards).toHaveLength(8);
    const revenue = strip.cards.find((c) => c.id === 'revenue_mtd');
    expect(revenue?.state.canShowValue).toBe(true);
    expect(revenue?.percentDelta).toBe(25);
    expect(revenue?.deltaTone).toBe('favorable');
    expect(revenue?.coveragePercent).toBe(100);
  });

  it('marks partial section without substituting zero', () => {
    const summary = baseSummary({
      financial: {
        status: 'PARTIAL',
        data: { ...baseSummary().financial.data!, revenueMtdMinor: 100_000 },
        error: 'Invoice subset',
        generatedAt: '2026-07-24T10:00:00.000Z',
      },
    });
    const revenue = resolveExecutiveKpiStrip({
      summary,
      lineage: null,
      fetchPhase: 'ready',
      fetchError: null,
      locale: 'de',
    }).cards.find((c) => c.id === 'revenue_mtd');
    expect(revenue?.state.kind).toBe('partial');
    expect(revenue?.state.canShowValue).toBe(true);
  });

  it('surfaces stale freshness from lineage', () => {
    const lineage = {
      ...baseSummary().lineage.data!,
      metrics: [
        {
          ...baseSummary().lineage.data!.metrics[0]!,
          freshness: { state: 'STALE' as const, staleThresholdMs: 86400000, staleThresholdLabel: '24h' },
        },
      ],
    } satisfies EvaluationsLineageSummary;
    const revenue = resolveExecutiveKpiStrip({
      summary: baseSummary(),
      lineage,
      fetchPhase: 'ready',
      fetchError: null,
      locale: 'en',
    }).cards.find((c) => c.id === 'revenue_mtd');
    expect(revenue?.freshnessState).toBe('STALE');
    expect(formatExecutiveKpiFreshness('STALE', 'en')).toBe('Stale');
  });

  it('handles API error without values', () => {
    const summary = baseSummary({
      financial: { status: 'ERROR', data: null, error: 'DB timeout', generatedAt: '2026-07-24T10:00:00.000Z' },
    });
    const revenue = resolveExecutiveKpiStrip({
      summary,
      lineage: null,
      fetchPhase: 'failed',
      fetchError: 'DB timeout',
      locale: 'de',
    }).cards.find((c) => c.id === 'revenue_mtd');
    expect(revenue?.state.kind).toBe('error');
    expect(revenue?.state.canShowValue).toBe(false);
  });

  it('shows true zero for overdue receivables', () => {
    const summary = baseSummary({
      receivables: envelopeOk({
        openCount: 0,
        openAmountMinor: 0,
        overdueCount: 0,
        overdueAmountMinor: 0,
        currency: 'EUR',
      }),
    });
    const overdue = resolveExecutiveKpiStrip({
      summary,
      lineage: null,
      fetchPhase: 'ready',
      fetchError: null,
      locale: 'de',
    }).cards.find((c) => c.id === 'overdue_receivables');
    expect(overdue?.state.kind).toBe('null_value');
    expect(overdue?.state.rawValue).toBe(0);
  });

  it('formats long currency values without overflow semantics loss', () => {
    const summary = baseSummary({
      financial: envelopeOk({
        ...baseSummary().financial.data!,
        revenueMtdMinor: 12_345_678_90,
        revenuePreviousMinor: 11_000_000_00,
        revenueDeltaPercent: 12.2,
      }),
    });
    const revenue = resolveExecutiveKpiStrip({
      summary,
      lineage: null,
      fetchPhase: 'ready',
      fetchError: null,
      locale: 'de',
    }).cards.find((c) => c.id === 'revenue_mtd');
    expect(revenue?.state.displayValue).toContain('€');
    expect(revenue?.state.displayValue?.length).toBeGreaterThan(6);
  });

  it('uses neutral delta tone for contextual utilization', () => {
    const util = resolveExecutiveKpiStrip({
      summary: baseSummary(),
      lineage: null,
      fetchPhase: 'ready',
      fetchError: null,
      locale: 'de',
    }).cards.find((c) => c.id === 'fleet_utilization');
    expect(util?.deltaSemantics).toBe('contextual');
    expect(util?.deltaTone).toBe('hidden');
  });

  it('marks financial risk as estimate', () => {
    const risk = resolveExecutiveKpiStrip({
      summary: baseSummary(),
      lineage: null,
      fetchPhase: 'ready',
      fetchError: null,
      locale: 'de',
    }).cards.find((c) => c.id === 'financial_risk_exposure');
    expect(risk?.isEstimate).toBe(true);
  });
});

describe('formatExecutiveKpiCoverage', () => {
  it('formats coverage percent', () => {
    expect(formatExecutiveKpiCoverage(92.4, 'de')).toBe('92% Abdeckung');
  });
});
