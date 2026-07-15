import {
  BillingOrgPriceOverrideStatus,
  BillingPriceVersionStatus,
  BillingSubscriptionItemRole,
  BillingSubscriptionItemStatus,
  BillingUsageCalculationStatus,
} from '@prisma/client';
import { BillingPricingErrorCode } from '../domain/billing-pricing.errors';
import { PricingResolverService } from './pricing-resolver.service';

describe('PricingResolverService (Prompt 10)', () => {
  const prisma = {
    billingSubscription: { findFirst: jest.fn() },
    billingSubscriptionItem: { findFirst: jest.fn() },
    billingPriceVersion: { findUnique: jest.fn() },
    billingOrganizationPriceOverride: { findFirst: jest.fn() },
    billingQuantityEvent: { findFirst: jest.fn() },
  };

  const pricebook = {
    findActiveVersion: jest.fn(),
    getPricingConfiguration: jest.fn(),
  };

  const priceResolution = {
    calculateVolumePriceForVersion: jest.fn(),
    calculateVolumePrice: jest.fn(),
  };

  let service: PricingResolverService;

  const asOf = new Date('2026-07-15T12:00:00.000Z');

  beforeEach(() => {
    jest.resetAllMocks();
    service = new PricingResolverService(
      prisma as never,
      pricebook as never,
      priceResolution as never,
    );

    prisma.billingSubscription.findFirst.mockImplementation(({ where }: { where: { organizationId: string } }) =>
      Promise.resolve({
        id: `sub-${where.organizationId}`,
        organizationId: where.organizationId,
        priceBookId: null,
        priceVersionId: null,
      }),
    );
    prisma.billingSubscriptionItem.findFirst.mockResolvedValue(null);
    prisma.billingOrganizationPriceOverride.findFirst.mockResolvedValue(null);
    prisma.billingQuantityEvent.findFirst.mockResolvedValue(null);
    prisma.billingPriceVersion.findUnique.mockResolvedValue({
      id: 'ver-rental',
      priceBookId: 'book-rental',
      status: BillingPriceVersionStatus.ACTIVE,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
    });
    priceResolution.calculateVolumePriceForVersion.mockResolvedValue({
      calculationStatus: BillingUsageCalculationStatus.OK,
      priceBookId: 'book-rental',
      priceVersionId: 'ver-rental',
      currency: 'EUR',
      tier: {
        id: 'tier-1',
        minVehicles: 1,
        maxVehicles: null,
        unitPriceCents: 1200,
        sortOrder: 0,
        status: 'CONFIGURED',
      },
      unitPriceCents: 1200,
      subtotalCents: 2400,
      totalCents: 2400,
    });
  });

  it('resolves Rental subscription item version before any default', async () => {
    prisma.billingSubscriptionItem.findFirst.mockResolvedValue({
      id: 'item-rental',
      priceBookId: 'book-rental',
      priceVersionId: 'ver-rental',
    });

    const assignment = await service.resolvePriceAssignment('org-rental', { asOf });

    expect(assignment.source).toBe('SUBSCRIPTION_ITEM_VERSION');
    expect(assignment.priceBookId).toBe('book-rental');
    expect(assignment.priceVersionId).toBe('ver-rental');
    expect(assignment.legacyFallbackUsed).toBe(false);
    expect(pricebook.getPricingConfiguration).not.toHaveBeenCalled();
  });

  it('resolves Fleet price book via subscription item when version is unset', async () => {
    prisma.billingSubscriptionItem.findFirst.mockResolvedValue({
      id: 'item-fleet',
      priceBookId: 'book-fleet',
      priceVersionId: null,
    });
    pricebook.findActiveVersion.mockResolvedValue({
      id: 'ver-fleet',
      status: BillingPriceVersionStatus.ACTIVE,
    });

    const assignment = await service.resolvePriceAssignment('org-fleet', { asOf });

    expect(assignment.source).toBe('SUBSCRIPTION_ITEM_PRICE_BOOK');
    expect(assignment.priceBookId).toBe('book-fleet');
    expect(assignment.priceVersionId).toBe('ver-fleet');
    expect(pricebook.findActiveVersion).toHaveBeenCalledWith('book-fleet', asOf);
  });

  it('uses different Rental and Fleet versions for different orgs', async () => {
    prisma.billingSubscriptionItem.findFirst.mockImplementation(
      ({ where }: { where: { organizationId: string } }) => {
        if (where.organizationId === 'org-rental') {
          return Promise.resolve({
            id: 'item-rental',
            priceBookId: 'book-rental',
            priceVersionId: 'ver-rental',
          });
        }
        return Promise.resolve({
          id: 'item-fleet',
          priceBookId: 'book-fleet',
          priceVersionId: 'ver-fleet',
        });
      },
    );
    prisma.billingPriceVersion.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === 'ver-rental') {
        return Promise.resolve({
          id: 'ver-rental',
          priceBookId: 'book-rental',
          status: BillingPriceVersionStatus.ACTIVE,
          effectiveFrom: null,
          effectiveTo: null,
        });
      }
      return Promise.resolve({
        id: 'ver-fleet',
        priceBookId: 'book-fleet',
        status: BillingPriceVersionStatus.ACTIVE,
        effectiveFrom: null,
        effectiveTo: null,
      });
    });

    const rental = await service.resolvePriceAssignment('org-rental', { asOf });
    const fleet = await service.resolvePriceAssignment('org-fleet', { asOf });

    expect(rental.priceVersionId).toBe('ver-rental');
    expect(fleet.priceVersionId).toBe('ver-fleet');
    expect(rental.priceBookId).not.toBe(fleet.priceBookId);
  });

  it('does not use global default for modern contracts without assignment', async () => {
    const assignment = await service.resolvePriceAssignment('org-rental', { asOf });

    expect(assignment.pricingErrorCode).toBe(
      BillingPricingErrorCode.BILLING_PRICE_NOT_ASSIGNED,
    );
    expect(assignment.priceVersionId).toBeNull();
    expect(pricebook.getPricingConfiguration).not.toHaveBeenCalled();
  });

  it('returns BILLING_PRICE_VERSION_INVALID when no active version exists', async () => {
    prisma.billingSubscriptionItem.findFirst.mockResolvedValue({
      id: 'item-fleet',
      priceBookId: 'book-fleet',
      priceVersionId: null,
    });
    pricebook.findActiveVersion.mockResolvedValue(null);

    const assignment = await service.resolvePriceAssignment('org-fleet', { asOf });

    expect(assignment.pricingErrorCode).toBe(
      BillingPricingErrorCode.BILLING_PRICE_VERSION_INVALID,
    );
    expect(assignment.priceVersionId).toBeNull();
  });

  it('rejects archived version for new pricing unless historical read is allowed', async () => {
    prisma.billingSubscriptionItem.findFirst.mockResolvedValue({
      id: 'item-old',
      priceBookId: 'book-rental',
      priceVersionId: 'ver-archived',
    });
    prisma.billingPriceVersion.findUnique.mockResolvedValue({
      id: 'ver-archived',
      priceBookId: 'book-rental',
      status: BillingPriceVersionStatus.ARCHIVED,
      effectiveFrom: new Date('2025-01-01'),
      effectiveTo: new Date('2025-12-31'),
    });

    const blocked = await service.resolvePriceAssignment('org-rental', { asOf });
    expect(blocked.pricingErrorCode).toBe(
      BillingPricingErrorCode.BILLING_PRICE_VERSION_INVALID,
    );

    const historical = await service.resolvePriceAssignment('org-rental', {
      asOf: new Date('2025-06-01'),
      allowArchivedVersion: true,
    });
    expect(historical.priceVersionId).toBe('ver-archived');
    expect(historical.source).toBe('SUBSCRIPTION_ITEM_VERSION');
  });

  it('allows legacy default fallback only for marked legacy data', async () => {
    prisma.billingOrganizationPriceOverride.findFirst.mockResolvedValue({
      id: 'override-1',
      reason: 'VIP [legacy-backfill:documented]',
      status: BillingOrgPriceOverrideStatus.ACTIVE,
    });
    pricebook.getPricingConfiguration.mockResolvedValue({
      configured: true,
      priceBook: { id: 'book-default', currency: 'EUR' },
      activeVersion: { id: 'ver-default', tiers: [] },
    });

    const assignment = await service.resolvePriceAssignment('org-rental', { asOf });

    expect(assignment.source).toBe('LEGACY_MARKED_FALLBACK_DEFAULT');
    expect(assignment.legacyFallbackUsed).toBe(true);
    expect(assignment.pricingErrorCode).toBe(
      BillingPricingErrorCode.BILLING_LEGACY_FALLBACK_USED,
    );
    expect(assignment.priceBookId).toBe('book-default');
  });

  it('scopes subscription item lookup to organizationId (cross-tenant guard)', async () => {
    prisma.billingSubscriptionItem.findFirst.mockResolvedValue({
      id: 'item-rental',
      priceBookId: 'book-rental',
      priceVersionId: 'ver-rental',
    });

    await service.resolvePriceAssignment('org-rental', { asOf });

    expect(prisma.billingSubscriptionItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-rental' }),
      }),
    );
    expect(prisma.billingSubscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-rental' },
      }),
    );
  });

  it('resolveItemPricingForOrganization uses assigned version, not global default', async () => {
    prisma.billingSubscriptionItem.findFirst.mockResolvedValue({
      id: 'item-rental',
      priceBookId: 'book-rental',
      priceVersionId: 'ver-rental',
    });

    const pricing = await service.resolveItemPricingForOrganization({
      organizationId: 'org-rental',
      billableQuantity: 2,
      asOf,
    });

    expect(priceResolution.calculateVolumePriceForVersion).toHaveBeenCalledWith(
      'ver-rental',
      2,
      expect.objectContaining({ priceBookId: 'book-rental' }),
    );
    expect(pricing.priceVersionId).toBe('ver-rental');
    expect(pricing.legacyFallbackUsed).toBe(false);
  });

  it('second resolution for same org remains idempotent', async () => {
    prisma.billingSubscriptionItem.findFirst.mockResolvedValue({
      id: 'item-rental',
      priceBookId: 'book-rental',
      priceVersionId: 'ver-rental',
    });

    const first = await service.resolvePriceAssignment('org-rental', { asOf });
    const second = await service.resolvePriceAssignment('org-rental', { asOf });

    expect(second).toEqual(first);
  });
});
