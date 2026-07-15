import { BadRequestException, ConflictException } from '@nestjs/common';
import { BillingPriceVersionStatus } from '@prisma/client';
import { PricebookService } from './pricebook.service';

describe('PricebookService publish rules', () => {
  const audit = { log: jest.fn() };
  let prisma: any;
  let svc: PricebookService;

  beforeEach(() => {
    prisma = {
      billingPriceVersion: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
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
