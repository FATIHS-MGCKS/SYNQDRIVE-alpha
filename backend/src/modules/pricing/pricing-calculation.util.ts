import {
  BookingPriceLineItemType,
  PriceOptionPricingType,
} from '@prisma/client';
import {
  isTaxablePricingLineType,
} from './pricing-line-item-types';
import {
  buildPricingLineMetadata,
  PRICING_LINE_SOURCE_TYPES,
  type PricingLineItemSourceMetadata,
} from './pricing-line-item-source.util';
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
  metadataJson?: PricingLineItemSourceMetadata;
  sortOrder: number;
}

export interface SimulatePriceInput {
  pickupAt: Date;
  returnAt: Date;
  taxRatePercent: number;
  currency?: string;
  tariffRateId?: string | null;
  rate: RateInput;
  mileagePackage?: { id: string; label: string; includedKm: number; priceCents: number } | null;
  insurances?: PricedOptionInput[];
  extras?: PricedOptionInput[];
  manualDiscountCents?: number;
  manualAdjustmentCents?: number;
  resolvedDeposit?: {
    amountCents: number;
    currency: string;
    source: string;
    ruleRevisionId: string | null;
    reason: string;
    manualOverride: boolean;
  };
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
  sourceType: (typeof PRICING_LINE_SOURCE_TYPES)[keyof typeof PRICING_LINE_SOURCE_TYPES],
  opt: PricedOptionInput,
  rentalDays: number,
  taxRatePercent: number,
  sortOrder: number,
  currency?: string,
): SimulatedLineItem {
  const quantity = optionQuantity(opt.pricingType, rentalDays);
  const totalNetCents = opt.priceCents * quantity;
  const totalGrossCents = netToGrossCents(totalNetCents, taxRatePercent);
  return {
    type,
    label: opt.label,
    quantity,
    unitPriceCents: opt.priceCents,
    totalNetCents,
    taxRatePercent,
    totalGrossCents,
    metadataJson: buildPricingLineMetadata({
      sourceType,
      sourceId: opt.id,
      lineItemType: type,
      label: opt.label,
      quantity,
      unitAmountCents: opt.priceCents,
      totalAmountCents: totalGrossCents,
      currency,
      pricingType: opt.pricingType,
    }),
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
  const baseGross = netToGrossCents(base.netCents, taxRatePercent);
  lineItems.push({
    type: 'BASE_RENTAL',
    label: base.label,
    quantity: rentalDays,
    unitPriceCents: input.rate.dailyRateCents,
    totalNetCents: base.netCents,
    taxRatePercent,
    totalGrossCents: baseGross,
    metadataJson: buildPricingLineMetadata({
      sourceType: PRICING_LINE_SOURCE_TYPES.TARIFF_RATE,
      sourceId: input.tariffRateId ?? null,
      lineItemType: 'BASE_RENTAL',
      label: base.label,
      quantity: rentalDays,
      unitAmountCents: input.rate.dailyRateCents,
      totalAmountCents: baseGross,
      currency: input.currency,
    }),
    sortOrder: sort++,
  });

  let includedKm = input.rate.includedKmPerDay * rentalDays;

  if (input.mileagePackage) {
    includedKm += input.mileagePackage.includedKm;
    const pkgNet = input.mileagePackage.priceCents;
    const pkgGross = netToGrossCents(pkgNet, taxRatePercent);
    lineItems.push({
      type: 'MILEAGE_PACKAGE',
      label: input.mileagePackage.label,
      quantity: 1,
      unitPriceCents: pkgNet,
      totalNetCents: pkgNet,
      taxRatePercent,
      totalGrossCents: pkgGross,
      metadataJson: buildPricingLineMetadata({
        sourceType: PRICING_LINE_SOURCE_TYPES.MILEAGE_PACKAGE,
        sourceId: input.mileagePackage.id,
        lineItemType: 'MILEAGE_PACKAGE',
        label: input.mileagePackage.label,
        quantity: 1,
        unitAmountCents: pkgNet,
        totalAmountCents: pkgGross,
        currency: input.currency,
      }),
      sortOrder: sort++,
    });
  }

  for (const ins of input.insurances ?? []) {
    lineItems.push(
      buildOptionLine(
        'INSURANCE',
        PRICING_LINE_SOURCE_TYPES.TARIFF_INSURANCE,
        ins,
        rentalDays,
        taxRatePercent,
        sort++,
        input.currency,
      ),
    );
  }

  for (const extra of input.extras ?? []) {
    lineItems.push(
      buildOptionLine(
        'EXTRA',
        PRICING_LINE_SOURCE_TYPES.TARIFF_EXTRA,
        extra,
        rentalDays,
        taxRatePercent,
        sort++,
        input.currency,
      ),
    );
  }

  if (input.manualDiscountCents && input.manualDiscountCents > 0) {
    const discountNet = -Math.abs(input.manualDiscountCents);
    const discountGross = netToGrossCents(discountNet, taxRatePercent);
    lineItems.push({
      type: 'DISCOUNT',
      label: 'Rabatt',
      quantity: 1,
      unitPriceCents: discountNet,
      totalNetCents: discountNet,
      taxRatePercent,
      totalGrossCents: discountGross,
      metadataJson: buildPricingLineMetadata({
        sourceType: PRICING_LINE_SOURCE_TYPES.MANUAL,
        sourceId: null,
        lineItemType: 'DISCOUNT',
        label: 'Rabatt',
        quantity: 1,
        unitAmountCents: discountNet,
        totalAmountCents: discountGross,
        currency: input.currency,
      }),
      sortOrder: sort++,
    });
  }

  if (input.manualAdjustmentCents && input.manualAdjustmentCents !== 0) {
    const adjNet = input.manualAdjustmentCents;
    const adjGross = netToGrossCents(adjNet, taxRatePercent);
    lineItems.push({
      type: 'MANUAL_ADJUSTMENT',
      label: 'Manuelle Anpassung',
      quantity: 1,
      unitPriceCents: adjNet,
      totalNetCents: adjNet,
      taxRatePercent,
      totalGrossCents: adjGross,
      metadataJson: buildPricingLineMetadata({
        sourceType: PRICING_LINE_SOURCE_TYPES.MANUAL,
        sourceId: null,
        lineItemType: 'MANUAL_ADJUSTMENT',
        label: 'Manuelle Anpassung',
        quantity: 1,
        unitAmountCents: adjNet,
        totalAmountCents: adjGross,
        currency: input.currency,
      }),
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

  const depositAmountCents = input.resolvedDeposit
    ? Math.max(0, input.resolvedDeposit.amountCents)
    : Math.max(0, input.rate.depositAmountCents);
  if (depositAmountCents > 0) {
    const depositSourceId =
      input.resolvedDeposit?.ruleRevisionId ?? input.tariffRateId ?? null;
    lineItems.push({
      type: 'DEPOSIT',
      label: 'Kaution',
      quantity: 1,
      unitPriceCents: depositAmountCents,
      totalNetCents: depositAmountCents,
      taxRatePercent: 0,
      totalGrossCents: depositAmountCents,
      metadataJson: buildPricingLineMetadata({
        sourceType: input.resolvedDeposit
          ? PRICING_LINE_SOURCE_TYPES.DEPOSIT_RESOLVER
          : PRICING_LINE_SOURCE_TYPES.TARIFF_RATE,
        sourceId: depositSourceId,
        lineItemType: 'DEPOSIT',
        label: 'Kaution',
        quantity: 1,
        unitAmountCents: depositAmountCents,
        totalAmountCents: depositAmountCents,
        currency: input.currency,
        depositSource: input.resolvedDeposit?.source,
        ruleRevisionId: input.resolvedDeposit?.ruleRevisionId ?? null,
        manualOverride: input.resolvedDeposit?.manualOverride ?? false,
        depositReason: input.resolvedDeposit?.reason,
      }),
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
