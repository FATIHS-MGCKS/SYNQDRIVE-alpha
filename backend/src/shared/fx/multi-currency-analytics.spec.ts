import { createAnalyticsFxContext } from '@synq/fx/fx.analytics-resolver';
import { convertMinorCrossCurrency, convertMinorForReporting } from '@synq/fx/fx.convert';
import { createReferenceFxRateProvider, MemoryFxRateProvider } from '@synq/fx/fx.provider';
import { computeRevenueCashflowContribution } from '@synq/finance/revenue-cashflow-contribution';
import type { FinanceInvoiceRow } from '@synq/finance/revenue-cashflow-contribution.contract';
import { computeReceivablesAnalytics } from '@synq/receivables/receivables-analytics';

const FROM = new Date('2026-06-01T00:00:00.000Z');
const TO = new Date('2026-06-30T23:59:59.999Z');

function inv(overrides: Partial<FinanceInvoiceRow> & { id: string }): FinanceInvoiceRow {
  return {
    type: 'OUTGOING_BOOKING',
    status: 'SENT',
    totalCents: 10_000,
    subtotalCents: 8_400,
    taxCents: 1_600,
    paidCents: 0,
    currency: 'EUR',
    invoiceDate: '2026-06-10',
    paidAt: null,
    createdAt: '2026-06-10',
    ...overrides,
  };
}

