import { Injectable, Logger } from '@nestjs/common';
import {
  BillingOrgPriceOverrideStatus,
  BillingPriceVersionStatus,
  BillingStripeMappingStatus,
  BillingStripeMode,
  BillingSubscriptionItemRole,
  BillingSubscriptionItemStatus,
  OrgProductStatus,
  Prisma,
  ProductSlug,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BillableVehiclesService } from '../billable-vehicles.service';
import { PricebookService } from '../pricebook.service';
import {
  appendLegacyBackfillMarker,
  BaseBillingProductKey,
  BILLING_CATALOG_BASE_PRODUCT_SEEDS,
  buildQuantityBackfillIdempotencyKey,
  classifyStripePriceIdMode,
  hasLegacyBackfillMarker,
  inferBaseBillingProductKey,
  mapSubscriptionStatusToItemStatus,
  resolveStripeModeFromSecretKey,
  sourcesConflict,
} from './billing-legacy-backfill.util';
import {
  BillingLegacyBackfillAction,
  BillingLegacyBackfillCheckpoint,
  BillingLegacyBackfillGlobalSummary,
  BillingLegacyBackfillOrgRecord,
  BillingLegacyBackfillReport,
  BillingLegacyBackfillRunOptions,
  BillingLegacyBackfillSummary,
} from './billing-legacy-backfill.types';

@Injectable()
export class BillingLegacyBackfillService {
  private readonly logger = new Logger(BillingLegacyBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricebook: PricebookService,
    private readonly billableVehicles: BillableVehiclesService,
  ) {}

  async run(options: BillingLegacyBackfillRunOptions): Promise<BillingLegacyBackfillReport> {
    const mode = options.dryRun ? 'dry-run' : 'execute';
    const startedAt = new Date();
    const failures: BillingLegacyBackfillReport['failures'] = [];
    const organizations: BillingLegacyBackfillOrgRecord[] = [];

    const global = await this.runGlobalPhase(options.dryRun);

    const orgIds = await this.loadOrganizationIds(options);
    let processedCount = options.checkpoint?.processedCount ?? 0;
    let lastOrganizationId: string | null = options.checkpoint?.lastOrganizationId ?? null;

    for (const orgId of orgIds) {
      if (options.checkpoint?.lastOrganizationId && orgId <= options.checkpoint.lastOrganizationId) {
        continue;
      }

      try {
        const record = await this.processOrganization(orgId, options.dryRun, global);
        organizations.push(record);
        this.logger.log({
          msg: 'billing.legacy_backfill.org_processed',
          organizationId: orgId,
          outcome: record.outcome,
          conflicts: record.conflicts,
          actions: record.actions.length,
        });
      } catch (err) {
        const error = (err as Error).message ?? String(err);
        failures.push({ organizationId: orgId, error });
        organizations.push({
          organizationId: orgId,
          companyName: orgId,
          outcome: 'failed',
          inferredProductKey: null,
          inferenceSource: null,
          subscriptionId: null,
          conflicts: [],
          actions: [],
          warnings: [],
          error,
        });
        this.logger.error({
          msg: 'billing.legacy_backfill.org_failed',
          organizationId: orgId,
          error,
        });
      }

      processedCount += 1;
      lastOrganizationId = orgId;
    }

    const finishedAt = new Date();
    const summary = this.buildSummary(organizations);

    const report: BillingLegacyBackfillReport = {
      mode,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      global,
      summary,
      organizations,
      checkpoint: {
        lastOrganizationId,
        processedCount,
        updatedAt: finishedAt.toISOString(),
      },
      failures,
    };

    this.logger.log({
      msg: 'billing.legacy_backfill.completed',
      mode,
      summary,
      failures: failures.length,
    });

    return report;
  }

  private async loadOrganizationIds(options: BillingLegacyBackfillRunOptions): Promise<string[]> {
    const rows = await this.prisma.organization.findMany({
      where: options.organizationId ? { id: options.organizationId } : undefined,
      select: { id: true },
      orderBy: { id: 'asc' },
      ...(options.limit ? { take: options.limit } : {}),
    });
    return rows.map((r) => r.id);
  }

