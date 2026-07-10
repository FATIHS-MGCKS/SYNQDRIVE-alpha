import type { PricingLineItem } from './pricingTypes';

/** Optional add-ons for "Pakete & Extras" — not deposit, base rental, tax, or discounts. */
export const EXTRAS_SUM_LINE_TYPES = ['MILEAGE_PACKAGE', 'INSURANCE', 'EXTRA'] as const;

/** Rental charge lines for summaries (excludes refundable deposit). */
export const RENTAL_CHARGE_LINE_TYPES = [
  'BASE_RENTAL',
  'MILEAGE_PACKAGE',
  'INSURANCE',
  'EXTRA',
  'DISCOUNT',
  'MANUAL_DISCOUNT',
  'MANUAL_ADJUSTMENT',
  'EXTRA_KM',
] as const;

export type ExtrasSumLineType = (typeof EXTRAS_SUM_LINE_TYPES)[number];
export type RentalChargeLineType = (typeof RENTAL_CHARGE_LINE_TYPES)[number];

export function isExtrasSumLineType(type: string): type is ExtrasSumLineType {
  return (EXTRAS_SUM_LINE_TYPES as readonly string[]).includes(type);
}

export function isRentalChargeLineType(type: string): type is RentalChargeLineType {
  return (RENTAL_CHARGE_LINE_TYPES as readonly string[]).includes(type);
}

export function sumExtrasGrossCents(lineItems: PricingLineItem[]): number {
  return lineItems
    .filter((li) => isExtrasSumLineType(li.type))
    .reduce((sum, li) => sum + li.totalGrossCents, 0);
}

export function sumRentalChargeGrossCents(lineItems: PricingLineItem[]): number {
  return lineItems
    .filter((li) => isRentalChargeLineType(li.type))
    .reduce((sum, li) => sum + li.totalGrossCents, 0);
}

export function countDepositLineItems(lineItems: PricingLineItem[]): number {
  return lineItems.filter((li) => li.type === 'DEPOSIT').length;
}
