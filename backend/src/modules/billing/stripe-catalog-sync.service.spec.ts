import { ConflictException } from '@nestjs/common';
import {
  BillingInterval,
  BillingModel,
  BillingPriceVersionStatus,
  BillingStripeMappingStatus,
  BillingStripeMode,
} from '@prisma/client';
import * as stripeClientUtil from './stripe-client.util';
import { StripeCatalogMappingService } from './stripe-catalog-mapping.service';
import { StripeCatalogSyncService } from './stripe-catalog-sync.service';
import { StripeCatalogMappingErrorCode } from './domain/stripe-catalog-mapping';
import {
  StripeCatalogSyncErrorCode,
  StripeCatalogSyncMetadataKeys,
  buildStripeCatalogPriceIdempotencyKey,
  buildStripeCatalogProductIdempotencyKey,
} from './domain/stripe-catalog-sync';

describe('StripeCatalogSyncService', () => {
  const productId = 'bprod-rental';
  const bookId = 'book-1';
  const versionId = 'ver-active';
  const mappingId = 'map-1';

  let mappings: any[];
  let versions: Map<string, any>;
  let stripeMock: {
    products: {
      create: jest.Mock;
      retrieve: jest.Mock;
      update: jest.Mock;
    };
    prices: {
      create: jest.Mock;
      retrieve: jest.Mock;
    };
  };

  const prisma: any = {
    billingStripeCatalogMapping: {
      findMany: jest.fn(async ({ where, include }: any) =>
        mappings.filter((row) => {
          if (where?.disabledAt === null && row.disabledAt != null) return false;
          return true;
        }),
      ),
      findFirst: jest.fn(async ({ where }: any) =>
        mappings.find((row) => {
          if (where.billingProductId && row.billingProductId !== where.billingProductId) {
            return false;
          }
          if (where.stripeMode && row.stripeMode !== where.stripeMode) return false;
          if (where.disabledAt === null && row.disabledAt != null) return false;
          return true;
        }) ?? null,
      ),
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.priceVersionId_stripeMode) {
          const key = where.priceVersionId_stripeMode;
          const row =
            mappings.find(
              (item) =>
                item.priceVersionId === key.priceVersionId && item.stripeMode === key.stripeMode,
            ) ?? null;
          if (!row) return null;
          return {
            ...row,
            billingProduct: row.billingProduct ?? { key: 'RENTAL' },
          };
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
        if (where.id) {
          const row = mappings.find((item) => item.id === where.id) ?? null;
          if (!row) return null;
          return {
            ...row,
            billingProduct: row.billingProduct ?? { key: 'RENTAL' },
            priceVersion: versions.get(row.priceVersionId),
            priceBook: versions.get(row.priceVersionId)?.priceBook,
          };
        }
        return null;
      }),
      create: jest.fn(async ({ data }: any) => {
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
      update: jest.fn(async ({ where, data }: any) => {
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
      return '';
    }),
  };

  let catalogMappings: StripeCatalogMappingService;
  let service: StripeCatalogSyncService;

  const productMetadata = {
    [StripeCatalogSyncMetadataKeys.billingProductId]: productId,
    [StripeCatalogSyncMetadataKeys.productKey]: 'RENTAL',
    [StripeCatalogSyncMetadataKeys.environment]: 'test',
    [StripeCatalogSyncMetadataKeys.schemaVersion]: '1',
  };

  const mappingDefaults = {
    billingProduct: { key: 'RENTAL' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const buildMapping = (overrides: Record<string, unknown>) => ({
    ...mappingDefaults,
    billingProductId: productId,
    priceBookId: bookId,
    stripeMode: BillingStripeMode.TEST,
    currency: 'EUR',
    billingInterval: BillingInterval.MONTHLY,
    billingModel: BillingModel.PER_CONNECTED_VEHICLE,
    stripePresentation: 'recurring_per_unit',
    disabledAt: null,
    ...overrides,
  });

  const priceMetadata = {
    ...productMetadata,
    [StripeCatalogSyncMetadataKeys.priceVersionId]: versionId,
  };

  const stripeProduct = {
    id: 'prod_test_1',
    active: true,
    name: 'SynqDrive Rental',
    description: 'Rental platform base plan',
    metadata: productMetadata,
  };

  const stripePrice = {
    id: 'price_test_1',
    active: true,
    currency: 'eur',
    unit_amount: 1500,
    product: 'prod_test_1',
    recurring: { interval: 'month' },
    metadata: priceMetadata,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mappings = [];
    const sharedPriceBook = {
      id: bookId,
      currency: 'EUR',
      interval: BillingInterval.MONTHLY,
      billingModel: BillingModel.PER_CONNECTED_VEHICLE,
      billingProductId: productId,
      billingProduct: {
        id: productId,
        key: 'RENTAL',
        name: 'SynqDrive Rental',
        description: 'Rental platform base plan',
      },
    };

    versions = new Map([
      [
        versionId,
        {
          id: versionId,
          priceBookId: bookId,
          status: BillingPriceVersionStatus.ACTIVE,
          tiers: [{ minVehicles: 1, maxVehicles: 10, unitPriceCents: 1500, sortOrder: 0 }],
          priceBook: sharedPriceBook,
        },
      ],
      [
        'ver-archived',
        {
          id: 'ver-archived',
          priceBookId: bookId,
          status: BillingPriceVersionStatus.ARCHIVED,
          tiers: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: 1500, sortOrder: 0 }],
          priceBook: sharedPriceBook,
        },
      ],
    ]);

    stripeMock = {
      products: {
        create: jest.fn(async () => stripeProduct),
        retrieve: jest.fn(async (id: string) => ({ ...stripeProduct, id })),
        update: jest.fn(async (id: string, data: any) => ({
          ...stripeProduct,
          id,
          ...data,
        })),
      },
      prices: {
        create: jest.fn(async () => stripePrice),
        retrieve: jest.fn(async (id: string) => ({ ...stripePrice, id })),
      },
    };

    jest.spyOn(stripeClientUtil, 'getStripeClient').mockReturnValue(stripeMock as never);
    catalogMappings = new StripeCatalogMappingService(prisma as never, configService as never);
    service = new StripeCatalogSyncService(prisma as never, configService as never, catalogMappings);
  });

  afterEach(() => {
    jest.useRealTimers();
    stripeClientUtil.resetStripeClientForTests();
  });

  const runSync = async () => {
    const promise = service.syncPriceVersion({ priceVersionId: versionId });
    await Promise.all([promise, jest.runAllTimersAsync()]);
    return await promise;
  };

  it('creates stripe product and price for a new published version', async () => {
    const result = await runSync();

    expect(stripeMock.products.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: productMetadata,
      }),
      expect.objectContaining({
        idempotencyKey: buildStripeCatalogProductIdempotencyKey(productId, BillingStripeMode.TEST),
      }),
    );
    expect(stripeMock.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        unit_amount: 1500,
        recurring: { interval: 'month' },
        metadata: priceMetadata,
      }),
      expect.objectContaining({
        idempotencyKey: buildStripeCatalogPriceIdempotencyKey(versionId, BillingStripeMode.TEST),
      }),
    );
    expect(result.createdProduct).toBe(true);
    expect(result.createdPrice).toBe(true);
    expect(result.mappingStatus).toBe(BillingStripeMappingStatus.SYNCED);
    expect(result.verified).toBe(true);
  });

  it('reuses existing stripe product from sibling mapping', async () => {
    mappings.push(
      buildMapping({
        id: 'map-sibling',
        priceVersionId: 'ver-other',
        stripeProductId: 'prod_existing',
        stripePriceId: 'price_other',
        mappingStatus: BillingStripeMappingStatus.SYNCED,
      }),
    );
    stripeMock.products.retrieve.mockImplementation(async (id: string) => ({
      ...stripeProduct,
      id,
    }));
    stripeMock.prices.create.mockResolvedValue({
      ...stripePrice,
      product: 'prod_existing',
    });
    stripeMock.prices.retrieve.mockImplementation(async (id: string) => ({
      ...stripePrice,
      id,
      product: 'prod_existing',
    }));

    const result = await runSync();

    expect(stripeMock.products.create).not.toHaveBeenCalled();
    expect(result.createdProduct).toBe(false);
    expect(result.stripeProductId).toBe('prod_existing');
  });

  it('validates existing mapped price without creating a duplicate on retry', async () => {
    mappings.push(
      buildMapping({
        id: mappingId,
        priceVersionId: versionId,
        stripeProductId: 'prod_test_1',
        stripePriceId: 'price_test_1',
        mappingStatus: BillingStripeMappingStatus.FAILED,
        lastError: 'previous',
      }),
    );

    const first = await runSync();
    const second = await runSync();

    expect(stripeMock.prices.create).not.toHaveBeenCalled();
    expect(first.createdPrice).toBe(false);
    expect(second.createdPrice).toBe(false);
    expect(second.mappingStatus).toBe(BillingStripeMappingStatus.SYNCED);
  });

  it('retries failed mapping via mapping id endpoint flow', async () => {
    mappings.push(
      buildMapping({
        id: mappingId,
        priceVersionId: versionId,
        stripeProductId: 'prod_test_1',
        stripePriceId: 'price_test_1',
        mappingStatus: BillingStripeMappingStatus.FAILED,
        lastError: 'STRIPE_CATALOG_SYNC_PROVIDER_TIMEOUT',
      }),
    );

    const promise = service.retrySyncMapping(mappingId);
    await Promise.all([promise, jest.runAllTimersAsync()]);
    const result = await promise;

    expect(result.mappingStatus).toBe(BillingStripeMappingStatus.SYNCED);
    expect(result.lastError).toBeNull();
  });

  it('translates stripe timeout errors and stores failure', async () => {
    stripeMock.products.create.mockRejectedValueOnce({
      type: 'StripeConnectionError',
      code: 'timeout',
      message: 'request timed out',
    });

    await expect(runSync()).rejects.toMatchObject({
      response: { code: StripeCatalogSyncErrorCode.PROVIDER_TIMEOUT },
    });
  });

  it('translates stripe invalid request errors', async () => {
    stripeMock.prices.create.mockRejectedValueOnce({
      type: 'StripeInvalidRequestError',
      message: 'invalid price',
    });

    await expect(runSync()).rejects.toMatchObject({
      response: { code: StripeCatalogSyncErrorCode.PROVIDER_INVALID_REQUEST },
    });
  });

  it('marks mapping drifted when stripe price amount differs', async () => {
    mappings.push(
      buildMapping({
        id: mappingId,
        priceVersionId: versionId,
        stripeProductId: 'prod_test_1',
        stripePriceId: 'price_test_1',
        mappingStatus: BillingStripeMappingStatus.SYNCED,
      }),
    );
    stripeMock.prices.retrieve.mockResolvedValue({
      ...stripePrice,
      unit_amount: 1200,
    });

    await expect(runSync()).rejects.toMatchObject({
      response: { code: StripeCatalogSyncErrorCode.PRICE_AMOUNT_DRIFT },
    });

    const row = mappings.find((item) => item.id === mappingId);
    expect(row?.mappingStatus).toBe(BillingStripeMappingStatus.DRIFTED);
    expect(stripeMock.prices.create).not.toHaveBeenCalled();
  });

  it('rejects inconsistent stripe metadata', async () => {
    const badMetadata = {
      ...priceMetadata,
      synqdrivePriceVersionId: 'other-version',
    };
    stripeMock.prices.create.mockResolvedValue({
      ...stripePrice,
      metadata: badMetadata,
    });
    stripeMock.prices.retrieve.mockResolvedValue({
      ...stripePrice,
      metadata: badMetadata,
    });

    await expect(runSync()).rejects.toMatchObject({
      response: { code: StripeCatalogSyncErrorCode.METADATA_INCONSISTENT },
    });
  });

  it('rejects test/live mode mismatch', async () => {
    await expect(
      service.syncPriceVersion({
        priceVersionId: versionId,
        stripeMode: BillingStripeMode.LIVE,
      }),
    ).rejects.toMatchObject({
      response: { code: StripeCatalogMappingErrorCode.STRIPE_MODE_MISMATCH },
    });
  });

  it('returns not configured when stripe secret is missing', async () => {
    jest.spyOn(stripeClientUtil, 'getStripeClient').mockReturnValue(null);
    await expect(
      service.syncPriceVersion({ priceVersionId: versionId }),
    ).rejects.toMatchObject({
      response: { code: StripeCatalogSyncErrorCode.NOT_CONFIGURED },
    });
  });

  it('scans stale mappings for archived versions and draft drift', async () => {
    mappings.push(
      {
        id: 'map-archived',
        billingProductId: productId,
        priceVersionId: 'ver-archived',
        priceBookId: bookId,
        stripeMode: BillingStripeMode.TEST,
        stripeProductId: 'prod_test_1',
        stripePriceId: 'price_archived',
        currency: 'EUR',
        billingInterval: BillingInterval.MONTHLY,
        billingModel: BillingModel.PER_CONNECTED_VEHICLE,
        stripePresentation: 'recurring_per_unit',
        mappingStatus: BillingStripeMappingStatus.SYNCED,
        disabledAt: null,
        priceVersion: { status: BillingPriceVersionStatus.ARCHIVED },
      },
      {
        id: 'map-draft',
        billingProductId: productId,
        priceVersionId: 'ver-draft',
        priceBookId: bookId,
        stripeMode: BillingStripeMode.TEST,
        stripeProductId: 'prod_test_1',
        stripePriceId: 'price_draft',
        currency: 'EUR',
        billingInterval: BillingInterval.MONTHLY,
        billingModel: BillingModel.PER_CONNECTED_VEHICLE,
        stripePresentation: 'recurring_per_unit',
        mappingStatus: BillingStripeMappingStatus.SYNCED,
        disabledAt: null,
        priceVersion: { status: BillingPriceVersionStatus.DRAFT },
      },
    );

    prisma.billingStripeCatalogMapping.findMany.mockResolvedValue(mappings);

    const result = await service.scanStaleMappings();

    expect(result.scanned).toBe(2);
    expect(result.stale).toBe(2);
    expect(result.disabled).toBe(1);
    expect(result.drifted).toBe(1);
  });

  it('rejects sync for unpublished versions', async () => {
    versions.set('ver-draft', {
      id: 'ver-draft',
      priceBookId: bookId,
      status: BillingPriceVersionStatus.DRAFT,
      tiers: [{ minVehicles: 1, maxVehicles: null, unitPriceCents: 1500, sortOrder: 0 }],
      priceBook: versions.get(versionId)!.priceBook,
    });

    await expect(
      service.syncPriceVersion({ priceVersionId: 'ver-draft' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
