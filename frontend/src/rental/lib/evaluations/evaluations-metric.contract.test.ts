import { describe, expect, it } from 'vitest';
import {
  BUSINESS_PULSE_TO_EVALUATIONS_METRIC,
  FINANCIAL_INSIGHTS_REGISTRY_METRIC_IDS,
  resolveLegacyEvaluationsMetricId,
} from './evaluations-metric.contract';

describe('evaluations metric contract (shared)', () => {
  it('maps business pulse legacy ids to canonical registry ids', () => {
    expect(resolveLegacyEvaluationsMetricId('revenue')).toBe('fin.mtd_issued_revenue');
    expect(resolveLegacyEvaluationsMetricId('profit')).toBe('fin.mtd_net_result');
    expect(BUSINESS_PULSE_TO_EVALUATIONS_METRIC['open-receivables']).toBe(
      FINANCIAL_INSIGHTS_REGISTRY_METRIC_IDS.openReceivables,
    );
  });

  it('exposes stable financial insights registry constants', () => {
    expect(FINANCIAL_INSIGHTS_REGISTRY_METRIC_IDS.mtdNetResult).toBe('fin.mtd_net_result');
  });
});
