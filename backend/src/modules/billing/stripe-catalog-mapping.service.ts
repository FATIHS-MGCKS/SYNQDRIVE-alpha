import {
  BillingPriceVersionStatus,
  BillingStripeMappingStatus,
  BillingStripeMode,
  BillingInterval,
  Prisma,
} from '@prisma/client';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { resolveStripeModeFromSecretKey } from './migration/billing-legacy-backfill.util';
import {
  ResolvedStripeCatalogPrice,
  StripeCatalogMappingErrorCode,
  StripeCatalogMappingView,
  assertCurrencyMatches,
  assertIntervalMatches,
  assertRuntimeStripeMode,
  buildStripePresentation,
  isModernBillingContract,
  mapBillingIntervalToStripe,
  normalizeCurrency,
  STRIPE_LEGACY_DEFAULT_PRICE_ENV,
} from './domain/stripe-catalog-mapping';

export interface ConnectStripeCatalogMappingInput {
  priceVersionId: string;
  stripeMode: BillingStripeMode;
  stripeProductId: string;
  stripePriceId: string;
  billingProductId?: string;
  currency?: string;
  billingInterval?: string;
  actorUserId?: string | null;
}

export interface ResolveStripeCatalogPriceInput {
  organizationId: string;
  priceVersionId: string;
  billingProductId?: string | null;
  allowLegacyFallback?: boolean;
  subscriptionPriceVersionId?: string | null;
  subscriptionItemPriceVersionId?: string | null;
}

