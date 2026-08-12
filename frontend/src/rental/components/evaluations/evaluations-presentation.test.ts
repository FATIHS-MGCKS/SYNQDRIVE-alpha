import { describe, expect, it } from 'vitest';
import {
  statusTone,
  statusLabelKey,
  canShowMetricValue,
  readNumericMetricForDisplay,
  costCategoryLabelKey,
  EVALUATIONS_FINANCE_KPI_LABEL,
} from './evaluations-presentation';
import { deriveSectionAsync } from './evaluations-section-derive';
import type { EvaluationsAsyncResult } from '../../lib/evaluations/evaluations-request';
import type {
  EvaluationsAnalyticsInsightsSummary,
  EvaluationsMetricResponse,
} from '../../lib/evaluations/evaluations-canonical.types';

describe('E6B presentation adapters (display-only, status-preserving)', () => {
  it('maps canonical status to tone without upgrading meaning', () => {
    expect(statusTone('AVAILABLE')).toBe('positive');
    expect(statusTone('PARTIAL')).toBe('warning');
    expect(statusTone('STALE')).toBe('watch');
    expect(statusTone('ERROR')).toBe('critical');
    expect(statusTone('UNAVAILABLE')).toBe('neutral');
    expect(statusTone('NOT_APPLICABLE')).toBe('neutral');
  });

  it('only AVAILABLE/PARTIAL/STALE are value-bearing (UNAVAILABLE/ERROR/N_A are not)', () => {
    expect(canShowMetricValue('AVAILABLE')).toBe(true);
    expect(canShowMetricValue('PARTIAL')).toBe(true);
    expect(canShowMetricValue('STALE')).toBe(true);
    expect(canShowMetricValue('UNAVAILABLE')).toBe(false);
    expect(canShowMetricValue('ERROR')).toBe(false);
    expect(canShowMetricValue('NOT_APPLICABLE')).toBe(false);
  });

  it('readNumericMetricForDisplay preserves real zero vs null (never ?? 0)', () => {
    const zero = { status: 'AVAILABLE', value: 0 } as unknown as EvaluationsMetricResponse;
    const unavail = { status: 'UNAVAILABLE', value: null } as unknown as EvaluationsMetricResponse;
    expect(readNumericMetricForDisplay(zero)).toEqual({ value: 0, status: 'AVAILABLE' });
    // No-value status → value null (not coerced to 0).
    expect(readNumericMetricForDisplay(unavail)).toEqual({ value: null, status: 'UNAVAILABLE' });
    expect(readNumericMetricForDisplay(null)).toBeNull();
  });

  it('status/label + category/finance label keys are canonical', () => {
    expect(statusLabelKey('PARTIAL')).toBe('evaluations.status.PARTIAL');
    expect(costCategoryLabelKey('OPERATING_EXPENSES')).toBe('evaluations.cost.category.OPERATING_EXPENSES');
    expect(EVALUATIONS_FINANCE_KPI_LABEL['fin.mtd_issued_revenue']).toBe('evaluations.kpi.issuedRevenue');
  });
});

describe('E6B deriveSectionAsync (single shared summary request; no duplication)', () => {
  const settledAvailable = (): EvaluationsAsyncResult<EvaluationsAnalyticsInsightsSummary> => ({
    phase: 'SETTLED',
    result: {
      state: 'AVAILABLE',
      data: { sections: { utilization: { status: 'PARTIAL' } } } as unknown as EvaluationsAnalyticsInsightsSummary,
    },
  });

  it('derives a section slice when the summary is AVAILABLE', () => {
    const util = deriveSectionAsync(settledAvailable(), (s) => s.sections.utilization);
    expect(util.phase).toBe('SETTLED');
    if (util.phase === 'SETTLED' && util.result.state === 'AVAILABLE') {
      expect(util.result.data.status).toBe('PARTIAL');
    }
  });

  it('passes IDLE/LOADING through unchanged', () => {
    expect(deriveSectionAsync({ phase: 'IDLE' }, (s) => s).phase).toBe('IDLE');
    expect(deriveSectionAsync({ phase: 'LOADING' }, (s) => s).phase).toBe('LOADING');
  });

  it('passes a non-AVAILABLE transport result through (NOT_FOUND stays NOT_FOUND)', () => {
    const nf: EvaluationsAsyncResult<EvaluationsAnalyticsInsightsSummary> = {
      phase: 'SETTLED',
      result: { state: 'NOT_FOUND' },
    };
    const derived = deriveSectionAsync(nf, (s) => s.sections.costModel);
    expect(derived.phase).toBe('SETTLED');
    if (derived.phase === 'SETTLED') expect(derived.result.state).toBe('NOT_FOUND');
  });
});
