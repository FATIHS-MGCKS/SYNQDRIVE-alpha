import {
  BillingAddonKey,
  BillingProductKind,
  SubscriptionStatus,
} from './billing-domain.types';
import { resolveSubscriptionDomainStatus } from './subscription-lifecycle';
import {
  BillingStatus,
  BillingSubscriptionItemRole,
  BillingSubscriptionItemStatus,
} from '@prisma/client';
import { isBillingAddonKey, mapProductSlugToBillingProductKind } from './mappers/billing-legacy.mappers';

/** Central past-due grace period before entitlements are revoked. */
export const BILLING_PAST_DUE_GRACE_PERIOD_DAYS = 7;

export const BillingEntitlementAccessStatus = {
  ACTIVE: 'ACTIVE',
  TRIALING: 'TRIALING',
  GRACE_PERIOD: 'GRACE_PERIOD',
  SCHEDULED_CANCEL: 'SCHEDULED_CANCEL',
  PAUSED: 'PAUSED',
  INACTIVE: 'INACTIVE',
} as const;

export type BillingEntitlementAccessStatus =
  (typeof BillingEntitlementAccessStatus)[keyof typeof BillingEntitlementAccessStatus];

export const BillingEntitlementSource = {
  BILLING_CONTRACT: 'BILLING_CONTRACT',
  NONE: 'NONE',
} as const;

export type BillingEntitlementSource =
  (typeof BillingEntitlementSource)[keyof typeof BillingEntitlementSource];

export interface BillingProductLimits {
  maxVehicles: number | null;
  maxUsers: number | null;
  maxStations: number | null;
  features: string[];
}

export interface BillingAddonEntitlement {
  addonKey: BillingAddonKey;
  status: BillingEntitlementAccessStatus;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
  limits: BillingProductLimits;
  source: BillingEntitlementSource;
  lastUpdatedAt: string;
}

export interface BillingEntitlementSnapshot {
  organizationId: string;
  baseProduct: typeof BillingProductKind.RENTAL | typeof BillingProductKind.FLEET | null;
  addonKeys: BillingAddonKey[];
  activeAddonKeys: BillingAddonKey[];
  status: BillingEntitlementAccessStatus;
  subscriptionStatus: SubscriptionStatus | null;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
  limits: BillingProductLimits;
  source: BillingEntitlementSource;
  lastUpdatedAt: string;
  resolvedAt: string;
  addons: BillingAddonEntitlement[];
  gracePeriodEndsAt: string | null;
  inGracePeriod: boolean;
}

export interface BillingEntitlementContractItem {
  id: string;
  itemRole: BillingSubscriptionItemRole;
  status: BillingSubscriptionItemStatus;
  validFrom: Date;
  validTo: Date | null;
  updatedAt: Date;
  productKey: string;
  metadata: Record<string, unknown> | null;
}

export interface BillingEntitlementContractInput {
  subscription: {
    id: string;
    status: BillingStatus;
    cancelAtPeriodEnd: boolean;
    trialStartAt: Date | null;
    trialEndAt: Date | null;
    startedAt: Date | null;
    endedAt: Date | null;
    cancelAt: Date | null;
    currentPeriodEnd: Date | null;
    updatedAt: Date;
  } | null;
  items: BillingEntitlementContractItem[];
}

const ENTITLING_ITEM_STATUSES: BillingSubscriptionItemStatus[] = [
  BillingSubscriptionItemStatus.ACTIVE,
  BillingSubscriptionItemStatus.TRIALING,
];

export function parseBillingProductLimits(metadata: unknown): BillingProductLimits {
  const record =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};

  const readLimit = (key: string): number | null =>
    typeof record[key] === 'number' && Number.isFinite(record[key] as number)
      ? (record[key] as number)
      : null;

  const features = Array.isArray(record.features)
    ? record.features.filter((value): value is string => typeof value === 'string')
    : [];

  return {
    maxVehicles: readLimit('maxVehicles'),
    maxUsers: readLimit('maxUsers'),
    maxStations: readLimit('maxStations'),
    features,
  };
}

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isItemEntitlingAt(item: BillingEntitlementContractItem, asOf: Date): boolean {
  if (!ENTITLING_ITEM_STATUSES.includes(item.status)) {
    return false;
  }
  if (item.validFrom.getTime() > asOf.getTime()) {
    return false;
  }
  if (item.validTo && item.validTo.getTime() < asOf.getTime()) {
    return false;
  }
  return true;
}

