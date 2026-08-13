// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { FinanceReceivablesSection } from './FinanceReceivablesSection';
import { StrengthWeaknessSection } from './StrengthWeaknessSection';
import { CostDowntimeSection } from './CostDowntimeSection';
import { ExecutiveSummarySection } from './ExecutiveSummarySection';
import type { EvaluationsAsyncResult } from '../../lib/evaluations/evaluations-request';
import type {
  EvaluationsAnalyticsInsightsSummary,
  EvaluationsCostModelSection,
  EvaluationsStrengthSection,
  EvaluationsWeaknessSection,
} from '../../lib/evaluations/evaluations-canonical.types';
import type { FinancialInsightsBundleDto } from '../../lib/finance-insights.types';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: React.ReactElement) {
  act(() => {
    root.render(createElement(LanguageProvider, null, node));
  });
}

const settled = <T,>(data: T): EvaluationsAsyncResult<T> => ({
  phase: 'SETTLED',
  result: { state: 'AVAILABLE', data },
});

function moneyMetric(amountMinor: number, currency: string) {
  return { status: 'AVAILABLE', value: { amountMinor, currency }, warnings: [] };
}

describe('E6B FinanceReceivablesSection (E3 MTD, status-aware money)', () => {
  it('shows the MTD scope label and formats explicit currency; unavailable → placeholder, not 0', () => {
    const bundle = {
      organizationId: 'org-a',
      period: {},
      metrics: {
        'fin.mtd_issued_revenue': moneyMetric(123456, 'EUR'),
        'fin.mtd_expenses': { status: 'UNAVAILABLE', value: null, warnings: ['NO_DATA'] },
      },
    } as unknown as FinancialInsightsBundleDto;
    render(createElement(FinanceReceivablesSection, { finance: settled(bundle) }));
    const text = container.textContent ?? '';
    expect(text).toContain('Month to date');
    expect(text).toMatch(/€|1,234\.56/);
    // Expenses UNAVAILABLE must not render as €0.00.
    const expensesCard = container.querySelector('[data-testid="evaluations-finance-kpi-fin.mtd_expenses"]');
    expect(expensesCard?.textContent ?? '').not.toContain('0.00');
  });

  it('formats JPY with no /100 (¥ minor-unit exponent 0)', () => {
    const bundle = {
      organizationId: 'org-a',
      period: {},
      metrics: { 'fin.mtd_issued_revenue': moneyMetric(1000, 'JPY') },
    } as unknown as FinancialInsightsBundleDto;
    render(createElement(FinanceReceivablesSection, { finance: settled(bundle) }));
    expect(container.textContent ?? '').toContain('¥1,000');
  });
});

describe('E6B StrengthWeaknessSection (qualified empty; no false-complete)', () => {
  it('PARTIAL + empty → qualified copy, NOT a full "no weaknesses" verdict', () => {
    const strengths = {
      status: 'PARTIAL',
      strengths: [],
      evaluatedDimensions: ['FINANCE'],
      skippedDimensions: [{ dimension: 'UTILIZATION', reason: 'SOURCE_PARTIAL' }],
    } as unknown as EvaluationsStrengthSection;
    const weaknesses = {
      status: 'PARTIAL',
      weaknesses: [],
      evaluatedDimensions: ['FINANCE'],
      skippedDimensions: [{ dimension: 'UTILIZATION', reason: 'SOURCE_PARTIAL' }],
    } as unknown as EvaluationsWeaknessSection;
    render(
      createElement(StrengthWeaknessSection, {
        strengths: settled(strengths),
        weaknesses: settled(weaknesses),
      }),
    );
    const text = container.textContent ?? '';
    expect(text).toContain('coverage incomplete');
    expect(text).not.toContain('No weaknesses detected in the evaluated scope');
  });
});

describe('E6B CostDowntimeSection (OPERATING_EXPENSES money; unsupported = status-only)', () => {
  it('renders OPERATING_EXPENSES per-currency money and never an amount for unsupported categories', () => {
    const cost = {
      status: 'PARTIAL',
      categories: [
        {
          category: 'OPERATING_EXPENSES',
          nature: 'ACTUAL',
          status: 'AVAILABLE',
          totalsByCurrency: [{ amountMinor: 500000, currency: 'EUR' }],
          eventCount: 3,
          formula: 'x',
          sources: ['OrgInvoice'],
          reason: null,
        },
        {
          category: 'UNPLANNED_MAINTENANCE',
          nature: 'ACTUAL',
          status: 'UNAVAILABLE',
          totalsByCurrency: [],
          eventCount: 0,
          formula: 'x',
          sources: ['ServiceCase'],
          reason: 'UNPROVEN_CURRENCY',
        },
      ],
      totalsByCurrency: [{ amountMinor: 500000, currency: 'EUR' }],
      reportingCurrency: 'EUR',
      mixedCurrency: false,
    } as unknown as EvaluationsCostModelSection;
    render(createElement(CostDowntimeSection, { costModel: settled(cost) }));
    const opex = container.querySelector('[data-testid="evaluations-cost-OPERATING_EXPENSES"]');
    const maint = container.querySelector('[data-testid="evaluations-cost-UNPLANNED_MAINTENANCE"]');
    expect(opex?.textContent ?? '').toMatch(/€|5,000\.00/);
    // Unsupported category shows the unsupported label + reason, never a money amount.
    expect(maint?.textContent ?? '').toContain('Not available as an authoritative amount');
    expect(maint?.textContent ?? '').not.toMatch(/€\s?\d/);
  });
});

describe('E6B ExecutiveSummarySection + transport states', () => {
  it('unavailable finance metric → placeholder, not 0', () => {
    const summary = {
      sections: {
        finance: { status: 'UNAVAILABLE', metrics: { 'fin.mtd_issued_revenue': { status: 'UNAVAILABLE', value: null } }, reason: 'x' },
        utilization: { status: 'AVAILABLE', utilizationPercent: { status: 'AVAILABLE', value: 42 } },
        strengths: { status: 'AVAILABLE', strengths: [{}], evaluatedDimensions: [], skippedDimensions: [] },
        weaknesses: { status: 'AVAILABLE', weaknesses: [], evaluatedDimensions: [], skippedDimensions: [] },
      },
    } as unknown as EvaluationsAnalyticsInsightsSummary;
    render(createElement(ExecutiveSummarySection, { summary: settled(summary) }));
    const issued = container.querySelector('[data-testid="evaluations-exec-issued-revenue"]');
    expect(issued?.textContent ?? '').toContain('—');
    expect(container.querySelector('[data-testid="evaluations-exec-utilization"]')?.textContent ?? '').toContain('42.0 %');
  });

  it('NOT_FOUND transport → neutral copy, never "feature disabled"', () => {
    const notFound: EvaluationsAsyncResult<EvaluationsAnalyticsInsightsSummary> = {
      phase: 'SETTLED',
      result: { state: 'NOT_FOUND' },
    };
    render(createElement(ExecutiveSummarySection, { summary: notFound }));
    const text = container.textContent ?? '';
    expect(text).toContain('Analytics are not available for this scope.');
    expect(text.toLowerCase()).not.toContain('disabled');
    expect(text.toLowerCase()).not.toContain('deaktiviert');
  });
});
