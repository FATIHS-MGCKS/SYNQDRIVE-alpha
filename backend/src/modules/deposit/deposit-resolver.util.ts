import { BadRequestException } from '@nestjs/common';
import type { EffectiveRentalRules, RentalRuleSource } from '@modules/rental-rules/rental-rules.types';
import { normalizeCurrencyCode } from '@shared/money/money.util';
import {
  DEPOSIT_SOURCE,
  type DepositEntityIds,
  type DepositFloorLayer,
  type DepositResolverInput,
  type DepositSource,
  type ResolvedDeposit,
} from './deposit-resolver.types';

export class DepositCurrencyMismatchError extends BadRequestException {
  constructor(left: string, right: string, context: string) {
    super({
      message: `Deposit currency mismatch in ${context}: ${left} vs ${right}`,
      code: 'DEPOSIT_CURRENCY_MISMATCH',
      leftCurrency: left,
      rightCurrency: right,
    });
  }
}

export class DepositBelowMinimumError extends BadRequestException {
  constructor(amountCents: number, minimumCents: number) {
    super({
      message: `Deposit ${amountCents} is below effective minimum ${minimumCents} without approved manual override`,
      code: 'DEPOSIT_BELOW_MINIMUM',
      amountCents,
      minimumCents,
    });
  }
}

function assertDepositCurrencyMatch(
  left: string,
  right: string,
  context: string,
): void {
  const normalizedLeft = normalizeCurrencyCode(left);
  const normalizedRight = normalizeCurrencyCode(right);
  if (normalizedLeft !== normalizedRight) {
    throw new DepositCurrencyMismatchError(normalizedLeft, normalizedRight, context);
  }
}

export function mapRentalRuleSourceToDepositSource(
  source: RentalRuleSource,
): DepositSource {
  switch (source) {
    case 'ORGANIZATION_DEFAULT':
      return DEPOSIT_SOURCE.ORGANIZATION_MINIMUM;
    case 'CATEGORY':
      return DEPOSIT_SOURCE.CATEGORY_MINIMUM;
    case 'VEHICLE_OVERRIDE':
      return DEPOSIT_SOURCE.VEHICLE_OVERRIDE_MINIMUM;
    default:
      return DEPOSIT_SOURCE.ORGANIZATION_MINIMUM;
  }
}

export function resolveDepositEntityId(
  source: RentalRuleSource,
  entityIds: DepositEntityIds,
): string | null {
  switch (source) {
    case 'ORGANIZATION_DEFAULT':
      return entityIds.organizationRulesId;
    case 'CATEGORY':
      return entityIds.categoryId;
    case 'VEHICLE_OVERRIDE':
      return entityIds.vehicleOverrideId;
    default:
      return null;
  }
}

export function extractDepositFloorFromEffectiveRules(
  rules: EffectiveRentalRules,
  entityIds: DepositEntityIds,
  pricingCurrency: string,
): DepositFloorLayer | null {
  const amountCents = rules.depositAmountCents.value;
  if (amountCents == null || amountCents <= 0 || !rules.depositAmountCents.source) {
    return null;
  }

  const currency = normalizeCurrencyCode(
    rules.depositCurrency.value ?? pricingCurrency,
  );
  assertDepositCurrencyMatch(currency, pricingCurrency, 'rental rules floor vs pricing');

  const sourceEntityId = resolveDepositEntityId(rules.depositAmountCents.source, entityIds);
  if (!sourceEntityId) {
    return null;
  }

  return {
    source: rules.depositAmountCents.source,
    sourceName: rules.depositAmountCents.sourceName ?? '',
    sourceEntityId,
    amountCents,
    currency,
  };
}

