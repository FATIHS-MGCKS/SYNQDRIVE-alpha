import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingDiscountStatus,
  BillingDiscountType,
  BillingSubscriptionItemRole,
  BillingSubscriptionItemStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingAuditService } from './billing-audit.service';
import { BillingPeriodResolverService } from './billing-period-resolver.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { SubscriptionPricePreviewService } from './subscription-price-preview.service';
import { UsageSnapshotService } from './usage-snapshot.service';
import { SubscriptionLifecycleErrorCode } from './domain/subscription-lifecycle';
import { calculateProration } from './domain/proration-calculator';

export const MasterSubscriptionAdminErrorCode = {
  ORGANIZATION_NOT_FOUND: 'ORGANIZATION_NOT_FOUND',
  SUBSCRIPTION_NOT_FOUND: 'SUBSCRIPTION_NOT_FOUND',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_REPLAY: 'IDEMPOTENCY_REPLAY',
} as const;

export interface MasterSubscriptionActor {
  actorUserId?: string | null;
  idempotencyKey?: string;
  lockVersion?: number;
}

@Injectable()
export class BillingSubscriptionAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly pricePreview: SubscriptionPricePreviewService,
    private readonly usageSnapshots: UsageSnapshotService,
    private readonly periodResolver: BillingPeriodResolverService,
    private readonly audit: BillingAuditService,
  ) {}

  async getContract(organizationId: string) {
    await this.ensureOrganization(organizationId);
    const subscription = await this.findOpenSubscription(organizationId);
    if (!subscription) {
      return { organizationId, subscription: null, contract: null };
    }
    const contract = await this.lifecycle.getContractState(subscription.id);
    return { organizationId, subscription, contract };
  }

  async createDraft(
    organizationId: string,
    actor: MasterSubscriptionActor,
    currency?: string,
  ) {
    return this.withIdempotency(organizationId, actor, 'draft', async () => {
      await this.ensureOrganization(organizationId);
      const contract = await this.lifecycle.createDraft({
        organizationId,
        currency,
        actorUserId: actor.actorUserId,
      });
      return this.wrapContract(organizationId, contract);
    });
  }

  async assignRental(organizationId: string, actor: MasterSubscriptionActor, priceBookId?: string) {
    return this.assignPlan(organizationId, actor, 'RENTAL', priceBookId);
  }

  async assignFleet(organizationId: string, actor: MasterSubscriptionActor, priceBookId?: string) {
    return this.assignPlan(organizationId, actor, 'FLEET', priceBookId);
  }

  async selectPriceVersion(
    organizationId: string,
    actor: MasterSubscriptionActor,
    priceVersionId: string,
    priceBookId?: string,
  ) {
    return this.withIdempotency(organizationId, actor, 'select-price-version', async () => {
      const subscription = await this.requireSubscriptionForOrg(organizationId);
      const baseItem = await this.requireMutableBaseItem(organizationId);

      const version = await this.prisma.billingPriceVersion.findUnique({
        where: { id: priceVersionId },
        select: { id: true, priceBookId: true, status: true },
      });
      if (!version || version.status === 'ARCHIVED') {
        throw new ConflictException({
          code: SubscriptionLifecycleErrorCode.PRICE_VERSION_ARCHIVED,
          message: SubscriptionLifecycleErrorCode.PRICE_VERSION_ARCHIVED,
        });
      }

      await this.prisma.billingSubscriptionItem.update({
        where: { id: baseItem.id },
        data: {
          priceVersionId: version.id,
          priceBookId: priceBookId ?? version.priceBookId ?? baseItem.priceBookId,
        },
      });

      await this.audit.log({
        organizationId,
        actorUserId: actor.actorUserId,
        action: 'MASTER_SUBSCRIPTION_PRICE_VERSION_SELECTED',
        entityType: 'BillingSubscriptionItem',
        entityId: baseItem.id,
        after: { priceVersionId: version.id },
      });

      return this.wrapContract(organizationId, await this.lifecycle.getContractState(subscription.id));
    });
  }

  async configureTrial(
    organizationId: string,
    actor: MasterSubscriptionActor,
    input: { priceVersionId: string; trialEndAt: Date; priceBookId?: string },
  ) {
    return this.withIdempotency(organizationId, actor, 'configure-trial', async () => {
      const subscription = await this.requireSubscriptionForOrg(organizationId);
      const contract = await this.lifecycle.startTrial({
        subscriptionId: subscription.id,
        priceVersionId: input.priceVersionId,
        trialEndAt: input.trialEndAt,
        actorUserId: actor.actorUserId,
        lockVersion: actor.lockVersion ?? subscription.lockVersion,
      });
      return this.wrapContract(organizationId, contract);
    });
  }

  async configureBillingAnchor(
    organizationId: string,
    actor: MasterSubscriptionActor,
    anchorDay: number,
  ) {
    return this.withIdempotency(organizationId, actor, 'billing-anchor', async () => {
      const subscription = await this.requireSubscriptionForOrg(organizationId);
      const contract = await this.lifecycle.changeBillingAnchor({
        subscriptionId: subscription.id,
        anchorDay,
        actorUserId: actor.actorUserId,
        lockVersion: actor.lockVersion ?? subscription.lockVersion,
      });
      return this.wrapContract(organizationId, contract);
    });
  }

  async previewChanges(
    organizationId: string,
    input: {
      productKey?: 'RENTAL' | 'FLEET';
      priceVersionId?: string;
      effectiveAt?: Date;
      anchorDay?: number;
    },
  ) {
    await this.ensureOrganization(organizationId);
    const subscription = await this.findOpenSubscription(organizationId);
    const currentPreview = await this.pricePreview.preview(organizationId);
    const warnings: string[] = [];

    const [currentTariff, currentVersion] = await Promise.all([
      currentPreview.tariff,
      currentPreview.priceVersion,
    ]);

    let proposedPreview = currentPreview;
    if (input.priceVersionId) {
      const version = await this.prisma.billingPriceVersion.findUnique({
        where: { id: input.priceVersionId },
        include: { priceBook: { select: { id: true, name: true, productKey: true, interval: true } } },
      });
      if (!version) {
        warnings.push('PROPOSED_PRICE_VERSION_NOT_FOUND');
      } else if (version.status === 'ARCHIVED') {
        warnings.push('PROPOSED_PRICE_VERSION_ARCHIVED');
      } else {
        proposedPreview = await this.pricePreview.preview(organizationId);
      }
    }

    const effectiveAt = input.effectiveAt ?? new Date();
    const period = input.effectiveAt
      ? {
          periodStart: effectiveAt,
          periodEnd: new Date(effectiveAt.getTime() + 30 * 24 * 60 * 60 * 1000),
        }
      : await this.periodResolver.resolveForOrganization(organizationId, effectiveAt);

    const assignments = await this.prisma.billingBillableVehicleAssignment.findMany({
      where: { organizationId },
      select: {
        id: true,
        vehicleId: true,
        billableFrom: true,
        billableUntil: true,
        status: true,
        reasonCode: true,
      },
    });

    const proration = calculateProration({
      period: {
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      },
      assignments: assignments.map((row) => ({
        assignmentId: row.id,
        vehicleId: row.vehicleId,
        billableFrom: row.billableFrom,
        billableUntil: row.billableUntil,
        status: row.status,
        reasonCode: row.reasonCode,
      })),
      unitPriceCents: proposedPreview.unitPriceCents,
    });

    const usagePreview = await this.usageSnapshots.preview({
      organizationId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
    });

    return {
      organizationId,
      mutating: false,
      effectiveAt: effectiveAt.toISOString(),
      current: {
        productKey: currentTariff.productKey,
        priceBookId: currentTariff.priceBookId,
        priceVersionId: currentVersion.id,
        priceVersionLabel: currentVersion.versionLabel,
        quantity: currentPreview.vehicleCount,
        baseAmountCents: currentPreview.baseAmountCents,
        amountAfterDiscountCents: currentPreview.amountAfterDiscountCents,
        discounts: currentPreview.discounts,
      },
      proposed: {
        productKey: input.productKey ?? currentTariff.productKey,
        priceVersionId: input.priceVersionId ?? currentVersion.id,
        anchorDay: input.anchorDay ?? null,
        quantity: usagePreview.calculatedQuantity,
        baseAmountCents: usagePreview.subtotalCents,
        amountAfterDiscountCents: usagePreview.amountAfterDiscountCents,
        discounts: usagePreview.discounts,
      },
      proration: {
        lines: proration.lines,
        proratedBillableQuantity: proration.proratedBillableQuantity,
        proratedSubtotalCents: proration.proratedSubtotalCents,
        snapshotProration: usagePreview.proration,
      },
      warnings: [...warnings, ...currentPreview.warnings, ...usagePreview.warnings],
    };
  }

  async activate(
    organizationId: string,
    actor: MasterSubscriptionActor,
    input: { priceVersionId: string; priceBookId?: string },
  ) {
    return this.withIdempotency(organizationId, actor, 'activate', async () => {
      const subscription = await this.requireSubscriptionForOrg(organizationId);
      const contract = await this.lifecycle.activate({
        subscriptionId: subscription.id,
        priceVersionId: input.priceVersionId,
        priceBookId: input.priceBookId,
        actorUserId: actor.actorUserId,
        lockVersion: actor.lockVersion ?? subscription.lockVersion,
      });
      return this.wrapContract(organizationId, contract);
    });
  }

  async pause(organizationId: string, actor: MasterSubscriptionActor) {
    return this.mutateLifecycle(organizationId, actor, 'pause', (subscription) =>
      this.lifecycle.pause({
        subscriptionId: subscription.id,
        actorUserId: actor.actorUserId,
        lockVersion: actor.lockVersion ?? subscription.lockVersion,
      }),
    );
  }

  async reactivate(organizationId: string, actor: MasterSubscriptionActor) {
    return this.mutateLifecycle(organizationId, actor, 'reactivate', (subscription) =>
      this.lifecycle.reactivate({
        subscriptionId: subscription.id,
        actorUserId: actor.actorUserId,
        lockVersion: actor.lockVersion ?? subscription.lockVersion,
      }),
    );
  }

  async scheduleCancel(organizationId: string, actor: MasterSubscriptionActor, cancelAt?: Date) {
    return this.mutateLifecycle(organizationId, actor, 'schedule-cancel', (subscription) =>
      this.lifecycle.scheduleCancelAtPeriodEnd({
        subscriptionId: subscription.id,
        cancelAt,
        actorUserId: actor.actorUserId,
        lockVersion: actor.lockVersion ?? subscription.lockVersion,
      }),
    );
  }

  async revokeCancel(organizationId: string, actor: MasterSubscriptionActor) {
    return this.mutateLifecycle(organizationId, actor, 'revoke-cancel', (subscription) =>
      this.lifecycle.revokeCancellation({
        subscriptionId: subscription.id,
        actorUserId: actor.actorUserId,
        lockVersion: actor.lockVersion ?? subscription.lockVersion,
      }),
    );
  }

  async scheduleTariffChange(
    organizationId: string,
    actor: MasterSubscriptionActor,
    input: { productKey: 'RENTAL' | 'FLEET'; effectiveAt: Date },
  ) {
    return this.withIdempotency(organizationId, actor, 'schedule-tariff', async () => {
      const subscription = await this.requireSubscriptionForOrg(organizationId);
      const contract = await this.lifecycle.scheduleTariffChange({
        subscriptionId: subscription.id,
        productKey: input.productKey,
        effectiveAt: input.effectiveAt,
        actorUserId: actor.actorUserId,
        lockVersion: actor.lockVersion ?? subscription.lockVersion,
      });
      return this.wrapContract(organizationId, contract);
    });
  }

  async schedulePriceVersionChange(
    organizationId: string,
    actor: MasterSubscriptionActor,
    input: { priceVersionId: string; effectiveAt: Date },
  ) {
    return this.withIdempotency(organizationId, actor, 'schedule-price-version', async () => {
      const subscription = await this.requireSubscriptionForOrg(organizationId);
      const contract = await this.lifecycle.schedulePriceVersionChange({
        subscriptionId: subscription.id,
        priceVersionId: input.priceVersionId,
        effectiveAt: input.effectiveAt,
        actorUserId: actor.actorUserId,
        lockVersion: actor.lockVersion ?? subscription.lockVersion,
      });
      return this.wrapContract(organizationId, contract);
    });
  }

  async addDiscount(
    organizationId: string,
    actor: MasterSubscriptionActor,
    input: {
      discountType: BillingDiscountType;
      percentBps?: number;
      fixedAmountCents?: number;
      currency?: string;
      validFrom: Date;
      validTo?: Date;
      reason?: string;
      subscriptionItemId?: string;
    },
  ) {
    return this.withIdempotency(organizationId, actor, 'add-discount', async () => {
      const subscription = await this.requireSubscriptionForOrg(organizationId);
      const discount = await this.prisma.billingDiscount.create({
        data: {
          subscriptionId: subscription.id,
          subscriptionItemId: input.subscriptionItemId ?? null,
          discountType: input.discountType,
          percentBps: input.discountType === BillingDiscountType.PERCENTAGE ? input.percentBps : null,
          fixedAmountCents:
            input.discountType === BillingDiscountType.FIXED_AMOUNT
              ? input.fixedAmountCents
              : null,
          currency:
            input.discountType === BillingDiscountType.FIXED_AMOUNT ? input.currency ?? 'EUR' : null,
          validFrom: input.validFrom,
          validTo: input.validTo ?? null,
          reason: input.reason ?? null,
          status: BillingDiscountStatus.ACTIVE,
          createdByUserId: actor.actorUserId ?? null,
        },
      });

      await this.audit.log({
        organizationId,
        actorUserId: actor.actorUserId,
        action: 'MASTER_SUBSCRIPTION_DISCOUNT_ADDED',
        entityType: 'BillingDiscount',
        entityId: discount.id,
        after: discount,
      });

      return { organizationId, discount };
    });
  }

  async updateDiscount(
    organizationId: string,
    discountId: string,
    actor: MasterSubscriptionActor,
    input: { percentBps?: number; fixedAmountCents?: number; validTo?: Date; reason?: string },
  ) {
    return this.withIdempotency(organizationId, actor, `update-discount:${discountId}`, async () => {
      const subscription = await this.requireSubscriptionForOrg(organizationId);
      const existing = await this.prisma.billingDiscount.findFirst({
        where: { id: discountId, subscriptionId: subscription.id },
      });
      if (!existing) {
        throw new NotFoundException('Discount not found');
      }

      const updated = await this.prisma.billingDiscount.update({
        where: { id: discountId },
        data: {
          percentBps: input.percentBps ?? undefined,
          fixedAmountCents: input.fixedAmountCents ?? undefined,
          validTo: input.validTo ?? undefined,
          reason: input.reason ?? undefined,
        },
      });

      await this.audit.log({
        organizationId,
        actorUserId: actor.actorUserId,
        action: 'MASTER_SUBSCRIPTION_DISCOUNT_UPDATED',
        entityType: 'BillingDiscount',
        entityId: discountId,
        before: existing,
        after: updated,
      });

      return { organizationId, discount: updated };
    });
  }

  async endDiscount(
    organizationId: string,
    discountId: string,
    actor: MasterSubscriptionActor,
    input?: { validTo?: Date; reason?: string },
  ) {
    return this.withIdempotency(organizationId, actor, `end-discount:${discountId}`, async () => {
      const subscription = await this.requireSubscriptionForOrg(organizationId);
      const existing = await this.prisma.billingDiscount.findFirst({
        where: { id: discountId, subscriptionId: subscription.id },
      });
      if (!existing) {
        throw new NotFoundException('Discount not found');
      }

      const updated = await this.prisma.billingDiscount.update({
        where: { id: discountId },
        data: {
          validTo: input?.validTo ?? new Date(),
          status: BillingDiscountStatus.CANCELLED,
          reason: input?.reason ?? existing.reason,
        },
      });

      await this.audit.log({
        organizationId,
        actorUserId: actor.actorUserId,
        action: 'MASTER_SUBSCRIPTION_DISCOUNT_ENDED',
        entityType: 'BillingDiscount',
        entityId: discountId,
        before: existing,
        after: updated,
      });

      return { organizationId, discount: updated };
    });
  }

  async getChangeHistory(organizationId: string) {
    await this.ensureOrganization(organizationId);
    return this.lifecycle.getContractHistory(organizationId);
  }

  private async assignPlan(
    organizationId: string,
    actor: MasterSubscriptionActor,
    productKey: 'RENTAL' | 'FLEET',
    priceBookId?: string,
  ) {
    return this.withIdempotency(organizationId, actor, `assign-${productKey.toLowerCase()}`, async () => {
      const subscription = await this.requireSubscriptionForOrg(organizationId, { createIfMissing: true });
      const assign =
        productKey === 'RENTAL'
          ? this.lifecycle.assignRental.bind(this.lifecycle)
          : this.lifecycle.assignFleet.bind(this.lifecycle);
      const contract = await assign({
        subscriptionId: subscription.id,
        priceBookId,
        actorUserId: actor.actorUserId,
        lockVersion: actor.lockVersion ?? subscription.lockVersion,
      });
      return this.wrapContract(organizationId, contract);
    });
  }

  private async mutateLifecycle(
    organizationId: string,
    actor: MasterSubscriptionActor,
    action: string,
    fn: (subscription: { id: string; lockVersion: number }) => Promise<unknown>,
  ) {
    return this.withIdempotency(organizationId, actor, action, async () => {
      const subscription = await this.requireSubscriptionForOrg(organizationId);
      const contract = await fn(subscription);
      return this.wrapContract(organizationId, contract);
    });
  }

  private async withIdempotency<T>(
    organizationId: string,
    actor: MasterSubscriptionActor,
    actionSuffix: string,
    fn: () => Promise<T>,
  ): Promise<{ created: boolean; replayed: boolean; result: T }> {
    if (!actor.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: MasterSubscriptionAdminErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        message: MasterSubscriptionAdminErrorCode.IDEMPOTENCY_KEY_REQUIRED,
      });
    }

    const action = `idempotency:master-subscription:${actionSuffix}:${actor.idempotencyKey}`;
    const existing = await this.prisma.billingAuditLog.findFirst({
      where: { organizationId, action },
      orderBy: { createdAt: 'desc' },
    });

    if (existing?.afterJson) {
      return {
        created: false,
        replayed: true,
        result: existing.afterJson as T,
      };
    }

    const result = await fn();

    await this.audit.log({
      organizationId,
      actorUserId: actor.actorUserId,
      action,
      entityType: 'MasterSubscriptionMutation',
      after: result as Prisma.InputJsonValue,
    });

    return { created: true, replayed: false, result };
  }

  private async ensureOrganization(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) {
      throw new NotFoundException({
        code: MasterSubscriptionAdminErrorCode.ORGANIZATION_NOT_FOUND,
        message: MasterSubscriptionAdminErrorCode.ORGANIZATION_NOT_FOUND,
      });
    }
    return org;
  }

  private async findOpenSubscription(organizationId: string) {
    return this.prisma.billingSubscription.findFirst({
      where: {
        organizationId,
        endedAt: null,
        status: { not: 'CANCELLED' },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async requireSubscriptionForOrg(
    organizationId: string,
    opts?: { createIfMissing?: boolean },
  ) {
    let subscription = await this.findOpenSubscription(organizationId);
    if (!subscription && opts?.createIfMissing) {
      const draft = await this.lifecycle.createDraft({ organizationId });
      subscription = draft.subscription;
    }
    if (!subscription) {
      throw new NotFoundException({
        code: MasterSubscriptionAdminErrorCode.SUBSCRIPTION_NOT_FOUND,
        message: MasterSubscriptionAdminErrorCode.SUBSCRIPTION_NOT_FOUND,
      });
    }
    if (subscription.organizationId !== organizationId) {
      throw new NotFoundException({
        code: MasterSubscriptionAdminErrorCode.SUBSCRIPTION_NOT_FOUND,
        message: MasterSubscriptionAdminErrorCode.SUBSCRIPTION_NOT_FOUND,
      });
    }
    return subscription;
  }

  private async requireMutableBaseItem(organizationId: string) {
    const item = await this.prisma.billingSubscriptionItem.findFirst({
      where: {
        organizationId,
        itemRole: BillingSubscriptionItemRole.BASE_PLAN,
        status: {
          in: [
            BillingSubscriptionItemStatus.DRAFT,
            BillingSubscriptionItemStatus.TRIALING,
            BillingSubscriptionItemStatus.ACTIVE,
          ],
        },
      },
      orderBy: { validFrom: 'desc' },
    });
    if (!item) {
      throw new ConflictException({
        code: SubscriptionLifecycleErrorCode.BASE_PLAN_NOT_ASSIGNED,
        message: SubscriptionLifecycleErrorCode.BASE_PLAN_NOT_ASSIGNED,
      });
    }
    return item;
  }

  private wrapContract(organizationId: string, contract: unknown) {
    return { organizationId, contract };
  }
}
