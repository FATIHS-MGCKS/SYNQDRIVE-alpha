import { createHash } from 'crypto';

export const BillingCommandType = {
  MASTER_SUBSCRIPTION_DRAFT: 'master_subscription.draft',
  MASTER_SUBSCRIPTION_ASSIGN_RENTAL: 'master_subscription.assign_rental',
  MASTER_SUBSCRIPTION_ASSIGN_FLEET: 'master_subscription.assign_fleet',
  MASTER_SUBSCRIPTION_SELECT_PRICE_VERSION: 'master_subscription.select_price_version',
  MASTER_SUBSCRIPTION_CONFIGURE_TRIAL: 'master_subscription.configure_trial',
  MASTER_SUBSCRIPTION_BILLING_ANCHOR: 'master_subscription.billing_anchor',
  MASTER_SUBSCRIPTION_ACTIVATE: 'master_subscription.activate',
  MASTER_SUBSCRIPTION_PAUSE: 'master_subscription.pause',
  MASTER_SUBSCRIPTION_REACTIVATE: 'master_subscription.reactivate',
  MASTER_SUBSCRIPTION_SCHEDULE_CANCEL: 'master_subscription.schedule_cancel',
  MASTER_SUBSCRIPTION_REVOKE_CANCEL: 'master_subscription.revoke_cancel',
  MASTER_SUBSCRIPTION_SCHEDULE_TARIFF_CHANGE: 'master_subscription.schedule_tariff_change',
  MASTER_SUBSCRIPTION_SCHEDULE_PRICE_VERSION_CHANGE: 'master_subscription.schedule_price_version_change',
  MASTER_SUBSCRIPTION_ADD_DISCOUNT: 'master_subscription.add_discount',
  MASTER_SUBSCRIPTION_UPDATE_DISCOUNT: 'master_subscription.update_discount',
  MASTER_SUBSCRIPTION_END_DISCOUNT: 'master_subscription.end_discount',
} as const;

export type BillingCommandType =
  (typeof BillingCommandType)[keyof typeof BillingCommandType];

export const BillingCommandErrorCode = {
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
  CONCURRENT_COMMAND_IN_PROGRESS: 'CONCURRENT_COMMAND_IN_PROGRESS',
  COMMAND_FINALIZE_FAILED: 'COMMAND_FINALIZE_FAILED',
} as const;

export type BillingCommandErrorCode =
  (typeof BillingCommandErrorCode)[keyof typeof BillingCommandErrorCode];

const STRIPE_SENSITIVE_KEYS = new Set([
  'stripeSecretKey',
  'stripe_secret_key',
  'clientSecret',
  'client_secret',
  'paymentIntentClientSecret',
  'setupIntentClientSecret',
  'rawStripePayload',
]);

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue(record[key]);
        return acc;
      }, {});
  }
  return value;
}

export function normalizeBillingCommandPayload(payload: unknown): unknown {
  return sortValue(payload);
}

export function hashBillingCommandRequest(payload: unknown): string {
  const normalized = JSON.stringify(normalizeBillingCommandPayload(payload));
  return createHash('sha256').update(normalized).digest('hex');
}

export function sanitizeBillingAuditPayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeBillingAuditPayload(item)) as T;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record)) {
      if (STRIPE_SENSITIVE_KEYS.has(key)) {
        continue;
      }
      next[key] = sanitizeBillingAuditPayload(nested);
    }
    return next as T;
  }
  return value;
}

export function buildBillingCommandOutboxIdempotencyKey(
  commandId: string,
  eventType: string,
): string {
  return `billing-command:${commandId}:${eventType}`;
}
