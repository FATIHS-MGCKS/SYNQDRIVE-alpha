import type { PricingLineItem, PricingSimulationResult } from './pricingTypes';

export interface SimulatorPriceBreakdown {
  baseRentalGrossCents: number;
  mileageGrossCents: number;
  extrasGrossCents: number;
  insuranceGrossCents: number;
  discountsGrossCents: number;
  rentalRevenueGrossCents: number;
  taxAmountCents: number;
  depositAmountCents: number;
  totalDueNowCents: number;
}

function sumTypes(lineItems: PricingLineItem[], types: string[]): number {
  return lineItems
    .filter((li) => types.includes(li.type))
    .reduce((sum, li) => sum + li.totalGrossCents, 0);
}

export function buildSimulatorPriceBreakdown(
  result: PricingSimulationResult,
): SimulatorPriceBreakdown {
  const items = result.lineItems;
  const baseRentalGrossCents = sumTypes(items, ['BASE_RENTAL']);
  const mileageGrossCents = sumTypes(items, ['MILEAGE_PACKAGE', 'EXTRA_KM']);
  const extrasGrossCents = sumTypes(items, ['EXTRA']);
  const insuranceGrossCents = sumTypes(items, ['INSURANCE']);
  const discountsGrossCents = sumTypes(items, [
    'DISCOUNT',
    'MANUAL_DISCOUNT',
    'MANUAL_ADJUSTMENT',
  ]);

  const rentalRevenueGrossCents = result.totalGrossCents;

  return {
    baseRentalGrossCents,
    mileageGrossCents,
    extrasGrossCents,
    insuranceGrossCents,
    discountsGrossCents,
    rentalRevenueGrossCents: result.totalGrossCents,
    taxAmountCents: result.taxAmountCents,
    depositAmountCents: result.depositAmountCents,
    totalDueNowCents: result.totalDueNowCents,
  };
}

export function resolveSimulatorDraftDepositHint(params: {
  tariffGroupId: string;
  liveDepositCents: number;
  draftDepositCents: number | null;
}): boolean {
  if (params.draftDepositCents == null) return false;
  return params.draftDepositCents !== params.liveDepositCents;
}
