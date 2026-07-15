import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { BillingController } from './billing.controller';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

function rolesOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(ROLES_KEY, handler);
}

describe('BillingController security characterization', () => {
  it('applies RolesGuard and PermissionsGuard on controller class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, BillingController) ?? [];
    expect(guards).toEqual(expect.arrayContaining([RolesGuard, PermissionsGuard]));
  });

  describe('tenant billing.read endpoints', () => {
    const readHandlers = [
      'getBillingSummary',
      'getBillableVehicles',
      'getNextInvoicePreview',
      'getSubscriptionOverview',
      'findInvoices',
      'getInvoiceDetail',
      'getInvoiceHostedUrl',
      'getInvoicePdfUrl',
      'getInvoicePayments',
      'findSubscriptions',
      'findSubscriptionById',
      'previewUsage',
      'listUsageSnapshots',
      'listPaymentMethods',
      'getDefaultPaymentMethod',
    ] as const;

    it.each(readHandlers)('%s requires billing.read', (method) => {
      expect(permissionOf(BillingController.prototype, method)).toEqual({
        module: 'billing',
        level: 'read',
      });
    });
  });

  describe('tenant billing.write endpoints', () => {
    it('createCustomerPortal requires billing.write', () => {
      expect(permissionOf(BillingController.prototype, 'createCustomerPortal')).toEqual({
        module: 'billing',
        level: 'write',
      });
    });

    it('createSetupIntent requires billing.write', () => {
      expect(permissionOf(BillingController.prototype, 'createSetupIntent')).toEqual({
        module: 'billing',
        level: 'write',
      });
    });

    const writeHandlers = [
      'syncPaymentMethods',
      'setDefaultPaymentMethod',
      'detachPaymentMethod',
    ] as const;

    it.each(writeHandlers)('%s requires billing.write', (method) => {
      expect(permissionOf(BillingController.prototype, method)).toEqual({
        module: 'billing',
        level: 'write',
      });
    });
  });

  describe('master admin endpoints', () => {
    const masterHandlers = [
      'getAdminOverview',
      'listOrganizationsBilling',
      'syncOrganizationStripe',
      'listAdminInvoices',
      'listAuditLog',
      'findAllSubscriptions',
      'getRevenueStats',
      'listPriceBooks',
      'getPricingConfiguration',
      'getPriceBook',
      'listPriceBookVersions',
      'createPriceBook',
      'createDraftVersion',
      'patchPriceVersion',
      'replaceDraftTiers',
      'publishPriceVersion',
      'archivePriceVersion',
      'listAdminPaymentMethods',
      'syncOrganizationPaymentMethods',
      'adminSetDefaultPaymentMethod',
      'adminDetachPaymentMethod',
      'getStripeStatus',
      'listWebhookEvents',
      'createSubscription',
    ] as const;

    it.each(masterHandlers)('%s requires MASTER_ADMIN role', (method) => {
      expect(rolesOf(BillingController.prototype, method)).toEqual(['MASTER_ADMIN']);
    });
  });
});

