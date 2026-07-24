// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import { EvaluationsExecutiveKpiStrip } from './EvaluationsExecutiveKpiStrip';
import { EvaluationsExecutiveKpiCard } from './EvaluationsExecutiveKpiCard';
import { resolveExecutiveKpiStrip } from '@synq/evaluations-insights/evaluations-executive-kpi-registry';
import type { EvaluationsAnalyticsHookResult } from '../../hooks/useEvaluationsAnalyticsSummary.types';

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

function mockAnalytics(overrides: Partial<EvaluationsAnalyticsHookResult> = {}): EvaluationsAnalyticsHookResult {
  return {
    summary: null,
    loading: false,
    isRefetching: false,
    error: null,
    fetchPhase: 'ready',
    metrics: {} as EvaluationsAnalyticsHookResult['metrics'],
    refresh: async () => {},
    ...overrides,
  };
}

describe('EvaluationsExecutiveKpiStrip', () => {
  it('renders loading skeleton', () => {
    const html = renderToStaticMarkup(
      <EvaluationsExecutiveKpiStrip analytics={mockAnalytics({ loading: true, fetchPhase: 'loading' })} />,
    );
    expect(html).toContain('animate-pulse');
  });

  it('renders mobile-friendly horizontal list with snap', () => {
    const summary = {
      organizationId: 'org-1',
      generatedAt: '2026-07-24T10:00:00.000Z',
      period: { key: 'mtd', label: 'Juli 2026', from: '2026-07-01', to: '2026-07-24', timezone: 'UTC' },
      comparisonPeriod: { key: 'prev', label: 'Juni 2026', from: '2026-06-01', to: '2026-06-30', timezone: 'UTC' },
      appliedFilters: {},
      overallStatus: 'OK' as const,
      financial: {
        status: 'OK' as const,
        data: {
          revenueMtdMinor: 500_000,
          revenuePreviousMinor: 400_000,
          revenueDeltaPercent: 25,
          expensesMtdMinor: 200_000,
          expensesPreviousMinor: 180_000,
          expensesDeltaPercent: 11,
          netMarginMinor: 300_000,
          paidRevenueMtdMinor: 420_000,
          currency: 'EUR',
        },
        error: null,
        generatedAt: '2026-07-24T10:00:00.000Z',
      },
      receivables: {
        status: 'OK' as const,
        data: { openCount: 0, openAmountMinor: 0, overdueCount: 0, overdueAmountMinor: 0, currency: 'EUR' },
        error: null,
        generatedAt: '2026-07-24T10:00:00.000Z',
      },
      fleetUtilization: {
        status: 'OK' as const,
        data: {
          totalOperational: 10,
          rented: 7,
          available: 2,
          reserved: 1,
          utilizationPercent: 70,
          underutilizedVehicles: 1,
        },
        error: null,
        generatedAt: '2026-07-24T10:00:00.000Z',
      },
      vehicleAvailability: {
        status: 'OK' as const,
        data: { total: 10, available: 2, rented: 7, reserved: 1, maintenance: 0, blocked: 0, other: 0, readyPercent: 90 },
        error: null,
        generatedAt: '2026-07-24T10:00:00.000Z',
      },
      downtime: {
        status: 'OK' as const,
        data: {
          maintenanceVehicles: 0,
          blockedVehicles: 0,
          cleaningRequiredVehicles: 0,
          totalDowntimeVehicles: 0,
          downtimePercent: 0,
        },
        error: null,
        generatedAt: '2026-07-24T10:00:00.000Z',
      },
      activeRisks: {
        status: 'OK' as const,
        data: {
          businessRiskGroups: 0,
          revenueLeakageGroups: 0,
          complianceInsightGroups: 0,
          criticalInsights: 0,
          criticalBookings: 0,
          estimatedExposureMinor: 0,
          exposureCurrency: 'EUR',
          orgWideRisks: 0,
          bookingScopedRisks: 0,
        },
        error: null,
        generatedAt: '2026-07-24T10:00:00.000Z',
      },
      executive: { status: 'OK' as const, data: null, error: null, generatedAt: '2026-07-24T10:00:00.000Z' },
      bookings: { status: 'OK' as const, data: null, error: null, generatedAt: '2026-07-24T10:00:00.000Z' },
      costs: { status: 'OK' as const, data: null, error: null, generatedAt: '2026-07-24T10:00:00.000Z' },
      costModel: { status: 'OK' as const, data: null, error: null, generatedAt: '2026-07-24T10:00:00.000Z' },
      utilizationModel: { status: 'OK' as const, data: null, error: null, generatedAt: '2026-07-24T10:00:00.000Z' },
      affectedEntities: { status: 'OK' as const, data: null, error: null, generatedAt: '2026-07-24T10:00:00.000Z' },
      strengths: { status: 'OK' as const, data: null, error: null, generatedAt: '2026-07-24T10:00:00.000Z' },
      weaknesses: { status: 'OK' as const, data: null, error: null, generatedAt: '2026-07-24T10:00:00.000Z' },
      driverAnalysis: { status: 'OK' as const, data: null, error: null, generatedAt: '2026-07-24T10:00:00.000Z' },
      dataQuality: { status: 'OK' as const, data: null, error: null, generatedAt: '2026-07-24T10:00:00.000Z' },
      lineage: { status: 'OK' as const, data: null, error: null, generatedAt: '2026-07-24T10:00:00.000Z' },
      insights: { status: 'OK' as const, data: null, error: null, generatedAt: '2026-07-24T10:00:00.000Z' },
      metadata: {
        generationDurationMs: 1,
        sectionCount: 1,
        okSections: 1,
        partialSections: 0,
        errorSections: 0,
        unavailableSections: 0,
      },
    };

    const strip = resolveExecutiveKpiStrip({
      summary: summary as never,
      lineage: null,
      fetchPhase: 'ready',
      fetchError: null,
      locale: 'de',
    });

    const html = renderToStaticMarkup(
      <EvaluationsExecutiveKpiStrip
        analytics={mockAnalytics({ summary: summary as never, fetchPhase: 'ready' })}
      />,
    );
    expect(html).toContain('snap-x');
    expect(html).toContain('Umsatz (Periode)');
    expect(strip.cards.length).toBeGreaterThan(0);
  });

  it('renders error state on KPI card', () => {
    const card = resolveExecutiveKpiStrip({
      summary: {
        period: { key: 'mtd', label: 'Juli', from: '', to: '', timezone: 'UTC' },
        comparisonPeriod: { key: 'p', label: 'Juni', from: '', to: '', timezone: 'UTC' },
        financial: { status: 'ERROR', data: null, error: 'fail', generatedAt: '' },
      } as never,
      lineage: null,
      fetchPhase: 'failed',
      fetchError: 'fail',
      locale: 'de',
    }).cards.find((c) => c.id === 'revenue_mtd');

    if (!card) throw new Error('expected revenue card');
    const html = renderToStaticMarkup(<EvaluationsExecutiveKpiCard card={card} analyticsLocale="de" />);
    expect(html).toContain('Fehler');
  });
});
