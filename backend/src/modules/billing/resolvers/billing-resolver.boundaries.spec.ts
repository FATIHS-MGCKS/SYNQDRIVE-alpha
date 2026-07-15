import { BillingOrgPriceOverrideStatus, BillingStatus, InvoiceStatus } from '@prisma/client';
import { DiscountResolverService } from './discount-resolver.service';
import { EntitlementResolverService } from './entitlement-resolver.service';
import { InvoiceResolverService } from './invoice-resolver.service';
import { PricingResolverService } from './pricing-resolver.service';
import { QuantityResolverService } from './quantity-resolver.service';
import { SubscriptionResolverService } from './subscription-resolver.service';
import { BillingProductKind, SubscriptionStatus } from '../domain';

function assertNoStripeTypes(value: unknown, path = 'root'): void {
  if (value == null) return;
  if (typeof value === 'function') {
    const name = (value as { name?: string }).name ?? '';
    expect(name).not.toMatch(/^Stripe/);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoStripeTypes(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'object') {
    const ctor = (value as object).constructor?.name ?? '';
    expect(ctor).not.toMatch(/^Stripe/);
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      expect(key.toLowerCase()).not.toBe('stripe');
      if (key === 'stripeSubscriptionId' || key === 'stripeCustomerId' || key === 'stripeInvoiceId') {
        expect(typeof nested === 'string' || nested === null).toBe(true);
      }
      assertNoStripeTypes(nested, `${path}.${key}`);
    }
  }
}