describe('BillingController tenant org isolation characterization', () => {
  const billingService = {
    findSubscriptionById: jest.fn(),
    findInvoices: jest.fn(),
    findPaymentMethods: jest.fn(),
  };
  const summaryService = { getSummary: jest.fn(), getNextInvoicePreview: jest.fn() };
  const subscriptionOverviewService = { getOverview: jest.fn() };
  const tenantInvoicesService = {
    listInvoices: jest.fn(),
    getInvoiceDetail: jest.fn(),
    getHostedInvoiceUrl: jest.fn(),
    getInvoicePdfUrl: jest.fn(),
  };
  const tenantPaymentsService = { getInvoicePaymentHistory: jest.fn() };
  const tenantPaymentMethodsService = {
    listPaymentMethods: jest.fn(),
    getDefaultPaymentMethod: jest.fn(),
    createCustomerPortalSession: jest.fn(),
    createSetupIntent: jest.fn(),
    setDefaultPaymentMethod: jest.fn(),
    detachPaymentMethod: jest.fn(),
  };
  const pricebookService = {};
  const usageService = {};
  const adminService = {};
  const billableVehiclesService = {};
  const stripePreparedService = {};
  const paymentLedgerService = { getInvoicePaymentLedger: jest.fn() };
  const manualPaymentService = { recordManualPayment: jest.fn() };
  const reconciliationService = { runBatch: jest.fn(), listOpenDrifts: jest.fn() };
  const prisma = {
    billingInvoice: { findUnique: jest.fn() },
  };

  let controller: BillingController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BillingController(
      billingService as never,
      pricebookService as never,
      usageService as never,
      adminService as never,
      summaryService as never,
      subscriptionOverviewService as never,
      tenantInvoicesService as never,
      tenantPaymentsService as never,
      tenantPaymentMethodsService as never,
      billableVehiclesService as never,
      stripePreparedService as never,
      paymentLedgerService as never,
      manualPaymentService as never,
      reconciliationService as never,
      prisma as never,
    );
  });

  it('rejects tenant access to subscription belonging to another org', async () => {
    billingService.findSubscriptionById.mockResolvedValue({
      id: 'sub-other',
      organizationId: 'org-b',
    });

    await expect(
      controller.findSubscriptionById('sub-other', {
        user: { platformRole: 'USER', organizationId: 'org-a' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows tenant access to own-org subscription', async () => {
    const sub = { id: 'sub-a', organizationId: 'org-a' };
    billingService.findSubscriptionById.mockResolvedValue(sub);

    await expect(
      controller.findSubscriptionById('sub-a', {
        user: { platformRole: 'USER', organizationId: 'org-a' },
      }),
    ).resolves.toBe(sub);
  });

  it('allows master admin to read subscription from any org', async () => {
    const sub = { id: 'sub-b', organizationId: 'org-b' };
    billingService.findSubscriptionById.mockResolvedValue(sub);

    await expect(
      controller.findSubscriptionById('sub-b', {
        user: { platformRole: 'MASTER_ADMIN' },
      }),
    ).resolves.toBe(sub);
  });

  it('scopes billing summary to JWT org for tenant users', async () => {
    summaryService.getSummary.mockResolvedValue({ organizationId: 'org-a' });

    await controller.getBillingSummary(undefined, {
      user: { platformRole: 'USER', organizationId: 'org-a' },
    });

    expect(summaryService.getSummary).toHaveBeenCalledWith('org-a');
  });

  it('rejects tenant spoofing orgId query on billing summary', async () => {
    await expect(
      controller.getBillingSummary('org-b', {
        user: { platformRole: 'USER', organizationId: 'org-a' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(summaryService.getSummary).not.toHaveBeenCalled();
  });

  it('requires explicit orgId for master admin billing summary', async () => {
    await expect(
      controller.getBillingSummary(undefined, {
        user: { platformRole: 'MASTER_ADMIN' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows master admin billing summary with explicit orgId', async () => {
    summaryService.getSummary.mockResolvedValue({ organizationId: 'org-b' });

    await controller.getBillingSummary('org-b', {
      user: { platformRole: 'MASTER_ADMIN' },
    });

    expect(summaryService.getSummary).toHaveBeenCalledWith('org-b');
  });

  it('scopes subscription overview to JWT org for tenant users', async () => {
    subscriptionOverviewService.getOverview.mockResolvedValue({ asOf: '2026-07-15T12:00:00.000Z' });

    await controller.getSubscriptionOverview(undefined, {
      user: { platformRole: 'USER', organizationId: 'org-a' },
    });

    expect(subscriptionOverviewService.getOverview).toHaveBeenCalledWith('org-a');
  });

  it('rejects tenant spoofing orgId on subscription overview', async () => {
    await expect(
      controller.getSubscriptionOverview('org-b', {
        user: { platformRole: 'USER', organizationId: 'org-a' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(subscriptionOverviewService.getOverview).not.toHaveBeenCalled();
  });

  it('scopes invoice detail to JWT org for tenant users', async () => {
    tenantInvoicesService.getInvoiceDetail.mockResolvedValue({ id: 'inv-1' });

    await controller.getInvoiceDetail('inv-1', undefined, {
      user: { platformRole: 'USER', organizationId: 'org-a' },
    });

    expect(tenantInvoicesService.getInvoiceDetail).toHaveBeenCalledWith('org-a', 'inv-1');
  });

  it('rejects tenant spoofing orgId on invoice detail', async () => {
    await expect(
      controller.getInvoiceDetail('inv-1', 'org-b', {
        user: { platformRole: 'USER', organizationId: 'org-a' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tenantInvoicesService.getInvoiceDetail).not.toHaveBeenCalled();
  });
});
