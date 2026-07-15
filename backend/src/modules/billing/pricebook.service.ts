import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingInterval,
  BillingModel,
  BillingPriceVersionStatus,
  BillingTierMode,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingAuditService } from './billing-audit.service';
import {
  calculateVolumePricing,
  PriceTierInput,
  validateTiersNoOverlap,
} from './billing-calculation.util';

export interface CreatePriceBookInput {
  name: string;
  productKey: string;
  billingModel?: BillingModel;
  interval?: BillingInterval;
  currency?: string;
  isDefault?: boolean;
}

export interface UpsertTierInput {
  minVehicles: number;
  maxVehicles?: number | null;
  unitPriceCents?: number | null;
  sortOrder?: number;
}

export interface SimulatePriceVersionInput {
  vehicleCount: number;
  discountPercentBps?: number;
  discountCents?: number;
  taxRateBps?: number;
}

export interface SimulatePriceVersionResult {
  priceVersionId: string;
  vehicleCount: number;
  pricingModel: string;
  tierMode: BillingTierMode;
  currency: string;
  calculationStatus: string;
  matchedTier: {
    minVehicles: number;
    maxVehicles: number | null;
    unitPriceCents: number | null;
  } | null;
  tierLines: Array<{
    tierId: string | null;
    minVehicles: number;
    maxVehicles: number | null;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
    sortOrder: number;
  }>;
  baseAmountCents: number | null;
  discountCents: number;
  netCents: number | null;
  taxRateBps: number | null;
  taxCents: number | null;
  grossCents: number | null;
}

