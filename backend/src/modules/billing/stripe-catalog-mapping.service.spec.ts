import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  BillingInterval,
  BillingModel,
  BillingPriceVersionStatus,
  BillingStripeMappingStatus,
  BillingStripeMode,
} from '@prisma/client';
import { StripeCatalogMappingService } from './stripe-catalog-mapping.service';
import { StripeCatalogMappingErrorCode } from './domain/stripe-catalog-mapping';

describe('StripeCatalogMappingService', () => {
  const productId = 'bprod-rental';
  const bookId = 'book-1';
  const versionId = 'ver-active';
  const mappingId = 'map-1';

  let mappings: any[];
  let versions: Map<string, any>;

  const prisma: any = {
    billingStripeCatalogMapping: {
      findMany: jest.fn(async ({ where }: any) =>
        mappings.filter((row) => {
          if (where?.priceVersionId && row.priceVersionId !== where.priceVersionId) return false;
          if (where?.stripeMode && row.stripeMode !== where.stripeMode) return false;
          if (where?.disabledAt === null && row.disabledAt != null) return false;
          if (where?.billingProductId && row.billingProductId !== where.billingProductId) return false;
          return true;
        }),
      ),
      findUnique: jest.fn(async ({ where, include }: any) => {
        if (where.id) {
          const row = mappings.find((item) => item.id === where.id) ?? null;
          if (!row) return null;
          const version = versions.get(row.priceVersionId);
          return {
            ...row,
            priceVersion: version,
            priceBook: version?.priceBook,
          };
        }
        if (where.priceVersionId_stripeMode) {
          const key = where.priceVersionId_stripeMode;
          return (
            mappings.find(
              (row) =>
                row.priceVersionId === key.priceVersionId && row.stripeMode === key.stripeMode,
            ) ?? null
          );
        }
        if (where.stripePriceId_stripeMode) {
          const key = where.stripePriceId_stripeMode;
          return (
            mappings.find(
              (row) =>
                row.stripePriceId === key.stripePriceId && row.stripeMode === key.stripeMode,
            ) ?? null
          );
        }
        return null;
      }),
      findFirst: jest.fn(async ({ where }: any) =>
        mappings.find((row) => {
          if (where.priceVersionId && row.priceVersionId !== where.priceVersionId) return false;
          if (where.stripeMode && row.stripeMode !== where.stripeMode) return false;
          if (where.disabledAt === null && row.disabledAt != null) return false;
          if (where.billingProductId && row.billingProductId !== where.billingProductId) return false;
          if (where.mappingStatus?.in && !where.mappingStatus.in.includes(row.mappingStatus)) {
            return false;
          }
          return true;
        }) ?? null,
      ),
      create: jest.fn(async ({ data, include }: any) => {
        const row = {
          id: `map-${mappings.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          billingProduct: { key: 'RENTAL' },
          ...data,
        };
        mappings.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data, include }: any) => {
        const row = mappings.find((item) => item.id === where.id);
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      }),
    },
    billingPriceVersion: {
      findUnique: jest.fn(async ({ where }: any) => versions.get(where.id) ?? null),
    },
  };

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'stripe.secretKey') return 'sk_test_abc';
      if (key === 'stripe.defaultPriceId') return 'price_legacy_default';
      if (key === 'stripe.currency') return 'eur';
      return '';
    }),
  };

  let service: StripeCatalogMappingService;

  beforeEach(() => {
    jest.clearAllMocks();
    mappings = [];
    versions = new Map([
      [
        versionId,
        {
          id: versionId,
          priceBookId: bookId,
          status: BillingPriceVersionStatus.ACTIVE,
          priceBook: {
            id: bookId,
            currency: 'EUR',
            interval: BillingInterval.MONTHLY,
            billingModel: BillingModel.PER_CONNECTED_VEHICLE,
            billingProductId: productId,
            billingProduct: { id: productId, key: 'RENTAL' },
          },
        },
      ],
      [
        'ver-archived',
        {
          id: 'ver-archived',
          priceBookId: bookId,
          status: BillingPriceVersionStatus.ARCHIVED,
          priceBook: {
            id: bookId,
            currency: 'EUR',
            interval: BillingInterval.MONTHLY,
            billingModel: BillingModel.PER_CONNECTED_VEHICLE,
            billingProductId: productId,
            billingProduct: { id: productId, key: 'RENTAL' },
          },
        },
      ],
      [
        'ver-draft',
        {
          id: 'ver-draft',
          priceBookId: bookId,
          status: BillingPriceVersionStatus.DRAFT,
          priceBook: {
            id: bookId,
            currency: 'EUR',
            interval: BillingInterval.MONTHLY,
            billingModel: BillingModel.PER_CONNECTED_VEHICLE,
            billingProductId: productId,
            billingProduct: { id: productId, key: 'RENTAL' },
          },
        },
      ],
    ]);

    service = new StripeCatalogMappingService(prisma as never, configService as never);
  });

  const connect = () =>
    service.connectMapping({
      priceVersionId: versionId,
      stripeMode: BillingStripeMode.TEST,
      stripeProductId: 'prod_test_1',
      stripePriceId: 'price_test_1',
    });

  it('connects published version mapping with matching currency and interval', async () => {
    const mapping = await connect();
    expect(mapping.stripeMode).toBe(BillingStripeMode.TEST);
    expect(mapping.currency).toBe('EUR');
    expect(mapping.billingInterval).toBe(BillingInterval.MONTHLY);
    expect(mapping.mappingStatus).toBe(BillingStripeMappingStatus.PENDING);
  });

  it('rejects test/live mode mismatch against runtime secret', async () => {
    await expect(
      service.connectMapping({
        priceVersionId: versionId,
        stripeMode: BillingStripeMode.LIVE,
        stripeProductId: 'prod_live_1',
        stripePriceId: 'price_live_1',
      }),
    ).rejects.toMatchObject({
      response: { code: StripeCatalogMappingErrorCode.STRIPE_MODE_MISMATCH },
    });
  });

  it('rejects currency mismatch', async () => {
    await expect(
      service.connectMapping({
        priceVersionId: versionId,
        stripeMode: BillingStripeMode.TEST,
        stripeProductId: 'prod_test_1',
        stripePriceId: 'price_test_1',
        currency: 'USD',
      }),
    ).rejects.toMatchObject({
      response: { code: StripeCatalogMappingErrorCode.CURRENCY_MISMATCH },
    });
  });

  it('rejects interval mismatch', async () => {
    await expect(
      service.connectMapping({
        priceVersionId: versionId,
        stripeMode: BillingStripeMode.TEST,
        stripeProductId: 'prod_test_1',
        stripePriceId: 'price_test_1',
        billingInterval: 'YEARLY',
      }),
    ).rejects.toMatchObject({
      response: { code: StripeCatalogMappingErrorCode.INTERVAL_MISMATCH },
    });
  });

  it('rejects duplicate stripe price id for another version', async () => {
    versions.set('ver-active-2', {
      id: 'ver-active-2',
      priceBookId: bookId,
      status: BillingPriceVersionStatus.ACTIVE,
      priceBook: versions.get(versionId)!.priceBook,
    });
    await connect();
    await expect(
      service.connectMapping({
        priceVersionId: 'ver-active-2',
        stripeMode: BillingStripeMode.TEST,
        stripeProductId: 'prod_test_1',
        stripePriceId: 'price_test_1',
      }),
    ).rejects.toMatchObject({
      response: { code: StripeCatalogMappingErrorCode.DUPLICATE_STRIPE_PRICE_ID },
    });
  });

  it('rejects archived version mapping', async () => {
    await expect(
      service.connectMapping({
        priceVersionId: 'ver-archived',
        stripeMode: BillingStripeMode.TEST,
        stripeProductId: 'prod_test_1',
        stripePriceId: 'price_test_arch',
      }),
    ).rejects.toMatchObject({
      response: { code: StripeCatalogMappingErrorCode.VERSION_ARCHIVED },
    });
  });

  it('rejects draft version mapping', async () => {
    await expect(
      service.connectMapping({
        priceVersionId: 'ver-draft',
        stripeMode: BillingStripeMode.TEST,
        stripeProductId: 'prod_test_1',
        stripePriceId: 'price_test_draft',
      }),
    ).rejects.toMatchObject({
      response: { code: StripeCatalogMappingErrorCode.VERSION_NOT_PUBLISHED },
    });
  });

  it('treats stripe price id as immutable once connected', async () => {
    await connect();
    await expect(
      service.connectMapping({
        priceVersionId: versionId,
        stripeMode: BillingStripeMode.TEST,
        stripeProductId: 'prod_test_1',
        stripePriceId: 'price_test_changed',
      }),
    ).rejects.toMatchObject({
      response: { code: StripeCatalogMappingErrorCode.STRIPE_PRICE_IMMUTABLE },
    });
  });

  it('resolves mapped price for modern contracts', async () => {
    mappings.push({
      id: mappingId,
      billingProductId: productId,
      priceVersionId: versionId,
      priceBookId: bookId,
      stripeMode: BillingStripeMode.TEST,
      stripeProductId: 'prod_test_1',
      stripePriceId: 'price_test_1',
      currency: 'EUR',
      billingInterval: BillingInterval.MONTHLY,
      billingModel: BillingModel.PER_CONNECTED_VEHICLE,
      stripePresentation: 'recurring_per_unit',
      mappingStatus: BillingStripeMappingStatus.SYNCED,
      disabledAt: null,
      billingProduct: { key: 'RENTAL' },
    });

    const resolved = await service.resolveStripePrice({
      organizationId: 'org-1',
      priceVersionId: versionId,
      subscriptionItemPriceVersionId: versionId,
    });

    expect(resolved.source).toBe('CATALOG_MAPPING');
    expect(resolved.legacyFallbackUsed).toBe(false);
    expect(resolved.stripePriceId).toBe('price_test_1');
  });

  it('returns clear error when mapping is missing for modern contract', async () => {
    await expect(
      service.resolveStripePrice({
        organizationId: 'org-1',
        priceVersionId: versionId,
        subscriptionPriceVersionId: versionId,
      }),
    ).rejects.toMatchObject({
      response: { code: StripeCatalogMappingErrorCode.STRIPE_MAPPING_MISSING },
    });
  });

  it('blocks legacy fallback for modern contracts', async () => {
    await expect(
      service.resolveStripePrice({
        organizationId: 'org-1',
        priceVersionId: versionId,
        subscriptionPriceVersionId: versionId,
        allowLegacyFallback: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows legacy fallback only for non-modern contracts', async () => {
    const resolved = await service.resolveStripePrice({
      organizationId: 'org-1',
      priceVersionId: versionId,
      allowLegacyFallback: true,
    });
    expect(resolved.source).toBe('LEGACY_DEFAULT_PRICE');
    expect(resolved.legacyFallbackUsed).toBe(true);
    expect(resolved.stripePriceId).toBe('price_legacy_default');
  });

  it('validates and marks mapping as synced', async () => {
    const created = await connect();
    const validated = await service.validateMapping(created.id);
    expect(validated.mappingStatus).toBe(BillingStripeMappingStatus.SYNCED);
    expect(validated.lastVerifiedAt).not.toBeNull();
  });

  it('deactivates mapping', async () => {
    const created = await connect();
    const deactivated = await service.deactivateMapping(created.id);
    expect(deactivated.mappingStatus).toBe(BillingStripeMappingStatus.DISABLED);
    expect(deactivated.disabledAt).not.toBeNull();
  });
});
