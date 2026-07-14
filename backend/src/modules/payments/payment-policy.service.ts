import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingPriceLineItemType } from '@prisma/client';
import { InvalidCurrencyError } from './payment-fee.errors';
import {
  COMMISSIONABLE_ADJUSTMENT_LINE_TYPES,
  NON_COMMISSIONABLE_LINE_ITEM_TYPES,
  PAYMENT_FEE_POLICY_VERSION,
  PaymentFeeBasis,
  PaymentFeePolicyConfig,
  PROVISIONABLE_LINE_ITEM_TYPES,
  type CommissionableAmountResult,
  type PriceSnapshotLineItemInput,
} from './payment-fee.types';

const SUPPORTED_CURRENCIES = new Set(['EUR']);

export function isProvisionableLineItemType(type: BookingPriceLineItemType): boolean {
  return (PROVISIONABLE_LINE_ITEM_TYPES as readonly string[]).includes(type);
}

export function isCommissionableAdjustmentLineType(type: BookingPriceLineItemType): boolean {
  return (COMMISSIONABLE_ADJUSTMENT_LINE_TYPES as readonly string[]).includes(type);
}

export function isExcludedFromCommissionable(type: BookingPriceLineItemType): boolean {
  return (NON_COMMISSIONABLE_LINE_ITEM_TYPES as readonly string[]).includes(type);
}

export function assertSupportedCurrency(currency: string): string {
  const normalized = currency.trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.has(normalized)) {
    throw new InvalidCurrencyError(currency);
  }
  return normalized;
}

export function lineItemAmountForBasis(
  item: PriceSnapshotLineItemInput,
  basis: PaymentFeeBasis,
): number {
  return basis === PaymentFeeBasis.NET_RENTAL_EXCL_DEPOSIT
    ? item.totalNetCents
    : item.totalGrossCents;
}

/**
 * Commissionable base from snapshot line items only — never totalDueNowCents or deposit header fields.
 */
export function computeCommissionableAmountFromLineItems(
  lineItems: readonly PriceSnapshotLineItemInput[],
  basis: PaymentFeeBasis,
  currency: string,
): CommissionableAmountResult {
  const normalizedCurrency = assertSupportedCurrency(currency);

  let commissionableAmountCents = 0;
  let excludedDepositCents = 0;
  const includedLineTypes: BookingPriceLineItemType[] = [];

  for (const item of lineItems) {
    if (item.type === BookingPriceLineItemType.DEPOSIT) {
      excludedDepositCents += Math.abs(item.totalGrossCents);
      continue;
    }

    if (isExcludedFromCommissionable(item.type)) {
      continue;
    }

    if (
      isProvisionableLineItemType(item.type)
      || isCommissionableAdjustmentLineType(item.type)
    ) {
      commissionableAmountCents += lineItemAmountForBasis(item, basis);
      includedLineTypes.push(item.type);
    }
  }

  return {
    commissionableAmountCents,
    rentalPaymentAmountCents: commissionableAmountCents,
    currency: normalizedCurrency,
    includedLineTypes,
    excludedDepositCents,
  };
}

export function applyFeeBounds(
  rawFeeCents: number,
  minFeeCents: number | null,
  maxFeeCents: number | null,
): number {
  let fee = rawFeeCents;
  if (minFeeCents != null && fee < minFeeCents) {
    fee = minFeeCents;
  }
  if (maxFeeCents != null && fee > maxFeeCents) {
    fee = maxFeeCents;
  }
  return Math.max(0, fee);
}

/**
 * Application fee = round(commissionable × rateBps / 10000) + fixedFeeCents, then min/max clamp.
 */
