import Stripe from 'stripe';
import {
  BillingPriceVersionStatus,
  BillingStripeMappingStatus,
  BillingStripeMode,
  Prisma,
} from '@prisma/client';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { getStripeClient } from './stripe-client.util';
import { StripeCatalogMappingService } from './stripe-catalog-mapping.service';
import {
  StripeCatalogMappingErrorCode,
  assertRuntimeStripeMode,
  mapBillingIntervalToStripe,
  normalizeCurrency,
} from './domain/stripe-catalog-mapping';
import {
  StripeCatalogSyncErrorCode,
  StripeCatalogSyncResult,
  STRIPE_CATALOG_SYNC_MAX_RETRIES,
  STRIPE_CATALOG_SYNC_RATE_LIMIT_DELAY_MS,
  assertStripeMetadataMatches,
  assertStripePriceMatchesLocal,
  buildStripeCatalogPriceIdempotencyKey,
  buildStripeCatalogPriceMetadata,
  buildStripeCatalogProductIdempotencyKey,
  buildStripeCatalogProductMetadata,
  resolveCatalogStripeUnitAmountCents,
  truncateSyncErrorMessage,
  translateStripeProviderError,
} from './domain/stripe-catalog-sync';

export interface SyncStripeCatalogInput {
  priceVersionId: string;
  stripeMode?: BillingStripeMode;
  actorUserId?: string | null;
}

export interface ScanStaleStripeCatalogMappingsResult {
  scanned: number;
  stale: number;
  disabled: number;
  drifted: number;
  mappingIds: string[];
}

