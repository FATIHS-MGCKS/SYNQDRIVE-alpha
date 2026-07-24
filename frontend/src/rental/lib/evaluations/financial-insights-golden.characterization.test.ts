import { describe, expect, it } from 'vitest';
import { createAnalyticsFxContext, createReferenceFxRateProvider } from '@synq/fx';
import {
  computeReceivablesAnalytics,
  computeRevenueCashflowContribution,
} from '../financial-insights.logic';
import {
  GOLDEN_ORG_ALPHA,
  GOLDEN_ORG_BETA,
  GOLDEN_MTD_END,
  GOLDEN_MTD_START,
  GOLDEN_REFERENCE,
} from './evaluations-finance-golden-fixtures';

describe('financial insights golden characterization (Prompt 14)', () => {
  const fxContext = createAnalyticsFxContext(
    'EUR',
    'platform_default',
    createReferenceFxRateProvider('2026-06-01'),
    { maxRateAgeDays: 30 },
  );

  it('Org Alpha client compute matches golden period revenue', () => {
    const result = computeRevenueCashflowContribution({
      invoices: GOLDEN_ORG_ALPHA.invoices,
      periodStart: GOLDEN_MTD_START,
      periodEndInclusive: GOLDEN_MTD_END,
      timezone: GOLDEN_ORG_ALPHA.timezone,
      reportingCurrency: 'EUR',
      fxContext,
    });
    expect(result.metrics.periodRevenue.netAmountMinor).toBe(
      GOLDEN_ORG_ALPHA.expected.periodRevenueNetMinor,
    );
    expect(result.completeness.operatingResultVisible).toBe(true);
  });

  it('Org Beta FX converts GBP — not silently excluded', () => {
    const result = computeRevenueCashflowContribution({
      invoices: GOLDEN_ORG_BETA.invoices,
      periodStart: GOLDEN_MTD_START,
      periodEndInclusive: GOLDEN_MTD_END,
      timezone: GOLDEN_ORG_BETA.timezone,
      reportingCurrency: 'EUR',
      fxContext,
    });
    expect(result.metrics.periodRevenue.netAmountMinor).toBe(21_700);
    expect(result.multiCurrency.dataQuality.convertedCount).toBeGreaterThan(0);
  });

  it('receivables open total uses outstanding not totalCents', () => {
    const receivables = computeReceivablesAnalytics({
      invoices: GOLDEN_ORG_ALPHA.invoices,
      reference: GOLDEN_REFERENCE,
      timezone: GOLDEN_ORG_ALPHA.timezone,
      reportingCurrency: 'EUR',
      fxContext,
    });
    expect(receivables.metrics.openTotal.amountMinor).toBe(20_000);
  });

  it('never reports operating result when cost basis incomplete', () => {
    const result = computeRevenueCashflowContribution({
      invoices: [GOLDEN_ORG_ALPHA.invoices[0]!],
      periodStart: GOLDEN_MTD_START,
      periodEndInclusive: GOLDEN_MTD_END,
      timezone: GOLDEN_ORG_ALPHA.timezone,
      reportingCurrency: 'EUR',
    });
    expect(result.completeness.operatingResultVisible).toBe(false);
    expect(result.metrics.operatingResult).toBeNull();
  });
});