export function calculateApplicationFeeCents(
  commissionableAmountCents: number,
  policy: Pick<
    PaymentFeePolicyConfig,
    'feeRateBps' | 'fixedFeeCents' | 'minFeeCents' | 'maxFeeCents'
  >,
): { applicationFeeAmountCents: number; variableFeeCents: number; fixedFeeCents: number } {
  const variableFeeCents = Math.round(
    (commissionableAmountCents * policy.feeRateBps) / 10_000,
  );
  const fixedFeeCents = Math.max(0, policy.fixedFeeCents);
  const rawTotal = variableFeeCents + fixedFeeCents;
  const applicationFeeAmountCents = applyFeeBounds(
    rawTotal,
    policy.minFeeCents,
    policy.maxFeeCents,
  );

  return { applicationFeeAmountCents, variableFeeCents, fixedFeeCents };
}

/**
 * Proportional application-fee refund with integer-cent rounding.
 * Fixed and variable portions refund proportionally to rental payment refunded.
 */
export function calculateRefundFeeAdjustment(
  params: {
    originalApplicationFeeCents: number;
    originalRentalPaymentAmountCents: number;
    refundAmountCents: number;
    alreadyRefundedAmountCents?: number;
  },
): {
  applicationFeeRefundCents: number;
  remainingApplicationFeeCents: number;
  isFullRefund: boolean;
} {
  const {
    originalApplicationFeeCents,
    originalRentalPaymentAmountCents,
    refundAmountCents,
    alreadyRefundedAmountCents = 0,
  } = params;

  if (originalRentalPaymentAmountCents <= 0 || refundAmountCents <= 0) {
    return {
      applicationFeeRefundCents: 0,
      remainingApplicationFeeCents: originalApplicationFeeCents,
      isFullRefund: false,
    };
  }

  const totalRefundedAfter = alreadyRefundedAmountCents + refundAmountCents;
  const isFullRefund = totalRefundedAfter >= originalRentalPaymentAmountCents;

  if (isFullRefund) {
    const priorFeeRefunded = Math.round(
      (originalApplicationFeeCents * alreadyRefundedAmountCents)
        / originalRentalPaymentAmountCents,
    );
    const applicationFeeRefundCents = Math.max(
      0,
      originalApplicationFeeCents - priorFeeRefunded,
    );
    return {
      applicationFeeRefundCents,
      remainingApplicationFeeCents: 0,
      isFullRefund: true,
    };
  }

  const applicationFeeRefundCents = Math.round(
    (originalApplicationFeeCents * refundAmountCents) / originalRentalPaymentAmountCents,
  );

  const totalFeeRefunded = Math.round(
    (originalApplicationFeeCents * totalRefundedAfter) / originalRentalPaymentAmountCents,
  );

  return {
    applicationFeeRefundCents,
    remainingApplicationFeeCents: Math.max(0, originalApplicationFeeCents - totalFeeRefunded),
    isFullRefund: false,
  };
}

@Injectable()
export class PaymentPolicyService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Resolves active fee policy for an organization.
   * Org/plan overrides can be wired here when a dedicated config model exists.
   */
  resolvePolicyForOrganization(
    organizationId: string,
    currency: string,
  ): PaymentFeePolicyConfig {
    void organizationId;
    const normalizedCurrency = assertSupportedCurrency(currency);
    const basis =
      this.configService.get<string>('PAYMENT_FEE_BASIS')
        === PaymentFeeBasis.NET_RENTAL_EXCL_DEPOSIT
        ? PaymentFeeBasis.NET_RENTAL_EXCL_DEPOSIT
        : PaymentFeeBasis.GROSS_RENTAL_EXCL_DEPOSIT;

    return {
      version: PAYMENT_FEE_POLICY_VERSION,
      basis,
      feeRateBps: Number(this.configService.get<string>('PAYMENT_FEE_RATE_BPS', '250')),
      fixedFeeCents: Number(this.configService.get<string>('PAYMENT_FEE_FIXED_CENTS', '0')),
      minFeeCents: this.parseOptionalInt('PAYMENT_FEE_MIN_CENTS'),
      maxFeeCents: this.parseOptionalInt('PAYMENT_FEE_MAX_CENTS'),
      currency: normalizedCurrency,
    };
  }

  private parseOptionalInt(key: string): number | null {
    const raw = this.configService.get<string>(key);
    if (raw == null || raw === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
}
