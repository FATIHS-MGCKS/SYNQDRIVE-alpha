import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BillingStatus } from '@prisma/client';
import {
  BillingSubscriptionAdminService,
  MasterSubscriptionAdminErrorCode,
} from './billing-subscription-admin.service';
import { SubscriptionLifecycleErrorCode } from './domain/subscription-lifecycle';
import { SubscriptionStatus } from './domain/billing-domain.types';

describe('BillingSubscriptionAdminService', () => {
  const orgId = 'org-1';
  const otherOrgId = 'org-other';
  const subId = 'sub-1';
  const priceVersionId = 'ver-active';

  let subscription: any;
  let auditLogs: any[];
  let mutationCount: number;

  const prisma: any = {
    organization: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === orgId ? { id: orgId } : null,
      ),
    },
    billingSubscription: {
      findFirst: jest.fn(async () => (subscription ? { ...subscription } : null)),
    },
    billingSubscriptionItem: {
      findFirst: jest.fn(async () => null),
    },
    billingPriceVersion: {
      findUnique: jest.fn(async () => null),
    },
    billingBillableVehicleAssignment: {
      findMany: jest.fn(async () => []),
    },
    billingDiscount: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    billingAuditLog: {
      findFirst: jest.fn(async ({ where }: any) =>
        auditLogs.find((row) => row.organizationId === where.organizationId && row.action === where.action) ??
        null,
      ),
    },
  };

  const lifecycle = {
    createDraft: jest.fn(),
    getContractState: jest.fn(),
    getContractHistory: jest.fn(),
    assignRental: jest.fn(),
    assignFleet: jest.fn(),
    startTrial: jest.fn(),
    changeBillingAnchor: jest.fn(),
    activate: jest.fn(),
    pause: jest.fn(),
    reactivate: jest.fn(),
    scheduleCancelAtPeriodEnd: jest.fn(),
    revokeCancellation: jest.fn(),
    scheduleTariffChange: jest.fn(),
    schedulePriceVersionChange: jest.fn(),
  };

  const pricePreview = {
    preview: jest.fn(async () => ({
      tariff: { productKey: 'RENTAL', priceBookId: 'book-1' },
      priceVersion: { id: priceVersionId, versionLabel: 'v1' },
      vehicleCount: 3,
      unitPriceCents: 1000,
      baseAmountCents: 3000,
      amountAfterDiscountCents: 2700,
      discounts: [],
      warnings: [],
    })),
  };

  const usageSnapshots = {
    preview: jest.fn(async () => ({
      calculatedQuantity: 3,
      subtotalCents: 3000,
      amountAfterDiscountCents: 2700,
      discounts: [],
      proration: { lines: [] },
      warnings: [],
    })),
  };

  const periodResolver = {
    resolveForOrganization: jest.fn(async () => ({
      periodStart: new Date('2026-07-01T00:00:00.000Z'),
      periodEnd: new Date('2026-08-01T00:00:00.000Z'),
    })),
  };

  const audit = {
    log: jest.fn(async (entry: any) => {
      auditLogs.push({
        ...entry,
        afterJson: entry.after,
      });
      mutationCount += 1;
      return entry;
    }),
  };

  let service: BillingSubscriptionAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    auditLogs = [];
    mutationCount = 0;
    subscription = {
      id: subId,
      organizationId: orgId,
      status: BillingStatus.ACTIVE,
      lockVersion: 1,
    };

    service = new BillingSubscriptionAdminService(
      prisma as never,
      lifecycle as never,
      pricePreview as never,
      usageSnapshots as never,
      periodResolver as never,
      audit as never,
    );
  });

  const actor = (overrides: Record<string, unknown> = {}) => ({
    actorUserId: 'master-1',
    idempotencyKey: 'idem-1',
    lockVersion: 1,
    ...overrides,
  });

  it('rejects unknown organizations', async () => {
    await expect(service.getContract(otherOrgId)).rejects.toMatchObject({
      response: { code: MasterSubscriptionAdminErrorCode.ORGANIZATION_NOT_FOUND },
    });
  });

  it('requires idempotency key for mutating operations', async () => {
    await expect(service.createDraft(orgId, { actorUserId: 'master-1' }, 'EUR')).rejects.toMatchObject(
      {
        response: { code: MasterSubscriptionAdminErrorCode.IDEMPOTENCY_KEY_REQUIRED },
      },
    );
  });

  it('replays duplicate idempotency keys without re-running mutation', async () => {
    const wrapped = { organizationId: orgId, contract: { domainStatus: SubscriptionStatus.DRAFT } };
    lifecycle.createDraft.mockResolvedValue(wrapped);
    auditLogs.push({
      organizationId: orgId,
      action: 'idempotency:master-subscription:draft:idem-dup',
      afterJson: wrapped,
    });

    const first = await service.createDraft(orgId, actor({ idempotencyKey: 'idem-dup' }), 'EUR');
    const second = await service.createDraft(orgId, actor({ idempotencyKey: 'idem-dup' }), 'EUR');

    expect(first.replayed).toBe(true);
    expect(second.replayed).toBe(true);
    expect(lifecycle.createDraft).not.toHaveBeenCalled();
    expect(mutationCount).toBe(0);
  });

  it('stores idempotency replay payload after first mutation', async () => {
    const wrapped = { organizationId: orgId, contract: { domainStatus: SubscriptionStatus.DRAFT } };
    lifecycle.createDraft.mockResolvedValue(wrapped);

    const first = await service.createDraft(orgId, actor({ idempotencyKey: 'idem-new' }), 'EUR');
    expect(first.created).toBe(true);
    expect(first.replayed).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'idempotency:master-subscription:draft:idem-new',
      }),
    );

    const second = await service.createDraft(orgId, actor({ idempotencyKey: 'idem-new' }), 'EUR');
    expect(second.replayed).toBe(true);
    expect(lifecycle.createDraft).toHaveBeenCalledTimes(1);
  });

  it('propagates optimistic lock conflicts from lifecycle', async () => {
    lifecycle.pause.mockRejectedValue(
      new ConflictException({
        code: SubscriptionLifecycleErrorCode.OPTIMISTIC_LOCK_FAILED,
        message: SubscriptionLifecycleErrorCode.OPTIMISTIC_LOCK_FAILED,
      }),
    );

    await expect(service.pause(orgId, actor({ lockVersion: 0 }))).rejects.toMatchObject({
      response: { code: SubscriptionLifecycleErrorCode.OPTIMISTIC_LOCK_FAILED },
    });
  });

  it('rejects invalid lifecycle transitions', async () => {
    lifecycle.pause.mockRejectedValue(
      new ConflictException({
        code: SubscriptionLifecycleErrorCode.INVALID_TRANSITION,
        message: SubscriptionLifecycleErrorCode.INVALID_TRANSITION,
      }),
    );

    await expect(service.pause(orgId, actor())).rejects.toMatchObject({
      response: { code: SubscriptionLifecycleErrorCode.INVALID_TRANSITION },
    });
  });

  it('rejects subscription lookup for foreign organization context', async () => {
    subscription = { ...subscription, organizationId: otherOrgId };

    await expect(service.activate(orgId, actor(), { priceVersionId })).rejects.toMatchObject({
      response: { code: MasterSubscriptionAdminErrorCode.SUBSCRIPTION_NOT_FOUND },
    });
  });

  it('preview is non-mutating and returns comparison payload', async () => {
    const beforeAuditCalls = audit.log.mock.calls.length;

    const preview = await service.previewChanges(orgId, {
      productKey: 'FLEET',
      priceVersionId: 'ver-next',
    });

    expect(preview.mutating).toBe(false);
    expect(preview.current.productKey).toBe('RENTAL');
    expect(preview.proposed.productKey).toBe('FLEET');
    expect(preview.proposed.priceVersionId).toBe('ver-next');
    expect(preview.proration).toBeDefined();
    expect(audit.log.mock.calls.length).toBe(beforeAuditCalls);
    expect(lifecycle.createDraft).not.toHaveBeenCalled();
    expect(lifecycle.activate).not.toHaveBeenCalled();
    expect(prisma.billingDiscount.create).not.toHaveBeenCalled();
  });

  it('returns null contract when organization has no open subscription', async () => {
    subscription = null;
    const result = await service.getContract(orgId);
    expect(result).toEqual({
      organizationId: orgId,
      subscription: null,
      contract: null,
    });
  });

  it('delegates change history to lifecycle service', async () => {
    lifecycle.getContractHistory.mockResolvedValue({ items: [], auditEntries: [] });
    await service.getChangeHistory(orgId);
    expect(lifecycle.getContractHistory).toHaveBeenCalledWith(orgId);
  });
});
