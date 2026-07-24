// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import { EvaluationsRiskCostVizPanel } from './EvaluationsRiskCostVizPanel';
import { resolveRiskCostVisualizations } from '@synq/evaluations-insights/evaluations-risk-cost-visualizations';

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'de',
    t: (key: TranslationKey) => de[key] ?? key,
  }),
}));

const summary = {
  period: { key: 'mtd', label: 'Juli 2026', from: '', to: '', timezone: 'UTC' },
  comparisonPeriod: { key: 'prev', label: 'Juni 2026', from: '', to: '', timezone: 'UTC' },
  financial: {
    status: 'OK',
    data: {
      expensesMtdMinor: 200_000,
      expensesPreviousMinor: 180_000,
      expensesDeltaPercent: 11,
      revenueMtdMinor: 500_000,
      revenuePreviousMinor: 400_000,
      revenueDeltaPercent: 25,
      netMarginMinor: 300_000,
      paidRevenueMtdMinor: 420_000,
      currency: 'EUR',
    },
    error: null,
    generatedAt: '',
  },
  receivables: {
    status: 'OK',
    data: { openCount: 3, openAmountMinor: 30_000, overdueCount: 1, overdueAmountMinor: 5_000, currency: 'EUR' },
    error: null,
    generatedAt: '',
  },
  downtime: {
    status: 'OK',
    data: {
      maintenanceVehicles: 2,
      blockedVehicles: 1,
      cleaningRequiredVehicles: 0,
      totalDowntimeVehicles: 3,
      downtimePercent: 5,
    },
    error: null,
    generatedAt: '',
  },
  costModel: {
    status: 'OK',
    data: {
      calculationVersion: 'v1',
      currency: 'EUR',
      period: { key: 'mtd', label: 'Juli 2026', from: '', to: '', timezone: 'UTC' },
      totals: {
        actualExpensesMinor: 200_000,
        estimatedFixedCostsMinor: 80_000,
        recordedDamageCostsMinor: 10_000,
        recordedMaintenanceCostsMinor: 20_000,
        invoiceExpenseCount: 10,
        invoicesWithVehicleLinkCount: 8,
      },
      denominators: {
        vehicleCount: 10,
        completedBookings: 20,
        totalKmDriven: 1000,
        bookingsWithKm: 18,
        totalRentalDays: 60,
        bookingsWithRentalDays: 20,
        cancelledBookings: 1,
        noShowBookings: 0,
      },
      metrics: [
        {
          key: 'COST_BY_STATION',
          label: 'Cost by station',
          formula: 'x',
          dataSources: [],
          coverage: { numeratorCount: 8, denominatorCount: 10, percent: 80 },
          period: { key: 'mtd', label: 'Juli', from: '', to: '', timezone: 'UTC' },
          currency: 'EUR',
          status: 'ACTUAL',
          calculationVersion: 'v1',
          valueMinor: 200_000,
          unit: 'EUR',
          breakdown: [
            { dimension: 'STATION', key: 's1', label: 'Berlin', valueMinor: 150_000, vehicleCount: 5 },
            { dimension: 'STATION', key: 's2', label: 'Munich', valueMinor: 50_000, vehicleCount: 3 },
          ],
        },
      ],
      dataGaps: [],
    },
    error: null,
    generatedAt: '',
  },
  utilizationModel: { status: 'OK', data: null, error: null, generatedAt: '' },
  activeRisks: {
    status: 'OK',
    data: {
      businessRiskGroups: 2,
      revenueLeakageGroups: 1,
      complianceInsightGroups: 0,
      criticalInsights: 1,
      criticalBookings: 0,
      estimatedExposureMinor: 20_000,
      exposureCurrency: 'EUR',
      orgWideRisks: 2,
      bookingScopedRisks: 1,
    },
    error: null,
    generatedAt: '',
  },
  driverAnalysis: { status: 'OK', data: { riskDrivers: [] }, error: null, generatedAt: '' },
  insights: { status: 'OK', data: { stale: false }, error: null, generatedAt: '' },
} as never;

describe('EvaluationsRiskCostVizPanel', () => {
  it('renders risk matrix with table alternative', () => {
    const html = renderToStaticMarkup(
      <EvaluationsRiskCostVizPanel summary={summary} isDarkMode={false} variant="risks" />,
    );
    expect(html).toContain('Risikomatrix');
    expect(html).toContain('Tabellarische Alternative');
    expect(html).toContain('<table');
  });

  it('renders costs charts with dimension filter tabs', () => {
    const html = renderToStaticMarkup(
      <EvaluationsRiskCostVizPanel summary={summary} isDarkMode={false} variant="costs" />,
    );
    expect(html).toContain('Kosten-Waterfall');
    expect(html).toContain('Pareto');
    expect(html).toContain('role="tab"');
    expect(html).toContain('Stationen');
  });

  it('renders receivables aging for finance variant', () => {
    const html = renderToStaticMarkup(
      <EvaluationsRiskCostVizPanel summary={summary} isDarkMode={false} variant="finance" />,
    );
    expect(html).toContain('Forderungs-Aging');
  });

  it('shows empty state when no data', () => {
    const html = renderToStaticMarkup(
      <EvaluationsRiskCostVizPanel summary={null} isDarkMode={false} variant="risks" />,
    );
    expect(html).toContain('Keine Visualisierung möglich');
  });

  it('resolver produces data for multi-currency summary', () => {
    const base = summary as Record<string, unknown>;
    const usdSummary = {
      ...base,
      financial: {
        ...(base.financial as object),
        data: { ...((base.financial as { data: object }).data), currency: 'USD' },
      },
      receivables: {
        ...(base.receivables as object),
        data: { ...((base.receivables as { data: object }).data), currency: 'USD' },
      },
      costModel: {
        ...(base.costModel as object),
        data: { ...((base.costModel as { data: object }).data), currency: 'USD' },
      },
    };
    const bundle = resolveRiskCostVisualizations(usdSummary as never);
    expect(bundle.costWaterfall.currency).toBe('USD');
    expect(bundle.receivablesAging.currency).toBe('USD');
  });
});
