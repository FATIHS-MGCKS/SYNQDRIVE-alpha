import {
  BillingOrgPriceOverrideStatus,
  BillingPaymentMethodStatus,
  BillingStatus,
  BillingUsageCalculationStatus,
  OrgProductPlan,
  OrgProductStatus,
} from '@prisma/client';
import { BillingSummaryService } from './billing-summary.service';

describe('BillingSummaryService characterization', () => {
  const prisma = {
    billingSubscription: { findFirst: jest.fn() },
    organizationProduct: { findMany: jest.fn() },
    billingOrganizationPriceOverride: { findFirst: jest.fn() },
    billingPaymentMethod: { findFirst: jest.fn() },
  };
  const billableVehicles = {
    getBillableConnectedVehiclesForOrganization: jest.fn(),
  };
  const priceResolution = {
    calculateVolumePrice: jest.fn(),
  };
  const usageService = {
    resolveOrgPriceOverride: jest.fn(),
  };
  const pricebook = {
    getPricingConfiguration: jest.fn(),
  };
  const stripePrepared = {
    getPreparedStatus: jest.fn(),
  };

  let service: BillingSummaryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BillingSummaryService(
      prisma as never,
      billableVehicles as never,
      priceResolution as never,
      usageService as never,
      pricebook as never,
      stripePrepared as never,
    );

    prisma.billingSubscription.findFirst.mockResolvedValue({
      id: 'sub-1',
      status: BillingStatus.ACTIVE,
      cancelAtPeriodEnd: false,
      currentPeriodStart: new Date('2026-07-01'),
      currentPeriodEnd: new Date('2026-07-31'),
    });
    prisma.organizationProduct.findMany.mockResolvedValue([
      {
        plan: OrgProductPlan.BUSINESS,
        status: OrgProductStatus.ACTIVE,
        product: { slug: 'RENTAL', name: 'SynqDrive Rental' },
      },
    ]);
    billableVehicles.getBillableConnectedVehiclesForOrganization.mockResolvedValue({
      connectedVehicleCount: 3,
      billableVehicleCount: 2,
      billableVehicles: [],
      excludedVehicles: [],
    });
    pricebook.getPricingConfiguration.mockResolvedValue({
      configured: true,
      reason: null,
      priceBook: {
        id: 'book-1',
        name: 'Default',
        currency: 'EUR',
        interval: 'MONTHLY',
      },
      activeVersion: {
        id: 'ver-1',
        versionNumber: 1,
        versionLabel: 'v1',
        status: 'ACTIVE',
        effectiveFrom: new Date('2026-01-01'),
        tiers: [
          { id: 'tier-1', minVehicles: 1, maxVehicles: 10, unitPriceCents: 1500, sortOrder: 0 },
        ],
      },
    });
    prisma.billingOrganizationPriceOverride.findFirst.mockResolvedValue(null);
    prisma.billingPaymentMethod.findFirst.mockResolvedValue({
      type: 'CARD',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2028,
      status: BillingPaymentMethodStatus.ACTIVE,
    });
    priceResolution.calculateVolumePrice.mockResolvedValue({
      calculationStatus: BillingUsageCalculationStatus.OK,
      priceBookId: 'book-1',
      priceVersionId: 'ver-1',
      currency: 'EUR',
      tier: {
        id: 'tier-1',
        minVehicles: 1,
        maxVehicles: 10,
        unitPriceCents: 1500,
        sortOrder: 0,
        status: 'CONFIGURED',
      },
      unitPriceCents: 1500,
      subtotalCents: 3000,
      totalCents: 3000,
    });
    stripePrepared.getPreparedStatus.mockReturnValue({
      configured: false,
      webhookConfigured: false,
      portalPrepared: true,
      message: 'Stripe integration is prepared but not yet active.',
    });
  });

  it('returns tenant billing summary with products, vehicles, tier, and preview', async () => {
    const summary = await service.getSummary('org-a');

    expect(summary.organizationId).toBe('org-a');
    expect(summary.billableVehicleCount).toBe(2);
    expect(summary.connectedVehicleCount).toBe(3);
    expect(summary.products).toEqual([
      expect.objectContaining({ slug: 'RENTAL', planDisplay: 'Business' }),
    ]);
    expect(summary.currentTier?.unitPriceCents).toBe(1500);
    expect(summary.nextInvoicePreview.totalCents).toBe(3000);
    expect(summary.billingModel).toBe('PER_CONNECTED_VEHICLE');
    expect(summary.paymentMethod.exists).toBe(true);
  });

  it('uses global default pricebook — not subscription-specific price version', async () => {
    // legacy behavior – subscription priceVersionId ignored; to be corrected in prompt 10
    prisma.billingSubscription.findFirst.mockResolvedValue({
      id: 'sub-1',
      status: BillingStatus.ACTIVE,
      priceBookId: 'other-book',
      priceVersionId: 'other-version',
      cancelAtPeriodEnd: false,
      currentPeriodStart: new Date('2026-07-01'),
      currentPeriodEnd: new Date('2026-07-31'),
    });

    await service.getSummary('org-a');

    expect(pricebook.getPricingConfiguration).toHaveBeenCalled();
    expect(priceResolution.calculateVolumePrice).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        customUnitPriceCents: null,
        customMonthlyMinimumCents: null,
      }),
    );
  });

  it('applies org price override when resolving preview amounts', async () => {
    prisma.billingOrganizationPriceOverride.findFirst.mockResolvedValue({
      customUnitPriceCents: 1200,
      customMonthlyMinimumCents: 5000,
      status: BillingOrgPriceOverrideStatus.ACTIVE,
    });

    await service.getSummary('org-a');

    expect(priceResolution.calculateVolumePrice).toHaveBeenCalledWith(2, {
      customUnitPriceCents: 1200,
      customMonthlyMinimumCents: 5000,
    });
  });

  it('surfaces warnings for missing payment method and unconfigured price', async () => {
    prisma.billingPaymentMethod.findFirst.mockResolvedValue(null);
    priceResolution.calculateVolumePrice.mockResolvedValue({
      calculationStatus: BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION,
      priceBookId: 'book-1',
      priceVersionId: null,
      currency: 'EUR',
      tier: null,
      unitPriceCents: null,
      subtotalCents: null,
      totalCents: null,
    });

    const summary = await service.getSummary('org-a');

    expect(summary.warnings).toEqual(
      expect.arrayContaining(['PAYMENT_METHOD_MISSING', 'NO_ACTIVE_PRICE_VERSION']),
    );
  });

  it('getNextInvoicePreview delegates vehicle count and override resolution', async () => {
    usageService.resolveOrgPriceOverride.mockResolvedValue({
      customUnitPriceCents: 999,
      customMonthlyMinimumCents: null,
    });
    priceResolution.calculateVolumePrice.mockResolvedValue({
      calculationStatus: BillingUsageCalculationStatus.OK,
      tier: null,
      unitPriceCents: 999,
      subtotalCents: 1998,
      totalCents: 1998,
      currency: 'EUR',
    });

    const preview = await service.getNextInvoicePreview('org-a');

    expect(preview.billableVehicleCount).toBe(2);
    expect(preview.totalCents).toBe(1998);
    expect(usageService.resolveOrgPriceOverride).toHaveBeenCalledWith('org-a');
  });
});
