import type { Prisma } from '@prisma/client';
import type Stripe from 'stripe';

/** MVP Connect webhook event types accepted for future processing. */
export const MVP_CONNECT_WEBHOOK_EVENT_TYPES = new Set<string>([
  'account.updated',
  'checkout.session.completed',
  'checkout.session.expired',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
]);

const ALLOWED_METADATA_KEYS = new Set([
  'organizationId',
  'bookingId',
  'invoiceId',
  'paymentRequestId',
  'synqdrive_organization_id',
]);

export function isMvpConnectWebhookEventType(eventType: string): boolean {
  return MVP_CONNECT_WEBHOOK_EVENT_TYPES.has(eventType);
}

export function extractConnectedAccountId(event: Stripe.Event): string | null {
  if (typeof event.account === 'string' && event.account.trim()) {
    return event.account;
  }

  const object = event.data.object as { account?: string | null } | null;
  if (object && typeof object.account === 'string' && object.account.trim()) {
    return object.account;
  }

  return null;
}

export function extractProviderObjectId(event: Stripe.Event): string | null {
  const object = event.data.object as { id?: string } | null;
  return object?.id ?? null;
}

function sanitizeMetadata(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const sanitized: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    if (typeof raw === 'string' && raw.trim()) {
      sanitized[key] = raw.trim();
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

/**
 * Minimized Stripe event snapshot — no secrets, no customer email/phone, no full raw payload.
 */
export function buildSafeConnectWebhookEventData(event: Stripe.Event): Prisma.InputJsonValue {
  const object = event.data.object as unknown as Record<string, unknown> | null;
  const paymentIntent =
    object && typeof object.payment_intent === 'string'
      ? object.payment_intent
      : object && typeof object.payment_intent === 'object' && object.payment_intent
        ? (object.payment_intent as { id?: string }).id ?? null
        : null;

  return {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    account: event.account ?? null,
    objectId: extractProviderObjectId(event),
    objectType: typeof object?.object === 'string' ? object.object : null,
    status: typeof object?.status === 'string' ? object.status : null,
    amount: typeof object?.amount === 'number' ? object.amount : null,
    amount_total: typeof object?.amount_total === 'number' ? object.amount_total : null,
    currency: typeof object?.currency === 'string' ? object.currency : null,
    payment_intent: paymentIntent,
    metadata: sanitizeMetadata(object?.metadata),
  };
}
