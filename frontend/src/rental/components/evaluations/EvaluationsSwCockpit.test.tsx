// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import { EvaluationsSwCockpit } from './EvaluationsSwCockpit';
import { EvaluationsSwFindingCard } from './EvaluationsSwFindingCard';
import { resolveSwCockpit } from '@synq/evaluations-insights/evaluations-sw-cockpit';
import { detectOrganizationalStrengths } from '@synq/evaluations-insights/evaluations-strength-detection';
import { detectOrganizationalWeaknesses } from '@synq/evaluations-insights/evaluations-weakness-detection';
import type { EvaluationsStrengthDetectionSnapshot } from '@synq/evaluations-insights/evaluations-strength-detection.contract';
import type { EvaluationsWeaknessDetectionSnapshot } from '@synq/evaluations-insights/evaluations-weakness-detection.contract';

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'de',
    t: (key: TranslationKey, vars?: Record<string, string | number>) => {
      let text = de[key] ?? key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          text = text.replace(`{${k}}`, String(v));
        });
      }
      return text;
    },
  }),
}));

const period = {
  key: 'mtd',
  label: 'Juli 2026',
  from: '2026-07-01',
  to: '2026-07-24',
  timezone: 'Europe/Berlin',
};

function strengthSnapshot(): EvaluationsStrengthDetectionSnapshot {
  return {
    period,
    comparisonPeriod: { ...period, key: 'prev', label: 'Juni 2026' },
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
      ],
      classBreakdown: [],
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
  };
}

function weaknessSnapshot(): EvaluationsWeaknessDetectionSnapshot {
  return {
    period,
    comparisonPeriod: { ...period, key: 'prev', label: 'Juni 2026' },
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
      avgTurnaroundMs: 60 * 60 * 60 * 1000,
      turnaroundCount: 10,
      stationBottlenecks: [],
      vehiclesWithHighDowntime: [],
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
  };
}

function mockSummary() {
  return {
    strengths: {
      status: 'OK' as const,
      data: detectOrganizationalStrengths(strengthSnapshot()),
      error: null,
      generatedAt: '2026-07-24T10:00:00.000Z',
    },
    weaknesses: {
      status: 'OK' as const,
      data: detectOrganizationalWeaknesses(weaknessSnapshot()),
      error: null,
      generatedAt: '2026-07-24T10:00:00.000Z',
    },
  };
}

describe('EvaluationsSwCockpit', () => {
  it('renders loading skeleton', () => {
    const html = renderToStaticMarkup(<EvaluationsSwCockpit summary={null} loading />);
    expect(html).toContain('animate-pulse');
  });

  it('renders empty state when no findings', () => {
    const html = renderToStaticMarkup(
      <EvaluationsSwCockpit
        summary={{
          strengths: { status: 'OK', data: { strengths: [], highlights: [] }, error: null, generatedAt: '' },
          weaknesses: { status: 'OK', data: { weaknesses: [], highlights: [] }, error: null, generatedAt: '' },
        } as never}
        loading={false}
      />,
    );
    expect(html).toContain('Keine belastbaren Aussagen');
  });

  it('renders many findings with category filters and mobile snap scroll', () => {
    const summary = mockSummary();
    const cockpit = resolveSwCockpit({
      strengths: summary.strengths.data.strengths,
      weaknesses: summary.weaknesses.data.weaknesses,
      locale: 'de',
    });

    const html = renderToStaticMarkup(
      <EvaluationsSwCockpit summary={summary as never} loading={false} />,
    );

    expect(cockpit.findings.length).toBeGreaterThan(3);
    expect(html).toContain('snap-x');
    expect(html).toContain('role="tab"');
    expect(html).toContain('Stärke');
  });

  it('renders finding card with text severity label (not color-only)', () => {
    const finding = resolveSwCockpit({
      strengths: detectOrganizationalStrengths(strengthSnapshot()).strengths,
      weaknesses: [],
      locale: 'de',
    }).findings[0];

    if (!finding) throw new Error('expected finding');
    const html = renderToStaticMarkup(
      <EvaluationsSwFindingCard finding={finding} onSelect={() => {}} />,
    );
    expect(html).toContain('Stärke');
    expect(html).toContain('Quantitative Grundlage');
    expect(html).toContain('Details anzeigen');
    expect(html).toContain('type="button"');
  });

  it('supports keyboard-accessible filter tabs', () => {
    const html = renderToStaticMarkup(
      <EvaluationsSwCockpit summary={mockSummary() as never} loading={false} />,
    );
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-selected');
  });

  it('shows low confidence and partial coverage hints', () => {
    const weaknesses = detectOrganizationalWeaknesses(weaknessSnapshot()).weaknesses.map((w) => ({
      ...w,
      confidence: 'LOW' as const,
      dataCoverage: { numerator: 2, denominator: 10, percent: 20 },
    }));
    const finding = resolveSwCockpit({ strengths: [], weaknesses, locale: 'de' }).findings[0];
    if (!finding) throw new Error('expected finding');

    const html = renderToStaticMarkup(
      <EvaluationsSwFindingCard finding={finding} onSelect={() => {}} />,
    );
    expect(html).toContain('Niedrige Sicherheit');
    expect(html).toContain('Eingeschränkte Datenlage');
  });
});
