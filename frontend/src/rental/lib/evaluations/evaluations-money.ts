import type { Money } from '@synq/money/money.contract';
import { formatMoneyMinor } from '@synq/money/money.format';
import { addMoney, minorToMajorDisplayValue, moneyFromMinor, sumMoney, zeroMoney } from '@synq/money/money.util';

import type { DashboardInsight } from '../../DashboardInsightsContext';
import { financialImpactMoney } from '../insights-categories';

const DEFAULT_EVALUATIONS_CURRENCY = 'EUR';

/** Resolve cockpit KPI money — accepts canonical Money or deprecated whole-major EUR number. */
export function resolveEvaluationsCockpitMoney(
  money: Money | null | undefined,
  legacyWholeMajorEur?: number,
  currency = DEFAULT_EVALUATIONS_CURRENCY,
): Money {
  if (money) return money;
  if (typeof legacyWholeMajorEur === 'number' && Number.isFinite(legacyWholeMajorEur)) {
    return moneyFromMinor(legacyWholeMajorEur * 100, currency);
  }
  return zeroMoney(currency);
}

export function sumInsightFinancialExposure(
  insights: DashboardInsight[],
  currency = DEFAULT_EVALUATIONS_CURRENCY,
): Money {
  const amounts = insights
    .map((insight) => financialImpactMoney(insight, currency))
    .filter((m): m is Money => m != null);
  if (amounts.length === 0) return zeroMoney(currency);
  return sumMoney(amounts);
}

export function estimatedFinancialRiskMoney(
  baseRisk: Money,
  insights: DashboardInsight[],
): Money {
  const insightTotal = sumInsightFinancialExposure(insights, baseRisk.currency);
  if (insightTotal.amountMinor === 0) return baseRisk;
  return addMoney(baseRisk, insightTotal);
}

export function formatEvaluationsMoneyDisplay(money: Money, locale = 'de-DE'): string {
  return formatMoneyMinor(money.amountMinor, money.currency, locale);
}

/** Display-only major value for chart axes (not business math). */
export function chartMajorFromMinor(amountMinor: number, currency: string): number {
  return minorToMajorDisplayValue(amountMinor, currency);
}
