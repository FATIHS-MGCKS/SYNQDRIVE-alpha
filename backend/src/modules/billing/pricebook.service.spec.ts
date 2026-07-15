import { BadRequestException, ConflictException } from '@nestjs/common';
import { BillingPriceVersionStatus, BillingTierMode } from '@prisma/client';
import { PricebookService } from './pricebook.service';

describe('PricebookService publish rules', () => {
  const audit = { log: jest.fn() };
  let prisma: any;
  let svc: PricebookService;

  beforeEach(() => {
    prisma = {
      billingPriceVersion: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      billingPriceBook: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      billingCatalogProduct: {
        findUnique: jest.fn(),
      },
      billingSubscription: {
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      billingSubscriptionItem: {
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      $transaction: jest.fn((fn: any) =>
        typeof fn === 'function' ? fn(prisma) : Promise.all(fn),
      ),
    };
    svc = new PricebookService(prisma, audit as any);
  });

  it('blocks publishing ACTIVE version edits via replaceDraftTiers', async () => {
    prisma.billingPriceVersion.findUnique.mockResolvedValue({
      id: 'v1',
      status: BillingPriceVersionStatus.ACTIVE,
      priceBook: { currency: 'EUR' },
    });

    await expect(
      svc.replaceDraftTiers('v1', [{ minVehicles: 1, maxVehicles: 10, unitPriceCents: 100 }]),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks publish when tiers have missing prices without allowUnpriced', async () => {
    prisma.billingPriceVersion.findUnique.mockResolvedValue({
      id: 'v1',
      status: BillingPriceVersionStatus.DRAFT,
      priceBookId: 'book-1',
      priceBook: { currency: 'EUR' },
      tiers: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: null, sortOrder: 0 }],
    });

    await expect(svc.publishVersion('v1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks publish with overlapping tiers', async () => {
    prisma.billingPriceVersion.findUnique.mockResolvedValue({
      id: 'v1',
      status: BillingPriceVersionStatus.DRAFT,
      priceBookId: 'book-1',
      priceBook: { currency: 'EUR' },
      tiers: [
        { minVehicles: 1, maxVehicles: 10, unitPriceCents: 100, sortOrder: 0 },
        { minVehicles: 8, maxVehicles: 20, unitPriceCents: 90, sortOrder: 1 },
      ],
    });

    await expect(svc.publishVersion('v1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks archiving ACTIVE versions', async () => {
    prisma.billingPriceVersion.findUnique.mockResolvedValue({
      id: 'v1',
      status: BillingPriceVersionStatus.ACTIVE,
    });

    await expect(svc.archiveVersion('v1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('PricebookService simulation and usage', () => {
  const audit = { log: jest.fn() };
  let prisma: any;
  let svc: PricebookService;

  beforeEach(() => {
    prisma = {
      billingPriceVersion: {
        findUnique: jest.fn(),
      },
      billingSubscription: {
        count: jest.fn(),
      },
      billingSubscriptionItem: {
        count: jest.fn(),
      },
    };
    svc = new PricebookService(prisma, audit as any);
  });

  it('returns usage counts for a version', async () => {
    prisma.billingPriceVersion.findUnique.mockResolvedValue({ id: 'v1' });
    prisma.billingSubscription.count.mockResolvedValue(2);
    prisma.billingSubscriptionItem.count.mockResolvedValue(3);

    await expect(svc.getVersionUsage('v1')).resolves.toEqual({
      priceVersionId: 'v1',
      subscriptions: 2,
      subscriptionItems: 3,
      total: 5,
    });
  });

  it('simulates graduated pricing with discount and tax', async () => {
    prisma.billingPriceVersion.findUnique.mockResolvedValue({
      id: 'v1',
      tierMode: BillingTierMode.GRADUATED,
      priceBook: { currency: 'EUR' },
      tiers: [
        { id: 't1', minVehicles: 1, maxVehicles: 5, unitPriceCents: 1000, sortOrder: 0 },
        { id: 't2', minVehicles: 6, maxVehicles: null, unitPriceCents: 800, sortOrder: 1 },
      ],
    });

    const result = await svc.simulatePriceVersion('v1', {
      vehicleCount: 7,
      discountPercentBps: 1000,
      taxRateBps: 1900,
    });

    expect(result.baseAmountCents).toBe(6600);
    expect(result.discountCents).toBe(660);
    expect(result.netCents).toBe(5940);
    expect(result.taxCents).toBe(1129);
    expect(result.grossCents).toBe(7069);
    expect(result.tierLines.length).toBeGreaterThan(0);
  });
});
