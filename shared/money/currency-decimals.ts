/**
 * ISO-4217 minor-unit decimal places for supported currencies.
 * Default is 2 when a currency is not listed (common for most fiat currencies).
 */
const ZERO_DECIMAL_CURRENCIES = new Set<string>([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'UYI',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

const THREE_DECIMAL_CURRENCIES = new Set<string>(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

/** Returns the number of decimal places for the currency's standard minor unit. */
export function currencyMinorDecimals(currency: string): number {
  const code = currency.trim().toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

/** Scale factor from minor to major units (10^decimals) — for display only, not business math. */
export function minorUnitScale(currency: string): number {
  const decimals = currencyMinorDecimals(currency);
  if (decimals === 0) return 1;
  if (decimals === 3) return 1000;
  return 100;
}