function resolveAddonKey(productKey: string): BillingAddonKey | null {
  if (!isBillingAddonKey(productKey)) {
    return null;
  }
  return productKey;
}

function resolveBaseProductKind(
  items: BillingEntitlementContractItem[],
  asOf: Date,
): typeof BillingProductKind.RENTAL | typeof BillingProductKind.FLEET | null {
  const baseItem = items.find(
    (item) => item.itemRole === BillingSubscriptionItemRole.BASE_PLAN && isItemEntitlingAt(item, asOf),
  );
  if (!baseItem) {
    return null;
  }
  const kind = mapProductSlugToBillingProductKind(baseItem.productKey);
  if (kind === BillingProductKind.ADDON) {
    return null;
  }
  return kind;
}

export interface ResolvedEntitlementAccess {
  status: BillingEntitlementAccessStatus;
  active: boolean;
  subscriptionStatus: SubscriptionStatus | null;
  validTo: Date | null;
  gracePeriodEndsAt: Date | null;
  inGracePeriod: boolean;
}

export function resolveEntitlementAccess(
  input: BillingEntitlementContractInput,
  asOf: Date,
): ResolvedEntitlementAccess {
  if (!input.subscription) {
    return {
      status: BillingEntitlementAccessStatus.INACTIVE,
      active: false,
      subscriptionStatus: null,
      validTo: null,
      gracePeriodEndsAt: null,
      inGracePeriod: false,
    };
  }

  const baseItem = input.items.find(
    (item) => item.itemRole === BillingSubscriptionItemRole.BASE_PLAN,
  );
  const subscriptionStatus = resolveSubscriptionDomainStatus({
    status: input.subscription.status,
    cancelAtPeriodEnd: input.subscription.cancelAtPeriodEnd,
    trialStartAt: input.subscription.trialStartAt,
    startedAt: input.subscription.startedAt,
    endedAt: input.subscription.endedAt,
    baseItemStatus: baseItem?.status ?? null,
  });

  const hasEntitlingBaseItem = input.items.some(
    (item) =>
      item.itemRole === BillingSubscriptionItemRole.BASE_PLAN && isItemEntitlingAt(item, asOf),
  );

  if (!hasEntitlingBaseItem) {
    return {
      status: BillingEntitlementAccessStatus.INACTIVE,
      active: false,
      subscriptionStatus,
      validTo: null,
      gracePeriodEndsAt: null,
      inGracePeriod: false,
    };
  }

  if (subscriptionStatus === SubscriptionStatus.CANCELLED) {
    return {
      status: BillingEntitlementAccessStatus.INACTIVE,
      active: false,
      subscriptionStatus,
      validTo: input.subscription.endedAt ?? input.subscription.cancelAt,
      gracePeriodEndsAt: null,
      inGracePeriod: false,
    };
  }

  if (subscriptionStatus === SubscriptionStatus.PAUSED) {
    return {
      status: BillingEntitlementAccessStatus.PAUSED,
      active: false,
      subscriptionStatus,
      validTo: null,
      gracePeriodEndsAt: null,
      inGracePeriod: false,
    };
  }

  if (
    subscriptionStatus === SubscriptionStatus.DRAFT ||
    subscriptionStatus === SubscriptionStatus.INCOMPLETE
  ) {
    return {
      status: BillingEntitlementAccessStatus.INACTIVE,
      active: false,
      subscriptionStatus,
      validTo: null,
      gracePeriodEndsAt: null,
      inGracePeriod: false,
    };
  }

  if (subscriptionStatus === SubscriptionStatus.CANCEL_SCHEDULED) {
    const validTo =
      input.subscription.cancelAt ??
      input.subscription.currentPeriodEnd ??
      baseItem?.validTo ??
      null;
    return {
      status: BillingEntitlementAccessStatus.SCHEDULED_CANCEL,
      active: true,
      subscriptionStatus,
      validTo,
      gracePeriodEndsAt: null,
      inGracePeriod: false,
    };
  }

  if (subscriptionStatus === SubscriptionStatus.PAST_DUE) {
    const graceStart =
      input.subscription.currentPeriodEnd ?? input.subscription.updatedAt;
    const gracePeriodEndsAt = addUtcDays(graceStart, BILLING_PAST_DUE_GRACE_PERIOD_DAYS);
    if (asOf.getTime() <= gracePeriodEndsAt.getTime()) {
      return {
        status: BillingEntitlementAccessStatus.GRACE_PERIOD,
        active: true,
        subscriptionStatus,
        validTo: gracePeriodEndsAt,
        gracePeriodEndsAt,
        inGracePeriod: true,
      };
    }
    return {
      status: BillingEntitlementAccessStatus.INACTIVE,
      active: false,
      subscriptionStatus,
      validTo: gracePeriodEndsAt,
      gracePeriodEndsAt,
      inGracePeriod: false,
    };
  }

  if (subscriptionStatus === SubscriptionStatus.TRIALING) {
    return {
      status: BillingEntitlementAccessStatus.TRIALING,
      active: true,
      subscriptionStatus,
      validTo: input.subscription.trialEndAt ?? baseItem?.validTo ?? null,
      gracePeriodEndsAt: null,
      inGracePeriod: false,
    };
  }

  if (subscriptionStatus === SubscriptionStatus.ACTIVE) {
    return {
      status: BillingEntitlementAccessStatus.ACTIVE,
      active: true,
      subscriptionStatus,
      validTo: baseItem?.validTo ?? input.subscription.currentPeriodEnd,
      gracePeriodEndsAt: null,
      inGracePeriod: false,
    };
  }

  return {
    status: BillingEntitlementAccessStatus.INACTIVE,
    active: false,
    subscriptionStatus,
    validTo: null,
    gracePeriodEndsAt: null,
    inGracePeriod: false,
  };
}

