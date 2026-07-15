import { BusinessType, ProductSlug } from '@prisma/client';
import { BillingLegacyBackfillService } from './billing-legacy-backfill.service';
import {
  appendLegacyBackfillMarker,
  buildQuantityBackfillIdempotencyKey,
  classifyStripePriceIdMode,
  inferBaseBillingProductKey,
  inferLegacyAddonSignals,
  resolveStripeModeFromSecretKey,
  sourcesConflict,
} from './billing-legacy-backfill.util';

describe('billing legacy backfill utilities', () => {
  describe('inferBaseBillingProductKey', () => {
    it('prefers active org product slug for Rental', () => {
      const result = inferBaseBillingProductKey({
        orgProductSlugs: [ProductSlug.RENTAL],
        subscriptionPriceBookProductKey: 'FLEET',
        businessType: BusinessType.FLEET,
      });
      expect(result.productKey).toBe('RENTAL');
      expect(result.source).toBe('ORG_PRODUCT');
      expect(result.conflicts).toEqual([]);
    });

    it('prefers active org product slug for Fleet', () => {
      const result = inferBaseBillingProductKey({
        orgProductSlugs: [ProductSlug.FLEET],
        subscriptionPriceBookProductKey: null,
        businessType: BusinessType.RENTAL,
      });
      expect(result.productKey).toBe('FLEET');
      expect(result.source).toBe('ORG_PRODUCT');
    });

    it('maps TAXI org product to Rental base plan', () => {
      const result = inferBaseBillingProductKey({
        orgProductSlugs: [ProductSlug.TAXI],
        subscriptionPriceBookProductKey: null,
        businessType: null,
      });
      expect(result.productKey).toBe('RENTAL');
      expect(result.source).toBe('ORG_PRODUCT');
    });

    it('reports conflict when Rental and Fleet org products are both active', () => {
      const result = inferBaseBillingProductKey({
        orgProductSlugs: [ProductSlug.RENTAL, ProductSlug.FLEET],
        subscriptionPriceBookProductKey: 'FLEET',
        businessType: BusinessType.FLEET,
      });
      expect(result.productKey).toBeNull();
      expect(result.conflicts).toContain('RENTAL_AND_FLEET_ACTIVE');
    });

    it('falls back to subscription price book product key', () => {
      const result = inferBaseBillingProductKey({
        orgProductSlugs: [],
        subscriptionPriceBookProductKey: 'FLEET',
        businessType: null,
      });
      expect(result.productKey).toBe('FLEET');
      expect(result.source).toBe('PRICE_BOOK');
    });

    it('falls back to businessType when no org product or price book', () => {
      const result = inferBaseBillingProductKey({
        orgProductSlugs: [],
        subscriptionPriceBookProductKey: null,
        businessType: BusinessType.FLEET,
      });
      expect(result.productKey).toBe('FLEET');
      expect(result.source).toBe('BUSINESS_TYPE');
    });

    it('reports ambiguous product for org without subscription signals', () => {
      const result = inferBaseBillingProductKey({
        orgProductSlugs: [],
        subscriptionPriceBookProductKey: null,
        businessType: BusinessType.LOGISTICS,
      });
      expect(result.productKey).toBeNull();
      expect(result.conflicts).toContain('AMBIGUOUS_BASE_PRODUCT');
    });
  });

  describe('inferLegacyAddonSignals', () => {
    it('detects addons from integration signals', () => {
      const signals = inferLegacyAddonSignals({
        orgProductSlugs: [],
        voiceAssistantConnected: true,
        whatsAppActive: true,
        workflowAutomationEnabled: true,
      });
      expect(signals.map((row) => row.addonKey)).toEqual([
        'VOICE_AGENT',
        'WHATSAPP',
        'AI_PACKAGE',
      ]);
    });
  });

  describe('stripe mode classification', () => {
    it('classifies test secret key as TEST', () => {
      expect(resolveStripeModeFromSecretKey('sk_test_abc')).toBe('TEST');
    });

    it('classifies live secret key as LIVE', () => {
      expect(resolveStripeModeFromSecretKey('sk_live_abc')).toBe('LIVE');
    });

    it('classifies default stripe price id using configured secret key mode', () => {
      expect(
        classifyStripePriceIdMode('price_123', 'sk_test_abc'),
      ).toBe('TEST');
      expect(
        classifyStripePriceIdMode('price_123', 'sk_live_abc'),
      ).toBe('LIVE');
    });
  });

  describe('idempotency helpers', () => {
    it('builds stable quantity backfill idempotency key', () => {
      expect(buildQuantityBackfillIdempotencyKey('org-1', 'item-1')).toBe(
        'legacy-backfill:quantity:v1:org-1:item-1',
      );
    });

    it('appends legacy marker only once', () => {
      expect(appendLegacyBackfillMarker('custom')).toBe(
        'custom [legacy-backfill:documented]',
      );
      expect(appendLegacyBackfillMarker('x [legacy-backfill:documented]')).toBe(
        'x [legacy-backfill:documented]',
      );
    });

    it('detects conflicting legacy sources', () => {
      expect(sourcesConflict('RENTAL', 'FLEET')).toBe(true);
      expect(sourcesConflict('FLEET', 'FLEET')).toBe(false);
      expect(sourcesConflict(null, 'FLEET')).toBe(false);
    });
  });
});

