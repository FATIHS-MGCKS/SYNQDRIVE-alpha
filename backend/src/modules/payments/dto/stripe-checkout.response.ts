import type { CheckoutSessionResult } from '../stripe-checkout.service';

export interface CheckoutSessionResponse {
  paymentRequestId: string;
  status: string;
  checkoutUrl: string;
  checkoutSessionId: string;
  paymentIntentId: string | null;
  amountCents: number;
  currency: string;
  applicationFeeAmountCents: number;
  checkoutCreatedAt: string;
  checkoutExpiresAt: string;
  stripeConnectedAccountId: string;
  stripeLivemode: boolean;
}

export function mapCheckoutSessionResponse(
  result: CheckoutSessionResult,
): CheckoutSessionResponse {
  return { ...result };
}
