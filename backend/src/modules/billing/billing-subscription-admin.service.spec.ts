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
import { BillingCommandErrorCode } from './domain/billing-command';
import { SubscriptionLifecycleErrorCode } from './domain/subscription-lifecycle';
import { SubscriptionStatus } from './domain/billing-domain.types';

describe('BillingSubscriptionAdminService', () => {
  const orgId = 'org-1';
  const otherOrgId = 'org-other';
  const subId = 'sub-1';
  const priceVersionId = 'ver-active';

  let subscription: any;

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

  const commands = {
    execute: jest.fn(),
  };

  let service: BillingSubscriptionAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    subscription = {
      id: subId,
      organizationId: orgId,
      status: BillingStatus.ACTIVE,
      lockVersion: 1,
    };

    service = new BillingSubscriptionAdminService(
      prisma as never,
      commands as never,
      lifecycle as never,
      pricePreview as never,
      usageSnapshots as never,
      periodResolver as never,
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

  it('delegates mutating operations to billing command service', async () => {
    const wrapped = {
      created: true,
      replayed: false,
      commandId: 'cmd-1',
      result: { organizationId: orgId, contract: { domainStatus: SubscriptionStatus.DRAFT } },
    };
    commands.execute.mockResolvedValue(wrapped);
    lifecycle.createDraft.mockResolvedValue({
      subscription: { id: subId },
      domainStatus: SubscriptionStatus.DRAFT,
    });

    const response = await service.createDraft(orgId, actor(), 'EUR');
    expect(response).toBe(wrapped);
    expect(commands.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        actor: actor(),
        payload: { currency: 'EUR', lockVersion: 1 },
      }),
    );
  });

  it('propagates command idempotency payload mismatch', async () => {
    commands.execute.mockRejectedValue(
      new ConflictException({
        code: BillingCommandErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
      }),
    );

    await expect(
      service.activate(orgId, actor(), { priceVersionId }),
    ).rejects.toMatchObject({
      response: { code: BillingCommandErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH },
    });
  });

  it('propagates optimistic lock conflicts from lifecycle', async () => {
    commands.execute.mockImplementation(async ({ handler }) => {
      try {
        await handler();
      } catch (error) {
        throw error;
      }
    });
    lifecycle.pause.mockRejectedValue(
      new ConflictException({
        code: SubscriptionLifecycleErrorCode.OPTIMISTIC_LOCK_FAILED,
      }),
    );

    await expect(service.pause(orgId, actor({ lockVersion: 0 }))).rejects.toMatchObject({
      response: { code: SubscriptionLifecycleErrorCode.OPTIMISTIC_LOCK_FAILED },
    });
  });

  it('rejects subscription lookup for foreign organization context', async () => {
    subscription = { ...subscription, organizationId: otherOrgId };
    commands.execute.mockImplementation(async ({ handler }) => handler());

    await expect(service.activate(orgId, actor(), { priceVersionId })).rejects.toMatchObject({
      response: { code: MasterSubscriptionAdminErrorCode.SUBSCRIPTION_NOT_FOUND },
    });
  });

  it('preview is non-mutating and does not invoke command service', async () => {
    const preview = await service.previewChanges(orgId, {
      productKey: 'FLEET',
      priceVersionId: 'ver-next',
    });

    expect(preview.mutating).toBe(false);
    expect(commands.execute).not.toHaveBeenCalled();
    expect(lifecycle.createDraft).not.toHaveBeenCalled();
    expect(lifecycle.activate).not.toHaveBeenCalled();
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
