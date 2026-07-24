/**
 * Canonical Money domain model — all monetary amounts use integer minor units + ISO-4217 currency.
 * No FX conversion; incompatible currencies must not be combined without an explicit exchange step.
 */
export type Money = {
  /** Integer amount in the currency's minor unit (e.g. cents for EUR, whole yen for JPY). */
  amountMinor: number;
  /** Uppercase ISO-4217 alphabetic currency code (e.g. EUR, USD, JPY). */
  currency: string;
};

export class MoneyDomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MoneyDomainError';
    this.code = code;
  }
}
