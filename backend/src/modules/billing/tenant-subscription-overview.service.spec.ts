import {
  BillingPaymentMethodStatus,
  BillingPaymentMethodType,
  BillingUsageCalculationStatus,
} from '@prisma/client';
import { PricingModel, SubscriptionStatus } from './domain';
import { TenantSubscriptionOverviewService } from './tenant-subscription-overview.service';
import { tenantOverviewMapperInternals } from './tenant-subscription-overview.mapper';

describe('TenantSubscriptionOverviewService', () => {
  const prisma = {
    billingSubscription: { findFirst: jest.fn() },
  };
  const subscriptionResolver = { resolveContract: jest.fn() };
  const quantityResolver = { resolveQuantity: jest.fn() };
  const pricePreview = { preview: jest.fn() };
  const entitlementResolver = { resolve: jest.fn() };
  const paymentMethods = { getDefaultPaymentMethodView: jest.fn() };
  const stripePrepared = { isStripeConfigured: jest.fn() };

  let service: TenantSubscriptionOverviewService;

  const asOf = new Date('2026-07-15T12:00:00.000Z');

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
    items: [{ id: 'item-1', productKind: 'RENTAL', addonKey: null, priceBookId: 'book-1', priceVersionId: 'ver-1', quantity: 2 }],
    resolvedAt: asOf,
  };

  const basePreview = {
    organizationId: 'org-a',
    subscriptionId: 'sub-1',
    subscriptionItemId: 'item-1',
    calculationStatus: BillingUsageCalculationStatus.OK,
    tariff: {
      priceBookId: 'book-1',
      name: 'SynqDrive Rental',
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
      configured: true,
      taxRateBps: 1900,
      taxBasisCents: 3000,
      taxCents: 570,
      netCents: 3000,
      grossCents: 3570,
    },
    currency: 'EUR',
    warnings: [],
    legacyFallbacks: [],
    priceResolutionSource: 'SUBSCRIPTION_ITEM_VERSION',
    pricingErrorCode: null,
    legacyFallbackUsed: false,
    resolvedAt: asOf,
  };

  const baseEntitlements = {
    organizationId: 'org-a',
    baseProduct: 'RENTAL' as const,
    addonKeys: [],
    activeAddonKeys: [],
    status: 'ACTIVE' as const,
    subscriptionStatus: SubscriptionStatus.ACTIVE,
    active: true,
    validFrom: '2026-07-01T00:00:00.000Z',
    validTo: null,
    limits: { maxVehicles: null, maxUsers: null, maxStations: null, features: [] },
    source: 'BILLING_CONTRACT' as const,
    lastUpdatedAt: asOf.toISOString(),
    resolvedAt: asOf.toISOString(),
    addons: [],
    gracePeriodEndsAt: null,
    inGracePeriod: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TenantSubscriptionOverviewService(
      prisma as never,
      subscriptionResolver as never,
      quantityResolver as never,
      pricePreview as never,
      entitlementResolver as never,
      paymentMethods as never,
      stripePrepared as never,
    );

    subscriptionResolver.resolveContract.mockResolvedValue(baseContract);
    quantityResolver.resolveQuantity.mockResolvedValue({
      organizationId: 'org-a',
      asOf,
      connectedVehicleCount: 3,
      billableVehicleCount: 2,
      billableVehicleIds: [],
      excludedVehicleIds: [],
    });
    pricePreview.preview.mockResolvedValue(basePreview);
    entitlementResolver.resolve.mockResolvedValue(baseEntitlements);
    paymentMethods.getDefaultPaymentMethodView.mockResolvedValue({
      exists: true,
      billingState: 'READY',
      paymentMethod: {
        id: 'pm-1',
        type: BillingPaymentMethodType.CARD,
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2028,
        country: 'DE',
        billingName: 'Acme GmbH',
        sepaMandateStatus: null,
        sepaBankCode: null,
        isDefault: true,
        status: BillingPaymentMethodStatus.ACTIVE,
        isActive: true,
        billingState: 'READY',
      },
    });
    prisma.billingSubscription.findFirst.mockResolvedValue({
      trialEndAt: null,
      startedAt: new Date('2026-06-01'),
      cancelAt: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date('2026-07-31'),
    });
    stripePrepared.isStripeConfigured.mockReturnValue(true);
  });

  it('returns rental active overview without internal billing identifiers', async () => {
    const overview = await service.getOverview('org-a', { asOf });

    expect(overview.plan).toEqual({
      kind: 'RENTAL',
      name: 'SynqDrive Rental',
    });
    expect(overview.contract?.status).toBe(SubscriptionStatus.ACTIVE);
    expect(overview.contract?.statusLabel).toBe('Aktiv');
    expect(overview.pricing?.billableVehicleCount).toBe(2);
    expect(overview.pricing?.grossAmount?.formatted).toMatch(/35,70/);
    expect(overview.paymentMethod?.status).toBe('READY');
    expect(overview.paymentMethod?.defaultMethod).toEqual(
      expect.objectContaining({
        type: 'CARD',
        last4: '4242',
      }),
    );
    expect(overview.paymentMethod?.defaultMethod).not.toHaveProperty('id');
    expect(overview.billing?.nextChargeAt).toBe('2026-07-31T00:00:00.000Z');
    expect(overview.asOf).toBe(asOf.toISOString());
    expect(overview.sectionErrors).toEqual([]);
    expect(JSON.stringify(overview)).not.toMatch(/stripe/i);
    expect(JSON.stringify(overview)).not.toMatch(/sub-1|book-1|ver-1|tier-1|pm-1/);
  });

  it('returns fleet plan overview', async () => {
    subscriptionResolver.resolveContract.mockResolvedValue({
      ...baseContract,
      items: [{ ...baseContract.items[0], productKind: 'FLEET' }],
    });
    pricePreview.preview.mockResolvedValue({
      ...basePreview,
      tariff: { ...basePreview.tariff, productKey: 'FLEET', name: 'SynqDrive Fleet' },
      product: { slug: 'FLEET', name: 'SynqDrive Fleet', plan: 'BUSINESS' },
    });
    entitlementResolver.resolve.mockResolvedValue({
      ...baseEntitlements,
      baseProduct: 'FLEET',
    });

    const overview = await service.getOverview('org-a', { asOf });

    expect(overview.plan).toEqual({
      kind: 'FLEET',
      name: 'SynqDrive Fleet',
    });
  });

  it('returns trialing contract with trial end and next charge at trial end', async () => {
    const trialEnd = new Date('2026-07-20');
    subscriptionResolver.resolveContract.mockResolvedValue({
      ...baseContract,
      status: SubscriptionStatus.TRIALING,
    });
    prisma.billingSubscription.findFirst.mockResolvedValue({
      trialEndAt: trialEnd,
      startedAt: new Date('2026-07-01'),
      cancelAt: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date('2026-07-31'),
    });

    const overview = await service.getOverview('org-a', { asOf });

    expect(overview.contract?.statusLabel).toBe('Testphase');
    expect(overview.contract?.trialEndsAt).toBe(trialEnd.toISOString());
    expect(overview.billing?.nextChargeAt).toBe(trialEnd.toISOString());
    expect(overview.warnings.some((w) => w.message.includes('Testphase endet'))).toBe(true);
  });

  it('returns past due warning and update payment action', async () => {
    subscriptionResolver.resolveContract.mockResolvedValue({
      ...baseContract,
      status: SubscriptionStatus.PAST_DUE,
    });

    const overview = await service.getOverview('org-a', { asOf });

    expect(overview.contract?.statusLabel).toBe('Zahlung überfällig');
    expect(overview.warnings.some((w) => w.severity === 'critical')).toBe(true);
    expect(overview.availableActions.map((a) => a.action)).toEqual(
      expect.arrayContaining(['UPDATE_PAYMENT_METHOD', 'VIEW_INVOICES']),
    );
  });

  it('returns cancel scheduled contract with cancellation date', async () => {
    const cancelAt = new Date('2026-08-31');
    subscriptionResolver.resolveContract.mockResolvedValue({
      ...baseContract,
      status: SubscriptionStatus.CANCEL_SCHEDULED,
      cancelAtPeriodEnd: true,
    });
    prisma.billingSubscription.findFirst.mockResolvedValue({
      trialEndAt: null,
      startedAt: new Date('2026-06-01'),
      cancelAt,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: cancelAt,
    });

    const overview = await service.getOverview('org-a', { asOf });

    expect(overview.contract?.statusLabel).toBe('Kündigung geplant');
    expect(overview.contract?.cancellationScheduledAt).toBe(cancelAt.toISOString());
    expect(overview.warnings.some((w) => w.message.includes('endet am'))).toBe(true);
  });

  it('returns missing payment method warning and add action', async () => {
    paymentMethods.getDefaultPaymentMethodView.mockResolvedValue({
      exists: false,
      billingState: 'MISSING',
      paymentMethod: null,
    });

    const overview = await service.getOverview('org-a', { asOf });

    expect(overview.paymentMethod?.status).toBe('MISSING');
    expect(overview.paymentMethod?.statusLabel).toBe('Nicht hinterlegt');
    expect(overview.warnings.some((w) => w.message.includes('Zahlungsmethode'))).toBe(true);
    expect(overview.availableActions.map((a) => a.action)).toContain('ADD_PAYMENT_METHOD');
  });

  it('returns no billable vehicles warning', async () => {
    quantityResolver.resolveQuantity.mockResolvedValue({
      organizationId: 'org-a',
      asOf,
      connectedVehicleCount: 0,
      billableVehicleCount: 0,
      billableVehicleIds: [],
      excludedVehicleIds: [],
    });
    pricePreview.preview.mockResolvedValue({
      ...basePreview,
      vehicleCount: 0,
      connectedVehicleCount: 0,
      calculationStatus: BillingUsageCalculationStatus.NO_BILLABLE_VEHICLES,
      baseAmountCents: 0,
      tax: { ...basePreview.tax, netCents: 0, grossCents: 0, taxCents: 0 },
    });

    const overview = await service.getOverview('org-a', { asOf });

    expect(overview.pricing?.billableVehicleCount).toBe(0);
    expect(overview.warnings.some((w) => w.message.includes('keine abrechenbaren Fahrzeuge'))).toBe(
      true,
    );
  });

  it('returns discount information in pricing and warnings', async () => {
    pricePreview.preview.mockResolvedValue({
      ...basePreview,
      discounts: [
        {
          discountId: 'disc-1',
          kind: 'PERCENTAGE',
          percentBps: 1000,
          fixedAmountCents: null,
          appliedAmountCents: 300,
          sortOrder: 0,
          reason: 'Willkommensrabatt',
          subscriptionItemId: null,
          validFrom: new Date('2026-07-01'),
          validTo: null,
        },
      ],
      totalDiscountCents: 300,
      amountAfterDiscountCents: 2700,
      tax: {
        ...basePreview.tax,
        taxBasisCents: 2700,
        netCents: 2700,
        taxCents: 513,
        grossCents: 3213,
      },
    });

    const overview = await service.getOverview('org-a', { asOf });

    expect(overview.pricing?.discounts).toEqual([
      expect.objectContaining({
        label: 'Willkommensrabatt',
        amount: expect.objectContaining({ cents: 300 }),
      }),
    ]);
    expect(overview.warnings.some((w) => w.message.includes('Rabatt'))).toBe(true);
    expect(JSON.stringify(overview.pricing)).not.toContain('disc-1');
  });

  it('returns no contract state when subscription is missing', async () => {
    subscriptionResolver.resolveContract.mockResolvedValue({
      ...baseContract,
      subscriptionId: null,
      status: SubscriptionStatus.DRAFT,
    });
    prisma.billingSubscription.findFirst.mockResolvedValue(null);

    const overview = await service.getOverview('org-a', { asOf });

    expect(overview.contract?.statusLabel).toBe('Entwurf');
    expect(overview.warnings[0].message).toContain('noch kein SynqDrive-Abonnement');
    expect(overview.availableActions).toEqual([]);
  });

  it('keeps other sections when pricing preview fails', async () => {
    pricePreview.preview.mockRejectedValue(new Error('preview failed'));

    const overview = await service.getOverview('org-a', { asOf });

    expect(overview.contract).not.toBeNull();
    expect(overview.pricing).toBeNull();
    expect(overview.paymentMethod).not.toBeNull();
    expect(overview.sectionErrors).toEqual([
      expect.objectContaining({ section: 'pricing' }),
    ]);
  });

  it('keeps other sections when payment method lookup fails', async () => {
    paymentMethods.getDefaultPaymentMethodView.mockRejectedValue(new Error('pm failed'));

    const overview = await service.getOverview('org-a', { asOf });

    expect(overview.pricing).not.toBeNull();
    expect(overview.paymentMethod?.status).toBe('MISSING');
    expect(overview.sectionErrors).toEqual([
      expect.objectContaining({ section: 'paymentMethod' }),
    ]);
  });
});

describe('tenant subscription overview mapper labels', () => {
  it('exposes German status labels', () => {
    expect(tenantOverviewMapperInternals.STATUS_LABELS.ACTIVE).toBe('Aktiv');
    expect(tenantOverviewMapperInternals.STATUS_LABELS.TRIALING).toBe('Testphase');
    expect(tenantOverviewMapperInternals.PLAN_NAMES.RENTAL).toBe('SynqDrive Rental');
  });
});
