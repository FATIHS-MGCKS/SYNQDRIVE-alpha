import { ConflictException } from '@nestjs/common';
import {
  BillingInterval,
  BillingModel,
  BillingProrationBehavior,
  BillingStripeMappingStatus,
  BillingStripeMode,
  BillingSubscriptionItemRole,
  BillingSubscriptionItemStatus,
} from '@prisma/client';
import * as stripeClientUtil from './stripe-client.util';
import { StripeCatalogMappingService } from './stripe-catalog-mapping.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { StripeSubscriptionOrchestratorService } from './stripe-subscription-orchestrator.service';
import { SubscriptionStatus, SyncStatus } from './domain/billing-domain.types';
import { StripeCatalogMappingErrorCode } from './domain/stripe-catalog-mapping';
import { StripeSubscriptionOrchestratorErrorCode } from './domain/stripe-subscription-orchestrator';

describe('StripeSubscriptionOrchestratorService', () => {
  const orgId = 'org-1';
  const subId = 'sub-1';
  const baseItemId = 'item-base';
  const rentalVersionId = 'ver-rental';
  const fleetVersionId = 'ver-fleet';
  const addonVersionId = 'ver-addon';

  let subscription: any;
  let items: any[];
  let discounts: any[];
  let stripeMock: {
    customers: { create: jest.Mock };
    subscriptions: {
      create: jest.Mock;
      update: jest.Mock;
      retrieve: jest.Mock;
      list: jest.Mock;
    };
  };

  const prisma: any = {
    billingSubscription: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.id && where.organizationId && subscription.id !== where.id) return null;
        if (where.organizationId && subscription.organizationId !== where.organizationId) {
          return null;
        }
        return subscription;
      }),
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === subscription.id ? subscription : null,
      ),
      create: jest.fn(async ({ data }: any) => {
        subscription = { id: subId, ...data };
        return subscription;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        if (where.id === subscription.id) {
          subscription = { ...subscription, ...data };
        }
        return subscription;
      }),
    },
    billingSubscriptionItem: {
      findMany: jest.fn(async ({ where }: any) => {
        if (where.subscriptionId) {
          return items.filter((row) => {
            if (row.subscriptionId !== where.subscriptionId) return false;
            if (where.stripeSubscriptionItemId?.not === null && !row.stripeSubscriptionItemId) {
              return false;
            }
            return true;
          });
        }
        return items;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = items.find((item) => item.id === where.id);
        if (!row) {
          return { id: where.id, ...data };
        }
        Object.assign(row, data);
        return row;
      }),
    },
    billingDiscount: {
      findMany: jest.fn(async () => discounts),
    },
    organization: {
      findUnique: jest.fn(async () => ({
        id: orgId,
        companyName: 'Acme Rental',
        legalCompanyName: 'Acme Rental GmbH',
        email: 'billing@acme.test',
        invoiceEmail: 'billing@acme.test',
        managerEmail: null,
        phone: null,
        address: 'Street 1',
        city: 'Berlin',
        state: null,
        zip: '10115',
        country: 'DE',
      })),
    },
  };

  const configService = {
    get: jest.fn((key: string) => (key === 'stripe.secretKey' ? 'sk_test_abc' : '')),
  };

  const catalogMappings = {
    getRuntimeStripeMode: jest.fn(() => BillingStripeMode.TEST),
    resolveStripePrice: jest.fn(async ({ priceVersionId }: { priceVersionId: string }) => ({
      stripePriceId: `price_${priceVersionId}`,
      stripeProductId: 'prod_test',
      stripeMode: BillingStripeMode.TEST,
      currency: 'EUR',
      billingInterval: BillingInterval.MONTHLY,
      billingModel: BillingModel.PER_CONNECTED_VEHICLE,
      stripePresentation: 'recurring_per_unit',
      mappingId: `map-${priceVersionId}`,
      priceVersionId,
      billingProductId: 'bprod-1',
      source: 'CATALOG_MAPPING',
      legacyFallbackUsed: false,
    })),
  } as unknown as StripeCatalogMappingService;

  const lifecycle = {
    getContractState: jest.fn(async () => ({
      subscription,
      domainStatus: SubscriptionStatus.ACTIVE,
      baseItem: items.find((item) => item.itemRole === BillingSubscriptionItemRole.BASE_PLAN),
      items,
      lockVersion: subscription.lockVersion,
    })),
  } as unknown as SubscriptionLifecycleService;

  const events = {
    publishSubscriptionSynced: jest.fn(async () => undefined),
  };

  let service: StripeSubscriptionOrchestratorService;

  const stripeSub = {
    id: 'sub_stripe_1',
    customer: 'cus_test_1',
    status: 'active',
    current_period_start: 1_700_000_000,
    current_period_end: 1_700_259_200,
    cancel_at_period_end: false,
    items: {
      data: [
        {
          id: 'si_base',
          quantity: 3,
          price: { id: `price_${rentalVersionId}` },
          metadata: { synqdriveSubscriptionItemId: baseItemId },
        },
      ],
    },
    metadata: {
      organizationId: orgId,
      synqdriveSubscriptionId: subId,
    },
  };

  const buildBaseItem = (overrides: Record<string, unknown> = {}) => ({
    id: baseItemId,
    subscriptionId: subId,
    organizationId: orgId,
    billingProductId: 'bprod-rental',
    itemRole: BillingSubscriptionItemRole.BASE_PLAN,
    priceBookId: 'book-1',
    priceVersionId: rentalVersionId,
    quantity: 3,
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validTo: null,
    status: BillingSubscriptionItemStatus.ACTIVE,
    stripeSubscriptionItemId: null,
    stripeMode: null,
    prorationBehavior: BillingProrationBehavior.CREATE_PRORATIONS,
    billingProduct: { key: 'RENTAL', name: 'Rental' },
    priceVersion: { id: rentalVersionId, versionNumber: 1, status: 'ACTIVE' },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    subscription = {
      id: subId,
      organizationId: orgId,
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      stripeMode: null,
      status: 'ACTIVE',
      trialEndAt: null,
      billingAnchorDay: null,
      priceVersionId: rentalVersionId,
      lockVersion: 0,
      stripeSyncStatus: BillingStripeMappingStatus.PENDING,
    };
    items = [buildBaseItem()];
    discounts = [];

    stripeMock = {
      customers: {
        create: jest.fn(async () => ({ id: 'cus_test_1' })),
      },
      subscriptions: {
        create: jest.fn(async () => stripeSub),
        update: jest.fn(async () => stripeSub),
        retrieve: jest.fn(async () => stripeSub),
        list: jest.fn(async () => ({ data: [] })),
      },
    };

    jest.spyOn(stripeClientUtil, 'getStripeClient').mockReturnValue(stripeMock as never);

    service = new StripeSubscriptionOrchestratorService(
      prisma as never,
      configService as never,
      catalogMappings,
      lifecycle,
      events as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    stripeClientUtil.resetStripeClientForTests();
  });

  const runSync = async () => {
    const promise = service.syncOrganizationSubscription({ organizationId: orgId });
    await Promise.all([promise, jest.runAllTimersAsync()]);
    return await promise;
  };

  it('creates stripe subscription for rental base plan with quantity > 0', async () => {
    const result = await runSync();

    expect(stripeMock.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_test_1',
        items: [
          expect.objectContaining({
            price: `price_${rentalVersionId}`,
            quantity: 3,
          }),
        ],
      }),
      expect.any(Object),
    );
    expect(result.syncStatus).toBe(SyncStatus.SYNCED);
    expect(result.created).toBe(true);
    expect(subscription.stripeSubscriptionId).toBe('sub_stripe_1');
    expect(items[0].stripeSubscriptionItemId).toBe('si_base');
  });

  it('creates stripe subscription for fleet base plan', async () => {
    items = [
      buildBaseItem({
        billingProductId: 'bprod-fleet',
        priceVersionId: fleetVersionId,
        billingProduct: { key: 'FLEET', name: 'Fleet' },
      }),
    ];
    stripeSub.items.data[0].price = { id: `price_${fleetVersionId}` };

    await runSync();

    expect(catalogMappings.resolveStripePrice).toHaveBeenCalledWith(
      expect.objectContaining({ priceVersionId: fleetVersionId }),
    );
    expect(stripeMock.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ price: `price_${fleetVersionId}` })],
      }),
      expect.any(Object),
    );
  });

  it('keeps quantity 0 and never coerces it to 1', async () => {
    items = [buildBaseItem({ quantity: 0 })];
    stripeSub.items.data[0].quantity = 0;

    await runSync();

    expect(stripeMock.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ quantity: 0 })],
      }),
      expect.any(Object),
    );
  });

  it('applies trial_end from local contract', async () => {
    const trialEndAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    subscription.trialEndAt = trialEndAt;
    (lifecycle.getContractState as jest.Mock).mockResolvedValue({
      subscription,
      domainStatus: SubscriptionStatus.TRIALING,
      baseItem: items[0],
      items,
      lockVersion: 0,
    });

    await runSync();

    expect(stripeMock.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        trial_end: Math.floor(trialEndAt.getTime() / 1000),
      }),
      expect.any(Object),
    );
  });

  it('includes mapped stripe coupon discounts', async () => {
    discounts = [
      {
        id: 'disc-1',
        stripeCouponId: 'coupon_10',
        stripeMode: BillingStripeMode.TEST,
      },
    ];

    await runSync();

    expect(stripeMock.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        discounts: [{ coupon: 'coupon_10' }],
      }),
      expect.any(Object),
    );
  });

  it('updates existing stripe subscription on price version change', async () => {
    subscription.stripeSubscriptionId = 'sub_stripe_1';
    subscription.stripeMode = BillingStripeMode.TEST;
    items = [
      buildBaseItem({
        priceVersionId: fleetVersionId,
        stripeSubscriptionItemId: 'si_base',
        stripeMode: BillingStripeMode.TEST,
      }),
    ];
    (lifecycle.getContractState as jest.Mock).mockResolvedValue({
      subscription,
      domainStatus: SubscriptionStatus.ACTIVE,
      baseItem: items[0],
      items,
      lockVersion: 0,
    });
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      ...stripeSub,
      items: {
        data: [
          {
            id: 'si_base',
            quantity: 3,
            price: { id: `price_${rentalVersionId}` },
            metadata: { synqdriveSubscriptionItemId: baseItemId },
          },
        ],
      },
    });

    await runSync();

    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      'sub_stripe_1',
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: 'si_base',
            price: `price_${fleetVersionId}`,
          }),
        ],
      }),
    );
    expect(stripeMock.subscriptions.create).not.toHaveBeenCalled();
  });

  it('retries sync for existing stripe subscription without creating duplicates', async () => {
    subscription.stripeSubscriptionId = 'sub_stripe_1';
    subscription.stripeMode = BillingStripeMode.TEST;
    items = [
      buildBaseItem({
        stripeSubscriptionItemId: 'si_base',
        stripeMode: BillingStripeMode.TEST,
      }),
    ];
    stripeMock.subscriptions.retrieve.mockResolvedValue(stripeSub);

    await runSync();
    const retryPromise = service.retrySyncOrganizationSubscription(orgId);
    await Promise.all([retryPromise, jest.runAllTimersAsync()]);
    const second = await retryPromise;

    expect(stripeMock.subscriptions.create).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.update).toHaveBeenCalled();
    expect(second.syncStatus).toBe(SyncStatus.SYNCED);
  });

  it('removes ended local items from stripe subscription', async () => {
    subscription.stripeSubscriptionId = 'sub_stripe_1';
    subscription.stripeMode = BillingStripeMode.TEST;
    items = [
      buildBaseItem({
        stripeSubscriptionItemId: 'si_base',
        stripeMode: BillingStripeMode.TEST,
      }),
    ];
    prisma.billingSubscriptionItem.findMany.mockImplementation(async ({ where }: any) => {
      if (where.subscriptionId && where.stripeSubscriptionItemId?.not === null) {
        return [
          ...items.filter((row) => row.stripeSubscriptionItemId),
          {
            id: 'item-ended',
            stripeSubscriptionItemId: 'si_old',
            status: BillingSubscriptionItemStatus.ENDED,
            prorationBehavior: BillingProrationBehavior.NONE,
          },
        ];
      }
      return items;
    });
    stripeMock.subscriptions.retrieve.mockResolvedValue(stripeSub);

    await runSync();

    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      'sub_stripe_1',
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ id: 'si_old', deleted: true }),
        ]),
      }),
    );
  });

  it('syncs rental and addon as separate stripe items', async () => {
    items = [
      buildBaseItem(),
      buildBaseItem({
        id: 'item-addon',
        itemRole: BillingSubscriptionItemRole.ADDON,
        billingProductId: 'bprod-addon',
        priceVersionId: addonVersionId,
        quantity: 1,
        billingProduct: { key: 'VOICE_AGENT', name: 'Voice Agent' },
      }),
    ];
    (lifecycle.getContractState as jest.Mock).mockResolvedValue({
      subscription,
      domainStatus: SubscriptionStatus.ACTIVE,
      baseItem: items[0],
      items,
      lockVersion: 0,
    });
    stripeMock.subscriptions.create.mockResolvedValue({
      ...stripeSub,
      items: {
        data: [
          {
            id: 'si_base',
            quantity: 3,
            price: { id: `price_${rentalVersionId}` },
            metadata: { synqdriveSubscriptionItemId: baseItemId },
          },
          {
            id: 'si_addon',
            quantity: 1,
            price: { id: `price_${addonVersionId}` },
            metadata: { synqdriveSubscriptionItemId: 'item-addon' },
          },
        ],
      },
    });

    await runSync();

    expect(stripeMock.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ price: `price_${rentalVersionId}`, quantity: 3 }),
          expect.objectContaining({ price: `price_${addonVersionId}`, quantity: 1 }),
        ]),
      }),
      expect.any(Object),
    );
  });

  it('translates provider timeout errors and marks sync failed', async () => {
    stripeMock.subscriptions.create.mockRejectedValueOnce({
      type: 'StripeConnectionError',
      code: 'timeout',
    });

    await expect(runSync()).rejects.toMatchObject({
      response: { code: StripeSubscriptionOrchestratorErrorCode.PROVIDER_TIMEOUT },
    });
    expect(subscription.stripeSyncStatus).toBe(BillingStripeMappingStatus.FAILED);
  });

  it('rejects missing catalog mapping for modern contract', async () => {
    (catalogMappings.resolveStripePrice as jest.Mock).mockRejectedValueOnce({
      response: { code: StripeCatalogMappingErrorCode.STRIPE_MAPPING_MISSING },
    });

    await expect(runSync()).rejects.toBeInstanceOf(ConflictException);
    expect(subscription.stripeSyncStatus).toBe(BillingStripeMappingStatus.FAILED);
  });

  it('rejects test/live mode mismatch from catalog mapping', async () => {
    (catalogMappings.resolveStripePrice as jest.Mock).mockResolvedValueOnce({
      stripePriceId: 'price_live',
      stripeMode: BillingStripeMode.LIVE,
    });

    await expect(runSync()).rejects.toMatchObject({
      response: { code: StripeSubscriptionOrchestratorErrorCode.STRIPE_MODE_MISMATCH },
    });
  });

  it('detects duplicate stripe subscriptions for the same organization', async () => {
    stripeMock.subscriptions.list.mockResolvedValueOnce({
      data: [
        {
          id: 'sub_a',
          status: 'active',
          metadata: { organizationId: orgId, synqdriveSubscriptionId: subId },
        },
        {
          id: 'sub_b',
          status: 'active',
          metadata: { organizationId: orgId, synqdriveSubscriptionId: subId },
        },
      ],
    });

    await expect(runSync()).rejects.toMatchObject({
      response: { code: StripeSubscriptionOrchestratorErrorCode.DUPLICATE_STRIPE_SUBSCRIPTION },
    });
    expect(subscription.stripeSyncStatus).toBe(BillingStripeMappingStatus.DRIFTED);
  });
});
