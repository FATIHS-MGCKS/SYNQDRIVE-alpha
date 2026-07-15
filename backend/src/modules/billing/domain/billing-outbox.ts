import { SubscriptionStatus } from './billing-domain.types';
import { BillingDomainEventType } from './billing-domain.events';
import { sanitizeBillingAuditPayload } from './billing-command';

export const BILLING_OUTBOX_PAYLOAD_VERSION = 1 as const;
export const BILLING_OUTBOX_DEFAULT_CONSUMER_ID = 'billing.primary' as const;
export const BILLING_OUTBOX_MAX_RETRIES = 5;
export const BILLING_OUTBOX_RETRY_BASE_MS = 1_000;
export const BILLING_OUTBOX_BATCH_SIZE = 25;
export const BILLING_OUTBOX_WORKER_INTERVAL_MS = 30_000;

const STRIPE_OBJECT_KEYS = new Set([
  'object',
  'raw',
  'stripeObject',
  'payment_intent',
  'charge',
  'customer',
  'subscription',
  'invoice',
  'lines',
  'metadata',
]);

export const BillingOutboxTransactionalEventType = {
  SUBSCRIPTION_CREATED: BillingDomainEventType.SUBSCRIPTION_CREATED,
  SUBSCRIPTION_ACTIVATED: BillingDomainEventType.SUBSCRIPTION_ACTIVATED,
  SUBSCRIPTION_CHANGED: BillingDomainEventType.SUBSCRIPTION_CHANGED,
  SUBSCRIPTION_CANCEL_SCHEDULED: BillingDomainEventType.SUBSCRIPTION_CANCEL_SCHEDULED,
  SUBSCRIPTION_CANCELLED: BillingDomainEventType.SUBSCRIPTION_CANCELLED,
  TRIAL_ENDING: BillingDomainEventType.TRIAL_ENDING,
  PAYMENT_METHOD_MISSING: BillingDomainEventType.PAYMENT_METHOD_MISSING,
  INVOICE_FINALIZED: BillingDomainEventType.INVOICE_FINALIZED,
  PAYMENT_SUCCEEDED: BillingDomainEventType.PAYMENT_SUCCEEDED,
  PAYMENT_FAILED: BillingDomainEventType.PAYMENT_FAILED,
  INVOICE_OVERDUE: BillingDomainEventType.INVOICE_OVERDUE,
  REFUND_CREATED: BillingDomainEventType.REFUND_CREATED,
  CREDIT_NOTE_CREATED: BillingDomainEventType.CREDIT_NOTE_CREATED,
} as const;

export function buildBillingOutboxIdempotencyKey(parts: string[]): string {
  return parts.filter(Boolean).join(':');
}

export function sanitizeBillingOutboxPayload<T extends Record<string, unknown>>(payload: T): T {
  const sanitized = sanitizeBillingAuditPayload(payload) as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sanitized)) {
    if (STRIPE_OBJECT_KEYS.has(key)) {
      continue;
    }
    next[key] = value;
  }
  return next as T;
}

export function buildVersionedBillingOutboxPayload<T extends Record<string, unknown>>(
  payload: T,
): T & { payloadVersion: number } {
  return sanitizeBillingOutboxPayload({
    ...payload,
    payloadVersion: BILLING_OUTBOX_PAYLOAD_VERSION,
  });
}

export function computeBillingOutboxNextRetryAt(retryCount: number, now = new Date()): Date {
  const delayMs = BILLING_OUTBOX_RETRY_BASE_MS * Math.pow(2, Math.max(0, retryCount - 1));
  return new Date(now.getTime() + delayMs);
}

export function resolveSubscriptionLifecycleOutboxEvent(input: {
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus;
}): string | null {
  if (input.fromStatus == null) {
    return BillingDomainEventType.SUBSCRIPTION_CREATED;
  }
  if (
    input.toStatus === SubscriptionStatus.ACTIVE &&
    input.fromStatus !== SubscriptionStatus.ACTIVE
  ) {
    return BillingDomainEventType.SUBSCRIPTION_ACTIVATED;
  }
  if (input.toStatus === SubscriptionStatus.CANCEL_SCHEDULED) {
    return BillingDomainEventType.SUBSCRIPTION_CANCEL_SCHEDULED;
  }
  if (input.toStatus === SubscriptionStatus.CANCELLED) {
    return BillingDomainEventType.SUBSCRIPTION_CANCELLED;
  }
  if (input.fromStatus !== input.toStatus) {
    return BillingDomainEventType.SUBSCRIPTION_CHANGED;
  }
  return null;
}

export function truncateBillingOutboxError(message: string): string {
  return message.slice(0, 500);
}
