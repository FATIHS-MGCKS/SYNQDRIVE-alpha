import { BillingStatus, BillingSubscriptionItemRole, BillingSubscriptionItemStatus } from '@prisma/client';
import { BillingAddonKey, BillingProductKind } from './domain/billing-domain.types';
import { BillingEntitlementAccessStatus, BillingEntitlementSource } from './domain/billing-entitlements';
import { BillingEntitlementResolver } from './billing-entitlement-resolver.service';

describe('BillingEntitlementResolver', () => {
  const orgId = 'org-1';
  const asOf = new Date('2026-07-15T12:00:00.000Z');

  let subscription: any;
  let items: any[];

  const prisma: any = {
    billingSubscription: {
      findFirst: jest.fn(async () => subscription),
    },
    billingSubscriptionItem: {
      findMany: jest.fn(async () => items),
    },
  };

  let resolver: BillingEntitlementResolver;

  beforeEach(() => {
    jest.clearAllMocks();
    subscription = {
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
    };
    items = [
      {
        id: 'item-base',
        itemRole: BillingSubscriptionItemRole.BASE_PLAN,
        status: BillingSubscriptionItemStatus.ACTIVE,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validTo: null,
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        metadata: null,
        billingProduct: {
          key: 'RENTAL',
          metadata: { maxVehicles: 30 },
        },
      },
    ];
    resolver = new BillingEntitlementResolver(prisma as never);
  });

  it('resolves rental entitlements from billing contract items', async () => {
    const snapshot = await resolver.resolve(orgId, { asOf });
    expect(snapshot.baseProduct).toBe(BillingProductKind.RENTAL);
    expect(snapshot.active).toBe(true);
    expect(snapshot.source).toBe(BillingEntitlementSource.BILLING_CONTRACT);
    expect(snapshot.limits.maxVehicles).toBe(30);
  });

  it('does not read organization products as entitlement source', async () => {
    prisma.organizationProduct = {
      findMany: jest.fn(async () => [
        {
          status: 'ACTIVE',
          product: { slug: 'FLEET' },
        },
      ]),
    };

    const snapshot = await resolver.resolve(orgId, { asOf });
    expect(snapshot.baseProduct).toBe(BillingProductKind.RENTAL);
    expect(prisma.organizationProduct.findMany).not.toHaveBeenCalled();
  });

  it('organization product data cannot override billing contract product', async () => {
    items[0].billingProduct.key = 'RENTAL';
    const snapshot = await resolver.resolve(orgId, { asOf });

    items[0].billingProduct.key = 'FLEET';
    const fleetSnapshot = await resolver.resolve('org-fleet', { asOf });

    expect(snapshot.baseProduct).toBe(BillingProductKind.RENTAL);
    expect(fleetSnapshot.baseProduct).toBe(BillingProductKind.FLEET);
  });

  it('returns inactive snapshot when no open billing subscription exists', async () => {
    subscription = null;
    items = [];
    const snapshot = await resolver.resolve(orgId, { asOf });
    expect(snapshot.active).toBe(false);
    expect(snapshot.source).toBe(BillingEntitlementSource.NONE);
    expect(snapshot.baseProduct).toBeNull();
  });

  it('resolves addon entitlements from billing subscription items', async () => {
    items.push({
      id: 'item-addon',
      itemRole: BillingSubscriptionItemRole.ADDON,
      status: BillingSubscriptionItemStatus.ACTIVE,
      validFrom: new Date('2026-02-01T00:00:00.000Z'),
      validTo: null,
      updatedAt: new Date('2026-07-02T00:00:00.000Z'),
      metadata: null,
      billingProduct: {
        key: BillingAddonKey.AI_PACKAGE,
        metadata: { features: ['addon.ai_package'] },
      },
    });

    const snapshot = await resolver.resolve(orgId, { asOf });
    expect(snapshot.activeAddonKeys).toEqual([BillingAddonKey.AI_PACKAGE]);
    expect(snapshot.addons[0].status).toBe(BillingEntitlementAccessStatus.ACTIVE);
  });
});