@Injectable()
export class StripeCatalogMappingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  getRuntimeStripeMode(): BillingStripeMode | null {
    return resolveStripeModeFromSecretKey(this.configService.get<string>('stripe.secretKey'));
  }

  async listMappings(filters?: {
    priceVersionId?: string;
    priceBookId?: string;
    billingProductId?: string;
    stripeMode?: BillingStripeMode;
    includeDisabled?: boolean;
  }): Promise<StripeCatalogMappingView[]> {
    const rows = await this.prisma.billingStripeCatalogMapping.findMany({
      where: {
        priceVersionId: filters?.priceVersionId,
        priceBookId: filters?.priceBookId,
        billingProductId: filters?.billingProductId,
        stripeMode: filters?.stripeMode,
        disabledAt: filters?.includeDisabled ? undefined : null,
      },
      include: {
        billingProduct: { select: { key: true } },
      },
      orderBy: [{ priceVersionId: 'asc' }, { stripeMode: 'asc' }],
    });
    return rows.map((row) => this.toView(row));
  }

  async getMappingById(mappingId: string): Promise<StripeCatalogMappingView> {
    const row = await this.prisma.billingStripeCatalogMapping.findUnique({
      where: { id: mappingId },
      include: { billingProduct: { select: { key: true } } },
    });
    if (!row) {
      throw new NotFoundException({
        code: StripeCatalogMappingErrorCode.MAPPING_NOT_FOUND,
        message: StripeCatalogMappingErrorCode.MAPPING_NOT_FOUND,
      });
    }
    return this.toView(row);
  }

  async getMappingForVersion(
    priceVersionId: string,
    stripeMode: BillingStripeMode,
  ): Promise<StripeCatalogMappingView | null> {
    const row = await this.prisma.billingStripeCatalogMapping.findUnique({
      where: {
        priceVersionId_stripeMode: { priceVersionId, stripeMode },
      },
      include: { billingProduct: { select: { key: true } } },
    });
    return row ? this.toView(row) : null;
  }

  async getMappingStatus(priceVersionId: string, stripeMode: BillingStripeMode) {
    const mapping = await this.getMappingForVersion(priceVersionId, stripeMode);
    const runtimeMode = this.getRuntimeStripeMode();
    return {
      priceVersionId,
      stripeMode,
      runtimeStripeMode: runtimeMode,
      mapping,
      modeAligned: mapping ? mapping.stripeMode === runtimeMode : null,
    };
  }

  async connectMapping(input: ConnectStripeCatalogMappingInput): Promise<StripeCatalogMappingView> {
    const context = await this.loadVersionContext(input.priceVersionId);
    this.assertNotArchived(context.version.status);
    this.assertPublishedVersion(context.version.status);

    const billingProductId = input.billingProductId ?? context.priceBook.billingProductId;
    if (!billingProductId) {
      throw new ConflictException({
        code: StripeCatalogMappingErrorCode.PRODUCT_MISMATCH,
        message: StripeCatalogMappingErrorCode.PRODUCT_MISMATCH,
      });
    }

    const currency = normalizeCurrency(input.currency ?? context.priceBook.currency);
    const billingInterval = input.billingInterval
      ? (input.billingInterval.toUpperCase() as typeof context.priceBook.interval)
      : context.priceBook.interval;

    this.guardConflict(() => assertCurrencyMatches(context.priceBook.currency, currency));
    this.guardConflict(() => assertIntervalMatches(context.priceBook.interval, billingInterval));
    this.guardConflict(() => assertRuntimeStripeMode(input.stripeMode, this.getRuntimeStripeMode()));

    const duplicate = await this.prisma.billingStripeCatalogMapping.findUnique({
      where: {
        stripePriceId_stripeMode: {
          stripePriceId: input.stripePriceId,
          stripeMode: input.stripeMode,
        },
      },
    });
    if (duplicate && duplicate.priceVersionId !== input.priceVersionId) {
      throw new ConflictException({
        code: StripeCatalogMappingErrorCode.DUPLICATE_STRIPE_PRICE_ID,
        message: StripeCatalogMappingErrorCode.DUPLICATE_STRIPE_PRICE_ID,
      });
    }

    const existing = await this.prisma.billingStripeCatalogMapping.findUnique({
      where: {
        priceVersionId_stripeMode: {
          priceVersionId: input.priceVersionId,
          stripeMode: input.stripeMode,
        },
      },
    });

    if (existing && existing.stripePriceId !== input.stripePriceId) {
      throw new ConflictException({
        code: StripeCatalogMappingErrorCode.STRIPE_PRICE_IMMUTABLE,
        message: StripeCatalogMappingErrorCode.STRIPE_PRICE_IMMUTABLE,
      });
    }

    const data = {
      billingProductId,
      priceVersionId: input.priceVersionId,
      priceBookId: context.version.priceBookId,
      stripeMode: input.stripeMode,
      stripeProductId: input.stripeProductId,
      stripePriceId: input.stripePriceId,
      currency,
      billingInterval,
      billingModel: context.priceBook.billingModel,
      stripePresentation: buildStripePresentation(context.priceBook.billingModel),
      mappingStatus: BillingStripeMappingStatus.PENDING,
      lastError: null,
      disabledAt: null,
    };

    const row = existing
      ? await this.prisma.billingStripeCatalogMapping.update({
          where: { id: existing.id },
          data,
          include: { billingProduct: { select: { key: true } } },
        })
      : await this.prisma.billingStripeCatalogMapping.create({
          data,
          include: { billingProduct: { select: { key: true } } },
        });

    return this.toView(row);
  }

  async validateMapping(mappingId: string): Promise<StripeCatalogMappingView> {
    const mapping = await this.prisma.billingStripeCatalogMapping.findUnique({
      where: { id: mappingId },
      include: {
        billingProduct: { select: { key: true } },
        priceBook: true,
        priceVersion: true,
      },
    });
    if (!mapping) {
      throw new NotFoundException({
        code: StripeCatalogMappingErrorCode.MAPPING_NOT_FOUND,
        message: StripeCatalogMappingErrorCode.MAPPING_NOT_FOUND,
      });
    }
    if (mapping.disabledAt) {
      throw new ConflictException({
        code: StripeCatalogMappingErrorCode.MAPPING_DISABLED,
        message: StripeCatalogMappingErrorCode.MAPPING_DISABLED,
      });
    }

    try {
      this.assertPublishedVersion(mapping.priceVersion.status);
      this.guardConflict(() => assertRuntimeStripeMode(mapping.stripeMode, this.getRuntimeStripeMode()));
      this.guardConflict(() => assertCurrencyMatches(mapping.priceBook.currency, mapping.currency));
      this.guardConflict(() =>
        assertIntervalMatches(mapping.priceBook.interval, mapping.billingInterval),
      );

      const updated = await this.prisma.billingStripeCatalogMapping.update({
        where: { id: mapping.id },
        data: {
          mappingStatus: BillingStripeMappingStatus.SYNCED,
          lastVerifiedAt: new Date(),
          lastError: null,
        },
        include: { billingProduct: { select: { key: true } } },
      });
      return this.toView(updated);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : StripeCatalogMappingErrorCode.MAPPING_NOT_FOUND;
      await this.prisma.billingStripeCatalogMapping.update({
        where: { id: mapping.id },
        data: {
          mappingStatus: BillingStripeMappingStatus.FAILED,
          lastError: message.slice(0, 500),
        },
      });
      throw error;
    }
  }

  async deactivateMapping(mappingId: string): Promise<StripeCatalogMappingView> {
    const row = await this.prisma.billingStripeCatalogMapping.update({
      where: { id: mappingId },
      data: {
        mappingStatus: BillingStripeMappingStatus.DISABLED,
        disabledAt: new Date(),
      },
      include: { billingProduct: { select: { key: true } } },
    });
    return this.toView(row);
  }

  async resolveStripePrice(
    input: ResolveStripeCatalogPriceInput,
  ): Promise<ResolvedStripeCatalogPrice> {
    const modern = isModernBillingContract({
      subscriptionPriceVersionId: input.subscriptionPriceVersionId,
      subscriptionItemPriceVersionId: input.subscriptionItemPriceVersionId,
    });

    const runtimeMode = this.getRuntimeStripeMode();
    if (!runtimeMode) {
      throw new ConflictException({
        code: StripeCatalogMappingErrorCode.STRIPE_MODE_MISMATCH,
        message: StripeCatalogMappingErrorCode.STRIPE_MODE_MISMATCH,
      });
    }

    const mapping = await this.prisma.billingStripeCatalogMapping.findFirst({
      where: {
        priceVersionId: input.priceVersionId,
        stripeMode: runtimeMode,
        disabledAt: null,
        mappingStatus: {
          in: [BillingStripeMappingStatus.SYNCED, BillingStripeMappingStatus.PENDING],
        },
        ...(input.billingProductId ? { billingProductId: input.billingProductId } : {}),
      },
    });

    if (mapping) {
      this.guardConflict(() => assertRuntimeStripeMode(mapping.stripeMode, runtimeMode));
      return {
        stripePriceId: mapping.stripePriceId,
        stripeProductId: mapping.stripeProductId,
        stripeMode: mapping.stripeMode,
        currency: mapping.currency,
        billingInterval: mapping.billingInterval,
        billingModel: mapping.billingModel,
        stripePresentation: mapping.stripePresentation,
        mappingId: mapping.id,
        priceVersionId: mapping.priceVersionId,
        billingProductId: mapping.billingProductId,
        source: 'CATALOG_MAPPING',
        legacyFallbackUsed: false,
      };
    }

    if (modern) {
      throw new NotFoundException({
        code: StripeCatalogMappingErrorCode.STRIPE_MAPPING_MISSING,
        message: StripeCatalogMappingErrorCode.STRIPE_MAPPING_MISSING,
      });
    }

    if (!input.allowLegacyFallback) {
      throw new ConflictException({
        code: StripeCatalogMappingErrorCode.LEGACY_FALLBACK_BLOCKED,
        message: StripeCatalogMappingErrorCode.LEGACY_FALLBACK_BLOCKED,
      });
    }

    const legacyPriceId =
      this.configService.get<string>('stripe.defaultPriceId') ||
      process.env[STRIPE_LEGACY_DEFAULT_PRICE_ENV]?.trim() ||
      null;

    if (!legacyPriceId) {
      throw new NotFoundException({
        code: StripeCatalogMappingErrorCode.STRIPE_MAPPING_MISSING,
        message: StripeCatalogMappingErrorCode.STRIPE_MAPPING_MISSING,
      });
    }

    return {
      stripePriceId: legacyPriceId,
      stripeProductId: 'legacy_default',
      stripeMode: runtimeMode,
      currency: normalizeCurrency(this.configService.get<string>('stripe.currency') ?? 'EUR'),
      billingInterval: 'MONTHLY',
      billingModel: 'PER_CONNECTED_VEHICLE',
      stripePresentation: 'legacy_default_price',
      mappingId: 'legacy-default',
      priceVersionId: input.priceVersionId,
      billingProductId: input.billingProductId ?? 'legacy',
      source: 'LEGACY_DEFAULT_PRICE',
      legacyFallbackUsed: true,
    };
  }

  describeStripeInterval(interval: BillingInterval): string {
    return mapBillingIntervalToStripe(interval);
  }

  private async loadVersionContext(priceVersionId: string) {
    const version = await this.prisma.billingPriceVersion.findUnique({
      where: { id: priceVersionId },
      include: {
        priceBook: {
          include: {
            billingProduct: { select: { id: true, key: true } },
          },
        },
      },
    });
    if (!version) {
      throw new NotFoundException('Price version not found');
    }
    return { version, priceBook: version.priceBook };
  }

  private assertPublishedVersion(status: BillingPriceVersionStatus) {
    if (status !== BillingPriceVersionStatus.ACTIVE) {
      throw new ConflictException({
        code: StripeCatalogMappingErrorCode.VERSION_NOT_PUBLISHED,
        message: StripeCatalogMappingErrorCode.VERSION_NOT_PUBLISHED,
      });
    }
  }

  private assertNotArchived(status: BillingPriceVersionStatus) {
    if (status === BillingPriceVersionStatus.ARCHIVED) {
      throw new ConflictException({
        code: StripeCatalogMappingErrorCode.VERSION_ARCHIVED,
        message: StripeCatalogMappingErrorCode.VERSION_ARCHIVED,
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

  private toView(
    row: Prisma.BillingStripeCatalogMappingGetPayload<{
      include: { billingProduct: { select: { key: true } } };
    }>,
  ): StripeCatalogMappingView {
    return {
      id: row.id,
      billingProductId: row.billingProductId,
      billingProductKey: row.billingProduct.key,
      priceVersionId: row.priceVersionId,
      priceBookId: row.priceBookId,
      stripeMode: row.stripeMode,
      stripeProductId: row.stripeProductId,
      stripePriceId: row.stripePriceId,
      currency: row.currency,
      billingInterval: row.billingInterval,
      billingModel: row.billingModel,
      stripePresentation: row.stripePresentation,
      mappingStatus: row.mappingStatus,
      lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
      lastError: row.lastError,
      disabledAt: row.disabledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
