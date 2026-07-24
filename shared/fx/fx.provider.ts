import type { FxRateProvider, FxRateQuote } from './fx.contract';
import { toDateOnlyString } from './fx.convert';

type RateKey = string;

function rateKey(from: string, to: string, effectiveDate: string): RateKey {
  return `${from.toUpperCase()}:${to.toUpperCase()}:${effectiveDate}`;
}

/**
 * In-memory FX provider keyed by from/to/effectiveDate.
 * Selects the latest rate on or before `asOf` (historical analytics).
 */
export class MemoryFxRateProvider implements FxRateProvider {
  private readonly rates = new Map<RateKey, FxRateQuote>();

  addRate(quote: FxRateQuote): void {
    const normalized: FxRateQuote = {
      ...quote,
      fromCurrency: quote.fromCurrency.toUpperCase(),
      toCurrency: quote.toCurrency.toUpperCase(),
    };
    this.rates.set(
      rateKey(normalized.fromCurrency, normalized.toCurrency, normalized.effectiveDate),
      normalized,
    );
  }

  addRates(quotes: FxRateQuote[]): void {
    for (const quote of quotes) this.addRate(quote);
  }

  getRate(fromCurrency: string, toCurrency: string, asOf: Date): FxRateQuote | null {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();
    if (from === to) {
      return {
        fromCurrency: from,
        toCurrency: to,
        rateNumerator: 1,
        rateDenominator: 1,
        effectiveDate: toDateOnlyString(asOf),
        source: 'identity',
      };
    }

    const asOfDate = toDateOnlyString(asOf);
    let best: FxRateQuote | null = null;

    for (const quote of this.rates.values()) {
      if (quote.fromCurrency !== from || quote.toCurrency !== to) continue;
      if (quote.effectiveDate > asOfDate) continue;
      if (!best || quote.effectiveDate > best.effectiveDate) {
        best = quote;
      }
    }

    return best;
  }
}

/** Static reference rates for development and tests (not live market data). */
export function createReferenceFxRateProvider(referenceDate = '2026-06-01'): MemoryFxRateProvider {
  const provider = new MemoryFxRateProvider();
  provider.addRates([
    { fromCurrency: 'GBP', toCurrency: 'EUR', rateNumerator: 117, rateDenominator: 100, effectiveDate: referenceDate, source: 'reference_static' },
    { fromCurrency: 'USD', toCurrency: 'EUR', rateNumerator: 92, rateDenominator: 100, effectiveDate: referenceDate, source: 'reference_static' },
    { fromCurrency: 'CHF', toCurrency: 'EUR', rateNumerator: 105, rateDenominator: 100, effectiveDate: referenceDate, source: 'reference_static' },
    { fromCurrency: 'JPY', toCurrency: 'EUR', rateNumerator: 62, rateDenominator: 10000, effectiveDate: referenceDate, source: 'reference_static' },
    { fromCurrency: 'BHD', toCurrency: 'EUR', rateNumerator: 245, rateDenominator: 100, effectiveDate: referenceDate, source: 'reference_static' },
    { fromCurrency: 'PLN', toCurrency: 'EUR', rateNumerator: 23, rateDenominator: 100, effectiveDate: referenceDate, source: 'reference_static' },
    { fromCurrency: 'EUR', toCurrency: 'GBP', rateNumerator: 85, rateDenominator: 100, effectiveDate: referenceDate, source: 'reference_static' },
    { fromCurrency: 'EUR', toCurrency: 'USD', rateNumerator: 109, rateDenominator: 100, effectiveDate: referenceDate, source: 'reference_static' },
  ]);
  return provider;
}
