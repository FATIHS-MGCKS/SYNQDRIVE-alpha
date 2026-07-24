/**
 * SW cockpit resolver tests (Prompt 32/54).
 */
import { detectOrganizationalStrengths } from './evaluations-strength-detection';
import { detectOrganizationalWeaknesses } from './evaluations-weakness-detection';
import type { EvaluationsStrengthDetectionSnapshot } from './evaluations-strength-detection.contract';
import type { EvaluationsWeaknessDetectionSnapshot } from './evaluations-weakness-detection.contract';
import {
  EVALUATIONS_SW_COCKPIT_VERSION,
  type SwCockpitCategory,
} from './evaluations-sw-cockpit.contract';
import {
  filterSwCockpitByCategory,
  resolveSwCockpit,
  swCockpitCategoryLabelKey,
} from './evaluations-sw-cockpit';

const period = {
  key: 'mtd',
  label: 'Juli 2026',
  from: '2026-07-01',
  to: '2026-07-24',
  timezone: 'Europe/Berlin',
};

const comparisonPeriod = {
  key: 'prev',
  label: 'Juni 2026',
  from: '2026-06-01',
  to: '2026-06-30',
  timezone: 'Europe/Berlin',
};

function strengthSnapshot(
  overrides: Partial<EvaluationsStrengthDetectionSnapshot> = {},
): EvaluationsStrengthDetectionSnapshot {
  return {
    period,
    comparisonPeriod,
    currency: 'EUR',
    financial: {
      revenueCurrentMinor: 500_000,
      revenuePreviousMinor: 400_000,
      paidRevenueCurrentMinor: 450_000,
      openReceivablesMinor: 20_000,
      overdueReceivablesMinor: 1_000,
      openReceivablesCount: 3,
    },
    bookings: { completedInPeriod: 40, cancelledInPeriod: 2, noShowInPeriod: 1 },
    fleet: { total: 12, available: 10, readyPercent: 90, underutilized: 1 },
    utilization: {
      available: true,
      timeWeightedUtilizationPercent: 78,
      operationalSnapshotUtilizationPercent: 75,
      vehiclesWithData: 10,
      vehicleCount: 12,
      unplannedDowntimeMs: 40_000,
      fleetCapacityMs: 2_000_000,
      avgTurnaroundMs: 10 * 60 * 60 * 1000,
      turnaroundCount: 8,
      stationBreakdown: [
        { stationId: 'st-1', stationName: 'Berlin', utilizationPercent: 88, vehicleCount: 5 },
        { stationId: 'st-2', stationName: 'München', utilizationPercent: 62, vehicleCount: 4 },
      ],
      classBreakdown: [
        { vehicleClassId: 'cls-1', vehicleClassName: 'Compact', utilizationPercent: 85, vehicleCount: 6 },
      ],
    },
    costs: { available: true, recordedDamageCostsMinor: 5_000, revenueCurrentMinor: 500_000 },
    dataQuality: {
      overallStatus: 'OK',
      invoiceDataComplete: true,
      fleetDataComplete: true,
      insightsStale: false,
      partialSectionCount: 0,
      unavailableSectionCount: 0,
      hasOverlappingBookings: false,
    },
    ...overrides,
  };
}

const MS_HOUR = 60 * 60 * 1000;

