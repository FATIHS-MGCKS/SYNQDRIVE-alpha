import type { Money } from './money.contract';
import { majorUnitsNumberToMinor, moneyFromMinor } from './money.util';

/** Canonical insight metric field names (Prompt 10). */
export const INSIGHT_MONEY_FIELDS = {
  lostRevenueAmountMinor: 'lostRevenueAmountMinor',
  lostRevenueCurrency: 'lostRevenueCurrency',
  financialImpactAmountMinor: 'financialImpactAmountMinor',
  financialImpactCurrency: 'financialImpactCurrency',
  dailyRateAmountMinor: 'dailyRateAmountMinor',
  dailyRateCurrency: 'dailyRateCurrency',
} as const;

/** @deprecated Prompt 10 — whole major EUR; use lostRevenueAmountMinor + lostRevenueCurrency */
export const LEGACY_INSIGHT_MONEY_FIELDS = {
  lostRevenueEur: 'lostRevenueEur',
  financialImpactCents: 'financialImpactCents',
  dailyRateEur: 'dailyRateEur',
} as const;

export type InsightMoneyMigrationIssueCode =
  | 'CONFLICTING_CANONICAL_AND_LEGACY'
  | 'AMBIGUOUS_LOST_REVENUE_UNIT'
  | 'NON_INTEGER_MINOR'
  | 'INVALID_CURRENCY';

export interface InsightMoneyMigrationIssue {
  code: InsightMoneyMigrationIssueCode;
  field: string;
  message: string;
  legacyValue?: number;
  canonicalValue?: number;
}

export interface InsightMoneyMigrationResult {
  metrics: Record<string, unknown>;
  changed: boolean;
  issues: InsightMoneyMigrationIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function readInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value)) return null;
  return value;
}

function readCurrency(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length === 3) {
    return value.trim().toUpperCase();
  }
  return fallback;
}

export function readCanonicalMoneyPair(
  metrics: Record<string, unknown> | null | undefined,
  amountKey: string,
  currencyKey: string,
  defaultCurrency = 'EUR',
): Money | null {
  if (!metrics) return null;
  const amountMinor = readInteger(metrics[amountKey]);
  if (amountMinor == null) return null;
  return moneyFromMinor(amountMinor, readCurrency(metrics[currencyKey], defaultCurrency));
}

export function buildMoneyMetricFields(
  amountKey: string,
  currencyKey: string,
  money: Money,
): Record<string, unknown> {
  return {
    [amountKey]: money.amountMinor,
    [currencyKey]: money.currency,
  };
}

export function buildLostRevenueMetrics(
  amountMinor: number,
  currency: string,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  const money = moneyFromMinor(amountMinor, currency);
  return {
    ...extras,
    ...buildMoneyMetricFields(
      INSIGHT_MONEY_FIELDS.lostRevenueAmountMinor,
      INSIGHT_MONEY_FIELDS.lostRevenueCurrency,
      money,
    ),
  };
}

export function buildFinancialImpactMetrics(
  amountMinor: number,
  currency: string,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  const money = moneyFromMinor(amountMinor, currency);
  return {
    ...extras,
    ...buildMoneyMetricFields(
      INSIGHT_MONEY_FIELDS.financialImpactAmountMinor,
      INSIGHT_MONEY_FIELDS.financialImpactCurrency,
      money,
    ),
  };
}

export function buildDailyRateMetrics(
  amountMinor: number,
  currency: string,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  const money = moneyFromMinor(amountMinor, currency);
  return {
    ...extras,
    ...buildMoneyMetricFields(
      INSIGHT_MONEY_FIELDS.dailyRateAmountMinor,
      INSIGHT_MONEY_FIELDS.dailyRateCurrency,
      money,
    ),
  };
}

/**
 * Resolve lost revenue from canonical fields first, then verified legacy `lostRevenueEur` (whole major EUR).
 */
export function resolveInsightLostRevenueMoney(
  metrics: Record<string, unknown> | null | undefined,
  defaultCurrency = 'EUR',
): Money | null {
  const canonical = readCanonicalMoneyPair(
    metrics,
    INSIGHT_MONEY_FIELDS.lostRevenueAmountMinor,
    INSIGHT_MONEY_FIELDS.lostRevenueCurrency,
    defaultCurrency,
  );
  if (canonical) return canonical;

  const lostRevenueEur = metrics?.[LEGACY_INSIGHT_MONEY_FIELDS.lostRevenueEur];
  if (typeof lostRevenueEur === 'number' && Number.isFinite(lostRevenueEur)) {
    return moneyFromMinor(majorUnitsNumberToMinor(lostRevenueEur, defaultCurrency), defaultCurrency);
  }
  return null;
}

/**
 * Resolve booking financial impact — canonical first, then legacy `financialImpactCents` (minor EUR).
 */
export function resolveInsightFinancialImpactMoney(
  metrics: Record<string, unknown> | null | undefined,
  defaultCurrency = 'EUR',
): Money | null {
  const canonical = readCanonicalMoneyPair(
    metrics,
    INSIGHT_MONEY_FIELDS.financialImpactAmountMinor,
    INSIGHT_MONEY_FIELDS.financialImpactCurrency,
    defaultCurrency,
  );
  if (canonical) return canonical;

  const financialImpactCents = metrics?.[LEGACY_INSIGHT_MONEY_FIELDS.financialImpactCents];
  if (typeof financialImpactCents === 'number' && Number.isFinite(financialImpactCents)) {
    return moneyFromMinor(Math.trunc(financialImpactCents), defaultCurrency);
  }
  return null;
}

