import { BadRequestException } from '@nestjs/common';
import type { ResolvedTariffContext } from './pricing-context.types';
import type { PricingContextDto } from './pricing-context.types';
import type { ResolvedDeposit } from '@modules/deposit/deposit-resolver.types';

type TariffRateRow = ResolvedTariffContext['tariffVersion']['rate'];

export function assertTariffVersionComplete(
  rate: TariffRateRow | null | undefined,
  tariffVersionId: string,
): asserts rate is TariffRateRow {
  if (!rate) {
    throw new BadRequestException({
      message: 'Tarifversion ohne Rate für den Abholzeitpunkt',
      code: 'NO_TARIFF_RATE_FOR_PICKUP',
      tariffVersionId,
    });
  }
  const issues: string[] = [];
  if (rate.dailyRateCents <= 0) issues.push('dailyRateCents');
  if (rate.weeklyRateCents < 0) issues.push('weeklyRateCents');
  if (rate.monthlyRateCents < 0) issues.push('monthlyRateCents');
  if (rate.includedKmPerDay < 0) issues.push('includedKmPerDay');
  if (rate.extraKmPriceCents < 0) issues.push('extraKmPriceCents');
  if (rate.depositAmountCents < 0) issues.push('depositAmountCents');
  if (issues.length > 0) {
    throw new BadRequestException({
      message: 'Tarifversion unvollständig oder ungültig',
      code: 'TARIFF_VERSION_INCOMPLETE',
      tariffVersionId,
      fields: issues,
    });
  }
}

export function toPricingContextDto(
  ctx: ResolvedTariffContext,
  vehicleId: string,
  pickupAt: Date,
  resolvedDeposit?: ResolvedDeposit,
): PricingContextDto {
  const tv = ctx.tariffVersion;
  return {
    priceBookId: ctx.priceBook.id,
    priceBookName: ctx.priceBook.name,
    currency: ctx.priceBook.currency,
    assignmentId: ctx.assignmentId,
    tariffGroupId: ctx.tariffGroup.id,
    tariffGroupName: ctx.tariffGroup.name,
    tariffVersionId: tv.id,
    versionNumber: tv.versionNumber,
    effectiveFrom: tv.validFrom.toISOString(),
    effectiveTo: tv.validTo?.toISOString() ?? null,
    vehicleId,
    pickupAt: pickupAt.toISOString(),
    depositAmountCents: resolvedDeposit?.amount ?? tv.rate.depositAmountCents,
    resolvedDeposit: resolvedDeposit
      ? {
          amount: resolvedDeposit.amount,
          currency: resolvedDeposit.currency,
          source: resolvedDeposit.source,
          ruleRevisionId: resolvedDeposit.ruleRevisionId,
          reason: resolvedDeposit.reason,
          manualOverride: resolvedDeposit.manualOverride,
          calculatedAt: resolvedDeposit.calculatedAt,
        }
      : undefined,
    taxRatePercent: ctx.priceBook.taxRatePercent,
    mileagePackages: tv.mileagePackages,
    insuranceOptions: tv.insuranceOptions,
    extraOptions: tv.extraOptions,
    rate: {
      dailyRateCents: tv.rate.dailyRateCents,
      weeklyRateCents: tv.rate.weeklyRateCents,
      monthlyRateCents: tv.rate.monthlyRateCents,
      includedKmPerDay: tv.rate.includedKmPerDay,
      extraKmPriceCents: tv.rate.extraKmPriceCents,
      minimumRentalDays: tv.rate.minimumRentalDays,
    },
  };
}