function weaknessSnapshot(
  overrides: Partial<EvaluationsWeaknessDetectionSnapshot> = {},
): EvaluationsWeaknessDetectionSnapshot {
  return {
    period,
    comparisonPeriod,
    currency: 'EUR',
    financial: {
      revenueCurrentMinor: 120_000,
      revenuePreviousMinor: 180_000,
      expensesCurrentMinor: 110_000,
      expensesPreviousMinor: 90_000,
      paidRevenueCurrentMinor: 100_000,
      openReceivablesMinor: 30_000,
      overdueReceivablesMinor: 8_000,
      openReceivablesCount: 6,
      overdueReceivablesCount: 3,
    },
    bookings: { completedInPeriod: 30, cancelledInPeriod: 8, noShowInPeriod: 4 },
    fleet: { total: 12, available: 6, maintenance: 1, blocked: 1, readyPercent: 66, underutilized: 5 },
    utilization: {
      available: true,
      timeWeightedUtilizationPercent: 32,
      operationalSnapshotUtilizationPercent: 35,
      vehiclesWithData: 10,
      vehicleCount: 12,
      unplannedDowntimeMs: 200_000,
      fleetCapacityMs: 2_000_000,
      avgTurnaroundMs: 60 * MS_HOUR,
      turnaroundCount: 10,
      stationBottlenecks: [
        { stationId: 'st-1', stationName: 'Berlin', totalVehicles: 6, availableVehicles: 0 },
      ],
      vehiclesWithHighDowntime: [
        {
          vehicleId: 'v1',
          label: 'AB-1',
          unplannedDowntimeMs: 300_000,
          capacityMs: 1_000_000,
          downtimeSharePercent: 30,
        },
        {
          vehicleId: 'v2',
          label: 'AB-2',
          unplannedDowntimeMs: 250_000,
          capacityMs: 1_000_000,
          downtimeSharePercent: 25,
        },
      ],
      weakStations: [],
    },
    costs: {
      available: true,
      recordedDamageCostsMinor: 12_000,
      actualExpensesMinor: 110_000,
      revenueCurrentMinor: 120_000,
    },
    insights: {
      businessRiskGroups: 5,
      revenueLeakageGroups: 2,
      criticalInsights: 2,
      criticalBookings: 1,
      complianceInsightGroups: 3,
      estimatedExposureMinor: 15_000,
      exposureCurrency: 'EUR',
      affectedVehicles: 4,
      affectedStations: 2,
      affectedBookings: 1,
    },
    dataQuality: {
      overallStatus: 'OK',
      invoiceDataComplete: true,
      fleetDataComplete: true,
      insightsStale: false,
      partialSectionCount: 0,
      unavailableSectionCount: 0,
      hasOverlappingBookings: false,
    },
    ...overrides,
  };
}

