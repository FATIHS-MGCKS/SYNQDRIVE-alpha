import {
  BillingPaymentMethodStatus,
  BillingStatus,
  BillingUsageCalculationStatus,
  OrgProductPlan,
  OrgProductStatus,
} from '@prisma/client';
import { SubscriptionStatus } from './domain';
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
    resolveItemPricing: jest.fn(),
    resolveItemPricingForOrganization: jest.fn(),
    resolvePriceAssignment: jest.fn(),
  };
  const discountResolver = { resolveDiscounts: jest.fn() };
  const pricebook = {
    getPricingConfiguration: jest.fn(),
    getPriceBook: jest.fn(),
    getVersionWithTiers: jest.fn(),
  };
  const stripePrepared = { getPreparedStatus: jest.fn() };

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

  const basePricing = {
    priceBookId: 'book-1',
    priceVersionId: 'ver-1',
    currency: 'EUR',
    tier: {
      id: 'tier-1',
      minVehicles: 1,
      maxVehicles: 10,
      unitPriceCents: 1500,
      sortOrder: 0,
      status: 'CONFIGURED' as const,
    },
    unitPriceCents: 1500,
    subtotalCents: 3000,
    totalCents: 3000,
    calculationStatus: BillingUsageCalculationStatus.OK,
    quantity: 2,
    resolvedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BillingSummaryService(
      prisma as never,
      subscriptionResolver as never,
      quantityResolver as never,
      pricingResolver as never,
      discountResolver as never,
      pricebook as never,
      stripePrepared as never,
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
    discountResolver.resolveDiscounts.mockResolvedValue([]);
    pricingResolver.resolveItemPricingForOrganization.mockResolvedValue(basePricing);
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

  it('uses org-scoped price assignment — not global default pricebook', async () => {
    subscriptionResolver.resolveContract.mockResolvedValue({
      ...baseContract,
      priceBookId: 'book-1',
      priceVersionId: 'ver-1',
    });

    await service.getSummary('org-a');

    expect(pricingResolver.resolvePriceAssignment).toHaveBeenCalledWith('org-a');
    expect(pricingResolver.resolveItemPricingForOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        billableQuantity: 2,
        discounts: [],
      }),
    );
    expect(pricebook.getPricingConfiguration).not.toHaveBeenCalled();
  });

  it('applies org price override when resolving preview amounts', async () => {
    discountResolver.resolveDiscounts.mockResolvedValue([
      {
        id: 'disc-1',
        kind: 'FIXED_AMOUNT',
        customUnitPriceCents: 1200,
        customMonthlyMinimumCents: 5000,
        priceBookId: null,
        priceVersionId: null,
        reason: null,
        validFrom: new Date(),
        validTo: null,
        sortOrder: 0,
      },
    ]);

    await service.getSummary('org-a');

    expect(pricingResolver.resolveItemPricingForOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        discounts: expect.arrayContaining([
          expect.objectContaining({ customUnitPriceCents: 1200 }),
        ]),
      }),
    );
  });

  it('surfaces warnings for missing payment method and unconfigured price', async () => {
    prisma.billingPaymentMethod.findFirst.mockResolvedValue(null);
    pricingResolver.resolveItemPricingForOrganization.mockResolvedValue({
      ...basePricing,
      calculationStatus: BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION,
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
    discountResolver.resolveDiscounts.mockResolvedValue([
      {
        id: 'disc-1',
        kind: 'FIXED_AMOUNT',
        customUnitPriceCents: 999,
        customMonthlyMinimumCents: null,
        priceBookId: null,
        priceVersionId: null,
        reason: null,
        validFrom: new Date(),
        validTo: null,
        sortOrder: 0,
      },
    ]);
    pricingResolver.resolveItemPricingForOrganization.mockResolvedValue({
      ...basePricing,
      tier: null,
      unitPriceCents: 999,
      subtotalCents: 1998,
      totalCents: 1998,
    });

    const preview = await service.getNextInvoicePreview('org-a');

    expect(preview.billableVehicleCount).toBe(2);
    expect(preview.totalCents).toBe(1998);
    expect(discountResolver.resolveDiscounts).toHaveBeenCalledWith('org-a');
  });
});
