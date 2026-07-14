import { BookingPriceLineItemType } from '@prisma/client';

/** Current policy version — bump when rules or defaults change. */
export const PAYMENT_FEE_POLICY_VERSION = '2026-07-14-v1';

/**
 * Gross rental revenue excluding deposit (default until tax policy is finalized).
 * Alternative: NET_RENTAL_EXCL_DEPOSIT.
 */
export enum PaymentFeeBasis {
  GROSS_RENTAL_EXCL_DEPOSIT = 'GROSS_RENTAL_EXCL_DEPOSIT',
  NET_RENTAL_EXCL_DEPOSIT = 'NET_RENTAL_EXCL_DEPOSIT',
}

/** Positive list — provisionable rental services. */
export const PROVISIONABLE_LINE_ITEM_TYPES: readonly BookingPriceLineItemType[] = [
  BookingPriceLineItemType.BASE_RENTAL,
  BookingPriceLineItemType.INSURANCE,
  BookingPriceLineItemType.EXTRA,
  BookingPriceLineItemType.MILEAGE_PACKAGE,
  BookingPriceLineItemType.EXTRA_KM,
] as const;

/**
 * Revenue adjustments that reduce/increase commissionable base (not separate fee targets).
 * DISCOUNT is not "provisionable" as a product line but affects the fee base.
 */
export const COMMISSIONABLE_ADJUSTMENT_LINE_TYPES: readonly BookingPriceLineItemType[] = [
  BookingPriceLineItemType.DISCOUNT,
] as const;

/** Explicitly excluded from commissionable base — never subtracted twice from totals. */
export const NON_COMMISSIONABLE_LINE_ITEM_TYPES: readonly BookingPriceLineItemType[] = [
  BookingPriceLineItemType.DEPOSIT,
  BookingPriceLineItemType.TAX,
  BookingPriceLineItemType.MANUAL_ADJUSTMENT,
] as const;

export interface PaymentFeePolicyConfig {
  version: string;
  basis: PaymentFeeBasis;
  feeRateBps: number;
  fixedFeeCents: number;
  minFeeCents: number | null;
  maxFeeCents: number | null;
  currency: string;
}

export interface PriceSnapshotLineItemInput {
  type: BookingPriceLineItemType;
  totalNetCents: number;
  totalGrossCents: number;
}

export interface CommissionableAmountResult {
  commissionableAmountCents: number;
  rentalPaymentAmountCents: number;
  currency: string;
  includedLineTypes: BookingPriceLineItemType[];
  excludedDepositCents: number;
}

export interface ApplicationFeeResult {
  commissionableAmountCents: number;
  applicationFeeAmountCents: number;
  variableFeeCents: number;
  fixedFeeCents: number;
  feeRateBps: number;
  feePolicyVersion: string;
  feeBasis: PaymentFeeBasis;
  currency: string;
}

export interface PaymentRequestFeeSnapshot extends ApplicationFeeResult {
  rentalPaymentAmountCents: number;
}

export interface RefundFeeAdjustmentResult {
  refundAmountCents: number;
  applicationFeeRefundCents: number;
  remainingApplicationFeeCents: number;
  isFullRefund: boolean;
}

export { BookingPriceLineItemType };