  private async runGlobalPhase(dryRun: boolean): Promise<BillingLegacyBackfillGlobalSummary> {
    const defaultStripePriceId = process.env.STRIPE_DEFAULT_PRICE_ID?.trim() || null;
    const stripeModeClassified = classifyStripePriceIdMode(
      defaultStripePriceId,
      process.env.STRIPE_SECRET_KEY,
    );

    let catalogProductsEnsured = 0;
    for (const seed of BILLING_CATALOG_BASE_PRODUCT_SEEDS) {
      const existing = await this.prisma.billingCatalogProduct.findUnique({
        where: { key: seed.key },
        select: { id: true },
      });
      if (existing) continue;
      if (!dryRun) {
        await this.prisma.billingCatalogProduct.create({
          data: {
            id: seed.id,
            key: seed.key,
            name: seed.name,
            description: seed.description,
            productRole: 'BASE_PLAN',
            status: 'ACTIVE',
            sortOrder: seed.sortOrder,
          },
        });
      }
      catalogProductsEnsured += 1;
      this.logger.log({
        msg: 'billing.legacy_backfill.catalog_product_ensured',
        key: seed.key,
        dryRun,
      });
    }

    let priceBooksLinked = 0;
    const priceBooks = await this.prisma.billingPriceBook.findMany({
      select: { id: true, productKey: true, billingProductId: true },
    });
    for (const book of priceBooks) {
      if (book.billingProductId) continue;
      const productKey = book.productKey.trim().toUpperCase();
      if (productKey !== 'RENTAL' && productKey !== 'FLEET') continue;

      const catalog = await this.prisma.billingCatalogProduct.findUnique({
        where: { key: productKey },
        select: { id: true },
      });
      if (!catalog) continue;

      if (!dryRun) {
        await this.prisma.billingPriceBook.update({
          where: { id: book.id },
          data: { billingProductId: catalog.id },
        });
      }
      priceBooksLinked += 1;
    }

    let stripeMappingsUpserted = 0;
    if (defaultStripePriceId && stripeModeClassified) {
      const defaultBook = await this.prisma.billingPriceBook.findFirst({
        where: { isDefault: true },
        select: { id: true, billingProductId: true },
      });
      if (defaultBook) {
        const existing = await this.prisma.billingStripePriceMapping.findUnique({
          where: {
            priceBookId_stripeMode: {
              priceBookId: defaultBook.id,
              stripeMode: stripeModeClassified,
            },
          },
          select: { id: true, stripePriceId: true },
        });
        if (!existing?.stripePriceId) {
          if (!dryRun) {
            await this.prisma.billingStripePriceMapping.upsert({
              where: {
                priceBookId_stripeMode: {
                  priceBookId: defaultBook.id,
                  stripeMode: stripeModeClassified,
                },
              },
              create: {
                priceBookId: defaultBook.id,
                billingProductId: defaultBook.billingProductId,
                stripeMode: stripeModeClassified,
                stripePriceId: defaultStripePriceId,
                mappingStatus: BillingStripeMappingStatus.SYNCED,
                lastSyncedAt: new Date(),
              },
              update: {
                stripePriceId: defaultStripePriceId,
                mappingStatus: BillingStripeMappingStatus.SYNCED,
                lastSyncedAt: new Date(),
              },
            });
          }
          stripeMappingsUpserted += 1;
        }
      }
    }

    return {
      catalogProductsEnsured,
      priceBooksLinked,
      stripeMappingsUpserted,
      stripeModeClassified,
      defaultStripePriceId,
    };
  }

