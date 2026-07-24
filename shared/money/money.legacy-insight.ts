import { minorToWholeMajorUnits } from './money.util';
import type { Money } from './money.contract';
import {
  resolveInsightFinancialExposureMoney,
  resolveInsightFinancialImpactMoney,
  resolveInsightLostRevenueMoney,
} from './money-insight-metrics';

/** @deprecated Use resolveInsightFinancialExposureMoney */
export const resolveLegacyInsightFinancialImpact = resolveInsightFinancialExposureMoney;

export { resolveInsightFinancialExposureMoney, resolveInsightFinancialImpactMoney, resolveInsightLostRevenueMoney };

/** Whole major units for legacy cockpit badges — prefer Money + formatMoneyMinor. */
export function legacyInsightFinancialImpactWholeMajor(
  metrics: Record<string, unknown> | null | undefined,
  defaultCurrency = 'EUR',
): number | null {
  const money = resolveInsightFinancialExposureMoney(metrics, defaultCurrency);
  if (!money) return null;
  return minorToWholeMajorUnits(money.amountMinor, money.currency);
}

export function insightLostRevenueWholeMajor(
  metrics: Record<string, unknown> | null | undefined,
  defaultCurrency = 'EUR',
): number | null {
  const money = resolveInsightLostRevenueMoney(metrics, defaultCurrency);
  if (!money) return null;
  return minorToWholeMajorUnits(money.amountMinor, money.currency);
}

export function formatInsightMoneyWholeMajor(money: Money): number {
  return minorToWholeMajorUnits(money.amountMinor, money.currency);
}
