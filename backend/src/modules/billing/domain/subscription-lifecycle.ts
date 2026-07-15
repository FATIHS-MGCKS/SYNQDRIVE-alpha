import {
  BillingStatus,
  BillingSubscriptionItemStatus,
} from '@prisma/client';
import { SubscriptionStatus } from './billing-domain.types';
import { mapPrismaBillingStatusToDomain } from './mappers/stripe-subscription-status.mapper';

export const SubscriptionLifecycleErrorCode = {
  SUBSCRIPTION_NOT_FOUND: 'SUBSCRIPTION_NOT_FOUND',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  OPTIMISTIC_LOCK_FAILED: 'OPTIMISTIC_LOCK_FAILED',
  BASE_PLAN_ALREADY_ACTIVE: 'BASE_PLAN_ALREADY_ACTIVE',
  BASE_PLAN_NOT_ASSIGNED: 'BASE_PLAN_NOT_ASSIGNED',
  PRICE_VERSION_REQUIRED: 'PRICE_VERSION_REQUIRED',
  PRICE_VERSION_NOT_FOUND: 'PRICE_VERSION_NOT_FOUND',
  PRICE_VERSION_ARCHIVED: 'PRICE_VERSION_ARCHIVED',
  PRICE_VERSION_NOT_ACTIVE: 'PRICE_VERSION_NOT_ACTIVE',
  IMMEDIATE_CANCEL_FORBIDDEN: 'IMMEDIATE_CANCEL_FORBIDDEN',
  INVALID_ANCHOR_DAY: 'INVALID_ANCHOR_DAY',
  UNSUPPORTED_BASE_PRODUCT: 'UNSUPPORTED_BASE_PRODUCT',
  ORGANIZATION_NOT_FOUND: 'ORGANIZATION_NOT_FOUND',
} as const;

export type SubscriptionLifecycleErrorCode =
  (typeof SubscriptionLifecycleErrorCode)[keyof typeof SubscriptionLifecycleErrorCode];

export interface SubscriptionLifecycleContext {
  status: BillingStatus;
  cancelAtPeriodEnd: boolean;
  trialStartAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  baseItemStatus: BillingSubscriptionItemStatus | null;
}

export function resolveSubscriptionDomainStatus(
  subscription: SubscriptionLifecycleContext,
): SubscriptionStatus {
  if (subscription.endedAt != null || subscription.status === BillingStatus.CANCELLED) {
    return SubscriptionStatus.CANCELLED;
  }

  if (subscription.baseItemStatus === BillingSubscriptionItemStatus.PAUSED) {
    return SubscriptionStatus.PAUSED;
  }

  if (
    subscription.status === BillingStatus.TRIALING &&
    subscription.trialStartAt == null &&
    subscription.startedAt == null &&
    (subscription.baseItemStatus == null ||
      subscription.baseItemStatus === BillingSubscriptionItemStatus.DRAFT)
  ) {
    return SubscriptionStatus.DRAFT;
  }

  const mapped = mapPrismaBillingStatusToDomain(subscription.status, {
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  });

  return mapped;
}

const ALLOWED_TRANSITIONS: Readonly<Record<SubscriptionStatus, readonly SubscriptionStatus[]>> = {
  [SubscriptionStatus.DRAFT]: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.TRIALING]: [SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.ACTIVE]: [
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.PAUSED,
    SubscriptionStatus.CANCEL_SCHEDULED,
  ],
  [SubscriptionStatus.PAST_DUE]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.PAUSED,
    SubscriptionStatus.CANCEL_SCHEDULED,
  ],
  [SubscriptionStatus.PAUSED]: [SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.CANCEL_SCHEDULED]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED],
  [SubscriptionStatus.CANCELLED]: [],
  [SubscriptionStatus.INCOMPLETE]: [
    SubscriptionStatus.DRAFT,
    SubscriptionStatus.TRIALING,
    SubscriptionStatus.ACTIVE,
  ],
};

export function assertTransitionAllowed(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
  opts?: { allowImmediateCancel?: boolean },
): void {
  if (from === to) return;

  if (
    from === SubscriptionStatus.ACTIVE &&
    to === SubscriptionStatus.CANCELLED &&
    opts?.allowImmediateCancel
  ) {
    return;
  }

  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new SubscriptionLifecycleTransitionError(from, to);
  }
}

export class SubscriptionLifecycleTransitionError extends Error {
  readonly code = SubscriptionLifecycleErrorCode.INVALID_TRANSITION;

  constructor(
    readonly fromStatus: SubscriptionStatus,
    readonly toStatus: SubscriptionStatus,
  ) {
    super(
      `${SubscriptionLifecycleErrorCode.INVALID_TRANSITION}:${fromStatus}->${toStatus}`,
    );
    this.name = 'SubscriptionLifecycleTransitionError';
  }
}

export function mapDomainStatusToItemStatus(
  status: SubscriptionStatus,
): BillingSubscriptionItemStatus {
  switch (status) {
    case SubscriptionStatus.DRAFT:
      return BillingSubscriptionItemStatus.DRAFT;
    case SubscriptionStatus.TRIALING:
      return BillingSubscriptionItemStatus.TRIALING;
    case SubscriptionStatus.PAUSED:
      return BillingSubscriptionItemStatus.PAUSED;
    case SubscriptionStatus.CANCELLED:
      return BillingSubscriptionItemStatus.CANCELLED;
    case SubscriptionStatus.ACTIVE:
    case SubscriptionStatus.PAST_DUE:
    case SubscriptionStatus.CANCEL_SCHEDULED:
      return BillingSubscriptionItemStatus.ACTIVE;
    default:
      return BillingSubscriptionItemStatus.DRAFT;
  }
}

export function isAllowedTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
  opts?: { allowImmediateCancel?: boolean },
): boolean {
  try {
    assertTransitionAllowed(from, to, opts);
    return true;
  } catch {
    return false;
  }
}

export const SUBSCRIPTION_LIFECYCLE_TRANSITIONS = ALLOWED_TRANSITIONS;
