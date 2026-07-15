import { BillingUsageCalculationStatus } from '@prisma/client';
import { PricingModel } from './domain/billing-domain.types';
import { SubscriptionPricePreviewService } from './subscription-price-preview.service';

describe('SubscriptionPricePreviewService', () => {
  const prisma = {
    organizationProduct: { findMany: jest.fn() },
    organization: { findUnique: jest.fn() },
  };
  const quantityResolver = { resolveQuantity: jest.fn() };
  const subscriptionResolver = { resolveContract: jest.fn() };
  const pricingResolver = { resolvePriceAssignment: jest.fn() };
  const discountResolver = { resolveDiscounts: jest.fn() };
  const pricebook = {
    getPriceBook: jest.fn(),
    getVersionWithTiers: jest.fn(),
  };
  const priceResolution = { calculateVolumePriceForVersion: jest.fn() };

  let service: SubscriptionPricePreviewService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SubscriptionPricePreviewService(
      prisma as never,
      quantityResolver as never,
      subscriptionResolver as never,
      pricingResolver as never,
      discountResolver as never,
      pricebook as never,
      priceResolution as never,
    );

    quantityResolver.resolveQuantity.mockResolvedValue({
      billableVehicleCount: 2,
      connectedVehicleCount: 2,
    });
    subscriptionResolver.resolveContract.mockResolvedValue({
      subscriptionId: 'sub-1',
      currentPeriod: { start: new Date('2026-07-01'), end: new Date('2026-07-31') },
    });
    pricingResolver.resolvePriceAssignment.mockResolvedValue({
      priceBookId: 'book-1',
      priceVersionId: 'ver-1',
      subscriptionItemId: 'item-1',
      source: 'SUBSCRIPTION_ITEM_VERSION',
      legacyFallbackUsed: false,
      pricingErrorCode: null,
    });
    prisma.organizationProduct.findMany.mockResolvedValue([
      { plan: 'BUSINESS', product: { slug: 'FLEET', name: 'Fleet' } },
    ]);
    prisma.organization.findUnique.mockResolvedValue({ defaultVatRate: 19 });
    pricebook.getPriceBook.mockResolvedValue({
      id: 'book-1',
      name: 'Fleet Default',
      productKey: 'FLEET',
      currency: 'EUR',
      interval: 'MONTH',
    });
    pricebook.getVersionWithTiers.mockResolvedValue({
      id: 'ver-1',
      versionNumber: 1,
      versionLabel: 'v1',
      status: 'ACTIVE',
      tierMode: 'VOLUME',
      tiers: [],
    });
    priceResolution.calculateVolumePriceForVersion.mockResolvedValue({
      calculationStatus: BillingUsageCalculationStatus.OK,
      priceBookId: 'book-1',
      priceVersionId: 'ver-1',
      currency: 'EUR',
      pricingModel: PricingModel.VOLUME,
      tier: {
        id: 'tier-1',
        minVehicles: 1,
        maxVehicles: null,
        unitPriceCents: 1500,
        sortOrder: 0,
        status: 'CONFIGURED',
      },
      tierLines: [
        {
          tierId: 'tier-1',
          minVehicles: 1,
          maxVehicles: null,
          quantity: 2,
          unitPriceCents: 1500,
          subtotalCents: 3000,
          sortOrder: 0,
        },
      ],
      unitPriceCents: 1500,
      subtotalCents: 3000,
      totalCents: 3000,
    });
    discountResolver.resolveDiscounts.mockResolvedValue([]);
  });

  it('returns full preview with tax from org defaultVatRate', async () => {
    const preview = await service.preview('org-1');

    expect(preview.baseAmountCents).toBe(3000);
    expect(preview.amountAfterDiscountCents).toBe(3000);
    expect(preview.tax.configured).toBe(true);
    expect(preview.tax.taxCents).toBe(570);
    expect(preview.tax.grossCents).toBe(3570);
    expect(preview.pricingModel).toBe(PricingModel.VOLUME);
    expect(preview.tierBreakdown).toHaveLength(1);
  });

  it('applies percentage discount before tax', async () => {
    discountResolver.resolveDiscounts.mockResolvedValue([
      {
        id: 'disc-1',
        source: 'BILLING_DISCOUNT',
        applicationPhase: 'SUBTOTAL',
        kind: 'PERCENTAGE',
        percentBps: 1000,
        fixedAmountCents: null,
        currency: null,
        customUnitPriceCents: null,
        customMonthlyMinimumCents: null,
        subscriptionItemId: null,
        priceBookId: null,
        priceVersionId: null,
        reason: 'Launch promo',
        validFrom: new Date('2026-01-01'),
        validTo: null,
        sortOrder: 1000,
      },
    ]);

    const preview = await service.preview('org-1');

    expect(preview.totalDiscountCents).toBe(300);
    expect(preview.amountAfterDiscountCents).toBe(2700);
    expect(preview.tax.netCents).toBe(2700);
    expect(preview.tax.taxCents).toBe(513);
    expect(preview.discounts[0].appliedAmountCents).toBe(300);
  });

  it('marks tax as not configured when org has no defaultVatRate', async () => {
    prisma.organization.findUnique.mockResolvedValue({ defaultVatRate: null });

    const preview = await service.preview('org-1');

    expect(preview.tax.configured).toBe(false);
    expect(preview.tax.taxCents).toBeNull();
    expect(preview.warnings).toContain('TAX_NOT_CONFIGURED');
  });
});
