import { BillingStatus, BillingSubscriptionItemRole, BillingSubscriptionItemStatus } from '@prisma/client';
import { BillingAddonKey, BillingProductKind, SubscriptionStatus } from './billing-domain.types';
import {
  BILLING_PAST_DUE_GRACE_PERIOD_DAYS,
  BillingEntitlementAccessStatus,
  BillingEntitlementSource,
  addUtcDays,
  parseBillingProductLimits,
  resolveBillingEntitlements,
  resolveEntitlementAccess,
  type BillingEntitlementContractInput,
} from './billing-entitlements';

const asOf = new Date('2026-07-15T12:00:00.000Z');

function contract(
  overrides: Partial<BillingEntitlementContractInput> = {},
): BillingEntitlementContractInput {
  return {
    subscription: {
      id: 'sub-1',
      status: BillingStatus.ACTIVE,
      cancelAtPeriodEnd: false,
      trialStartAt: null,
      trialEndAt: null,
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      endedAt: null,
      cancelAt: null,
      currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-10T00:00:00.000Z'),
    },
    items: [
      {
        id: 'item-base',
        itemRole: BillingSubscriptionItemRole.BASE_PLAN,
        status: BillingSubscriptionItemStatus.ACTIVE,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validTo: null,
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        productKey: 'RENTAL',
        metadata: { maxVehicles: 25, features: ['rental.core'] },
      },
    ],
    ...overrides,
  };
}

describe('billing-entitlements domain', () => {
  it('parses product metadata limits', () => {
    expect(
      parseBillingProductLimits({
        maxVehicles: 50,
        maxUsers: 10,
        maxStations: 3,
        features: ['fleet.core', 42],
      }),
    ).toEqual({
      maxVehicles: 50,
      maxUsers: 10,
      maxStations: 3,
      features: ['fleet.core'],
    });
  });

  it('grants rental entitlements for active base plan', () => {
    const snapshot = resolveBillingEntitlements('org-1', contract(), asOf);
    expect(snapshot.baseProduct).toBe(BillingProductKind.RENTAL);
    expect(snapshot.active).toBe(true);
    expect(snapshot.status).toBe(BillingEntitlementAccessStatus.ACTIVE);
    expect(snapshot.source).toBe(BillingEntitlementSource.BILLING_CONTRACT);
    expect(snapshot.limits.maxVehicles).toBe(25);
  });

  it('grants fleet entitlements for fleet base plan', () => {
    const snapshot = resolveBillingEntitlements(
      'org-1',
      contract({
        items: [
          {
            ...contract().items[0],
            productKey: 'FLEET',
            metadata: { maxVehicles: 100 },
          },
        ],
      }),
      asOf,
    );
    expect(snapshot.baseProduct).toBe(BillingProductKind.FLEET);
    expect(snapshot.active).toBe(true);
  });

  it('grants trial entitlements without paid activation', () => {
    const snapshot = resolveBillingEntitlements(
      'org-1',
      contract({
        subscription: {
          ...contract().subscription!,
          status: BillingStatus.TRIALING,
          trialStartAt: new Date('2026-07-01T00:00:00.000Z'),
          trialEndAt: new Date('2026-08-01T00:00:00.000Z'),
          startedAt: null,
        },
        items: [
          {
            ...contract().items[0],
            status: BillingSubscriptionItemStatus.TRIALING,
          },
        ],
      }),
      asOf,
    );
    expect(snapshot.active).toBe(true);
    expect(snapshot.status).toBe(BillingEntitlementAccessStatus.TRIALING);
    expect(snapshot.subscriptionStatus).toBe(SubscriptionStatus.TRIALING);
  });

  it('keeps past due entitlements during grace period', () => {
    const periodEnd = new Date('2026-07-10T00:00:00.000Z');
    const snapshot = resolveBillingEntitlements(
      'org-1',
      contract({
        subscription: {
          ...contract().subscription!,
          status: BillingStatus.PAST_DUE,
          currentPeriodEnd: periodEnd,
        },
      }),
      asOf,
    );
    expect(snapshot.active).toBe(true);
    expect(snapshot.inGracePeriod).toBe(true);
    expect(snapshot.status).toBe(BillingEntitlementAccessStatus.GRACE_PERIOD);
    expect(snapshot.gracePeriodEndsAt).toBe(
      addUtcDays(periodEnd, BILLING_PAST_DUE_GRACE_PERIOD_DAYS).toISOString(),
    );
  });

  it('revokes past due entitlements after grace period', () => {
    const periodEnd = new Date('2026-07-01T00:00:00.000Z');
    const snapshot = resolveBillingEntitlements(
      'org-1',
      contract({
        subscription: {
          ...contract().subscription!,
          status: BillingStatus.PAST_DUE,
          currentPeriodEnd: periodEnd,
        },
      }),
      asOf,
    );
    expect(snapshot.active).toBe(false);
    expect(snapshot.inGracePeriod).toBe(false);
    expect(snapshot.status).toBe(BillingEntitlementAccessStatus.INACTIVE);
  });

  it('keeps cancel scheduled entitlements active until period end', () => {
    const snapshot = resolveBillingEntitlements(
      'org-1',
      contract({
        subscription: {
          ...contract().subscription!,
          cancelAtPeriodEnd: true,
        },
      }),
      asOf,
    );
    expect(snapshot.active).toBe(true);
    expect(snapshot.status).toBe(BillingEntitlementAccessStatus.SCHEDULED_CANCEL);
    expect(snapshot.subscriptionStatus).toBe(SubscriptionStatus.CANCEL_SCHEDULED);
    expect(snapshot.validTo).toBe(new Date('2026-08-01T00:00:00.000Z').toISOString());
  });

  it('marks cancelled subscriptions inactive', () => {
    const access = resolveEntitlementAccess(
      contract({
        subscription: {
          ...contract().subscription!,
          status: BillingStatus.CANCELLED,
          endedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        items: [
          {
            ...contract().items[0],
            status: BillingSubscriptionItemStatus.CANCELLED,
          },
        ],
      }),
      asOf,
    );
    expect(access.active).toBe(false);
    expect(access.subscriptionStatus).toBe(SubscriptionStatus.CANCELLED);
  });

  it('returns inactive when no entitling base item exists', () => {
    const snapshot = resolveBillingEntitlements(
      'org-1',
      contract({
        items: [
          {
            ...contract().items[0],
            status: BillingSubscriptionItemStatus.DRAFT,
          },
        ],
      }),
      asOf,
    );
    expect(snapshot.active).toBe(false);
    expect(snapshot.baseProduct).toBeNull();
  });

  it('includes simulated addon entitlements from billing items', () => {
    const snapshot = resolveBillingEntitlements(
      'org-1',
      contract({
        items: [
          contract().items[0],
          {
            id: 'item-addon',
            itemRole: BillingSubscriptionItemRole.ADDON,
            status: BillingSubscriptionItemStatus.ACTIVE,
            validFrom: new Date('2026-02-01T00:00:00.000Z'),
            validTo: null,
            updatedAt: new Date('2026-07-02T00:00:00.000Z'),
            productKey: BillingAddonKey.VOICE_AGENT,
            metadata: { maxUsers: 5 },
          },
        ],
      }),
      asOf,
    );
    expect(snapshot.addonKeys).toEqual([BillingAddonKey.VOICE_AGENT]);
    expect(snapshot.activeAddonKeys).toEqual([BillingAddonKey.VOICE_AGENT]);
    expect(snapshot.addons[0].limits.maxUsers).toBe(5);
  });
});
