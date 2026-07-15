import { PaymentStatusDomain } from '../billing-domain.types';
import { mapExternalValue } from '../billing-domain.utils';

const STRIPE_PAYMENT_INTENT_TO_DOMAIN: Readonly<Record<string, PaymentStatusDomain>> = {
  requires_payment_method: PaymentStatusDomain.PENDING,
  requires_confirmation: PaymentStatusDomain.PENDING,
  requires_action: PaymentStatusDomain.PENDING,
  processing: PaymentStatusDomain.PENDING,
  requires_capture: PaymentStatusDomain.PENDING,
  succeeded: PaymentStatusDomain.SUCCEEDED,
  canceled: PaymentStatusDomain.FAILED,
  failed: PaymentStatusDomain.FAILED,
};

const STRIPE_CHARGE_TO_DOMAIN: Readonly<Record<string, PaymentStatusDomain>> = {
  pending: PaymentStatusDomain.PENDING,
  succeeded: PaymentStatusDomain.SUCCEEDED,
  failed: PaymentStatusDomain.FAILED,
};

export function mapStripePaymentIntentToDomainStatus(
  stripeStatus: string | null | undefined,
  opts?: { refunded?: boolean; amountRefundedCents?: number; amountCents?: number },
): PaymentStatusDomain {
  if (opts?.refunded) {
    const refunded = opts.amountRefundedCents ?? 0;
    const total = opts.amountCents ?? 0;
    if (total > 0 && refunded > 0 && refunded < total) {
      return PaymentStatusDomain.PARTIALLY_REFUNDED;
    }
    return PaymentStatusDomain.REFUNDED;
  }

  return mapExternalValue({
    context: 'stripe.payment_intent.status',
    value: stripeStatus,
    map: STRIPE_PAYMENT_INTENT_TO_DOMAIN,
    fallback: PaymentStatusDomain.PENDING,
  });
}

export function mapStripeChargeToDomainStatus(
  stripeStatus: string | null | undefined,
  opts?: { refunded?: boolean; amountRefundedCents?: number; amountCents?: number },
): PaymentStatusDomain {
  if (opts?.refunded) {
    const refunded = opts.amountRefundedCents ?? 0;
    const total = opts.amountCents ?? 0;
    if (total > 0 && refunded > 0 && refunded < total) {
      return PaymentStatusDomain.PARTIALLY_REFUNDED;
    }
    return PaymentStatusDomain.REFUNDED;
  }

  return mapExternalValue({
    context: 'stripe.charge.status',
    value: stripeStatus,
    map: STRIPE_CHARGE_TO_DOMAIN,
    fallback: PaymentStatusDomain.PENDING,
  });
}
