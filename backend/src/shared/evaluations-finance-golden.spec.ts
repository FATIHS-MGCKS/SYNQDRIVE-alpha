import { createAnalyticsFxContext } from '@synq/fx/fx.analytics-resolver';
import { createReferenceFxRateProvider } from '@synq/fx/fx.provider';
import { computeRevenueCashflowContribution } from '@synq/finance/revenue-cashflow-contribution';
import { computeReceivablesAnalytics } from '@synq/receivables/receivables-analytics';
import {
  ALL_GOLDEN_ORGANIZATIONS,
  GOLDEN_MTD_END,
  GOLDEN_MTD_START,
  GOLDEN_ORG_ALPHA,
  GOLDEN_ORG_BETA,
  GOLDEN_ORG_DELTA,
  GOLDEN_ORG_EPSILON,
  GOLDEN_ORG_GAMMA,
  GOLDEN_REFERENCE,
} from '@synq/evaluations-fixtures/finance-golden-organizations';

function fxContextFor(reportingCurrency: string) {
  return createAnalyticsFxContext(
    reportingCurrency,
    'platform_default',
    createReferenceFxRateProvider('2026-06-01'),
    { maxRateAgeDays: 30 },
  );
}

describe('finance golden organizations (Prompt 14)', () => {
  it.each(ALL_GOLDEN_ORGANIZATIONS.map((org) => [org.id, org] as const))(
    '%s revenue/cashflow matches documented expectations',
    (_id, org) => {
      const fxContext = fxContextFor(org.reportingCurrency);
      const result = computeRevenueCashflowContribution({
        invoices: org.invoices,
        periodStart: GOLDEN_MTD_START,
        periodEndInclusive: GOLDEN_MTD_END,
        timezone: org.timezone,
        reportingCurrency: org.reportingCurrency,
        fxContext,
      });

      const exp = org.expected as Record<string, unknown>;

      if (typeof exp.periodRevenueNetMinor === 'number') {
        expect(result.metrics.periodRevenue.netAmountMinor).toBe(exp.periodRevenueNetMinor);
      }
      if (typeof exp.invoicedRevenueGrossMinor === 'number') {
        expect(result.metrics.invoicedRevenue.amountMinor).toBe(exp.invoicedRevenueGrossMinor);
      }
      if (typeof exp.paymentReceiptsMinor === 'number') {
        expect(result.metrics.paymentReceipts.amountMinor).toBe(exp.paymentReceiptsMinor);
      }
      if (typeof exp.operatingExpensesMinor === 'number') {
        expect(result.metrics.operatingExpenses.amountMinor).toBe(exp.operatingExpensesMinor);
      }
      if (typeof exp.refundsGrossMinor === 'number') {
        expect(result.metrics.refunds.amountMinor).toBe(exp.refundsGrossMinor);
      }
      if (typeof exp.operatingResultVisible === 'boolean') {
        expect(result.completeness.operatingResultVisible).toBe(exp.operatingResultVisible);
      }
      if (exp.multiCurrencyCompleteness) {
        expect(result.multiCurrency.completeness).toBe(exp.multiCurrencyCompleteness);
      }
      if (typeof exp.missingCurrencyCount === 'number') {
        expect(result.multiCurrency.dataQuality.missingCurrencyCount).toBe(exp.missingCurrencyCount);
      }
      if (typeof exp.missingRateCountMin === 'number') {
        expect(result.multiCurrency.dataQuality.missingRateCount).toBeGreaterThanOrEqual(
          exp.missingRateCountMin,
        );
      }
      if (typeof exp.convertedCountMin === 'number') {
        expect(result.multiCurrency.dataQuality.convertedCount).toBeGreaterThanOrEqual(
          exp.convertedCountMin,
        );
      }

      // Invariants — never silently mix or fake completeness
      expect(result.metrics.periodRevenue.currency).toBe(org.reportingCurrency);
      if (result.completeness.operatingResultVisible) {
        expect(result.metrics.operatingResult).not.toBeNull();
      } else {
        expect(result.metrics.operatingResult).toBeNull();
      }
    },
  );

  it('Org Alpha receivables aging matches golden expectations', () => {
    const receivables = computeReceivablesAnalytics({
      invoices: GOLDEN_ORG_ALPHA.invoices,
      reference: GOLDEN_REFERENCE,
      timezone: GOLDEN_ORG_ALPHA.timezone,
      reportingCurrency: GOLDEN_ORG_ALPHA.reportingCurrency,
      fxContext: fxContextFor(GOLDEN_ORG_ALPHA.reportingCurrency),
    });
    expect(receivables.metrics.openTotal.amountMinor).toBe(
      GOLDEN_ORG_ALPHA.expected.openReceivablesMinor,
    );
    expect(receivables.metrics.overdue.amountMinor).toBe(
      GOLDEN_ORG_ALPHA.expected.overdueReceivablesMinor,
    );
  });

  it('Org Gamma partial payment outstanding is not counted as paid', () => {
    const receivables = computeReceivablesAnalytics({
      invoices: GOLDEN_ORG_GAMMA.invoices,
      reference: GOLDEN_REFERENCE,
      timezone: GOLDEN_ORG_GAMMA.timezone,
      reportingCurrency: GOLDEN_ORG_GAMMA.reportingCurrency,
    });
    expect(receivables.metrics.openTotal.amountMinor).toBe(
      GOLDEN_ORG_GAMMA.expected.partialPaymentOutstandingMinor,
    );
    expect(receivables.metrics.partiallyPaid.invoiceCount).toBe(1);
  });

  it('Org Beta never sums GBP natively into EUR totals without conversion', () => {
    const withoutFx = computeRevenueCashflowContribution({
      invoices: GOLDEN_ORG_BETA.invoices,
      periodStart: GOLDEN_MTD_START,
      periodEndInclusive: GOLDEN_MTD_END,
      timezone: GOLDEN_ORG_BETA.timezone,
      reportingCurrency: 'EUR',
    });
    expect(withoutFx.metrics.periodRevenue.netAmountMinor).toBe(10_000);

    const withFx = computeRevenueCashflowContribution({
      invoices: GOLDEN_ORG_BETA.invoices,
      periodStart: GOLDEN_MTD_START,
      periodEndInclusive: GOLDEN_MTD_END,
      timezone: GOLDEN_ORG_BETA.timezone,
      reportingCurrency: 'EUR',
      fxContext: fxContextFor('EUR'),
    });
    expect(withFx.metrics.periodRevenue.netAmountMinor).toBe(21_700);
  });

  it('Org Epsilon marks PARTIAL when FX rate missing for CHF', () => {
    const provider = createReferenceFxRateProvider('2026-06-01');
    const fxContext = createAnalyticsFxContext('EUR', 'platform_default', provider, {
      maxRateAgeDays: 30,
    });
    const result = computeRevenueCashflowContribution({
      invoices: GOLDEN_ORG_EPSILON.invoices,
      periodStart: GOLDEN_MTD_START,
      periodEndInclusive: GOLDEN_MTD_END,
      timezone: GOLDEN_ORG_EPSILON.timezone,
      reportingCurrency: 'EUR',
      fxContext,
    });
    expect(result.multiCurrency.completeness).toBe('PARTIAL');
    expect(result.metrics.periodRevenue.netAmountMinor).toBe(5_000);
  });

  it('Org Delta period revenue reflects credit adjustment only', () => {
    const result = computeRevenueCashflowContribution({
      invoices: GOLDEN_ORG_DELTA.invoices,
      periodStart: GOLDEN_MTD_START,
      periodEndInclusive: GOLDEN_MTD_END,
      timezone: GOLDEN_ORG_DELTA.timezone,
      reportingCurrency: 'EUR',
    });
    expect(result.metrics.periodRevenue.netAmountMinor).toBe(12_000);
    expect(result.metrics.refunds.amountMinor).toBe(3_000);
  });
});