describe('evaluations-sw-cockpit (shared)', () => {
  it('returns empty result when no findings', () => {
    const result = resolveSwCockpit({
      strengths: [],
      weaknesses: [],
      strengthsStatus: 'OK',
      weaknessesStatus: 'OK',
      locale: 'de',
    });

    expect(result.calculationVersion).toBe(EVALUATIONS_SW_COCKPIT_VERSION);
    expect(result.findings).toHaveLength(0);
    expect(result.emptyReason).toBe('NO_FINDINGS');
    expect(result.suppressedDuplicates).toBe(0);
  });

  it('maps many findings with categories and required fields', () => {
    const strengths = detectOrganizationalStrengths(strengthSnapshot()).strengths;
    const weaknesses = detectOrganizationalWeaknesses(weaknessSnapshot()).weaknesses;
    const result = resolveSwCockpit({
      strengths,
      weaknesses,
      strengthsStatus: 'OK',
      weaknessesStatus: 'OK',
      locale: 'de',
    });

    expect(result.findings.length).toBeGreaterThan(5);

    for (const finding of result.findings) {
      expect(finding.key).toBeTruthy();
      expect(finding.title).toBeTruthy();
      expect(finding.explanation).toBeTruthy();
      expect(finding.comparisonBasisKey).toBeTruthy();
      expect(finding.periodLabel).toBeTruthy();
      expect(finding.affectedDimensionKey).toBeTruthy();
      expect(finding.confidence).toBeTruthy();
      expect(finding.dataCoverage.label).toBeTruthy();
      expect(finding.drillDownSection).toBeTruthy();
    }

    const categories = new Set(result.findings.map((f) => f.category));
    expect(categories.has('STRENGTH')).toBe(true);
    expect(
      categories.has('RISK') || categories.has('CRITICAL_RISK') || categories.has('IMPROVEMENT_POTENTIAL'),
    ).toBe(true);
  });

  it('sorts by urgency and impact — critical risks first', () => {
    const weaknesses = detectOrganizationalWeaknesses(weaknessSnapshot()).weaknesses;
    const result = resolveSwCockpit({
      strengths: [],
      weaknesses,
      locale: 'de',
    });

    const ranks = result.findings.map((f) => f.categoryRank);
    for (let i = 1; i < ranks.length; i += 1) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]!);
    }
  });

  it('deduplicates conflicting strength/weakness root causes', () => {
    const strengths = detectOrganizationalStrengths(strengthSnapshot()).strengths;
    const weaknesses = detectOrganizationalWeaknesses(weaknessSnapshot()).weaknesses;
    const combined = resolveSwCockpit({ strengths, weaknesses, locale: 'de' });
    const strengthsOnly = resolveSwCockpit({ strengths, weaknesses: [], locale: 'de' });
    const weaknessesOnly = resolveSwCockpit({ strengths: [], weaknesses, locale: 'de' });

    expect(combined.findings.length).toBeLessThan(strengthsOnly.findings.length + weaknessesOnly.findings.length);
    expect(combined.suppressedDuplicates).toBeGreaterThan(0);

    const orgUtilizationIds = combined.findings
      .filter((f) => f.dedupeGroup === 'utilization' && !f.entitySummary.dimensionKey)
      .map((f) => f.sourceId);
    expect(orgUtilizationIds.includes('HIGH_UTILIZATION') && orgUtilizationIds.includes('UNDERUTILIZATION')).toBe(
      false,
    );
  });

  it('represents grouped entities on station-level findings', () => {
    const strengths = detectOrganizationalStrengths(strengthSnapshot()).strengths.filter(
      (s) => s.id === 'STRONG_STATION',
    );
    const result = resolveSwCockpit({ strengths, weaknesses: [], locale: 'de' });

    expect(result.findings.length).toBeGreaterThan(0);
    const stationFinding = result.findings.find((f) => f.entitySummary.entityType === 'STATION');
    expect(stationFinding?.entitySummary.isGrouped).toBe(true);
    expect(stationFinding?.dimensionLabel).toBeTruthy();
  });

  it('flags partial coverage and low confidence', () => {
    const weaknesses = detectOrganizationalWeaknesses(weaknessSnapshot()).weaknesses.map((w) => ({
      ...w,
      confidence: 'LOW' as const,
      dataCoverage: { numerator: 2, denominator: 10, percent: 20, notes: 'Limited fleet telemetry' },
    }));
    const result = resolveSwCockpit({ strengths: [], weaknesses, locale: 'de' });

    expect(result.findings.every((f) => f.confidence === 'LOW')).toBe(true);
    expect(result.findings.every((f) => f.dataCoverage.isPartial)).toBe(true);
    expect(result.findings[0]?.dataCoverage.notes).toContain('Limited');
  });

  it('filters by category', () => {
    const result = resolveSwCockpit({
      strengths: detectOrganizationalStrengths(strengthSnapshot()).strengths,
      weaknesses: detectOrganizationalWeaknesses(weaknessSnapshot()).weaknesses,
      locale: 'de',
    });

    const strengthsOnly = filterSwCockpitByCategory(result, 'STRENGTH');
    expect(strengthsOnly.every((f) => f.category === 'STRENGTH')).toBe(true);
    expect(strengthsOnly.length).toBe(result.categoryCounts.STRENGTH);
  });

  it('exposes category label keys for i18n', () => {
    const categories: SwCockpitCategory[] = [
      'STRENGTH',
      'IMPROVEMENT_POTENTIAL',
      'OBSERVATION',
      'RISK',
      'CRITICAL_RISK',
    ];
    for (const cat of categories) {
      expect(swCockpitCategoryLabelKey(cat)).toBe(`evaluations.swCockpit.category.${cat}`);
    }
  });

  it('reports insufficient data empty reason when sections are partial with no findings', () => {
    const result = resolveSwCockpit({
      strengths: [],
      weaknesses: [],
      strengthsStatus: 'PARTIAL',
      weaknessesStatus: 'PARTIAL',
      locale: 'de',
    });
    expect(result.emptyReason).toBe('INSUFFICIENT_DATA');
  });
});
