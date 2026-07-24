import { describe, expect, it } from 'vitest';
import { moneyFromMinor } from '@synq/money/money.util';

import type { DashboardInsight } from '../../DashboardInsightsContext';
import { financialImpactMoney, partitionInsights } from '../insights-categories';
import {
  estimatedFinancialRiskMoney,
  resolveEvaluationsCockpitMoney,
  sumInsightFinancialExposure,
} from './evaluations-money';
import { buildManyInsights, insight } from './evaluations-test-fixtures';

function computeEstimatedRisk(baseRiskMinor: number, insights: DashboardInsight[]) {
  const { businessRisks, revenueLeakage } = partitionInsights(insights);
  const base = moneyFromMinor(baseRiskMinor, 'EUR');
  return estimatedFinancialRiskMoney(base, [...businessRisks, ...revenueLeakage]);
}

describe('InsightsCockpit KPI aggregation (money domain)', () => {
  it('treats financialRisk Money as overdue receivables base', () => {
    const overdue = moneyFromMinor(25_000, 'EUR');
    const rows = buildManyInsights(2);
    const estimated = computeEstimatedRisk(overdue.amountMinor, rows);
    expect(estimated.amountMinor).toBeGreaterThanOrEqual(25_000);
  });

  it('adds canonical lost revenue from LOW_UTILIZATION insights', () => {
    const leakage = insight({
      id: 'leak',
      type: 'LOW_UTILIZATION',
      severity: 'OPPORTUNITY',
      metrics: {
        lostRevenueAmountMinor: 40_000,
        lostRevenueCurrency: 'EUR',
      },
    });
    const estimated = computeEstimatedRisk(0, [leakage]);
    expect(estimated).toEqual(moneyFromMinor(40_000, 'EUR'));
  });

  it('legacy whole-major EUR props still resolve for compatibility', () => {
    const resolved = resolveEvaluationsCockpitMoney(null, 250);
    expect(resolved).toEqual(moneyFromMinor(25_000, 'EUR'));
  });

  it('sums insight exposure in minor units', () => {
    const rows = [
      insight({
        id: 'a',
        type: 'LOW_UTILIZATION',
        metrics: { lostRevenueAmountMinor: 10_000, lostRevenueCurrency: 'EUR' },
      }),
      insight({
        id: 'b',
        type: 'BATTERY_CRITICAL',
        metrics: { financialImpactAmountMinor: 5_000, financialImpactCurrency: 'EUR', bookingId: 'b1' },
      }),
    ];
    expect(sumInsightFinancialExposure(rows).amountMinor).toBe(15_000);
  });

  it('reads canonical financial impact on insights', () => {
    const row = insight({
      id: 'impact',
      type: 'BATTERY_CRITICAL',
      metrics: { financialImpactAmountMinor: 12_500, financialImpactCurrency: 'EUR', bookingId: 'x' },
    });
    expect(financialImpactMoney(row)?.amountMinor).toBe(12_500);
  });
});
