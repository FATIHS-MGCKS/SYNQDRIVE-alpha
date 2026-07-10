import {
  BookingPriceLineItemType,
  PriceOptionPricingType,
} from '@prisma/client';
import { isTaxablePricingLineType } from './pricing-line-item-types';
import { computeRentalDays } from './pricing-rental-days.util';

export {
  EXTRAS_SUM_LINE_TYPES,
  RENTAL_CHARGE_LINE_TYPES,
  TAXABLE_PRICING_LINE_TYPES,
  isExtrasSumLineType,
  isRentalChargeLineType,
  isTaxablePricingLineType,
} from './pricing-line-item-types';

export interface RateInput {
  dailyRateCents: number;
  weeklyRateCents: number;
  monthlyRateCents: number;
  includedKmPerDay: number;
  extraKmPriceCents: number;
  depositAmountCents: number;
  minimumRentalDays?: number | null;
}

export interface PricedOptionInput {
  id: string;
  label: string;
  priceCents: number;
  pricingType: PriceOptionPricingType;
}

export interface SimulatedLineItem {
  type: BookingPriceLineItemType;
  label: string;
  quantity: number;
  unitPriceCents: number;
  totalNetCents: number;
  taxRatePercent: number;
  totalGrossCents: number;
  metadataJson?: Record<string, unknown>;
  sortOrder: number;
}

export interface SimulatePriceInput {
  pickupAt: Date;
  returnAt: Date;
  taxRatePercent: number;
  rate: RateInput;
  mileagePackage?: { id: string; label: string; includedKm: number; priceCents: number } | null;
  insurances?: PricedOptionInput[];
  extras?: PricedOptionInput[];
  manualDiscountCents?: number;
  manualAdjustmentCents?: number;
}

export interface SimulatePriceResult {
  rentalDays: number;
  lineItems: SimulatedLineItem[];
  subtotalNetCents: number;
  taxAmountCents: number;
  totalGrossCents: number;
  depositAmountCents: number;
  includedKm: number;
  extraKmPriceCents: number;
  totalDueNowCents: number;
  warnings: string[];
}

/** Net from gross — legacy vehicle rates were customer-facing (brutto). */
export function grossToNetCents(grossCents: number, taxRatePercent: number): number {
  if (grossCents <= 0) return 0;
  return Math.round(grossCents / (1 + taxRatePercent / 100));
}

export function netToGrossCents(netCents: number, taxRatePercent: number): number {
  return Math.round(netCents * (1 + taxRatePercent / 100));
}

export function computeBaseRentalNetCents(
  rentalDays: number,
  rate: RateInput,
): { netCents: number; label: string } {
  if (rate.minimumRentalDays != null && rentalDays < rate.minimumRentalDays) {
    rentalDays = rate.minimumRentalDays;
  }

  if (rentalDays >= 30 && rate.monthlyRateCents > 0) {
    const months = Math.floor(rentalDays / 30);
    const remainder = rentalDays % 30;
    const net =
      months * rate.monthlyRateCents + remainder * rate.dailyRateCents;
    return {
      netCents: net,
      label: `Grundmiete (${months}× Monat + ${remainder}× Tag)`,
    };
  }

  if (rentalDays >= 7 && rate.weeklyRateCents > 0) {
    const weeks = Math.floor(rentalDays / 7);
    const remainder = rentalDays % 7;
    const net = weeks * rate.weeklyRateCents + remainder * rate.dailyRateCents;
    return {
      netCents: net,
      label: `Grundmiete (${weeks}× Woche + ${remainder}× Tag)`,
    };
  }

  return {
    netCents: rentalDays * rate.dailyRateCents,
    label: `Grundmiete (${rentalDays} Tag(e))`,
  };
}

function optionQuantity(
  pricingType: PriceOptionPricingType,
  rentalDays: number,
): number {
  return pricingType === 'PER_DAY' ? rentalDays : 1;
}

function buildOptionLine(
  type: BookingPriceLineItemType,
  opt: PricedOptionInput,
  rentalDays: number,
  taxRatePercent: number,
  sortOrder: number,
): SimulatedLineItem {
  const quantity = optionQuantity(opt.pricingType, rentalDays);
  const totalNetCents = opt.priceCents * quantity;
  return {
    type,
    label: opt.label,
    quantity,
    unitPriceCents: opt.priceCents,
    totalNetCents,
    taxRatePercent,
    totalGrossCents: netToGrossCents(totalNetCents, taxRatePercent),
    metadataJson: { optionId: opt.id, pricingType: opt.pricingType },
    sortOrder,
  };
}

