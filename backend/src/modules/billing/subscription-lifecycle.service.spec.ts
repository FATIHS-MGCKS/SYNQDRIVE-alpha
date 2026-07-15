import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingPriceVersionStatus,
  BillingStatus,
  BillingSubscriptionItemStatus,
} from '@prisma/client';
import { SubscriptionStatus } from './domain/billing-domain.types';
import { SubscriptionLifecycleErrorCode } from './domain/subscription-lifecycle';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

describe('SubscriptionLifecycleService', () => {
  const orgId = 'org-1';
  const subId = 'sub-1';
  const itemId = 'item-base';
  const rentalProductId = 'prod-rental';
  const fleetProductId = 'prod-fleet';
  const priceVersionId = 'ver-active';

  let subscription: any;
  let baseItem: any | null;
  let items: any[];
  let priceVersions: Map<string, any>;
  let auditLogs: any[];
  let publishedEvents: any[];

  const prisma: any = {
    organization: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === orgId ? { id: orgId } : null,
      ),
    },
    billingSubscription: {
      findFirst: jest.fn(async () => ({ ...subscription })),
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === subId ? { ...subscription } : null,
      ),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        if (where.id !== subId) throw new Error('not found');
        return { ...subscription };
      }),
      create: jest.fn(async ({ data }: any) => {
        subscription = {
          id: subId,
          organizationId: orgId,
          lockVersion: 0,
          cancelAtPeriodEnd: false,
          trialStartAt: null,
          trialEndAt: null,
          startedAt: null,
          endedAt: null,
          cancelAt: null,
          currentPeriodEnd: new Date('2026-08-01'),
          ...data,
        };
        return subscription;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (where.id !== subId || where.lockVersion !== subscription.lockVersion) {
          return { count: 0 };
        }
        subscription = {
          ...subscription,
          ...data,
          lockVersion: subscription.lockVersion + 1,
        };
        return { count: 1 };
      }),
    },
    billingSubscriptionItem: {
      findFirst: jest.fn(async () => baseItem),
      findMany: jest.fn(async () => items),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `item-${items.length + 1}`, ...data };
        items.push(row);
        if (row.itemRole === 'BASE_PLAN') baseItem = row;
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        if (baseItem?.id === where.id) {
          baseItem = { ...baseItem, ...data };
        }
        items = items.map((item) => (item.id === where.id ? { ...item, ...data } : item));
        return baseItem;
      }),
    },
    billingCatalogProduct: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.key === 'RENTAL') return { id: rentalProductId, key: 'RENTAL' };
        if (where.key === 'FLEET') return { id: fleetProductId, key: 'FLEET' };
        if (where.id === rentalProductId) return { id: rentalProductId, key: 'RENTAL' };
        return null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        if (where.key === 'FLEET') return { id: fleetProductId };
        return { id: rentalProductId };
      }),
    },
    billingPriceVersion: {
      findUnique: jest.fn(async ({ where }: any) => priceVersions.get(where.id) ?? null),
    },
    billingAuditLog: {
      findMany: jest.fn(async () => auditLogs),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };

  const audit = { log: jest.fn(async (entry: any) => auditLogs.push(entry)) };
  const outbox = {
    enqueue: jest.fn(async (_tx: any, input: any) => ({
      id: `outbox-${publishedEvents.length + 1}`,
      ...input,
      deliveries: [],
    })),
  };
  const quantityLedger = {
    recordSubscriptionActivated: jest.fn(async () => ({ created: true })),
    recordSubscriptionPaused: jest.fn(async () => ({ created: true })),
    recordBasePlanChanged: jest.fn(async () => ({ created: true })),
  };

  let service: SubscriptionLifecycleService;

  const activePriceVersion = {
    id: priceVersionId,
    priceBookId: 'book-1',
    status: BillingPriceVersionStatus.ACTIVE,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    auditLogs = [];
    publishedEvents = [];
    items = [];
    baseItem = null;
    priceVersions = new Map([[priceVersionId, activePriceVersion]]);
    subscription = {
      id: subId,
      organizationId: orgId,
      status: BillingStatus.TRIALING,
      lockVersion: 0,
      cancelAtPeriodEnd: false,
      trialStartAt: null,
      trialEndAt: null,
      startedAt: null,
      endedAt: null,
      cancelAt: null,
      currentPeriodEnd: new Date('2026-08-01'),
      priceBookId: null,
      priceVersionId: null,
    };

    service = new SubscriptionLifecycleService(
      prisma as never,
      audit as never,
      outbox as never,
      quantityLedger as never,
    );
  });

  const assignRentalDraft = async () => {
    await service.assignRental({ subscriptionId: subId, actorUserId: 'admin-1' });
  };

  it('creates a draft subscription and assigns rental', async () => {
    const draft = await service.createDraft({ organizationId: orgId, actorUserId: 'admin-1' });
    expect(draft.domainStatus).toBe(SubscriptionStatus.DRAFT);

    await assignRentalDraft();
    expect(baseItem.billingProductId).toBe(rentalProductId);
    expect(baseItem.status).toBe(BillingSubscriptionItemStatus.DRAFT);
  });

  it('activates only with an active price version', async () => {
    await service.createDraft({ organizationId: orgId });
    await assignRentalDraft();

    await expect(
      service.activate({ subscriptionId: subId, priceVersionId: '' }),
    ).rejects.toBeInstanceOf(ConflictException);

    priceVersions.set('ver-archived', {
      ...activePriceVersion,
      id: 'ver-archived',
      status: BillingPriceVersionStatus.ARCHIVED,
    });
    await expect(
      service.activate({ subscriptionId: subId, priceVersionId: 'ver-archived' }),
    ).rejects.toMatchObject({
      response: { code: SubscriptionLifecycleErrorCode.PRICE_VERSION_ARCHIVED },
    });

    const activated = await service.activate({
      subscriptionId: subId,
      priceVersionId,
      actorUserId: 'admin-1',
    });
    expect(activated.domainStatus).toBe(SubscriptionStatus.ACTIVE);
    expect(quantityLedger.recordSubscriptionActivated).toHaveBeenCalled();
  });

  it('rejects a second active base plan assignment', async () => {
    await service.createDraft({ organizationId: orgId });
    await assignRentalDraft();
    await service.activate({ subscriptionId: subId, priceVersionId });

    await expect(service.assignFleet({ subscriptionId: subId })).rejects.toMatchObject({
      response: { code: SubscriptionLifecycleErrorCode.BASE_PLAN_ALREADY_ACTIVE },
    });
  });

  it('covers allowed and forbidden transitions', async () => {
    await service.createDraft({ organizationId: orgId });
    await assignRentalDraft();

    await service.startTrial({
      subscriptionId: subId,
      priceVersionId,
      trialEndAt: new Date('2026-08-01'),
    });
    expect((await service.getContractHistory(orgId)).items[0].status).toBe('TRIALING');

    await service.activate({ subscriptionId: subId, priceVersionId });
    await service.markPastDue({ subscriptionId: subId });
    let contract = await service.getContractHistory(orgId);
    expect(contract.subscription?.status).toBe(BillingStatus.PAST_DUE);

    await service.reactivate({ subscriptionId: subId });
    await service.pause({ subscriptionId: subId });
    expect(baseItem.status).toBe(BillingSubscriptionItemStatus.PAUSED);

    await service.reactivate({ subscriptionId: subId });
    await service.scheduleCancelAtPeriodEnd({ subscriptionId: subId });
    expect(subscription.cancelAtPeriodEnd).toBe(true);

    await service.revokeCancellation({ subscriptionId: subId });
    expect(subscription.cancelAtPeriodEnd).toBe(false);

    await service.scheduleCancelAtPeriodEnd({ subscriptionId: subId });
    await service.cancelImmediately({
      subscriptionId: subId,
      allowImmediateCancel: true,
    });
    contract = await service.getContractHistory(orgId);
    expect(contract.subscription?.status).toBe(BillingStatus.CANCELLED);

    await expect(service.reactivate({ subscriptionId: subId })).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects immediate cancel without permission', async () => {
    await service.createDraft({ organizationId: orgId });
    await assignRentalDraft();
    await service.activate({ subscriptionId: subId, priceVersionId });

    await expect(service.cancelImmediately({ subscriptionId: subId })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('fails optimistic lock on parallel updates', async () => {
    await service.createDraft({ organizationId: orgId });
    await assignRentalDraft();
    await service.activate({ subscriptionId: subId, priceVersionId });

    await expect(
      service.pause({ subscriptionId: subId, lockVersion: 0 }),
    ).rejects.toMatchObject({
      response: { code: SubscriptionLifecycleErrorCode.OPTIMISTIC_LOCK_FAILED },
    });
  });

  it('returns historical contract items and audit entries', async () => {
    await service.createDraft({ organizationId: orgId, actorUserId: 'admin-1' });
    await assignRentalDraft();
    await service.activate({ subscriptionId: subId, priceVersionId, actorUserId: 'admin-1' });

    const history = await service.getContractHistory(orgId);
    expect(history.items.length).toBeGreaterThan(0);
    expect(history.auditEntries.length).toBeGreaterThan(0);
    expect(outbox.enqueue).toHaveBeenCalled();
  });

  it('rejects unknown subscriptions', async () => {
    await expect(
      service.activate({ subscriptionId: 'missing', priceVersionId }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
