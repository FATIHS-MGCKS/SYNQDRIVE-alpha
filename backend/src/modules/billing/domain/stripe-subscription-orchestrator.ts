import {
  BillingProrationBehavior,
  BillingStripeMode,
  BillingSubscriptionItemRole,
  BillingSubscriptionItemStatus,
} from '@prisma/client';
import { SyncStatus } from './billing-domain.types';

export const STRIPE_SUBSCRIPTION_ORCHESTRATOR_SCHEMA_VERSION = '1' as const;

export const StripeSubscriptionOrchestratorMetadataKeys = {
  organizationId: 'organizationId',
  subscriptionId: 'synqdriveSubscriptionId',
  schemaVersion: 'schemaVersion',
} as const;

export const StripeSubscriptionOrchestratorErrorCode = {
  NOT_CONFIGURED: 'STRIPE_SUBSCRIPTION_SYNC_NOT_CONFIGURED',
  SUBSCRIPTION_NOT_FOUND: 'STRIPE_SUBSCRIPTION_SYNC_NOT_FOUND',
  STRIPE_MODE_MISMATCH: 'STRIPE_SUBSCRIPTION_SYNC_MODE_MISMATCH',
  MAPPING_MISSING: 'STRIPE_SUBSCRIPTION_SYNC_MAPPING_MISSING',
  DUPLICATE_STRIPE_SUBSCRIPTION: 'STRIPE_SUBSCRIPTION_SYNC_DUPLICATE_SUBSCRIPTION',
  NO_SYNCABLE_ITEMS: 'STRIPE_SUBSCRIPTION_SYNC_NO_SYNCABLE_ITEMS',
  PROVIDER_TIMEOUT: 'STRIPE_SUBSCRIPTION_SYNC_PROVIDER_TIMEOUT',
  PROVIDER_ERROR: 'STRIPE_SUBSCRIPTION_SYNC_PROVIDER_ERROR',
  RATE_LIMITED: 'STRIPE_SUBSCRIPTION_SYNC_RATE_LIMITED',
  PROVIDER_INVALID_REQUEST: 'STRIPE_SUBSCRIPTION_SYNC_PROVIDER_INVALID_REQUEST',
} as const;

export type StripeSubscriptionOrchestratorErrorCode =
  (typeof StripeSubscriptionOrchestratorErrorCode)[keyof typeof StripeSubscriptionOrchestratorErrorCode];

export const STRIPE_SUBSCRIPTION_SYNC_RATE_LIMIT_DELAY_MS = 120;
export const STRIPE_SUBSCRIPTION_SYNC_MAX_RETRIES = 3;
export const STRIPE_SUBSCRIPTION_SYNC_ERROR_MAX_LENGTH = 500;

export const SYNCABLE_ITEM_STATUSES: BillingSubscriptionItemStatus[] = [
  BillingSubscriptionItemStatus.ACTIVE,
  BillingSubscriptionItemStatus.TRIALING,
];

export interface StripeSubscriptionLinePlan {
  localItemId: string;
  itemRole: BillingSubscriptionItemRole;
  priceVersionId: string;
  stripePriceId: string;
  quantity: number;
  prorationBehavior: BillingProrationBehavior;
  existingStripeItemId: string | null;
}

export interface StripeSubscriptionOrchestratorResult {
  organizationId: string;
  subscriptionId: string;
  stripeMode: BillingStripeMode;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  syncStatus: SyncStatus;
  created: boolean;
  updated: boolean;
  removedItemCount: number;
  itemCount: number;
  message: string | null;
  lastError: string | null;
}

export function buildStripeSubscriptionIdempotencyKey(
  subscriptionId: string,
  stripeMode: BillingStripeMode,
): string {
  return `stripe-subscription-sync:${subscriptionId}:${stripeMode}:v${STRIPE_SUBSCRIPTION_ORCHESTRATOR_SCHEMA_VERSION}`;
}

export function buildStripeSubscriptionMetadata(input: {
  organizationId: string;
  subscriptionId: string;
}): Record<string, string> {
  return {
    [StripeSubscriptionOrchestratorMetadataKeys.organizationId]: input.organizationId,
    [StripeSubscriptionOrchestratorMetadataKeys.subscriptionId]: input.subscriptionId,
    [StripeSubscriptionOrchestratorMetadataKeys.schemaVersion]:
      STRIPE_SUBSCRIPTION_ORCHESTRATOR_SCHEMA_VERSION,
    synqdrive: 'true',
  };
}