export function resolveDeposit(input: DepositResolverInput): ResolvedDeposit {
  const currency = normalizeCurrencyCode(input.pricingCurrency);
  const calculatedAt = (input.calculatedAt ?? new Date()).toISOString();

  assertDepositCurrencyMatch(
    input.tariffDeposit.currency,
    currency,
    'tariff deposit vs pricing',
  );
  if (input.rentalRulesFloor) {
    assertDepositCurrencyMatch(
      input.rentalRulesFloor.currency,
      currency,
      'rental rules floor vs pricing',
    );
  }

  const rentalRulesFloorCents = input.rentalRulesFloor?.amountCents ?? null;
  const tariffDepositCents = Math.max(0, input.tariffDeposit.amountCents);
  const effectiveMinimumCents = rentalRulesFloorCents ?? 0;

  if (input.manualOverride) {
    assertDepositCurrencyMatch(input.manualOverride.currency, currency, 'manual override vs pricing');
    if (
      input.manualOverride.amountCents < effectiveMinimumCents &&
      !input.manualOverride.approvalReferenceId
    ) {
      throw new DepositBelowMinimumError(
        input.manualOverride.amountCents,
        effectiveMinimumCents,
      );
    }

    return {
      amount: Math.max(0, input.manualOverride.amountCents),
      currency,
      source: DEPOSIT_SOURCE.MANUAL_OVERRIDE_APPROVED,
      ruleRevisionId: input.manualOverride.approvalReferenceId,
      reason: input.manualOverride.reason,
      manualOverride: true,
      calculatedAt,
      components: {
        rentalRulesFloorCents,
        tariffDepositCents,
        effectiveMinimumCents,
        raisedToMinimum: false,
      },
    };
  }

  if (tariffDepositCents < effectiveMinimumCents) {
    const floor = input.rentalRulesFloor!;
    return {
      amount: effectiveMinimumCents,
      currency,
      source: mapRentalRuleSourceToDepositSource(floor.source),
      ruleRevisionId: floor.sourceEntityId,
      reason:
        tariffDepositCents > 0
          ? `Raised from tariff deposit (${tariffDepositCents}) to rental rules minimum (${effectiveMinimumCents}).`
          : `Rental rules minimum deposit (${effectiveMinimumCents}) applies — tariff had no deposit.`,
      manualOverride: false,
      calculatedAt,
      components: {
        rentalRulesFloorCents,
        tariffDepositCents,
        effectiveMinimumCents,
        raisedToMinimum: true,
      },
    };
  }

  if (tariffDepositCents > effectiveMinimumCents && effectiveMinimumCents > 0) {
    return {
      amount: tariffDepositCents,
      currency,
      source: DEPOSIT_SOURCE.TARIFF_RATE,
      ruleRevisionId: input.tariffDeposit.tariffRateId,
      reason: `Tariff deposit (${tariffDepositCents}) exceeds rental rules minimum (${effectiveMinimumCents}).`,
      manualOverride: false,
      calculatedAt,
      components: {
        rentalRulesFloorCents,
        tariffDepositCents,
        effectiveMinimumCents,
        raisedToMinimum: false,
      },
    };
  }

  if (tariffDepositCents > 0) {
    return {
      amount: tariffDepositCents,
      currency,
      source: DEPOSIT_SOURCE.TARIFF_RATE,
      ruleRevisionId: input.tariffDeposit.tariffRateId,
      reason: 'From active tariff rate.',
      manualOverride: false,
      calculatedAt,
      components: {
        rentalRulesFloorCents,
        tariffDepositCents,
        effectiveMinimumCents,
        raisedToMinimum: false,
      },
    };
  }

  if (input.rentalRulesFloor) {
    return {
      amount: effectiveMinimumCents,
      currency,
      source: mapRentalRuleSourceToDepositSource(input.rentalRulesFloor.source),
      ruleRevisionId: input.rentalRulesFloor.sourceEntityId,
      reason: `Rental rules minimum deposit from ${input.rentalRulesFloor.sourceName}.`,
      manualOverride: false,
      calculatedAt,
      components: {
        rentalRulesFloorCents,
        tariffDepositCents,
        effectiveMinimumCents,
        raisedToMinimum: false,
      },
    };
  }

  return {
    amount: 0,
    currency,
    source: DEPOSIT_SOURCE.TARIFF_RATE,
    ruleRevisionId: input.tariffDeposit.tariffRateId,
    reason: 'No deposit configured in rental rules or tariff.',
    manualOverride: false,
    calculatedAt,
    components: {
      rentalRulesFloorCents,
      tariffDepositCents,
      effectiveMinimumCents,
      raisedToMinimum: false,
    },
  };
}
