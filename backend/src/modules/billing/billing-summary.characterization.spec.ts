import {
  BillingPaymentMethodStatus,
  BillingStatus,
  BillingUsageCalculationStatus,
  OrgProductPlan,
  OrgProductStatus,
} from '@prisma/client';
import { PricingModel, SubscriptionStatus } from './domain';
import { BillingSummaryService } from './billing-summary.service';

describe('BillingSummaryService characterization', () => {
  const prisma = {
    billingSubscription: { findFirst: jest.fn(), findUnique: jest.fn() },
    organizationProduct: { findMany: jest.fn() },
    billingPaymentMethod: { findFirst: jest.fn() },
  };
  const subscriptionResolver = { resolveContract: jest.fn() };
  const quantityResolver = { resolveQuantity: jest.fn() };
  const pricingResolver = {
    resolvePriceAssignment: jest.fn(),
  };
  const pricebook = {
    getPricingConfiguration: jest.fn(),
    getPriceBook: jest.fn(),
    getVersionWithTiers: jest.fn(),
  };
  const stripePrepared = { getPreparedStatus: jest.fn() };
  const pricePreview = { preview: jest.fn() };
  const entitlementResolver = { resolve: jest.fn() };

  let service: BillingSummaryService;

  const baseContract = {
    organizationId: 'org-a',
    subscriptionId: 'sub-1',
    status: SubscriptionStatus.ACTIVE,
    cancelAtPeriodEnd: false,
    currentPeriod: {
      start: new Date('2026-07-01'),
      end: new Date('2026-07-31'),
      source: 'SUBSCRIPTION' as const,
    },
    priceBookId: 'book-1',
    priceVersionId: 'ver-1',
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    items: [],
    resolvedAt: new Date(),
  };

  const basePreview = {
    organizationId: 'org-a',
    subscriptionId: 'sub-1',
    subscriptionItemId: 'item-1',
    calculationStatus: BillingUsageCalculationStatus.OK,
    tariff: {
      priceBookId: 'book-1',
      name: 'Rental',
      productKey: 'RENTAL',
      interval: 'MONTHLY',
    },
    product: { slug: 'RENTAL', name: 'SynqDrive Rental', plan: 'BUSINESS' },
    priceVersion: { id: 'ver-1', versionNumber: 1, versionLabel: 'v1', status: 'ACTIVE' },
    pricingModel: PricingModel.VOLUME,
    vehicleCount: 2,
    connectedVehicleCount: 3,
    tierBreakdown: [],
    tier: {
      id: 'tier-1',
      minVehicles: 1,
      maxVehicles: 10,
      unitPriceCents: 1500,
      sortOrder: 0,
      status: 'CONFIGURED' as const,
    },
    unitPriceCents: 1500,
    baseAmountCents: 3000,
    discounts: [],
    skippedDiscounts: [],
    amountAfterDiscountCents: 3000,
    totalDiscountCents: 0,
    tax: {
      configured: false,
      taxRateBps: null,
      taxBasisCents: 3000,
      taxCents: null,
      netCents: 3000,
      grossCents: 3000,
    },
    currency: 'EUR',
    warnings: [],
    legacyFallbacks: [],
    priceResolutionSource: 'SUBSCRIPTION_ITEM_VERSION',
    pricingErrorCode: null,
    legacyFallbackUsed: false,
    resolvedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BillingSummaryService(
      prisma as never,
      subscriptionResolver as never,
      quantityResolver as never,
      pricingResolver as never,
      pricebook as never,
      stripePrepared as never,
      pricePreview as never,
      entitlementResolver as never,
    );

    subscriptionResolver.resolveContract.mockResolvedValue(baseContract);
    quantityResolver.resolveQuantity.mockResolvedValue({
      organizationId: 'org-a',
      asOf: new Date(),
      connectedVehicleCount: 3,
      billableVehicleCount: 2,
      billableVehicleIds: [],
      excludedVehicleIds: [],
    });
    pricePreview.preview.mockResolvedValue(basePreview);
    pricingResolver.resolvePriceAssignment.mockResolvedValue({
      organizationId: 'org-a',
      subscriptionId: 'sub-1',
      subscriptionItemId: 'item-1',
      priceBookId: 'book-1',
      priceVersionId: 'ver-1',
      source: 'SUBSCRIPTION_ITEM_VERSION',
      legacyFallbackUsed: false,
      pricingErrorCode: null,
      resolvedAt: new Date(),
    });
    pricebook.getPriceBook.mockResolvedValue({
      id: 'book-1',
      name: 'Rental',
      currency: 'EUR',
      interval: 'MONTHLY',
      productKey: 'RENTAL',
      versions: [],
    });
    pricebook.getVersionWithTiers.mockResolvedValue({
      id: 'ver-1',
      versionNumber: 1,
      versionLabel: 'v1',
      status: 'ACTIVE',
      effectiveFrom: new Date('2026-01-01'),
      tiers: [
        { id: 'tier-1', minVehicles: 1, maxVehicles: 10, unitPriceCents: 1500, sortOrder: 0 },
      ],
    });
    prisma.billingSubscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      status: BillingStatus.ACTIVE,
      cancelAtPeriodEnd: false,
    });
    prisma.organizationProduct.findMany.mockResolvedValue([
      {
        plan: OrgProductPlan.BUSINESS,
        status: OrgProductStatus.ACTIVE,
        product: { slug: 'RENTAL', name: 'SynqDrive Rental' },
      },
    ]);
    prisma.billingPaymentMethod.findFirst.mockResolvedValue({
      type: 'CARD',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2028,
      status: BillingPaymentMethodStatus.ACTIVE,
    });
    stripePrepared.getPreparedStatus.mockReturnValue({
      configured: false,
      webhookConfigured: false,
      portalPrepared: true,
      message: 'Stripe integration is prepared but not yet active.',
    });
    entitlementResolver.resolve.mockResolvedValue({
      organizationId: 'org-a',
      baseProduct: 'RENTAL',
      addonKeys: [],
      activeAddonKeys: [],
      status: 'ACTIVE',
      subscriptionStatus: 'ACTIVE',
      active: true,
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: null,
      limits: { maxVehicles: null, maxUsers: null, maxStations: null, features: [] },
      source: 'BILLING_CONTRACT',
      lastUpdatedAt: '2026-07-01T00:00:00.000Z',
      resolvedAt: '2026-07-15T00:00:00.000Z',
      addons: [],
      gracePeriodEndsAt: null,
      inGracePeriod: false,
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
    expect(pricePreview.preview).toHaveBeenCalledWith('org-a');
  });

  it('uses org-scoped price assignment — not global default pricebook', async () => {
    await service.getSummary('org-a');

    expect(pricingResolver.resolvePriceAssignment).toHaveBeenCalledWith('org-a');
    expect(pricePreview.preview).toHaveBeenCalledWith('org-a');
    expect(pricebook.getPricingConfiguration).not.toHaveBeenCalled();
  });

  it('surfaces discount breakdown from shared preview engine', async () => {
    pricePreview.preview.mockResolvedValue({
      ...basePreview,
      totalDiscountCents: 300,
      amountAfterDiscountCents: 2700,
      discounts: [
        {
          discountId: 'disc-1',
          kind: 'PERCENTAGE',
          percentBps: 1000,
          fixedAmountCents: null,
          appliedAmountCents: 300,
          sortOrder: 1000,
          reason: 'Promo',
          subscriptionItemId: null,
          validFrom: new Date(),
          validTo: null,
        },
      ],
      tax: {
        configured: false,
        taxRateBps: null,
        taxBasisCents: 2700,
        taxCents: null,
        netCents: 2700,
        grossCents: 2700,
      },
    });

    const summary = await service.getSummary('org-a');

    expect(summary.nextInvoicePreview.discountCents).toBe(300);
    expect(summary.nextInvoicePreview.amountAfterDiscountCents).toBe(2700);
    expect(summary.nextInvoicePreview.discounts).toHaveLength(1);
  });

  it('surfaces warnings for missing payment method and unconfigured price', async () => {
    prisma.billingPaymentMethod.findFirst.mockResolvedValue(null);
    pricePreview.preview.mockResolvedValue({
      ...basePreview,
      calculationStatus: BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION,
      tier: null,
      unitPriceCents: null,
      baseAmountCents: null,
      amountAfterDiscountCents: null,
      tax: {
        configured: false,
        taxRateBps: null,
        taxBasisCents: null,
        taxCents: null,
        netCents: null,
        grossCents: null,
      },
    });

    const summary = await service.getSummary('org-a');

    expect(summary.warnings).toEqual(
      expect.arrayContaining(['PAYMENT_METHOD_MISSING', 'NO_ACTIVE_PRICE_VERSION']),
    );
  });

  it('getNextInvoicePreview delegates to shared preview engine', async () => {
    pricePreview.preview.mockResolvedValue({
      ...basePreview,
      totalDiscountCents: 0,
      amountAfterDiscountCents: 1998,
      unitPriceCents: 999,
      baseAmountCents: 1998,
      tier: null,
      tax: {
        configured: false,
        taxRateBps: null,
        taxBasisCents: 1998,
        taxCents: null,
        netCents: 1998,
        grossCents: 1998,
      },
    });

    const preview = await service.getNextInvoicePreview('org-a');

    expect(preview.billableVehicleCount).toBe(2);
    expect(preview.totalCents).toBe(1998);
    expect(pricePreview.preview).toHaveBeenCalledWith('org-a');
  });
});