describe('BillingLegacyBackfillService fixtures', () => {
  const mockPrisma = {
    organization: { findMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    billingCatalogProduct: { findUnique: jest.fn(), create: jest.fn() },
    billingPriceBook: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    billingStripePriceMapping: { findUnique: jest.fn(), upsert: jest.fn() },
    billingSubscription: { findMany: jest.fn(), update: jest.fn() },
    billingSubscriptionItem: { create: jest.fn() },
    billingQuantityEvent: { findUnique: jest.fn(), create: jest.fn() },
    billingOrganizationPriceOverride: { update: jest.fn() },
  } as any;

  const mockPricebook = {
    findActiveVersion: jest.fn(),
    getVersionWithTiers: jest.fn(),
  } as any;

  const mockBillable = {
    getBillableConnectedVehiclesForOrganization: jest.fn(),
  } as any;

  let service: BillingLegacyBackfillService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BillingLegacyBackfillService(mockPrisma, mockPricebook, mockBillable);
    mockPrisma.organization.findMany.mockResolvedValue([{ id: 'org-rental' }]);
    mockPrisma.billingCatalogProduct.findUnique.mockImplementation(({ where }: any) => {
      if (where.key === 'RENTAL') return Promise.resolve({ id: 'bprod-rental' });
      if (where.key === 'FLEET') return Promise.resolve({ id: 'bprod-fleet' });
      return Promise.resolve(null);
    });
    mockPrisma.billingPriceBook.findMany.mockResolvedValue([]);
    mockBillable.getBillableConnectedVehiclesForOrganization.mockResolvedValue({
      billableVehicleCount: 3,
      connectedVehicleCount: 4,
      billableVehicles: [],
      excludedVehicles: [],
    });
    mockPricebook.findActiveVersion.mockResolvedValue({
      id: 'pv-1',
      status: 'ACTIVE',
      tiers: [],
    });
  });

  const baseOrg = {
    id: 'org-rental',
    companyName: 'Rental Co',
    businessType: BusinessType.RENTAL,
    organizationProducts: [
      { product: { slug: ProductSlug.RENTAL }, status: 'ACTIVE' },
    ],
    billingOrgPriceOverrides: [],
    voiceAssistant: null,
    whatsappConfig: null,
    taskAutomationRuleOverrides: [],
  };

  it('skips org without subscription and without billing signals', async () => {
    mockPrisma.organization.findUniqueOrThrow.mockResolvedValue({
      id: 'org-empty',
      companyName: 'Empty Org',
      businessType: BusinessType.OTHER,
      organizationProducts: [],
      billingOrgPriceOverrides: [],
      voiceAssistant: null,
      whatsappConfig: null,
      taskAutomationRuleOverrides: [],
    });
    mockPrisma.organization.findMany.mockResolvedValue([{ id: 'org-empty' }]);
    mockPrisma.billingSubscription.findMany.mockResolvedValue([]);

    const report = await service.run({ dryRun: true, organizationId: 'org-empty' });

    expect(report.summary.skippedNoBillingSignal).toBe(1);
    expect(report.organizations[0].outcome).toBe('skipped_no_billing_signal');
  });

  it('dry run for org without subscription does not write', async () => {
    mockPrisma.organization.findUniqueOrThrow.mockResolvedValue({
      ...baseOrg,
      organizationProducts: [{ product: { slug: ProductSlug.RENTAL } }],
      billingOrgPriceOverrides: [],
    });
    mockPrisma.billingSubscription.findMany.mockResolvedValue([]);

    const report = await service.run({ dryRun: true, organizationId: 'org-rental' });

    expect(report.mode).toBe('dry-run');
    expect(report.summary.skippedNoSubscription).toBe(1);
    expect(mockPrisma.billingSubscriptionItem.create).not.toHaveBeenCalled();
    expect(mockPrisma.billingSubscription.update).not.toHaveBeenCalled();
  });

  it('migrates Rental org with subscription and stripe ids', async () => {
    mockPrisma.organization.findUniqueOrThrow.mockResolvedValue(baseOrg);
    mockPrisma.billingSubscription.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        organizationId: 'org-rental',
        status: 'ACTIVE',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_stripe_1',
        stripeMode: null,
        priceBookId: 'pb-rental',
        priceVersionId: null,
        currentPeriodStart: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        priceBook: { id: 'pb-rental', productKey: 'RENTAL', billingProductId: 'bprod-rental' },
        items: [],
      },
    ]);
    mockPrisma.billingSubscriptionItem.create.mockResolvedValue({ id: 'item-1' });

    const report = await service.run({ dryRun: false, organizationId: 'org-rental' });

    expect(report.summary.migrated).toBe(1);
    expect(mockPrisma.billingSubscription.update).toHaveBeenCalled();
    expect(mockPrisma.billingSubscriptionItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billingProductId: 'bprod-rental',
          quantity: 3,
        }),
      }),
    );
    expect(mockPrisma.billingQuantityEvent.create).toHaveBeenCalled();
  });

  it('second run is idempotent when base item already exists', async () => {
    mockPrisma.organization.findUniqueOrThrow.mockResolvedValue(baseOrg);
    mockPrisma.billingSubscription.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        organizationId: 'org-rental',
        status: 'ACTIVE',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_stripe_1',
        stripeMode: 'LIVE',
        priceBookId: 'pb-rental',
        priceVersionId: 'pv-1',
        currentPeriodStart: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        priceBook: { id: 'pb-rental', productKey: 'RENTAL', billingProductId: 'bprod-rental' },
        items: [
          {
            id: 'item-existing',
            quantity: 3,
            itemRole: 'BASE_PLAN',
            status: 'ACTIVE',
            billingProductId: 'bprod-rental',
          },
        ],
      },
    ]);
    mockPricebook.getVersionWithTiers.mockResolvedValue({ id: 'pv-1', status: 'ACTIVE' });
    mockPrisma.billingQuantityEvent.findUnique.mockResolvedValue({ id: 'evt-1' });

    const report = await service.run({ dryRun: false, organizationId: 'org-rental' });

    expect(report.summary.alreadyMigrated).toBe(1);
    expect(mockPrisma.billingSubscriptionItem.create).not.toHaveBeenCalled();
    expect(mockPrisma.billingQuantityEvent.create).not.toHaveBeenCalled();
  });

  it('reports conflict for missing active price version', async () => {
    mockPrisma.organization.findUniqueOrThrow.mockResolvedValue({
      ...baseOrg,
      businessType: BusinessType.FLEET,
      organizationProducts: [{ product: { slug: ProductSlug.FLEET } }],
    });
    mockPrisma.billingCatalogProduct.findUnique.mockResolvedValue({ id: 'bprod-fleet' });
    mockPrisma.billingSubscription.findMany.mockResolvedValue([
      {
        id: 'sub-fleet',
        organizationId: 'org-rental',
        status: 'ACTIVE',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripeMode: null,
        priceBookId: 'pb-fleet',
        priceVersionId: null,
        currentPeriodStart: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        priceBook: { id: 'pb-fleet', productKey: 'FLEET', billingProductId: 'bprod-fleet' },
        items: [],
      },
    ]);
    mockPricebook.findActiveVersion.mockResolvedValue(null);

    const report = await service.run({ dryRun: true, organizationId: 'org-rental' });

    expect(report.summary.conflicts).toBe(1);
    expect(report.organizations[0].conflicts).toContain('NO_ACTIVE_PRICE_VERSION');
    expect(mockPrisma.billingSubscriptionItem.create).not.toHaveBeenCalled();
  });

  it('reports conflicting legacy Rental/Fleet org products', async () => {
    mockPrisma.organization.findUniqueOrThrow.mockResolvedValue({
      ...baseOrg,
      organizationProducts: [
        { product: { slug: ProductSlug.RENTAL } },
        { product: { slug: ProductSlug.FLEET } },
      ],
    });
    mockPrisma.billingSubscription.findMany.mockResolvedValue([
      {
        id: 'sub-conflict',
        organizationId: 'org-rental',
        status: 'ACTIVE',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripeMode: null,
        priceBookId: 'pb-fleet',
        priceVersionId: 'pv-1',
        currentPeriodStart: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        priceBook: { id: 'pb-fleet', productKey: 'FLEET', billingProductId: 'bprod-fleet' },
        items: [],
      },
    ]);

    const report = await service.run({ dryRun: true, organizationId: 'org-rental' });

    expect(report.summary.conflicts).toBe(1);
    expect(report.organizations[0].conflicts).toContain('RENTAL_AND_FLEET_ACTIVE');
  });

  it('documents price overrides without deleting legacy rows', async () => {
    mockPrisma.organization.findUniqueOrThrow.mockResolvedValue({
      ...baseOrg,
      billingOrgPriceOverrides: [
        {
          id: 'override-1',
          reason: 'VIP pricing',
          status: 'ACTIVE',
        },
      ],
    });
    mockPrisma.billingSubscription.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        organizationId: 'org-rental',
        status: 'ACTIVE',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_stripe_1',
        stripeMode: 'LIVE',
        priceBookId: 'pb-rental',
        priceVersionId: 'pv-1',
        currentPeriodStart: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        priceBook: { id: 'pb-rental', productKey: 'RENTAL', billingProductId: 'bprod-rental' },
        items: [
          {
            id: 'item-existing',
            quantity: 2,
            itemRole: 'BASE_PLAN',
            status: 'ACTIVE',
          },
        ],
      },
    ]);
    mockPricebook.getVersionWithTiers.mockResolvedValue({ id: 'pv-1', status: 'ACTIVE' });
    mockPrisma.billingQuantityEvent.findUnique.mockResolvedValue({ id: 'evt-1' });

    const report = await service.run({ dryRun: false, organizationId: 'org-rental' });

    expect(report.organizations[0].actions.some((a) => a.kind === 'document_price_override')).toBe(
      true,
    );
    expect(mockPrisma.billingOrganizationPriceOverride.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { reason: 'VIP pricing [legacy-backfill:documented]' },
      }),
    );
    expect(mockPrisma.billingSubscriptionItem.create).not.toHaveBeenCalled();
  });
});