export function simulateBookingPrice(input: SimulatePriceInput): SimulatePriceResult {
  const warnings: string[] = [];
  const taxRatePercent = input.taxRatePercent;
  const rentalDays = computeRentalDays(input.pickupAt, input.returnAt);
  const lineItems: SimulatedLineItem[] = [];
  let sort = 0;

  const base = computeBaseRentalNetCents(rentalDays, input.rate);
  if (base.netCents <= 0) {
    warnings.push('Grundmiete ist 0 — Tarif prüfen');
  }
  lineItems.push({
    type: 'BASE_RENTAL',
    label: base.label,
    quantity: rentalDays,
    unitPriceCents: input.rate.dailyRateCents,
    totalNetCents: base.netCents,
    taxRatePercent,
    totalGrossCents: netToGrossCents(base.netCents, taxRatePercent),
    sortOrder: sort++,
  });

  let includedKm = input.rate.includedKmPerDay * rentalDays;

  if (input.mileagePackage) {
    includedKm += input.mileagePackage.includedKm;
    const pkgNet = input.mileagePackage.priceCents;
    lineItems.push({
      type: 'MILEAGE_PACKAGE',
      label: input.mileagePackage.label,
      quantity: 1,
      unitPriceCents: pkgNet,
      totalNetCents: pkgNet,
      taxRatePercent,
      totalGrossCents: netToGrossCents(pkgNet, taxRatePercent),
      metadataJson: { packageId: input.mileagePackage.id },
      sortOrder: sort++,
    });
  }

  for (const ins of input.insurances ?? []) {
    lineItems.push(
      buildOptionLine('INSURANCE', ins, rentalDays, taxRatePercent, sort++),
    );
  }

  for (const extra of input.extras ?? []) {
    lineItems.push(
      buildOptionLine('EXTRA', extra, rentalDays, taxRatePercent, sort++),
    );
  }

  if (input.manualDiscountCents && input.manualDiscountCents > 0) {
    const discountNet = -Math.abs(input.manualDiscountCents);
    lineItems.push({
      type: 'DISCOUNT',
      label: 'Rabatt',
      quantity: 1,
      unitPriceCents: discountNet,
      totalNetCents: discountNet,
      taxRatePercent,
      totalGrossCents: netToGrossCents(discountNet, taxRatePercent),
      sortOrder: sort++,
    });
  }

  if (input.manualAdjustmentCents && input.manualAdjustmentCents !== 0) {
    const adjNet = input.manualAdjustmentCents;
    lineItems.push({
      type: 'MANUAL_ADJUSTMENT',
      label: 'Manuelle Anpassung',
      quantity: 1,
      unitPriceCents: adjNet,
      totalNetCents: adjNet,
      taxRatePercent,
      totalGrossCents: netToGrossCents(adjNet, taxRatePercent),
      sortOrder: sort++,
    });
  }

  const chargeableItems = lineItems.filter((li) => isTaxablePricingLineType(li.type));
  const subtotalNetCents = Math.max(
    0,
    chargeableItems.reduce((s, li) => s + li.totalNetCents, 0),
  );
  const taxAmountCents = Math.max(
    0,
    chargeableItems.reduce(
      (s, li) => s + (li.totalGrossCents - li.totalNetCents),
      0,
    ),
  );
  const totalGrossCents = subtotalNetCents + taxAmountCents;

  const depositAmountCents = Math.max(0, input.rate.depositAmountCents);
  if (depositAmountCents > 0) {
    lineItems.push({
      type: 'DEPOSIT',
      label: 'Kaution',
      quantity: 1,
      unitPriceCents: depositAmountCents,
      totalNetCents: depositAmountCents,
      taxRatePercent: 0,
      totalGrossCents: depositAmountCents,
      sortOrder: sort++,
    });
  }

  return {
    rentalDays,
    lineItems,
    subtotalNetCents,
    taxAmountCents,
    totalGrossCents,
    depositAmountCents,
    includedKm,
    extraKmPriceCents: input.rate.extraKmPriceCents,
    totalDueNowCents: totalGrossCents + depositAmountCents,
    warnings,
  };
}
