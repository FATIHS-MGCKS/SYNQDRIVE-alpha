import {
  INSIGHT_MONEY_FIELDS,
  LEGACY_INSIGHT_MONEY_FIELDS,
  migrateInsightMetricsMoneyFields,
  resolveInsightFinancialExposureMoney,
  resolveInsightFinancialImpactMoney,
  resolveInsightLostRevenueMoney,
} from '@synq/money/money-insight-metrics';
import { moneyFromMinor } from '@synq/money/money.util';
import type { InsightMoneyMigrationIssue } from '@synq/money/money-insight-metrics';

describe('migrateInsightMetricsMoneyFields', () => {
  it('migrates lostRevenueEur (whole major EUR) to canonical minor + currency', () => {
    const result = migrateInsightMetricsMoneyFields({ lostRevenueEur: 350, idleDays: 7 });
    expect(result.changed).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.metrics.lostRevenueAmountMinor).toBe(35_000);
    expect(result.metrics.lostRevenueCurrency).toBe('EUR');
    expect(result.metrics.lostRevenueEur).toBe(350);
  });

  it('migrates financialImpactCents to canonical minor + currency', () => {
    const result = migrateInsightMetricsMoneyFields({ financialImpactCents: 12_500 });
    expect(result.metrics.financialImpactAmountMinor).toBe(12_500);
    expect(result.metrics.financialImpactCurrency).toBe('EUR');
  });

  it('strips legacy fields when stripLegacy is true', () => {
    const result = migrateInsightMetricsMoneyFields(
      { lostRevenueEur: 100, financialImpactCents: 500 },
      { stripLegacy: true },
    );
    expect(result.metrics.lostRevenueEur).toBeUndefined();
    expect(result.metrics.financialImpactCents).toBeUndefined();
  });

  it('does not overwrite existing canonical values', () => {
    const result = migrateInsightMetricsMoneyFields({
      lostRevenueAmountMinor: 40_000,
      lostRevenueCurrency: 'EUR',
      lostRevenueEur: 350,
    });
    expect(result.changed).toBe(false);
    expect(result.metrics.lostRevenueAmountMinor).toBe(40_000);
  });

  it('reports conflict when canonical and legacy-derived values differ', () => {
    const result = migrateInsightMetricsMoneyFields({
      lostRevenueAmountMinor: 10_000,
      lostRevenueCurrency: 'EUR',
      lostRevenueEur: 350,
    });
    expect(result.issues.some((i: InsightMoneyMigrationIssue) => i.code === 'CONFLICTING_CANONICAL_AND_LEGACY')).toBe(true);
    expect(result.metrics.lostRevenueAmountMinor).toBe(10_000);
  });

  it('reports non-integer financialImpactCents', () => {
    const result = migrateInsightMetricsMoneyFields({ financialImpactCents: 12.5 });
    expect(result.issues.some((i: InsightMoneyMigrationIssue) => i.code === 'NON_INTEGER_MINOR')).toBe(true);
    expect(result.metrics.financialImpactAmountMinor).toBeUndefined();
  });
});

describe('resolveInsight money readers', () => {
  it('prefers canonical lost revenue over legacy', () => {
    const money = resolveInsightLostRevenueMoney({
      lostRevenueAmountMinor: 35_000,
      lostRevenueCurrency: 'EUR',
      lostRevenueEur: 999,
    });
    expect(money).toEqual(moneyFromMinor(35_000, 'EUR'));
  });

  it('reads legacy lostRevenueEur as whole major EUR', () => {
    expect(resolveInsightLostRevenueMoney({ lostRevenueEur: 400 })).toEqual(
      moneyFromMinor(40_000, 'EUR'),
    );
  });

  it('reads canonical financial impact', () => {
    expect(
      resolveInsightFinancialImpactMoney({
        financialImpactAmountMinor: 500,
        financialImpactCurrency: 'EUR',
      }),
    ).toEqual(moneyFromMinor(500, 'EUR'));
  });

  it('exposure prefers financial impact over lost revenue', () => {
    expect(
      resolveInsightFinancialExposureMoney({
        financialImpactAmountMinor: 500,
        financialImpactCurrency: 'EUR',
        lostRevenueAmountMinor: 40_000,
        lostRevenueCurrency: 'EUR',
      }),
    ).toEqual(moneyFromMinor(500, 'EUR'));
  });
});

describe('INSIGHT_MONEY_FIELDS inventory', () => {
  it('documents canonical and legacy field names', () => {
    expect(INSIGHT_MONEY_FIELDS.lostRevenueAmountMinor).toBe('lostRevenueAmountMinor');
    expect(LEGACY_INSIGHT_MONEY_FIELDS.lostRevenueEur).toBe('lostRevenueEur');
  });
});
