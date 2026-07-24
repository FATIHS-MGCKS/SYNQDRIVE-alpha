// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { validateEvaluationsAnalyticsSummaryResponse } from '@synq/evaluations-insights/evaluations-analytics-contract-validation';
import {
  EVALUATIONS_CHART_DESKTOP_ONLY_CLASS,
  EVALUATIONS_CHART_MOBILE_HINT_CLASS,
  EVALUATIONS_FILTER_SELECT_CLASS,
  EVALUATIONS_KPI_GRID_CLASS,
  EVALUATIONS_KPI_VALUE_CLASS,
  EVALUATIONS_PAGE_SHELL_CLASS,
  EVALUATIONS_STICKY_NAV_CLASS,
  EVALUATIONS_TOUCH_TARGET_CLASS,
} from './evaluations-responsive.constants';

// Relative import for E2E mock shape validation (no Playwright in unit tests).
import { buildMockAnalyticsSummary } from '../../../../e2e/evaluations-fixtures';

describe('evaluations-responsive.constants', () => {
  it('defines single-column KPI grid on very narrow screens', () => {
    expect(EVALUATIONS_KPI_GRID_CLASS).toContain('grid-cols-1');
    expect(EVALUATIONS_KPI_GRID_CLASS).toContain('min-[360px]:grid-cols-2');
    expect(EVALUATIONS_KPI_GRID_CLASS).toContain('lg:grid-cols-4');
  });

  it('defines 44px touch targets and safe-area page shell', () => {
    expect(EVALUATIONS_TOUCH_TARGET_CLASS).toContain('min-h-[44px]');
    expect(EVALUATIONS_TOUCH_TARGET_CLASS).toContain('min-w-[44px]');
    expect(EVALUATIONS_PAGE_SHELL_CLASS).toContain('overflow-x-hidden');
    expect(EVALUATIONS_PAGE_SHELL_CLASS).toContain('safe-area-inset-bottom');
    expect(EVALUATIONS_STICKY_NAV_CLASS).toContain('safe-area-inset-top');
  });

  it('hides complex charts below md breakpoint', () => {
    expect(EVALUATIONS_CHART_DESKTOP_ONLY_CLASS).toBe('hidden md:block');
    expect(EVALUATIONS_CHART_MOBILE_HINT_CLASS).toContain('md:hidden');
  });

  it('scales KPI values and filter selects for mobile', () => {
    expect(EVALUATIONS_KPI_VALUE_CLASS).toContain('clamp');
    expect(EVALUATIONS_KPI_VALUE_CLASS).toContain('break-words');
    expect(EVALUATIONS_FILTER_SELECT_CLASS).toContain('min-h-[44px]');
  });

  it('E2E mock analytics summary passes contract validation', () => {
    const result = validateEvaluationsAnalyticsSummaryResponse(buildMockAnalyticsSummary());
    expect(result.ok).toBe(true);
  });
});