export function isSyncableSubscriptionItem(
  item: {
    status: BillingSubscriptionItemStatus;
    validTo: Date | null;
    priceVersionId: string | null;
  },
  asOf: Date,
): boolean {
  if (!SYNCABLE_ITEM_STATUSES.includes(item.status)) {
    return false;
  }
  if (item.validTo && item.validTo <= asOf) {
    return false;
  }
  if (!item.priceVersionId) {
    return false;
  }
  return true;
}

/**
 * Quantity is taken from local contract truth. Zero is preserved intentionally:
 * per-vehicle billing with no billable units must not be coerced to 1.
 */
export function resolveStripeItemQuantity(localQuantity: number): number {
  if (!Number.isFinite(localQuantity)) {
    return 0;
  }
  return Math.max(0, Math.trunc(localQuantity));
}

export function mapProrationBehaviorToStripe(
  behavior: BillingProrationBehavior,
): 'create_prorations' | 'none' | 'always_invoice' {
  switch (behavior) {
    case BillingProrationBehavior.NONE:
      return 'none';
    case BillingProrationBehavior.ALWAYS_INVOICE:
      return 'always_invoice';
    default:
      return 'create_prorations';
  }
}

export function computeBillingCycleAnchorUnix(
  anchorDay: number,
  reference: Date = new Date(),
): number {
  const day = Math.min(28, Math.max(1, anchorDay));
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  let target = new Date(Date.UTC(year, month, day, 12, 0, 0));
  if (target.getTime() <= reference.getTime()) {
    target = new Date(Date.UTC(year, month + 1, day, 12, 0, 0));
  }
  return Math.floor(target.getTime() / 1000);
}

export function resolveTrialEndUnix(trialEndAt: Date | null | undefined): number | undefined {
  if (!trialEndAt) {
    return undefined;
  }
  const unix = Math.floor(trialEndAt.getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  return unix > now ? unix : undefined;
}

export function truncateSubscriptionSyncError(message: string): string {
  return message.slice(0, STRIPE_SUBSCRIPTION_SYNC_ERROR_MAX_LENGTH);
}

export function translateStripeSubscriptionProviderError(error: unknown): {
  code: StripeSubscriptionOrchestratorErrorCode;
  message: string;
} {
  const stripeType =
    error && typeof error === 'object' && 'type' in error ? String((error as { type: string }).type) : '';

  if (stripeType === 'StripeRateLimitError') {
    return {
      code: StripeSubscriptionOrchestratorErrorCode.RATE_LIMITED,
      message: StripeSubscriptionOrchestratorErrorCode.RATE_LIMITED,
    };
  }

  if (stripeType === 'StripeConnectionError' || stripeType === 'StripeAPIError') {
    const rawCode =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: string }).code)
        : '';
    if (rawCode === 'timeout' || rawCode === 'request_timeout') {
      return {
        code: StripeSubscriptionOrchestratorErrorCode.PROVIDER_TIMEOUT,
        message: StripeSubscriptionOrchestratorErrorCode.PROVIDER_TIMEOUT,
      };
    }
  }

  if (stripeType === 'StripeInvalidRequestError') {
    return {
      code: StripeSubscriptionOrchestratorErrorCode.PROVIDER_INVALID_REQUEST,
      message: StripeSubscriptionOrchestratorErrorCode.PROVIDER_INVALID_REQUEST,
    };
  }

  if (error instanceof Error && error.message.toLowerCase().includes('timeout')) {
    return {
      code: StripeSubscriptionOrchestratorErrorCode.PROVIDER_TIMEOUT,
      message: StripeSubscriptionOrchestratorErrorCode.PROVIDER_TIMEOUT,
    };
  }

  return {
    code: StripeSubscriptionOrchestratorErrorCode.PROVIDER_ERROR,
    message: StripeSubscriptionOrchestratorErrorCode.PROVIDER_ERROR,
  };
}

export function mapStripeMappingStatusToSyncStatus(status: string): SyncStatus {
  switch (status) {
    case 'SYNCED':
      return SyncStatus.SYNCED;
    case 'FAILED':
      return SyncStatus.FAILED;
    case 'DRIFTED':
      return SyncStatus.DRIFTED;
    default:
      return SyncStatus.PENDING;
  }
}
