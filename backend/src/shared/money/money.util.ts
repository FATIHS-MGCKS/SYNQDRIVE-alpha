import { BadRequestException } from '@nestjs/common';

const ISO4217_PATTERN = /^[A-Z]{3}$/;

/** Normalize to uppercase ISO-4217. Throws on missing/invalid codes. */
export function normalizeCurrencyCode(input: string | null | undefined): string {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (!trimmed) {
    throw new BadRequestException({
      message: 'Currency code is required',
      code: 'CURRENCY_REQUIRED',
    });
  }
  const normalized = trimmed.toUpperCase();
  if (!ISO4217_PATTERN.test(normalized)) {
    throw new BadRequestException({
      message: `Invalid currency code: ${input}`,
      code: 'CURRENCY_INVALID',
    });
  }
  return normalized;
}

/** Resolve canonical currency from an active price book row. */
export function resolvePriceBookCurrency(priceBook: { currency?: string | null }): string {
  if (!priceBook?.currency?.trim()) {
    throw new BadRequestException({
      message: 'Active price book has no currency configured',
      code: 'PRICE_BOOK_CURRENCY_MISSING',
    });
  }
  return normalizeCurrencyCode(priceBook.currency);
}

/**
 * Reject client-supplied currency when it does not match server-resolved pricing currency.
 * No FX conversion — mismatch is a hard error.
 */
export function assertClientCurrencyMatches(
  clientCurrency: string | null | undefined,
  resolvedCurrency: string,
): void {
  if (clientCurrency == null || clientCurrency === '') return;
  const client = normalizeCurrencyCode(clientCurrency);
  const resolved = normalizeCurrencyCode(resolvedCurrency);
  if (client !== resolved) {
    throw new BadRequestException({
      message: `Client currency ${client} does not match resolved pricing currency ${resolved}`,
      code: 'CURRENCY_MISMATCH',
      clientCurrency: client,
      resolvedCurrency: resolved,
    });
  }
}

/** Booking legacy column stores lowercase ISO code (existing rows use "eur"). */
export function toBookingCurrencyStorage(code: string): string {
  return normalizeCurrencyCode(code).toLowerCase();
}