@Injectable()
export class StripeCatalogSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly catalogMappings: StripeCatalogMappingService,
  ) {}

  async syncPriceVersion(input: SyncStripeCatalogInput): Promise<StripeCatalogSyncResult> {
    const stripeMode = input.stripeMode ?? this.requireRuntimeStripeMode();
    const context = await this.loadSyncContext(input.priceVersionId);
    this.assertPublishedVersion(context.version.status);
    this.guardConflict(() => assertRuntimeStripeMode(stripeMode, this.catalogMappings.getRuntimeStripeMode()));

    const stripe = this.requireStripe();
    const expectedUnitAmountCents = resolveCatalogStripeUnitAmountCents(context.version.tiers);
    const expectedInterval = mapBillingIntervalToStripe(context.priceBook.interval);
    const currency = normalizeCurrency(context.priceBook.currency);
    const billingProduct = context.priceBook.billingProduct;

    if (!billingProduct) {
      throw new ConflictException({
        code: StripeCatalogMappingErrorCode.PRODUCT_MISMATCH,
        message: StripeCatalogMappingErrorCode.PRODUCT_MISMATCH,
      });
    }

    const productMetadata = buildStripeCatalogProductMetadata({
      billingProductId: billingProduct.id,
      productKey: billingProduct.key,
      stripeMode,
    });
    const priceMetadata = buildStripeCatalogPriceMetadata({
      billingProductId: billingProduct.id,
      productKey: billingProduct.key,
      priceVersionId: context.version.id,
      stripeMode,
    });

    const existingMapping = await this.catalogMappings.getMappingForVersion(
      input.priceVersionId,
      stripeMode,
    );

    let createdProduct = false;
    let createdPrice = false;
    let metadataSynced = false;
    let driftDetected = false;

    try {
      const productResult = await this.ensureStripeProduct({
        stripe,
        billingProductId: billingProduct.id,
        productName: billingProduct.name,
        productDescription: billingProduct.description,
        productMetadata,
        stripeMode,
        existingProductId: existingMapping?.stripeProductId ?? null,
      });
      createdProduct = productResult.created;
      const stripeProductId = productResult.stripeProductId;

      metadataSynced = await this.syncProductMetadata({
        stripe,
        stripeProductId,
        productName: billingProduct.name,
        productDescription: billingProduct.description,
        productMetadata,
      });

      const { stripePriceId, created } = await this.ensureStripePrice({
        stripe,
        stripeProductId,
        stripeMode,
        priceVersionId: context.version.id,
        currency,
        expectedInterval,
        expectedUnitAmountCents,
        priceMetadata,
        existingPriceId: existingMapping?.stripePriceId ?? null,
      });
      createdPrice = created;

      const stripePrice = await this.executeStripeCall(() =>
        stripe.prices.retrieve(stripePriceId),
      );
      assertStripePriceMatchesLocal({
        stripePrice: stripePrice as never,
        expectedUnitAmountCents,
        expectedCurrency: currency,
        expectedInterval,
        expectedProductId: stripeProductId,
      });
      assertStripeMetadataMatches(stripePrice.metadata ?? {}, priceMetadata);

      const mapping = await this.catalogMappings.connectMapping({
        priceVersionId: input.priceVersionId,
        stripeMode,
        stripeProductId,
        stripePriceId,
        billingProductId: billingProduct.id,
        currency,
        billingInterval: context.priceBook.interval,
        actorUserId: input.actorUserId,
      });

      const synced = await this.prisma.billingStripeCatalogMapping.update({
        where: { id: mapping.id },
        data: {
          mappingStatus: BillingStripeMappingStatus.SYNCED,
          lastVerifiedAt: new Date(),
          lastError: null,
        },
      });

      return this.toResult({
        priceVersionId: input.priceVersionId,
        stripeMode,
        mapping: synced,
        createdProduct,
        createdPrice,
        metadataSynced,
        driftDetected,
        verified: true,
      });
    } catch (error) {
      const translated = this.translateError(error);
      driftDetected = translated.code === StripeCatalogSyncErrorCode.PRICE_AMOUNT_DRIFT;

      if (existingMapping) {
        await this.persistMappingFailure(existingMapping.id, translated.message, {
          driftDetected,
        });
      }

      throw this.toHttpException(translated);
    }
  }

  async retrySyncMapping(mappingId: string): Promise<StripeCatalogSyncResult> {
    const mapping = await this.catalogMappings.getMappingById(mappingId);
    if (mapping.disabledAt) {
      throw new ConflictException({
        code: StripeCatalogMappingErrorCode.MAPPING_DISABLED,
        message: StripeCatalogMappingErrorCode.MAPPING_DISABLED,
      });
    }

    return this.syncPriceVersion({
      priceVersionId: mapping.priceVersionId,
      stripeMode: mapping.stripeMode,
    });
  }

  async scanStaleMappings(): Promise<ScanStaleStripeCatalogMappingsResult> {
    const rows = await this.prisma.billingStripeCatalogMapping.findMany({
      where: { disabledAt: null },
      include: {
        priceVersion: { select: { status: true } },
      },
    });

    const mappingIds: string[] = [];
    let stale = 0;
    let disabled = 0;
    let drifted = 0;

    for (const row of rows) {
      const versionStatus = row.priceVersion.status;
      if (versionStatus === BillingPriceVersionStatus.ARCHIVED) {
        await this.prisma.billingStripeCatalogMapping.update({
          where: { id: row.id },
          data: {
            mappingStatus: BillingStripeMappingStatus.DISABLED,
            disabledAt: new Date(),
            lastError: truncateSyncErrorMessage(StripeCatalogSyncErrorCode.STALE_MAPPING),
          },
        });
        stale += 1;
        disabled += 1;
        mappingIds.push(row.id);
        continue;
      }

      if (versionStatus !== BillingPriceVersionStatus.ACTIVE) {
        await this.prisma.billingStripeCatalogMapping.update({
          where: { id: row.id },
          data: {
            mappingStatus: BillingStripeMappingStatus.DRIFTED,
            lastError: truncateSyncErrorMessage(StripeCatalogSyncErrorCode.STALE_MAPPING),
          },
        });
        stale += 1;
        drifted += 1;
        mappingIds.push(row.id);
      }
    }

    return {
      scanned: rows.length,
      stale,
      disabled,
      drifted,
      mappingIds,
    };
  }

  private async ensureStripeProduct(input: {
    stripe: Stripe;
    billingProductId: string;
    productName: string;
    productDescription: string | null;
    productMetadata: Record<string, string>;
    stripeMode: BillingStripeMode;
    existingProductId: string | null;
  }): Promise<{ stripeProductId: string; created: boolean }> {
    if (input.existingProductId) {
      const product = await this.executeStripeCall(() =>
        input.stripe.products.retrieve(input.existingProductId!),
      );
      if (!product.active) {
        throw this.toHttpException({
          code: StripeCatalogSyncErrorCode.PRODUCT_NOT_FOUND,
          message: StripeCatalogSyncErrorCode.PRODUCT_NOT_FOUND,
        });
      }
      assertStripeMetadataMatches(product.metadata ?? {}, input.productMetadata);
      return { stripeProductId: product.id, created: false };
    }

    const sibling = await this.prisma.billingStripeCatalogMapping.findFirst({
      where: {
        billingProductId: input.billingProductId,
        stripeMode: input.stripeMode,
        disabledAt: null,
      },
      orderBy: { updatedAt: 'desc' },
      select: { stripeProductId: true },
    });

    if (sibling?.stripeProductId) {
      const product = await this.executeStripeCall(() =>
        input.stripe.products.retrieve(sibling.stripeProductId),
      );
      if (product.active) {
        assertStripeMetadataMatches(product.metadata ?? {}, input.productMetadata);
        return { stripeProductId: product.id, created: false };
      }
    }

    const created = await this.executeStripeCall(() =>
      input.stripe.products.create(
        {
          name: input.productName,
          description: input.productDescription ?? undefined,
          metadata: input.productMetadata,
        },
        {
          idempotencyKey: buildStripeCatalogProductIdempotencyKey(
            input.billingProductId,
            input.stripeMode,
          ),
        },
      ),
    );
    return { stripeProductId: created.id, created: true };
  }

  private async syncProductMetadata(input: {
    stripe: Stripe;
    stripeProductId: string;
    productName: string;
    productDescription: string | null;
    productMetadata: Record<string, string>;
  }): Promise<boolean> {
    const product = await this.executeStripeCall(() =>
      input.stripe.products.retrieve(input.stripeProductId),
    );

    const metadataDrift = Object.entries(input.productMetadata).some(
      ([key, value]) => (product.metadata?.[key] ?? '') !== value,
    );
    const nameDrift = product.name !== input.productName;
    const descriptionDrift = (product.description ?? '') !== (input.productDescription ?? '');

    if (!metadataDrift && !nameDrift && !descriptionDrift) {
      return false;
    }

    await this.executeStripeCall(() =>
      input.stripe.products.update(input.stripeProductId, {
        name: input.productName,
        description: input.productDescription ?? undefined,
        metadata: input.productMetadata,
      }),
    );
    return true;
  }

  private async ensureStripePrice(input: {
    stripe: Stripe;
    stripeProductId: string;
    stripeMode: BillingStripeMode;
    priceVersionId: string;
    currency: string;
    expectedInterval: 'month' | 'year';
    expectedUnitAmountCents: number;
    priceMetadata: Record<string, string>;
    existingPriceId: string | null;
  }): Promise<{ stripePriceId: string; created: boolean }> {
    if (input.existingPriceId) {
      const stripePrice = await this.executeStripeCall(() =>
        input.stripe.prices.retrieve(input.existingPriceId!),
      );

      try {
        assertStripePriceMatchesLocal({
          stripePrice: stripePrice as never,
          expectedUnitAmountCents: input.expectedUnitAmountCents,
          expectedCurrency: input.currency,
          expectedInterval: input.expectedInterval,
          expectedProductId: input.stripeProductId,
        });
        assertStripeMetadataMatches(stripePrice.metadata ?? {}, input.priceMetadata);
      } catch (error) {
        const translated = this.translateError(error);
        if (translated.code === StripeCatalogSyncErrorCode.PRICE_AMOUNT_DRIFT) {
          throw this.toHttpException(translated);
        }
        throw this.toHttpException(translated);
      }

      return { stripePriceId: stripePrice.id, created: false };
    }

    const created = await this.executeStripeCall(() =>
      input.stripe.prices.create(
        {
          product: input.stripeProductId,
          currency: input.currency.toLowerCase(),
          unit_amount: input.expectedUnitAmountCents,
          recurring: { interval: input.expectedInterval },
          metadata: input.priceMetadata,
        },
        {
          idempotencyKey: buildStripeCatalogPriceIdempotencyKey(
            input.priceVersionId,
            input.stripeMode,
          ),
        },
      ),
    );

    return { stripePriceId: created.id, created: true };
  }

  private async loadSyncContext(priceVersionId: string) {
    const version = await this.prisma.billingPriceVersion.findUnique({
      where: { id: priceVersionId },
      include: {
        tiers: { orderBy: [{ sortOrder: 'asc' }, { minVehicles: 'asc' }] },
        priceBook: {
          include: {
            billingProduct: { select: { id: true, key: true, name: true, description: true } },
          },
        },
      },
    });

    if (!version) {
      throw new NotFoundException('Price version not found');
    }

    return { version, priceBook: version.priceBook };
  }

  private requireStripe(): Stripe {
    const client = getStripeClient(this.configService.get<string>('stripe.secretKey'));
    if (!client) {
      throw new HttpException(
        {
          code: StripeCatalogSyncErrorCode.NOT_CONFIGURED,
          message: StripeCatalogSyncErrorCode.NOT_CONFIGURED,
        },
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    return client;
  }

  private requireRuntimeStripeMode(): BillingStripeMode {
    const mode = this.catalogMappings.getRuntimeStripeMode();
    if (!mode) {
      throw new ConflictException({
        code: StripeCatalogMappingErrorCode.STRIPE_MODE_MISMATCH,
        message: StripeCatalogMappingErrorCode.STRIPE_MODE_MISMATCH,
      });
    }
    return mode;
  }

  private async executeStripeCall<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        if (attempt > 0) {
          await this.delay(STRIPE_CATALOG_SYNC_RATE_LIMIT_DELAY_MS * attempt);
        } else {
          await this.delay(STRIPE_CATALOG_SYNC_RATE_LIMIT_DELAY_MS);
        }
        return await fn();
      } catch (error) {
        const translated = translateStripeProviderError(error);
        if (
          translated.code === StripeCatalogSyncErrorCode.RATE_LIMITED &&
          attempt < STRIPE_CATALOG_SYNC_MAX_RETRIES
        ) {
          attempt += 1;
          continue;
        }
        throw error;
      }
    }
  }

  private async persistMappingFailure(
    mappingId: string,
    message: string,
    opts?: { driftDetected?: boolean },
  ): Promise<void> {
    await this.prisma.billingStripeCatalogMapping.update({
      where: { id: mappingId },
      data: {
        mappingStatus: opts?.driftDetected
          ? BillingStripeMappingStatus.DRIFTED
          : BillingStripeMappingStatus.FAILED,
        lastError: truncateSyncErrorMessage(message),
      },
    });
  }

  private translateError(error: unknown): { code: string; message: string } {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (response && typeof response === 'object' && 'code' in response) {
        return {
          code: String((response as { code: string }).code),
          message: String((response as { message?: string }).message ?? (response as { code: string }).code),
        };
      }
    }

    if (error && typeof error === 'object' && 'type' in error) {
      return translateStripeProviderError(error);
    }

    if (error && typeof error === 'object' && 'code' in error) {
      const code = String((error as { code: string }).code);
      if (Object.values(StripeCatalogSyncErrorCode).includes(code as never)) {
        return {
          code,
          message: error instanceof Error ? error.message : code,
        };
      }
    }

    return translateStripeProviderError(error);
  }

  private toHttpException(error: { code: string; message: string }): HttpException {
    if (error.code === StripeCatalogSyncErrorCode.NOT_CONFIGURED) {
      return new HttpException({ code: error.code, message: error.message }, HttpStatus.NOT_IMPLEMENTED);
    }
    if (
      error.code === StripeCatalogSyncErrorCode.PROVIDER_TIMEOUT ||
      error.code === StripeCatalogSyncErrorCode.RATE_LIMITED
    ) {
      return new HttpException({ code: error.code, message: error.message }, HttpStatus.GATEWAY_TIMEOUT);
    }
    return new ConflictException({ code: error.code, message: error.message });
  }

  private assertPublishedVersion(status: BillingPriceVersionStatus) {
    if (status === BillingPriceVersionStatus.ARCHIVED) {
      throw new ConflictException({
        code: StripeCatalogMappingErrorCode.VERSION_ARCHIVED,
        message: StripeCatalogMappingErrorCode.VERSION_ARCHIVED,
      });
    }
    if (status !== BillingPriceVersionStatus.ACTIVE) {
      throw new ConflictException({
        code: StripeCatalogMappingErrorCode.VERSION_NOT_PUBLISHED,
        message: StripeCatalogMappingErrorCode.VERSION_NOT_PUBLISHED,
      });
    }
  }

  private guardConflict(fn: () => void) {
    try {
      fn();
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code: string }).code)
          : StripeCatalogMappingErrorCode.MAPPING_NOT_FOUND;
      throw new ConflictException({ code, message: code });
    }
  }

  private toResult(input: {
    priceVersionId: string;
    stripeMode: BillingStripeMode;
    mapping: Prisma.BillingStripeCatalogMappingGetPayload<object>;
    createdProduct: boolean;
    createdPrice: boolean;
    metadataSynced: boolean;
    driftDetected: boolean;
    verified: boolean;
  }): StripeCatalogSyncResult {
    return {
      priceVersionId: input.priceVersionId,
      stripeMode: input.stripeMode,
      mappingId: input.mapping.id,
      stripeProductId: input.mapping.stripeProductId,
      stripePriceId: input.mapping.stripePriceId,
      mappingStatus: input.mapping.mappingStatus,
      createdProduct: input.createdProduct,
      createdPrice: input.createdPrice,
      metadataSynced: input.metadataSynced,
      driftDetected: input.driftDetected,
      verified: input.verified,
      lastError: input.mapping.lastError,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