/** Combined financial exposure for cockpit aggregation (impact OR lost revenue, not both). */
export function resolveInsightFinancialExposureMoney(
  metrics: Record<string, unknown> | null | undefined,
  defaultCurrency = 'EUR',
): Money | null {
  return (
    resolveInsightFinancialImpactMoney(metrics, defaultCurrency) ??
    resolveInsightLostRevenueMoney(metrics, defaultCurrency)
  );
}

function lostRevenueLegacyToCanonical(
  lostRevenueEur: number,
  currency: string,
): { amountMinor: number; currency: string } {
  return {
    amountMinor: majorUnitsNumberToMinor(lostRevenueEur, currency),
    currency,
  };
}

function financialImpactLegacyToCanonical(
  financialImpactCents: number,
  currency: string,
): { amountMinor: number; currency: string } {
  const minor = Math.trunc(financialImpactCents);
  if (!Number.isInteger(financialImpactCents)) {
    throw new Error('financialImpactCents must be integer minor units');
  }
  return { amountMinor: minor, currency };
}

/**
 * Migrate one insight metrics JSON object to canonical money fields.
 * Does not silently change ambiguous rows — reports issues instead.
 */
export function migrateInsightMetricsMoneyFields(
  raw: unknown,
  options: { defaultCurrency?: string; stripLegacy?: boolean } = {},
): InsightMoneyMigrationResult {
  const defaultCurrency = options.defaultCurrency ?? 'EUR';
  const issues: InsightMoneyMigrationIssue[] = [];
  if (!isRecord(raw)) {
    return { metrics: {}, changed: false, issues };
  }

  const metrics: Record<string, unknown> = { ...raw };
  let changed = false;

  const applyPair = (
    amountKey: string,
    currencyKey: string,
    next: { amountMinor: number; currency: string },
    legacyKeys: string[],
  ) => {
    const existingMinor = readInteger(metrics[amountKey]);
    const existingCurrency = readCurrency(metrics[currencyKey], defaultCurrency);
    if (existingMinor != null) {
      if (existingMinor !== next.amountMinor || existingCurrency !== next.currency) {
        issues.push({
          code: 'CONFLICTING_CANONICAL_AND_LEGACY',
          field: amountKey,
          message: `Canonical ${amountKey} already set and differs from legacy-derived value`,
          canonicalValue: existingMinor,
          legacyValue: next.amountMinor,
        });
      }
      return;
    }
    metrics[amountKey] = next.amountMinor;
    metrics[currencyKey] = next.currency;
    changed = true;
    if (options.stripLegacy) {
      for (const key of legacyKeys) {
        if (key in metrics) {
          delete metrics[key];
          changed = true;
        }
      }
    }
  };

  const lostRevenueEur = metrics[LEGACY_INSIGHT_MONEY_FIELDS.lostRevenueEur];
  if (typeof lostRevenueEur === 'number' && Number.isFinite(lostRevenueEur)) {
    applyPair(
      INSIGHT_MONEY_FIELDS.lostRevenueAmountMinor,
      INSIGHT_MONEY_FIELDS.lostRevenueCurrency,
      lostRevenueLegacyToCanonical(lostRevenueEur, defaultCurrency),
      [LEGACY_INSIGHT_MONEY_FIELDS.lostRevenueEur],
    );
  }

  const financialImpactCents = metrics[LEGACY_INSIGHT_MONEY_FIELDS.financialImpactCents];
  if (typeof financialImpactCents === 'number' && Number.isFinite(financialImpactCents)) {
    if (!Number.isInteger(financialImpactCents)) {
      issues.push({
        code: 'NON_INTEGER_MINOR',
        field: LEGACY_INSIGHT_MONEY_FIELDS.financialImpactCents,
        message: 'financialImpactCents is not an integer — manual review required',
        legacyValue: financialImpactCents,
      });
    } else {
      applyPair(
        INSIGHT_MONEY_FIELDS.financialImpactAmountMinor,
        INSIGHT_MONEY_FIELDS.financialImpactCurrency,
        financialImpactLegacyToCanonical(financialImpactCents, defaultCurrency),
        [LEGACY_INSIGHT_MONEY_FIELDS.financialImpactCents],
      );
    }
  }

  const dailyRateEur = metrics[LEGACY_INSIGHT_MONEY_FIELDS.dailyRateEur];
  if (typeof dailyRateEur === 'number' && Number.isFinite(dailyRateEur)) {
    applyPair(
      INSIGHT_MONEY_FIELDS.dailyRateAmountMinor,
      INSIGHT_MONEY_FIELDS.dailyRateCurrency,
      lostRevenueLegacyToCanonical(dailyRateEur, defaultCurrency),
      [LEGACY_INSIGHT_MONEY_FIELDS.dailyRateEur],
    );
  }

  return { metrics, changed, issues };
}