  private async processOrganization(
    organizationId: string,
    dryRun: boolean,
    global: BillingLegacyBackfillGlobalSummary,
  ): Promise<BillingLegacyBackfillOrgRecord> {
    const actions: BillingLegacyBackfillAction[] = [];
    const warnings: string[] = [];

    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        id: true,
        companyName: true,
        businessType: true,
        organizationProducts: {
          where: { status: { in: [OrgProductStatus.ACTIVE, OrgProductStatus.TRIAL] } },
          include: { product: { select: { slug: true } } },
        },
        billingOrgPriceOverrides: {
          where: { status: BillingOrgPriceOverrideStatus.ACTIVE },
        },
      },
    });

    const subscriptions = await this.prisma.billingSubscription.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        priceBook: { select: { id: true, productKey: true, billingProductId: true } },
        items: {
          where: {
            itemRole: BillingSubscriptionItemRole.BASE_PLAN,
            status: { in: [BillingSubscriptionItemStatus.ACTIVE, BillingSubscriptionItemStatus.TRIALING] },
          },
        },
      },
    });

    if (subscriptions.length > 1) {
      return {
        organizationId,
        companyName: org.companyName,
        outcome: 'conflict',
        inferredProductKey: null,
        inferenceSource: null,
        subscriptionId: null,
        conflicts: ['MULTIPLE_ACTIVE_SUBSCRIPTIONS'],
        actions,
        warnings: [`Found ${subscriptions.length} billing subscriptions`],
      };
    }

    const subscription = subscriptions[0] ?? null;
    const orgProductSlugs = org.organizationProducts.map((p) => p.product.slug);

    const inference = inferBaseBillingProductKey({
      orgProductSlugs,
      subscriptionPriceBookProductKey: subscription?.priceBook?.productKey ?? null,
      businessType: org.businessType,
    });

    warnings.push(...inference.warnings);

    const orgProductBaseKey = this.resolveOrgProductBaseKey(orgProductSlugs);
    const priceBookBaseKey = subscription?.priceBook?.productKey
      ? (subscription.priceBook.productKey.toUpperCase() as BaseBillingProductKey)
      : null;
    if (sourcesConflict(orgProductBaseKey, priceBookBaseKey)) {
      inference.conflicts.push('CONFLICTING_LEGACY_SOURCES');
    }

    if (!subscription) {
      const hasBillingSignal =
        orgProductSlugs.some(
          (s) => s === ProductSlug.RENTAL || s === ProductSlug.FLEET || s === ProductSlug.TAXI,
        ) || org.billingOrgPriceOverrides.length > 0;

      if (!hasBillingSignal) {
        return {
          organizationId,
          companyName: org.companyName,
          outcome: 'skipped_no_billing_signal',
          inferredProductKey: inference.productKey,
          inferenceSource: inference.source,
          subscriptionId: null,
          conflicts: inference.conflicts,
          actions,
          warnings,
        };
      }

      for (const override of org.billingOrgPriceOverrides) {
        actions.push({
          kind: 'document_price_override',
          entityType: 'BillingOrganizationPriceOverride',
          entityId: override.id,
          detail: 'Legacy org price override noted (no subscription to attach)',
        });
      }

      return {
        organizationId,
        companyName: org.companyName,
        outcome: inference.conflicts.length ? 'conflict' : 'skipped_no_subscription',
        inferredProductKey: inference.productKey,
        inferenceSource: inference.source,
        subscriptionId: null,
        conflicts: inference.conflicts,
        actions,
        warnings,
      };
    }

    if (inference.conflicts.length > 0 || !inference.productKey) {
      return {
        organizationId,
        companyName: org.companyName,
        outcome: 'conflict',
        inferredProductKey: inference.productKey,
        inferenceSource: inference.source,
        subscriptionId: subscription.id,
        conflicts: inference.conflicts.length
          ? inference.conflicts
          : ['AMBIGUOUS_BASE_PRODUCT'],
        actions,
        warnings,
      };
    }

    const catalogProduct = await this.prisma.billingCatalogProduct.findUnique({
      where: { key: inference.productKey },
      select: { id: true },
    });
    if (!catalogProduct) {
      return {
        organizationId,
        companyName: org.companyName,
        outcome: 'conflict',
        inferredProductKey: inference.productKey,
        inferenceSource: inference.source,
        subscriptionId: subscription.id,
        conflicts: ['NO_PRICE_BOOK'],
        actions,
        warnings: [`Catalog product ${inference.productKey} missing`],
      };
    }

    const priceBook =
      subscription.priceBook ??
      (await this.findPriceBookForProduct(inference.productKey));
    if (!priceBook) {
      return {
        organizationId,
        companyName: org.companyName,
        outcome: 'conflict',
        inferredProductKey: inference.productKey,
        inferenceSource: inference.source,
        subscriptionId: subscription.id,
        conflicts: ['NO_PRICE_BOOK'],
        actions,
        warnings,
      };
    }

    if (
      priceBook.productKey &&
      priceBook.productKey.toUpperCase() !== inference.productKey
    ) {
      return {
        organizationId,
        companyName: org.companyName,
        outcome: 'conflict',
        inferredProductKey: inference.productKey,
        inferenceSource: inference.source,
        subscriptionId: subscription.id,
        conflicts: ['PRICE_BOOK_PRODUCT_MISMATCH'],
        actions,
        warnings: [
          `Subscription price book product ${priceBook.productKey} != inferred ${inference.productKey}`,
        ],
      };
    }

    const activeVersion = subscription.priceVersionId
      ? await this.pricebook.getVersionWithTiers(subscription.priceVersionId)
      : await this.pricebook.findActiveVersion(priceBook.id);
    if (!activeVersion || activeVersion.status !== BillingPriceVersionStatus.ACTIVE) {
      return {
        organizationId,
        companyName: org.companyName,
        outcome: 'conflict',
        inferredProductKey: inference.productKey,
        inferenceSource: inference.source,
        subscriptionId: subscription.id,
        conflicts: ['NO_ACTIVE_PRICE_VERSION'],
        actions,
        warnings,
      };
    }

    const stripeMode =
      subscription.stripeMode ??
      global.stripeModeClassified ??
      (subscription.stripeCustomerId || subscription.stripeSubscriptionId
        ? BillingStripeMode.LIVE
        : null);

    if (
      (subscription.stripeCustomerId || subscription.stripeSubscriptionId) &&
      !subscription.stripeMode &&
      !stripeMode
    ) {
      return {
        organizationId,
        companyName: org.companyName,
        outcome: 'conflict',
        inferredProductKey: inference.productKey,
        inferenceSource: inference.source,
        subscriptionId: subscription.id,
        conflicts: ['STRIPE_ID_WITHOUT_MODE'],
        actions,
        warnings,
      };
    }

    const existingBaseItem = subscription.items[0] ?? null;
    if (existingBaseItem) {
      for (const override of org.billingOrgPriceOverrides) {
        actions.push({
          kind: 'document_price_override',
          entityType: 'BillingOrganizationPriceOverride',
          entityId: override.id,
          detail: 'Legacy org price override documented',
        });
        if (!dryRun && !hasLegacyBackfillMarker(override.reason)) {
          await this.prisma.billingOrganizationPriceOverride.update({
            where: { id: override.id },
            data: { reason: appendLegacyBackfillMarker(override.reason) },
          });
        }
      }

      const qtyKey = buildQuantityBackfillIdempotencyKey(organizationId, existingBaseItem.id);
      const qtyExists = await this.prisma.billingQuantityEvent.findUnique({
        where: { idempotencyKey: qtyKey },
        select: { id: true },
      });
      if (!qtyExists) {
        const billable = await this.billableVehicles.getBillableConnectedVehiclesForOrganization(
          organizationId,
        );
        actions.push({
          kind: 'document_quantity_event',
          entityType: 'BillingQuantityEvent',
          detail: `Document quantity ${billable.billableVehicleCount} for existing item`,
        });
        if (!dryRun) {
          const qty = existingBaseItem.quantity;
          await this.prisma.billingQuantityEvent.create({
            data: {
              organizationId,
              subscriptionItemId: existingBaseItem.id,
              eventType: 'SUBSCRIPTION_SYNC',
              delta: 0,
              quantityBefore: qty,
              quantityAfter: qty,
              effectiveAt: new Date(),
              source: 'SYSTEM',
              reason: `Legacy backfill: documented billableVehicleCount=${billable.billableVehicleCount}`,
              idempotencyKey: qtyKey,
            },
          });
        }
      }

      return {
        organizationId,
        companyName: org.companyName,
        outcome: 'already_migrated',
        inferredProductKey: inference.productKey,
        inferenceSource: inference.source,
        subscriptionId: subscription.id,
        conflicts: [],
        actions,
        warnings,
      };
    }

    const billable = await this.billableVehicles.getBillableConnectedVehiclesForOrganization(
      organizationId,
    );
    const quantity = billable.billableVehicleCount;

    const subscriptionPatch: Prisma.BillingSubscriptionUpdateInput = {};
    if (!subscription.priceBookId) subscriptionPatch.priceBook = { connect: { id: priceBook.id } };
    if (!subscription.priceVersionId) {
      subscriptionPatch.priceVersion = { connect: { id: activeVersion.id } };
    }
    if (!subscription.stripeMode && stripeMode) {
      subscriptionPatch.stripeMode = stripeMode;
      actions.push({
        kind: 'set_subscription_stripe_mode',
        entityType: 'BillingSubscription',
        entityId: subscription.id,
        detail: `stripeMode=${stripeMode}`,
      });
    }
    if (Object.keys(subscriptionPatch).length > 0) {
      actions.push({
        kind: 'update_subscription',
        entityType: 'BillingSubscription',
        entityId: subscription.id,
        detail: 'Linked priceBookId/priceVersionId/stripeMode where missing',
      });
      if (!dryRun) {
        await this.prisma.billingSubscription.update({
          where: { id: subscription.id },
          data: subscriptionPatch,
        });
      }
    }

    const itemStatus = mapSubscriptionStatusToItemStatus(subscription.status);
    actions.push({
      kind: 'create_subscription_item',
      entityType: 'BillingSubscriptionItem',
      detail: `Create base plan ${inference.productKey} quantity=${quantity}`,
    });

    let createdItemId: string | null = null;
    if (!dryRun) {
      const item = await this.prisma.billingSubscriptionItem.create({
        data: {
          subscriptionId: subscription.id,
          organizationId,
          billingProductId: catalogProduct.id,
          itemRole: BillingSubscriptionItemRole.BASE_PLAN,
          priceBookId: priceBook.id,
          priceVersionId: activeVersion.id,
          quantity,
          validFrom: subscription.currentPeriodStart ?? subscription.createdAt,
          status: itemStatus as BillingSubscriptionItemStatus,
          stripeMode: stripeMode ?? undefined,
        },
      });
      createdItemId = item.id;

      const qtyKey = buildQuantityBackfillIdempotencyKey(organizationId, item.id);
      await this.prisma.billingQuantityEvent.create({
        data: {
          organizationId,
          subscriptionItemId: item.id,
          eventType: 'SUBSCRIPTION_SYNC',
          delta: quantity,
          quantityBefore: 0,
          quantityAfter: quantity,
          effectiveAt: new Date(),
          source: 'SYSTEM',
          reason: `Legacy backfill: initial quantity from billableVehicleCount=${billable.billableVehicleCount}`,
          idempotencyKey: qtyKey,
        },
      });
      actions.push({
        kind: 'document_quantity_event',
        entityType: 'BillingQuantityEvent',
        entityId: createdItemId,
        detail: `Recorded initial quantity ${quantity}`,
      });
    }

    for (const override of org.billingOrgPriceOverrides) {
      actions.push({
        kind: 'document_price_override',
        entityType: 'BillingOrganizationPriceOverride',
        entityId: override.id,
        detail: 'Legacy org price override documented',
      });
      if (!dryRun) {
        await this.prisma.billingOrganizationPriceOverride.update({
          where: { id: override.id },
          data: { reason: appendLegacyBackfillMarker(override.reason) },
        });
      }
    }

    return {
      organizationId,
      companyName: org.companyName,
      outcome: 'migrated',
      inferredProductKey: inference.productKey,
      inferenceSource: inference.source,
      subscriptionId: subscription.id,
      conflicts: [],
      actions,
      warnings,
    };
  }

  private resolveOrgProductBaseKey(slugs: string[]): BaseBillingProductKey | null {
    const rental = slugs.some((s) => s === ProductSlug.RENTAL || s === ProductSlug.TAXI);
    const fleet = slugs.some((s) => s === ProductSlug.FLEET);
    if (rental && fleet) return null;
    if (fleet) return 'FLEET';
    if (rental) return 'RENTAL';
    return null;
  }

  private async findPriceBookForProduct(productKey: BaseBillingProductKey) {
    return this.prisma.billingPriceBook.findFirst({
      where: {
        productKey,
        status: 'ACTIVE',
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, productKey: true, billingProductId: true },
    });
  }

  private buildSummary(organizations: BillingLegacyBackfillOrgRecord[]): BillingLegacyBackfillSummary {
    return organizations.reduce<BillingLegacyBackfillSummary>(
      (acc, org) => {
        acc.organizationsScanned += 1;
        switch (org.outcome) {
          case 'migrated':
            acc.migrated += 1;
            break;
          case 'already_migrated':
            acc.alreadyMigrated += 1;
            break;
          case 'skipped_no_subscription':
            acc.skippedNoSubscription += 1;
            break;
          case 'skipped_no_billing_signal':
            acc.skippedNoBillingSignal += 1;
            break;
          case 'conflict':
            acc.conflicts += 1;
            break;
          case 'failed':
            acc.failed += 1;
            break;
          default:
            break;
        }
        return acc;
      },
      {
        organizationsScanned: 0,
        migrated: 0,
        alreadyMigrated: 0,
        skippedNoSubscription: 0,
        skippedNoBillingSignal: 0,
        conflicts: 0,
        failed: 0,
      },
    );
  }
}
