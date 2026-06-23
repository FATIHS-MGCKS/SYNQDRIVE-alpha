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
    return this.prisma.billingPriceVersion.findMany({
      where: { priceBookId },
      orderBy: { versionNumber: 'desc' },
      include: { tiers: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async getVersionWithTiers(priceVersionId: string) {
    return this.prisma.billingPriceVersion.findUnique({
      where: { id: priceVersionId },
      include: { tiers: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async patchDraftVersion(
    priceVersionId: string,
    patch: { versionLabel?: string; effectiveFrom?: Date },
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
    if (input.isDefault) {
      await this.prisma.billingPriceBook.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const book = await this.prisma.billingPriceBook.create({
      data: {
        name: input.name,
        productKey: input.productKey,
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

    const errors = validateTiersNoOverlap(tierInputs);
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
      include: { tiers: true },
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