describe('Billing resolver service boundaries', () => {
  const pricingConfig = {
    configured: true,
    reason: null,
    priceBook: {
      id: 'book-1',
      name: 'Fleet',
      productKey: 'FLEET',
      currency: 'EUR',
      interval: 'MONTHLY',
    },
    activeVersion: {
      id: 'ver-1',
      versionNumber: 1,
      tiers: [{ id: 'tier-1', minVehicles: 1, maxVehicles: null, unitPriceCents: 1000, sortOrder: 0 }],
    },
  };

  const prisma = {
    billingSubscription: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    billingOrganizationPriceOverride: {
      findMany: jest.fn(),
    },
    billingDiscount: {
      findMany: jest.fn(),
    },
    billingSubscriptionItem: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    billingPriceVersion: {
      findUnique: jest.fn(),
    },
    billingQuantityEvent: {
      findFirst: jest.fn(),
    },
    organizationProduct: {
      findMany: jest.fn(),
    },
    billingInvoice: {
      findMany: jest.fn(),
    },
    billingPaymentMethod: {
      findFirst: jest.fn(),
    },
  };

  const pricebook = {
    getPricingConfiguration: jest.fn(),
    getPriceBook: jest.fn(),
    findActiveVersion: jest.fn(),
    getVersionWithTiers: jest.fn(),
  };

  const billableVehicles = {
    getBillableConnectedVehiclesForOrganization: jest.fn(),
  };

  const priceResolution = {
    calculateVolumePrice: jest.fn(),
    calculateVolumePriceForVersion: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    pricebook.getPricingConfiguration.mockResolvedValue(pricingConfig);
    pricebook.getPriceBook.mockResolvedValue({ id: 'book-1', productKey: 'FLEET' });
    prisma.billingSubscription.findFirst.mockResolvedValue({
      id: 'sub-1',
      organizationId: 'org-1',
      status: BillingStatus.ACTIVE,
      cancelAtPeriodEnd: false,
      currentPeriodStart: new Date('2026-07-01'),
      currentPeriodEnd: new Date('2026-07-31'),
      priceBookId: 'book-1',
      priceVersionId: 'ver-1',
      stripeSubscriptionId: 'sub_stripe_1',
      stripeCustomerId: 'cus_1',
    });
    prisma.billingSubscriptionItem.findMany.mockResolvedValue([]);
    prisma.billingSubscriptionItem.findFirst.mockResolvedValue({
      id: 'item-1',
      priceBookId: 'book-1',
      priceVersionId: 'ver-1',
    });
    prisma.billingPriceVersion.findUnique.mockResolvedValue({
      id: 'ver-1',
      priceBookId: 'book-1',
      status: 'ACTIVE',
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
    });
    prisma.billingQuantityEvent.findFirst.mockResolvedValue(null);
    prisma.organizationProduct.findMany.mockResolvedValue([
      { status: 'ACTIVE', product: { slug: 'FLEET', name: 'Fleet' } },
    ]);
    billableVehicles.getBillableConnectedVehiclesForOrganization.mockResolvedValue({
      connectedVehicleCount: 3,
      billableVehicleCount: 2,
      billableVehicles: [{ id: 'v1' }, { id: 'v2' }],
      excludedVehicles: [{ id: 'v3' }],
    });
    priceResolution.calculateVolumePriceForVersion.mockResolvedValue({
      calculationStatus: 'OK',
      priceBookId: 'book-1',
      priceVersionId: 'ver-1',
      currency: 'EUR',
      tier: { id: 'tier-1', minVehicles: 1, maxVehicles: null, unitPriceCents: 1000, sortOrder: 0, status: 'CONFIGURED' },
      unitPriceCents: 1000,
      subtotalCents: 2000,
      totalCents: 2000,
    });
    prisma.billingOrganizationPriceOverride.findMany.mockResolvedValue([
      {
        id: 'disc-1',
        customUnitPriceCents: 900,
        customMonthlyMinimumCents: null,
        priceBookId: null,
        priceVersionId: null,
        reason: 'VIP',
        validFrom: new Date('2026-01-01'),
        validTo: null,
        status: BillingOrgPriceOverrideStatus.ACTIVE,
      },
    ]);
    prisma.billingDiscount.findMany.mockResolvedValue([]);
    prisma.billingSubscription.findMany.mockResolvedValue([{ id: 'sub-1' }]);
    prisma.billingInvoice.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        subscriptionId: 'sub-1',
        stripeInvoiceId: 'in_1',
        amountCents: 2000,
        currency: 'eur',
        status: InvoiceStatus.PAID,
        invoiceDate: new Date('2026-07-01'),
        dueDate: null,
        paidAt: new Date('2026-07-02'),
        lines: [],
      },
    ]);
    prisma.billingPaymentMethod.findFirst.mockResolvedValue(null);
  });

  it('SubscriptionResolver returns domain contract without Stripe types', async () => {
    const service = new SubscriptionResolverService(prisma as never, pricebook as never);
    const contract = await service.resolveContract('org-1', { baseItemQuantity: 2 });

    expect(contract.organizationId).toBe('org-1');
    expect(contract.status).toBe(SubscriptionStatus.ACTIVE);
    expect(contract.items[0].productKind).toBe(BillingProductKind.FLEET);
    expect(contract.stripeSubscriptionId).toBe('sub_stripe_1');
    assertNoStripeTypes(contract);
  });

  it('QuantityResolver delegates to BillableVehiclesService only', async () => {
    const service = new QuantityResolverService(billableVehicles as never);
    const quantity = await service.resolveQuantity('org-1');

    expect(billableVehicles.getBillableConnectedVehiclesForOrganization).toHaveBeenCalledWith('org-1');
    expect(quantity.billableVehicleCount).toBe(2);
    assertNoStripeTypes(quantity);
  });

  it('DiscountResolver returns ordered org discounts', async () => {
    const service = new DiscountResolverService(prisma as never);
    const discounts = await service.resolveDiscounts('org-1');

    expect(discounts).toHaveLength(1);
    expect(discounts[0].customUnitPriceCents).toBe(900);
    expect(discounts[0].source).toBe('LEGACY_PRICE_OVERRIDE');
    expect(discounts[0].applicationPhase).toBe('UNIT_PRICE');
    assertNoStripeTypes(discounts);
  });

  it('PricingResolver resolves org-scoped assignment via subscription item version', async () => {
    const service = new PricingResolverService(
      prisma as never,
      pricebook as never,
      priceResolution as never,
    );
    const pricing = await service.resolveItemPricingForOrganization({
      organizationId: 'org-1',
      billableQuantity: 2,
      discounts: [
        {
          id: 'd1',
          source: 'LEGACY_PRICE_OVERRIDE',
          applicationPhase: 'UNIT_PRICE',
          kind: 'FIXED_AMOUNT',
          percentBps: null,
          fixedAmountCents: null,
          currency: null,
          customUnitPriceCents: 900,
          customMonthlyMinimumCents: null,
          priceBookId: null,
          priceVersionId: null,
          reason: null,
          validFrom: new Date(),
          validTo: null,
          sortOrder: 0,
          subscriptionItemId: null,
        },
      ],
    });

    expect(priceResolution.calculateVolumePriceForVersion).toHaveBeenCalledWith(
      'ver-1',
      2,
      expect.objectContaining({
        customUnitPriceCents: 900,
        priceBookId: 'book-1',
      }),
    );
    expect(pricing.totalCents).toBe(2000);
    assertNoStripeTypes(pricing);
  });

  it('InvoiceResolver maps invoices to domain status labels', async () => {
    const service = new InvoiceResolverService(prisma as never);
    const invoices = await service.resolveInvoices('org-1');

    expect(invoices[0].displayStatus).toBe('Paid');
    expect(invoices[0].status).toBe('PAID');
    assertNoStripeTypes(invoices);
  });

  it('EntitlementResolver merges subscription and legacy license projections', async () => {
    const subscriptionResolver = new SubscriptionResolverService(prisma as never, pricebook as never);
    const service = new EntitlementResolverService(subscriptionResolver, prisma as never);
    const result = await service.resolveEntitlements('org-1');

    expect(result.entitlements.some((e) => e.featureKey === 'fleet.core' && e.granted)).toBe(true);
    assertNoStripeTypes(result);
  });
});
