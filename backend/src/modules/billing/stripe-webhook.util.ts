import Stripe from 'stripe';
import {
  isSupportedStripeBillingWebhookEvent,
  StripeBillingWebhookEventType,
} from './domain/stripe-webhook-matrix';

export interface SafeStripeWebhookPayload {
  stripeEventId: string;
  type: string;
  livemode: boolean;
  created: number;
  stripeObjectId: string | null;
  objectType: string | null;
  organizationId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  invoiceId: string | null;
  paymentIntentId: string | null;
  chargeId: string | null;
}

function readId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id ?? null;
}

export function extractStripeObjectId(event: Stripe.Event): string | null {
  const object = event.data.object as { id?: string };
  return object?.id ?? null;
}

export function extractOrganizationIdFromMetadata(
  metadata: Stripe.Metadata | null | undefined,
): string | null {
  const orgId = metadata?.organizationId?.trim();
  return orgId || null;
}

export function buildSafeStripeWebhookPayload(
  event: Stripe.Event,
  organizationId: string | null = null,
): SafeStripeWebhookPayload {
  const object = event.data.object as unknown as Record<string, unknown>;
  const metadata =
    object && typeof object.metadata === 'object'
      ? (object.metadata as Stripe.Metadata)
      : undefined;

  return {
    stripeEventId: event.id,
    type: event.type,
    livemode: event.livemode,
    created: event.created,
    stripeObjectId: extractStripeObjectId(event),
    objectType: typeof object?.object === 'string' ? object.object : null,
    organizationId: organizationId ?? extractOrganizationIdFromMetadata(metadata),
    customerId: readId(object?.customer as string | { id: string } | null | undefined),
    subscriptionId: readId(object?.subscription as string | { id: string } | null | undefined),
    invoiceId: readId(object?.invoice as string | { id: string } | null | undefined),
    paymentIntentId: readId(
      object?.payment_intent as string | { id: string } | null | undefined,
    ),
    chargeId: readId(object?.charge as string | { id: string } | null | undefined),
  };
}

export function isBillingWebhookMatrixEvent(
  eventType: string,
): eventType is StripeBillingWebhookEventType {
  return isSupportedStripeBillingWebhookEvent(eventType);
}

export function sanitizeSafePayload(
  payload: SafeStripeWebhookPayload,
): Record<string, unknown> {
  return { ...payload };
}
