import { BillingUsageCalculationStatus } from '@prisma/client';
import { BillingPriceResolutionService } from './billing-price-resolution.service';
import { PricebookService } from './pricebook.service';

describe('Billing price resolution characterization', () => {
  const pricebook = {
    getPricingConfiguration: jest.fn(),
    getPriceBook: jest.fn(),
    findActiveVersion: jest.fn(),
    getVersionWithTiers: jest.fn(),
  };

  let service: BillingPriceResolutionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BillingPriceResolutionService(pricebook as unknown as PricebookService);
  });

  const activeConfig = {
    configured: true,
    reason: null,
    priceBook: { id: 'book-default', currency: 'EUR', name: 'Default', isDefault: true },
    activeVersion: {
      id: 'ver-active',
      versionNumber: 2,
      tiers: [
        { id: 't1', minVehicles: 1, maxVehicles: 5, unitPriceCents: 2000, sortOrder: 0 },
        { id: 't2', minVehicles: 6, maxVehicles: 20, unitPriceCents: 1800, sortOrder: 1 },
        { id: 't3', minVehicles: 21, maxVehicles: null, unitPriceCents: 1500, sortOrder: 2 },
      ],
    },
  };

  it('resolves global default pricebook and active version for pricing', async () => {
    pricebook.getPricingConfiguration.mockResolvedValue(activeConfig);

    const result = await service.calculateVolumePrice(7);

    expect(pricebook.getPricingConfiguration).toHaveBeenCalled();
    expect(result.calculationStatus).toBe(BillingUsageCalculationStatus.OK);
    expect(result.priceBookId).toBe('book-default');
    expect(result.priceVersionId).toBe('ver-active');
    expect(result.unitPriceCents).toBe(1800);
    expect(result.subtotalCents).toBe(7 * 1800);
    expect(result.tier?.id).toBe('t2');
  });

  it('returns NO_ACTIVE_PRICE_VERSION when default pricebook has no active version', async () => {
    pricebook.getPricingConfiguration.mockResolvedValue({
      configured: false,
      reason: 'NO_ACTIVE_PRICE_VERSION',
      priceBook: { id: 'book-default', currency: 'EUR' },
      activeVersion: null,
    });

    const result = await service.calculateVolumePrice(5);

    expect(result.calculationStatus).toBe(BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION);
    expect(result.unitPriceCents).toBeNull();
  });

  it('returns NO_BILLABLE_VEHICLES when count is zero but version exists', async () => {
    pricebook.getPricingConfiguration.mockResolvedValue(activeConfig);

    const result = await service.calculateVolumePrice(0);

    expect(result.calculationStatus).toBe(BillingUsageCalculationStatus.NO_BILLABLE_VEHICLES);
    expect(result.priceVersionId).toBe('ver-active');
  });

  it('returns PRICE_NOT_CONFIGURED when tier has null unit price', async () => {
    pricebook.getPricingConfiguration.mockResolvedValue({
      ...activeConfig,
      activeVersion: {
        ...activeConfig.activeVersion,
        tiers: [{ id: 't0', minVehicles: 1, maxVehicles: null, unitPriceCents: null, sortOrder: 0 }],
      },
    });

    const result = await service.calculateVolumePrice(3);

    expect(result.calculationStatus).toBe(BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED);
  });

  it('applies custom unit price and monthly minimum overrides', async () => {
    pricebook.getPricingConfiguration.mockResolvedValue(activeConfig);

    const result = await service.calculateVolumePrice(2, {
      customUnitPriceCents: 2500,
      customMonthlyMinimumCents: 6000,
    });

    expect(result.unitPriceCents).toBe(2500);
    expect(result.subtotalCents).toBe(6000);
    expect(result.calculationStatus).toBe(BillingUsageCalculationStatus.OK);
  });

  it('resolveTierForVehicleCountFromVersion reads tiers from explicit version id', async () => {
    pricebook.getVersionWithTiers.mockResolvedValue({
      id: 'ver-explicit',
      tiers: [{ id: 'tx', minVehicles: 1, maxVehicles: 10, unitPriceCents: 990, sortOrder: 0 }],
    });

    const tier = await service.resolveTierForVehicleCountFromVersion('ver-explicit', 4);

    expect(pricebook.getVersionWithTiers).toHaveBeenCalledWith('ver-explicit');
    expect(tier?.unitPriceCents).toBe(990);
    expect(tier?.status).toBe('CONFIGURED');
  });

  it('legacy behavior – explicit priceBookId uses book but still global active version lookup', async () => {
    // Subscription-specific version is not modeled; calculateVolumePrice with priceBookId
    // resolves via getPriceBook + findActiveVersion — not subscription.priceVersionId.
  // to be corrected in prompt 10
    pricebook.getPriceBook.mockResolvedValue({ id: 'book-fleet', currency: 'EUR' });
    pricebook.findActiveVersion.mockResolvedValue({
      id: 'ver-fleet',
      tiers: [{ id: 'tf', minVehicles: 1, maxVehicles: null, unitPriceCents: 1100, sortOrder: 0 }],
    });

    const result = await service.calculateVolumePrice(3, { priceBookId: 'book-fleet' });

    expect(pricebook.getPriceBook).toHaveBeenCalledWith('book-fleet');
    expect(pricebook.findActiveVersion).toHaveBeenCalledWith('book-fleet', expect.any(Date));
    expect(result.priceVersionId).toBe('ver-fleet');
    expect(result.subtotalCents).toBe(3300);
  });
});

describe('PricebookService getPricingConfiguration characterization', () => {
  const audit = { log: jest.fn() };
  let prisma: any;
  let svc: PricebookService;

  beforeEach(() => {
    prisma = {
      billingPriceBook: { findFirst: jest.fn() },
    };
    svc = new PricebookService(prisma, audit as never);
  });

  it('returns NO_DEFAULT_PRICEBOOK when none marked default', async () => {
    prisma.billingPriceBook.findFirst.mockResolvedValue(null);

    const config = await svc.getPricingConfiguration();

    expect(config.configured).toBe(false);
    expect(config.reason).toBe('NO_DEFAULT_PRICEBOOK');
  });

  it('returns NO_ACTIVE_PRICE_VERSION when default book has no ACTIVE version', async () => {
    prisma.billingPriceBook.findFirst.mockResolvedValue({
      id: 'book-1',
      currency: 'EUR',
      versions: [],
    });

    const config = await svc.getPricingConfiguration();

    expect(config.configured).toBe(false);
    expect(config.reason).toBe('NO_ACTIVE_PRICE_VERSION');
    expect(config.priceBook?.id).toBe('book-1');
  });

  it('returns configured default with first ACTIVE version from embedded query', async () => {
    const activeVersion = {
      id: 'ver-1',
      versionNumber: 1,
      status: 'ACTIVE',
      tiers: [],
    };
    prisma.billingPriceBook.findFirst.mockResolvedValue({
      id: 'book-1',
      currency: 'EUR',
      versions: [activeVersion],
    });

    const config = await svc.getPricingConfiguration();

    expect(config.configured).toBe(true);
    expect(config.activeVersion).toBe(activeVersion);
  });
});