describe('multi-currency analytics', () => {
  it('EUR-only org aggregates without conversion', () => {
    const result = computeRevenueCashflowContribution({
      invoices: [inv({ id: 'eur', totalCents: 5_000 })],
      periodStart: FROM,
      periodEndInclusive: TO,
      reportingCurrency: 'EUR',
    });
    expect(result.metrics.invoicedRevenue.amountMinor).toBe(5_000);
    expect(result.multiCurrency.dataQuality.nativeCount).toBeGreaterThan(0);
    expect(result.multiCurrency.dataQuality.convertedCount).toBe(0);
    expect(result.multiCurrency.completeness).toBe('COMPLETE');
  });

  it('EUR and GBP with FX converts foreign invoice to reporting currency', () => {
    const provider = createReferenceFxRateProvider('2026-06-01');
    const fxContext = createAnalyticsFxContext('EUR', 'platform_default', provider, {
      maxRateAgeDays: 30,
    });
    const result = computeRevenueCashflowContribution({
      invoices: [
        inv({ id: 'eur', totalCents: 1_000 }),
        inv({ id: 'gbp', currency: 'GBP', totalCents: 10_000, subtotalCents: 10_000, taxCents: 0 }),
      ],
      periodStart: FROM,
      periodEndInclusive: TO,
      reportingCurrency: 'EUR',
      fxContext,
    });
    // 1_000 EUR + 10_000 GBP pence (=100 GBP) * 1.17 = 11_700
    expect(result.metrics.invoicedRevenue.amountMinor).toBe(12_700);
    expect(result.multiCurrency.dataQuality.convertedCount).toBeGreaterThan(0);
    expect(result.multiCurrency.completeness).toBe('COMPLETE');
  });

  it('missing FX rate excludes foreign currency and marks PARTIAL', () => {
    const provider = new MemoryFxRateProvider();
    const fxContext = createAnalyticsFxContext('EUR', 'platform_default', provider, {
      maxRateAgeDays: 30,
    });
    const result = computeRevenueCashflowContribution({
      invoices: [
        inv({ id: 'eur', totalCents: 1_000 }),
        inv({ id: 'gbp', currency: 'GBP', totalCents: 10_000, subtotalCents: 10_000, taxCents: 0 }),
      ],
      periodStart: FROM,
      periodEndInclusive: TO,
      reportingCurrency: 'EUR',
      fxContext,
    });
    expect(result.metrics.invoicedRevenue.amountMinor).toBe(1_000);
    expect(result.multiCurrency.dataQuality.missingRateCount).toBeGreaterThan(0);
    expect(result.multiCurrency.completeness).toBe('PARTIAL');
  });

  it('stale FX rate excludes foreign currency', () => {
    const provider = new MemoryFxRateProvider();
    provider.addRate({
      fromCurrency: 'GBP',
      toCurrency: 'EUR',
      rateNumerator: 117,
      rateDenominator: 100,
      effectiveDate: '2026-01-01',
      source: 'test_stale',
    });
    const fxContext = createAnalyticsFxContext('EUR', 'platform_default', provider, {
      maxRateAgeDays: 7,
    });
    const result = computeRevenueCashflowContribution({
      invoices: [
        inv({ id: 'eur', totalCents: 1_000, subtotalCents: 1_000, taxCents: 0 }),
        inv({ id: 'gbp', currency: 'GBP', totalCents: 10_000, subtotalCents: 10_000, taxCents: 0 }),
      ],
      periodStart: FROM,
      periodEndInclusive: TO,
      reportingCurrency: 'EUR',
      fxContext,
    });
    expect(result.metrics.invoicedRevenue.amountMinor).toBe(1_000);
    expect(result.multiCurrency.dataQuality.staleRateCount).toBeGreaterThan(0);
    expect(result.multiCurrency.completeness).toBe('PARTIAL');
  });

  it('JPY zero-decimal currency converts correctly', () => {
    const provider = createReferenceFxRateProvider('2026-06-01');
    const converted = convertMinorCrossCurrency(
      1000,
      'JPY',
      'EUR',
      provider.getRate('JPY', 'EUR', FROM)!,
    );
    // 1000 JPY * 0.0062 EUR = 6.2 EUR = 620 cents
    expect(converted).toBe(620);
  });

  it('BHD three-decimal currency converts correctly', () => {
    const provider = createReferenceFxRateProvider('2026-06-01');
    const converted = convertMinorCrossCurrency(
      1000,
      'BHD',
      'EUR',
      provider.getRate('BHD', 'EUR', FROM)!,
    );
    // 1 BHD (1000 fils) * 2.45 EUR = 245 cents
    expect(converted).toBe(245);
  });

  it('foreign currency credit note reduces period revenue in reporting currency', () => {
    const provider = createReferenceFxRateProvider('2026-06-01');
    const fxContext = createAnalyticsFxContext('EUR', 'platform_default', provider, {
      maxRateAgeDays: 30,
    });
    const result = computeRevenueCashflowContribution({
      invoices: [
        inv({ id: 'issued', invoiceDate: '2026-06-04', totalCents: 10_000, subtotalCents: 10_000, taxCents: 0 }),
        inv({
          id: 'credit',
          currency: 'GBP',
          status: 'CREDITED',
          creditedAt: '2026-06-20',
          totalCents: 10_000,
          subtotalCents: 10_000,
          taxCents: 0,
        }),
      ],
      periodStart: FROM,
      periodEndInclusive: TO,
      reportingCurrency: 'EUR',
      fxContext,
    });
    // Credit 100 GBP = 11_700 EUR cents → period net floored at 0
    expect(result.metrics.periodRevenue.netAmountMinor).toBe(0);
  });

  it('missing document currency is never treated as EUR', () => {
    const result = computeRevenueCashflowContribution({
      invoices: [
        inv({ id: 'eur', totalCents: 1_000, subtotalCents: 1_000, taxCents: 0 }),
        inv({ id: 'no-currency', currency: null, totalCents: 5_000 }),
      ],
      periodStart: FROM,
      periodEndInclusive: TO,
      reportingCurrency: 'EUR',
    });
    expect(result.metrics.invoicedRevenue.amountMinor).toBe(1_000);
    expect(result.multiCurrency.dataQuality.missingCurrencyCount).toBe(1);
    expect(result.multiCurrency.completeness).toBe('PARTIAL');
  });

  it('receivables analytics converts GBP open balance to EUR', () => {
    const provider = createReferenceFxRateProvider('2026-06-01');
    const fxContext = createAnalyticsFxContext('EUR', 'platform_default', provider, {
      maxRateAgeDays: 30,
    });
    const result = computeReceivablesAnalytics({
      invoices: [
        {
          id: 'gbp-open',
          type: 'OUTGOING_BOOKING',
          status: 'SENT',
          totalCents: 10_000,
          outstandingCents: 10_000,
          currency: 'GBP',
          dueDate: '2026-07-01',
        },
      ],
      reference: new Date('2026-06-15'),
      reportingCurrency: 'EUR',
      fxContext,
    });
    expect(result.metrics.openTotal.amountMinor).toBe(11_700);
    expect(result.multiCurrency.dataQuality.convertedCount).toBeGreaterThan(0);
  });

  it('historical rate uses rate on or before transaction date', () => {
    const provider = new MemoryFxRateProvider();
    provider.addRates([
      {
        fromCurrency: 'GBP',
        toCurrency: 'EUR',
        rateNumerator: 110,
        rateDenominator: 100,
        effectiveDate: '2026-05-01',
        source: 'historical_may',
      },
      {
        fromCurrency: 'GBP',
        toCurrency: 'EUR',
        rateNumerator: 117,
        rateDenominator: 100,
        effectiveDate: '2026-06-15',
        source: 'historical_june',
      },
    ]);
    const mayConversion = convertMinorForReporting(
      10_000,
      'GBP',
      new Date('2026-06-10'),
      createAnalyticsFxContext('EUR', 'platform_default', provider, { maxRateAgeDays: 60 }),
    );
    const juneConversion = convertMinorForReporting(
      10_000,
      'GBP',
      new Date('2026-06-20'),
      createAnalyticsFxContext('EUR', 'platform_default', provider, { maxRateAgeDays: 60 }),
    );
    expect(mayConversion.convertedAmountMinor).toBe(11_000);
    expect(juneConversion.convertedAmountMinor).toBe(11_700);
  });
});
