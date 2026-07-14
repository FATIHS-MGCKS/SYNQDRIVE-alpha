import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { BookingPriceLineItemType } from '@prisma/client';
import {
  isCommissionableAdjustmentLineType,
  isExcludedFromCommissionable,
  isProvisionableLineItemType,
  lineItemAmountForBasis,
} from '../payment-policy.service';
import { PaymentFeeBasis } from '../payment-fee.types';
import type { CheckoutSessionLineItem } from '../stripe/stripe-connect.types';

const LINE_ITEM_LABELS: Partial<Record<BookingPriceLineItemType, string>> = {
  [BookingPriceLineItemType.BASE_RENTAL]: 'Miete',
  [BookingPriceLineItemType.INSURANCE]: 'Versicherung',
  [BookingPriceLineItemType.EXTRA]: 'Zusatzleistung',
  [BookingPriceLineItemType.MILEAGE_PACKAGE]: 'Kilometerpaket',
  [BookingPriceLineItemType.EXTRA_KM]: 'Zusatzkilometer',
  [BookingPriceLineItemType.DISCOUNT]: 'Rabatt',
};

export interface SnapshotLineItemInput {
  type: BookingPriceLineItemType;
  label?: string | null;
  totalNetCents: number;
  totalGrossCents: number;
}

/**
 * Builds Stripe Checkout line items from frozen snapshot rows — excludes deposit and
 * other non-commissionable types. Sum must match the frozen payment request amount.
 */
export function buildCheckoutLineItemsFromSnapshot(
  lineItems: readonly SnapshotLineItemInput[],
  feeBasis: PaymentFeeBasis,
  expectedAmountCents: number,
): CheckoutSessionLineItem[] {
  const checkoutItems: CheckoutSessionLineItem[] = [];

  for (const item of lineItems) {
    if (isExcludedFromCommissionable(item.type)) {
      continue;
    }

    if (
      !isProvisionableLineItemType(item.type)
      && !isCommissionableAdjustmentLineType(item.type)
    ) {
      continue;
    }

    const amountCents = lineItemAmountForBasis(item, feeBasis);
    if (amountCents === 0) {
      continue;
    }

    checkoutItems.push({
      name: item.label?.trim() || LINE_ITEM_LABELS[item.type] || item.type,
      amountCents,
      quantity: 1,
    });
  }

  const total = checkoutItems.reduce((sum, li) => sum + li.amountCents * li.quantity, 0);
  if (total !== expectedAmountCents) {
    throw new BadRequestException(
      `Checkout line items total (${total}) does not match frozen payment amount (${expectedAmountCents})`,
    );
  }

  if (checkoutItems.length === 0) {
    throw new BadRequestException('No payable line items available for checkout');
  }

  return checkoutItems;
}

/** Stripe Checkout Session expires_at must be 30 minutes to 24 hours from creation. */
export function resolveStripeCheckoutExpiresAt(
  requestedExpiresAt: Date | null | undefined,
  now: Date = new Date(),
): Date {
  const minMs = now.getTime() + 30 * 60 * 1000;
  const maxMs = now.getTime() + 24 * 60 * 60 * 1000;
  const requestedMs = requestedExpiresAt?.getTime() ?? maxMs;
  const clampedMs = Math.min(Math.max(requestedMs, minMs), maxMs);
  return new Date(clampedMs);
}

export function isCheckoutSessionStillActive(
  request: {
    stripeCheckoutSessionId: string | null;
    checkoutUrl: string | null;
    checkoutExpiresAt: Date | null;
  },
  now: Date = new Date(),
): boolean {
  if (!request.stripeCheckoutSessionId || !request.checkoutUrl) {
    return false;
  }
  if (!request.checkoutExpiresAt) {
    return true;
  }
  return request.checkoutExpiresAt.getTime() > now.getTime();
}
