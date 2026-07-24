import { majorUnitsNumberToMinor, minorToWholeMajorUnits, moneyFromMinor } from './money.util';
import type { Money } from './money.contract';

/**
 * Resolve financial impact from legacy insight metric fields.
 * - `financialImpactCents` — minor units (canonical naming, always cents for EUR rows today)
 * - `lostRevenueEur` — legacy whole major EUR units (Prompt 10 migrates to minor + currency)
 *
 * No magnitude heuristics — field name determines unit semantics.
 */
export function resolveLegacyInsightFinancialImpact(
  metrics: Record<string, unknown> | null | undefined,
  defaultCurrency = 'EUR',
): Money | null {
  const financialImpactCents = metrics?.financialImpactCents;
  if (typeof financialImpactCents === 'number' && Number.isFinite(financialImpactCents)) {
    return moneyFromMinor(Math.trunc(financialImpactCents), defaultCurrency);
  }

  const lostRevenueEur = metrics?.lostRevenueEur;
  if (typeof lostRevenueEur === 'number' && Number.isFinite(lostRevenueEur)) {
    return moneyFromMinor(majorUnitsNumberToMinor(lostRevenueEur, defaultCurrency), defaultCurrency);
  }

  return null;
}

/** Whole major units for legacy cockpit badges (`≈ {n} € Risiko`). */
export function legacyInsightFinancialImpactWholeMajor(
  metrics: Record<string, unknown> | null | undefined,
  defaultCurrency = 'EUR',
): number | null {
  const money = resolveLegacyInsightFinancialImpact(metrics, defaultCurrency);
  if (!money) return null;
  return minorToWholeMajorUnits(money.amountMinor, money.currency);
}