export function resolveBillingEntitlements(
  organizationId: string,
  input: BillingEntitlementContractInput,
  asOf: Date = new Date(),
): BillingEntitlementSnapshot {
  const access = resolveEntitlementAccess(input, asOf);
  const baseProduct = resolveBaseProductKind(input.items, asOf);
  const baseItem = input.items.find(
    (item) => item.itemRole === BillingSubscriptionItemRole.BASE_PLAN && isItemEntitlingAt(item, asOf),
  );

  const addonItems = input.items.filter(
    (item) => item.itemRole === BillingSubscriptionItemRole.ADDON,
  );
  const addons = addonItems.flatMap((item) => {
    const addonKey = resolveAddonKey(item.productKey);
    if (!addonKey) {
      return [];
    }
    const addonActive = access.active && isItemEntitlingAt(item, asOf);
    const addon: BillingAddonEntitlement = {
      addonKey,
      status: addonActive ? access.status : BillingEntitlementAccessStatus.INACTIVE,
      active: addonActive,
      validFrom: item.validFrom.toISOString(),
      validTo: item.validTo?.toISOString() ?? null,
      limits: parseBillingProductLimits(item.metadata),
      source: BillingEntitlementSource.BILLING_CONTRACT,
      lastUpdatedAt: item.updatedAt.toISOString(),
    };
    return [addon];
  });

  const addonKeys = addons.map((addon) => addon.addonKey);
  const activeAddonKeys = addons.filter((addon) => addon.active).map((addon) => addon.addonKey);

  const lastUpdatedAt = [
    input.subscription?.updatedAt,
    baseItem?.updatedAt,
    ...addonItems.map((item) => item.updatedAt),
  ]
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return {
    organizationId,
    baseProduct,
    addonKeys,
    activeAddonKeys,
    status: access.status,
    subscriptionStatus: access.subscriptionStatus,
    active: access.active && baseProduct != null,
    validFrom: baseItem?.validFrom.toISOString() ?? input.subscription?.startedAt?.toISOString() ?? input.subscription?.trialStartAt?.toISOString() ?? null,
    validTo: access.validTo?.toISOString() ?? null,
    limits: parseBillingProductLimits(baseItem?.metadata ?? null),
    source: input.subscription ? BillingEntitlementSource.BILLING_CONTRACT : BillingEntitlementSource.NONE,
    lastUpdatedAt: (lastUpdatedAt ?? asOf).toISOString(),
    resolvedAt: asOf.toISOString(),
    addons,
    gracePeriodEndsAt: access.gracePeriodEndsAt?.toISOString() ?? null,
    inGracePeriod: access.inGracePeriod,
  };
}
