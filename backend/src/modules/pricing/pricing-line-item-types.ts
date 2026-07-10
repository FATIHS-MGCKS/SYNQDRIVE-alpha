import { BookingPriceLineItemType } from '@prisma/client';

/** Line items that contribute to taxable rental revenue (net + VAT). */
export const TAXABLE_PRICING_LINE_TYPES: readonly BookingPriceLineItemType[] = [
  'BASE_RENTAL',
  'INSURANCE',
  'EXTRA',
  'MILEAGE_PACKAGE',
  'DISCOUNT',
  'MANUAL_ADJUSTMENT',
  'EXTRA_KM',
] as const;

/** Optional add-ons shown in "Pakete & Extras" — excludes deposit, base rental, tax, discounts. */
export const EXTRAS_SUM_LINE_TYPES: readonly BookingPriceLineItemType[] = [
  'MILEAGE_PACKAGE',
  'INSURANCE',
  'EXTRA',
] as const;

/** Rental charge lines for payment summaries (excludes deposit). */
export const RENTAL_CHARGE_LINE_TYPES: readonly BookingPriceLineItemType[] = [
  'BASE_RENTAL',
  'MILEAGE_PACKAGE',
  'INSURANCE',
  'EXTRA',
  'DISCOUNT',
  'MANUAL_ADJUSTMENT',
  'EXTRA_KM',
] as const;

export function isTaxablePricingLineType(type: BookingPriceLineItemType): boolean {
  return (TAXABLE_PRICING_LINE_TYPES as readonly string[]).includes(type);
}

export function isExtrasSumLineType(type: BookingPriceLineItemType): boolean {
  return (EXTRAS_SUM_LINE_TYPES as readonly string[]).includes(type);
}

export function isRentalChargeLineType(type: BookingPriceLineItemType): boolean {
  return (RENTAL_CHARGE_LINE_TYPES as readonly string[]).includes(type);
}
