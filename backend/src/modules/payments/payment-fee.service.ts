import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  CurrencyMismatchError,
  MissingPriceSnapshotError,
  NegativeCommissionableError,
  RefundExceedsPaidError,
} from './payment-fee.errors';
import {
  PaymentPolicyService,
  assertSupportedCurrency,
  calculateApplicationFeeCents,
  calculateRefundFeeAdjustment,
  computeCommissionableAmountFromLineItems,
} from './payment-policy.service';
import type {
  PaymentRequestFeeSnapshot,
  PaymentFeePolicyConfig,
  RefundFeeAdjustmentResult,
} from './payment-fee.types';

@Injectable()
export class PaymentFeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentPolicyService: PaymentPolicyService,
  ) {}

  async buildFeeSnapshotForBooking(
    organizationId: string,
    bookingId: string,
    policyOverride?: Partial<PaymentFeePolicyConfig>,
  ): Promise<PaymentRequestFeeSnapshot> {
    const snapshot = await this.prisma.bookingPriceSnapshot.findFirst({
      where: { organizationId, bookingId, isCurrent: true },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!snapshot) {
      throw new MissingPriceSnapshotError(bookingId);
    }

    const policy = {
      ...this.paymentPolicyService.resolvePolicyForOrganization(
        organizationId,
        snapshot.currency,
      ),
      ...policyOverride,
    };

    return this.buildFeeSnapshotFromLineItems(
      snapshot.lineItems.map((li) => ({
        type: li.type,
        totalNetCents: li.totalNetCents,
        totalGrossCents: li.totalGrossCents,
      })),
      policy,
      snapshot.currency,
    );
  }

  buildFeeSnapshotFromLineItems(
    lineItems: readonly { type: import('@prisma/client').BookingPriceLineItemType; totalNetCents: number; totalGrossCents: number }[],
    policy: PaymentFeePolicyConfig,
    currency: string,
  ): PaymentRequestFeeSnapshot {
    const normalizedCurrency = assertSupportedCurrency(currency);
    if (policy.currency !== normalizedCurrency) {
      throw new CurrencyMismatchError(policy.currency, normalizedCurrency);
    }

    const commissionable = computeCommissionableAmountFromLineItems(
      lineItems,
      policy.basis,
      normalizedCurrency,
    );

    if (commissionable.commissionableAmountCents < 0) {
      throw new NegativeCommissionableError(commissionable.commissionableAmountCents);
    }

    const fee = calculateApplicationFeeCents(
      commissionable.commissionableAmountCents,
      policy,
    );

    return {
      commissionableAmountCents: commissionable.commissionableAmountCents,
      rentalPaymentAmountCents: commissionable.rentalPaymentAmountCents,
      applicationFeeAmountCents: fee.applicationFeeAmountCents,
      variableFeeCents: fee.variableFeeCents,
      fixedFeeCents: fee.fixedFeeCents,
      feeRateBps: policy.feeRateBps,
      feePolicyVersion: policy.version,
      feeBasis: policy.basis,
      currency: normalizedCurrency,
    };
  }

  calculateRefundFee(
    feeSnapshot: Pick<
      PaymentRequestFeeSnapshot,
      | 'applicationFeeAmountCents'
      | 'rentalPaymentAmountCents'
    >,
    refundAmountCents: number,
    alreadyRefundedAmountCents = 0,
    paidAmountCents?: number,
  ): RefundFeeAdjustmentResult {
    const effectivePaid = paidAmountCents ?? feeSnapshot.rentalPaymentAmountCents;
    if (refundAmountCents > effectivePaid - alreadyRefundedAmountCents) {
      throw new RefundExceedsPaidError(refundAmountCents, effectivePaid);
    }

    const result = calculateRefundFeeAdjustment({
      originalApplicationFeeCents: feeSnapshot.applicationFeeAmountCents,
      originalRentalPaymentAmountCents: feeSnapshot.rentalPaymentAmountCents,
      refundAmountCents,
      alreadyRefundedAmountCents,
    });

    return {
      refundAmountCents,
      applicationFeeRefundCents: result.applicationFeeRefundCents,
      remainingApplicationFeeCents: result.remainingApplicationFeeCents,
      isFullRefund: result.isFullRefund,
    };
  }

  toImmutablePaymentRequestFields(
    snapshot: PaymentRequestFeeSnapshot,
  ): {
    amountCents: number;
    currency: string;
    commissionableAmountCents: number;
    applicationFeeAmountCents: number;
    feeRateBps: number;
    fixedFeeCents: number;
    feePolicyVersion: string;
    feeBasis: string;
  } {
    return {
      amountCents: snapshot.rentalPaymentAmountCents,
      currency: snapshot.currency,
      commissionableAmountCents: snapshot.commissionableAmountCents,
      applicationFeeAmountCents: snapshot.applicationFeeAmountCents,
      feeRateBps: snapshot.feeRateBps,
      fixedFeeCents: snapshot.fixedFeeCents,
      feePolicyVersion: snapshot.feePolicyVersion,
      feeBasis: snapshot.feeBasis,
    };
  }
}
