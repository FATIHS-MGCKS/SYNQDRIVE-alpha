import { OrganizationPaymentAccountStatus, StripeAccountGeneration } from '@prisma/client';

/** Stripe-agnostic connected account reference. */
export interface ConnectedAccountRef {
  connectedAccountId: string;
  livemode: boolean;
  generation: StripeAccountGeneration;
}

export interface ConnectedAccountRequirements {
  currentlyDue: string[];
  pastDue: string[];
  pendingVerification: string[];
}

export interface ConnectedAccountStatus {
  status: OrganizationPaymentAccountStatus;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  disabledReason: string | null;
  requirements: ConnectedAccountRequirements;
  country: string | null;
  defaultCurrency: string;
  livemode: boolean;
}

export interface OnboardingSessionRef {
  url: string;
  expiresAt: Date;
}

export interface SafePayoutSummary {
  payoutsEnabled: boolean;
  bankAccountLast4: string | null;
  defaultCurrency: string;
}

export interface CreateConnectedAccountInput {
  organizationId: string;
  country: string;
  email: string;
  defaultCurrency: string;
  companyName: string;
}

export interface CreateOnboardingSessionInput {
  connectedAccountId: string;
  returnUrl: string;
  refreshUrl: string;
}

export interface CheckoutSessionLineItem {
  name: string;
  amountCents: number;
  quantity: number;
}

export interface CreateCheckoutSessionInput {
  connectedAccountId: string;
  currency: string;
  lineItems: readonly CheckoutSessionLineItem[];
  applicationFeeAmountCents: number;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
  metadata: {
    organizationId: string;
    bookingId: string;
    invoiceId: string;
    paymentRequestId: string;
  };
  stripeIdempotencyKey: string;
}

export interface CheckoutSessionRef {
  sessionId: string;
  url: string;
  expiresAt: Date;
  paymentIntentId: string | null;
  livemode: boolean;
}

export interface CreateRefundInput {
  connectedAccountId: string;
  paymentIntentId: string;
  chargeId?: string | null;
  amountCents?: number;
  refundApplicationFee: boolean;
  reason?: string;
  stripeIdempotencyKey: string;
}

export interface RefundRef {
  refundId: string;
  amountCents: number;
  currency: string;
  status: string;
  livemode: boolean;
}