@Injectable()
export class PricebookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: BillingAuditService,
  ) {}

  async findDefaultPriceBook() {
    return this.prisma.billingPriceBook.findFirst({
      where: { isDefault: true },
      include: {
        versions: {
          where: { status: BillingPriceVersionStatus.ACTIVE },
          include: { tiers: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });
  }

  async findActiveVersion(priceBookId: string, asOf: Date = new Date()) {
    return this.prisma.billingPriceVersion.findFirst({
      where: {
        priceBookId,
        status: BillingPriceVersionStatus.ACTIVE,
        OR: [
          { effectiveFrom: null },
          { effectiveFrom: { lte: asOf } },
        ],
        AND: [
          {
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: asOf } },
            ],
          },
        ],
      },
      include: { tiers: { orderBy: [{ sortOrder: 'asc' }, { minVehicles: 'asc' }] } },
      orderBy: { versionNumber: 'desc' },
    });
  }

  async listPriceBooks() {
    return this.prisma.billingPriceBook.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 3,
          select: {
            id: true,
            versionNumber: true,
            versionLabel: true,
            status: true,
            effectiveFrom: true,
            publishedAt: true,
          },
        },
      },
    });
  }

  async getPriceBook(id: string) {
    const book = await this.prisma.billingPriceBook.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: { tiers: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!book) throw new NotFoundException('Price book not found');
    return book;
  }

  async listVersions(priceBookId: string) {
    await this.getPriceBook(priceBookId);
    const versions = await this.prisma.billingPriceVersion.findMany({
      where: { priceBookId },
      orderBy: { versionNumber: 'desc' },
      include: { tiers: { orderBy: { sortOrder: 'asc' } } },
    });
    const usageByVersion = await this.countVersionUsage(versions.map((version) => version.id));
    return versions.map((version) => ({
      ...version,
      usageCount: usageByVersion.get(version.id) ?? 0,
    }));
  }

  async listCatalogProducts() {
    const products = await this.prisma.billingCatalogProduct.findMany({
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      include: {
        priceBooks: {
          select: {
            id: true,
            name: true,
            productKey: true,
            currency: true,
            isDefault: true,
            status: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            priceBooks: true,
            subscriptionItems: true,
          },
        },
      },
    });

    return products.map((product) => ({
      id: product.id,
      key: product.key,
      name: product.name,
      description: product.description,
      productRole: product.productRole,
      status: product.status,
      sortOrder: product.sortOrder,
      priceBookCount: product._count.priceBooks,
      subscriptionItemCount: product._count.subscriptionItems,
      priceBooks: product.priceBooks,
    }));
  }

  async getVersionUsage(priceVersionId: string) {
    const version = await this.prisma.billingPriceVersion.findUnique({
      where: { id: priceVersionId },
      select: { id: true },
    });
    if (!version) throw new NotFoundException('Price version not found');

    const [subscriptions, subscriptionItems] = await Promise.all([
      this.prisma.billingSubscription.count({ where: { priceVersionId } }),
      this.prisma.billingSubscriptionItem.count({ where: { priceVersionId } }),
    ]);

    return {
      priceVersionId,
      subscriptions,
      subscriptionItems,
      total: subscriptions + subscriptionItems,
    };
  }

  async simulatePriceVersion(
    priceVersionId: string,
    input: SimulatePriceVersionInput,
  ): Promise<SimulatePriceVersionResult> {
    const version = await this.prisma.billingPriceVersion.findUnique({
      where: { id: priceVersionId },
      include: {
        tiers: { orderBy: { sortOrder: 'asc' } },
        priceBook: { select: { currency: true } },
      },
    });
    if (!version) throw new NotFoundException('Price version not found');

    const pricing = calculateVolumePricing({
      vehicleCount: input.vehicleCount,
      tiers: version.tiers.map((tier) => ({
        id: tier.id,
        minVehicles: tier.minVehicles,
        maxVehicles: tier.maxVehicles,
        unitPriceCents: tier.unitPriceCents,
        sortOrder: tier.sortOrder,
      })),
      tierMode: version.tierMode,
      currency: version.priceBook.currency,
    });

    const baseAmountCents = pricing.subtotalCents ?? pricing.totalCents;
    let discountCents = input.discountCents ?? 0;
    if (input.discountPercentBps != null && baseAmountCents != null && baseAmountCents > 0) {
      discountCents += Math.round((baseAmountCents * input.discountPercentBps) / 10_000);
    }
    if (baseAmountCents != null) {
      discountCents = Math.min(discountCents, baseAmountCents);
    }

    const netCents =
      baseAmountCents != null ? Math.max(0, baseAmountCents - discountCents) : null;
    const taxRateBps = input.taxRateBps ?? 1900;
    const taxCents =
      netCents != null ? Math.round((netCents * taxRateBps) / 10_000) : null;
    const grossCents = netCents != null && taxCents != null ? netCents + taxCents : null;

    return {
      priceVersionId,
      vehicleCount: input.vehicleCount,
      pricingModel: pricing.pricingModel,
      tierMode: version.tierMode,
      currency: version.priceBook.currency,
      calculationStatus: pricing.calculationStatus,
      matchedTier: pricing.tier
        ? {
            minVehicles: pricing.tier.minVehicles,
            maxVehicles: pricing.tier.maxVehicles,
            unitPriceCents: pricing.tier.unitPriceCents,
          }
        : null,
      tierLines: pricing.tierLines.map((line) => ({
        tierId: line.tierId,
        minVehicles: line.minVehicles,
        maxVehicles: line.maxVehicles,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        subtotalCents: line.subtotalCents,
        sortOrder: line.sortOrder,
      })),
      baseAmountCents,
      discountCents,
      netCents,
      taxRateBps: netCents != null ? taxRateBps : null,
      taxCents,
      grossCents,
    };
  }

  private async countVersionUsage(versionIds: string[]): Promise<Map<string, number>> {
    if (versionIds.length === 0) return new Map();

    const [subscriptionRows, itemRows] = await Promise.all([
      this.prisma.billingSubscription.groupBy({
        by: ['priceVersionId'],
        where: { priceVersionId: { in: versionIds } },
        _count: { _all: true },
      }),
      this.prisma.billingSubscriptionItem.groupBy({
        by: ['priceVersionId'],
        where: { priceVersionId: { in: versionIds } },
        _count: { _all: true },
      }),
    ]);

    const usage = new Map<string, number>();
    for (const row of subscriptionRows) {
      if (!row.priceVersionId) continue;
      usage.set(row.priceVersionId, (usage.get(row.priceVersionId) ?? 0) + row._count._all);
    }
    for (const row of itemRows) {
      if (!row.priceVersionId) continue;
      usage.set(row.priceVersionId, (usage.get(row.priceVersionId) ?? 0) + row._count._all);
    }
    return usage;
  }

  async getVersionWithTiers(priceVersionId: string) {
    return this.prisma.billingPriceVersion.findUnique({
      where: { id: priceVersionId },
      include: { tiers: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async patchDraftVersion(
    priceVersionId: string,
    patch: { versionLabel?: string; effectiveFrom?: Date; tierMode?: BillingTierMode },
    actorUserId?: string,
  ) {
    const version = await this.prisma.billingPriceVersion.findUnique({
      where: { id: priceVersionId },
    });
    if (!version) throw new NotFoundException('Price version not found');
    if (version.status !== BillingPriceVersionStatus.DRAFT) {
      throw new ConflictException('Only DRAFT versions can be edited');
    }

    const updated = await this.prisma.billingPriceVersion.update({
      where: { id: priceVersionId },
      data: {
        versionLabel: patch.versionLabel,
        effectiveFrom: patch.effectiveFrom,
        tierMode: patch.tierMode,
      },
      include: { tiers: { orderBy: { sortOrder: 'asc' } } },
    });

    await this.audit.log({
      actorUserId,
      action: 'PRICE_VERSION_PATCHED',
      entityType: 'BillingPriceVersion',
      entityId: priceVersionId,
      before: version,
      after: updated,
    });

    return updated;
  }

  async archiveVersion(priceVersionId: string, actorUserId?: string) {
    const version = await this.prisma.billingPriceVersion.findUnique({
      where: { id: priceVersionId },
    });
    if (!version) throw new NotFoundException('Price version not found');
    if (version.status === BillingPriceVersionStatus.ARCHIVED) {
      return version;
    }
    if (version.status === BillingPriceVersionStatus.ACTIVE) {
      throw new ConflictException(
        'Cannot archive an ACTIVE price version. Publish a replacement version first.',
      );
    }

    const updated = await this.prisma.billingPriceVersion.update({
      where: { id: priceVersionId },
      data: {
        status: BillingPriceVersionStatus.ARCHIVED,
        effectiveTo: new Date(),
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'PRICE_VERSION_ARCHIVED',
      entityType: 'BillingPriceVersion',
      entityId: priceVersionId,
      before: version,
      after: updated,
    });

    return updated;
  }

  async createPriceBook(input: CreatePriceBookInput, actorUserId?: string) {
    const catalogKey = input.productKey.trim().toUpperCase();
    const catalogProduct = await this.prisma.billingCatalogProduct.findUnique({
      where: { key: catalogKey },
      select: { id: true, key: true },
    });
    if (!catalogProduct) {
      throw new BadRequestException({
        message: 'Unknown catalog product key',
        productKey: input.productKey,
      });
    }

    if (input.isDefault) {
      await this.prisma.billingPriceBook.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const book = await this.prisma.billingPriceBook.create({
      data: {
        name: input.name,
        productKey: catalogProduct.key,
        billingProductId: catalogProduct.id,
        billingModel: input.billingModel ?? BillingModel.PER_CONNECTED_VEHICLE,
        interval: input.interval ?? BillingInterval.MONTHLY,
        currency: input.currency ?? 'EUR',
        isDefault: input.isDefault ?? false,
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'PRICEBOOK_CREATED',
      entityType: 'BillingPriceBook',
      entityId: book.id,
      after: book,
    });

    return book;
  }

  async createDraftVersion(
    priceBookId: string,
    opts?: { versionLabel?: string; tierMode?: BillingTierMode; actorUserId?: string },
  ) {
    await this.getPriceBook(priceBookId);

    const latest = await this.prisma.billingPriceVersion.findFirst({
      where: { priceBookId },
      orderBy: { versionNumber: 'desc' },
    });
    const versionNumber = (latest?.versionNumber ?? 0) + 1;

    const version = await this.prisma.billingPriceVersion.create({
      data: {
        priceBookId,
        versionNumber,
        versionLabel: opts?.versionLabel ?? `v${versionNumber}`,
        status: BillingPriceVersionStatus.DRAFT,
        tierMode: opts?.tierMode ?? BillingTierMode.VOLUME,
        createdByUserId: opts?.actorUserId ?? null,
      },
    });

    await this.audit.log({
      actorUserId: opts?.actorUserId,
      action: 'PRICE_VERSION_DRAFT_CREATED',
      entityType: 'BillingPriceVersion',
      entityId: version.id,
      after: version,
    });

    return version;
  }

  async replaceDraftTiers(
    priceVersionId: string,
    tiers: UpsertTierInput[],
    actorUserId?: string,
  ) {
    const version = await this.prisma.billingPriceVersion.findUnique({
      where: { id: priceVersionId },
      include: { priceBook: { select: { currency: true } } },
    });
    if (!version) throw new NotFoundException('Price version not found');
    if (version.status !== BillingPriceVersionStatus.DRAFT) {
      throw new ConflictException('Only DRAFT versions can be edited');
    }

    const tierInputs: PriceTierInput[] = tiers.map((t, i) => ({
      minVehicles: t.minVehicles,
      maxVehicles: t.maxVehicles ?? null,
      unitPriceCents: t.unitPriceCents ?? null,
      sortOrder: t.sortOrder ?? i,
    }));

    const errors = validateTiersNoOverlap(tierInputs, { currency: version.priceBook.currency });
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Invalid price tiers', errors });
    }

    await this.prisma.$transaction([
      this.prisma.billingPriceTier.deleteMany({ where: { priceVersionId } }),
      ...tierInputs.map((t) =>
        this.prisma.billingPriceTier.create({
          data: {
            priceVersionId,
            minVehicles: t.minVehicles,
            maxVehicles: t.maxVehicles,
            unitPriceCents: t.unitPriceCents,
            sortOrder: t.sortOrder ?? 0,
          },
        }),
      ),
    ]);

    const updated = await this.prisma.billingPriceVersion.findUnique({
      where: { id: priceVersionId },
      include: { tiers: { orderBy: { sortOrder: 'asc' } } },
    });

    await this.audit.log({
      actorUserId,
      action: 'PRICE_TIERS_UPDATED',
      entityType: 'BillingPriceVersion',
      entityId: priceVersionId,
      after: updated,
    });

    return updated;
  }

  async publishVersion(
    priceVersionId: string,
    actorUserId?: string,
    effectiveFrom?: Date,
    allowUnpriced = false,
  ) {
    const version = await this.prisma.billingPriceVersion.findUnique({
      where: { id: priceVersionId },
      include: {
        tiers: true,
        priceBook: { select: { currency: true } },
      },
    });
    if (!version) throw new NotFoundException('Price version not found');
    if (version.status !== BillingPriceVersionStatus.DRAFT) {
      throw new ConflictException('Only DRAFT versions can be published');
    }

    if (version.tiers.length === 0) {
      throw new BadRequestException('Cannot publish a version without tiers');
    }

    const overlapErrors = validateTiersNoOverlap(
      version.tiers.map((t) => ({
        minVehicles: t.minVehicles,
        maxVehicles: t.maxVehicles,
        unitPriceCents: t.unitPriceCents,
        sortOrder: t.sortOrder,
      })),
      { currency: version.priceBook.currency },
    );
    if (overlapErrors.length > 0) {
      throw new BadRequestException({ message: 'Cannot publish overlapping tiers', overlapErrors });
    }

    if (!allowUnpriced) {
      const missingPrice = version.tiers.some((t) => t.unitPriceCents == null);
      if (missingPrice) {
        throw new BadRequestException(
          'Cannot publish version with missing unit prices. Set allowUnpriced=true to override.',
        );
      }
    }

    const now = effectiveFrom ?? new Date();

    const published = await this.prisma.$transaction(async (tx) => {
      await tx.billingPriceVersion.updateMany({
        where: {
          priceBookId: version.priceBookId,
          status: BillingPriceVersionStatus.ACTIVE,
        },
        data: {
          status: BillingPriceVersionStatus.ARCHIVED,
          effectiveTo: now,
        },
      });

      return tx.billingPriceVersion.update({
        where: { id: priceVersionId },
        data: {
          status: BillingPriceVersionStatus.ACTIVE,
          effectiveFrom: now,
          publishedAt: new Date(),
        },
        include: { tiers: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    await this.audit.log({
      actorUserId,
      action: 'PRICE_VERSION_PUBLISHED',
      entityType: 'BillingPriceVersion',
      entityId: priceVersionId,
      before: version,
      after: published,
    });

    return published;
  }

  async getPricingConfiguration() {
    const book = await this.findDefaultPriceBook();
    if (!book) {
      return {
        configured: false,
        reason: 'NO_DEFAULT_PRICEBOOK',
        priceBook: null,
        activeVersion: null,
      };
    }

    const activeVersion = book.versions[0] ?? null;
    if (!activeVersion) {
      return {
        configured: false,
        reason: 'NO_ACTIVE_PRICE_VERSION',
        priceBook: book,
        activeVersion: null,
      };
    }

    return {
      configured: true,
      reason: null,
      priceBook: book,
      activeVersion,
    };
  }
}
