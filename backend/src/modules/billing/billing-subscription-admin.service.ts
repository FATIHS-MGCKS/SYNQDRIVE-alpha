import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingDiscountStatus,
  BillingDiscountType,
  BillingSubscriptionItemRole,
  BillingSubscriptionItemStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingCommandService } from './billing-command.service';
import { BillingPeriodResolverService } from './billing-period-resolver.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { SubscriptionPricePreviewService } from './subscription-price-preview.service';
import { UsageSnapshotService } from './usage-snapshot.service';
import { BillingCommandType } from './domain/billing-command';
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
  requestId?: string | null;
}

@Injectable()
export class BillingSubscriptionAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: BillingCommandService,
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly pricePreview: SubscriptionPricePreviewService,
    private readonly usageSnapshots: UsageSnapshotService,
    private readonly periodResolver: BillingPeriodResolverService,
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
    const payload = { currency: currency ?? null, lockVersion: actor.lockVersion ?? null };
    return this.commands.execute({
      organizationId,
      commandType: BillingCommandType.MASTER_SUBSCRIPTION_DRAFT,
      actor,
      payload,
      audit: {
        action: 'MASTER_SUBSCRIPTION_DRAFT_CREATED',
        entityType: 'BillingSubscription',
        changedFields: ['currency'],
      },
      handler: async () => {
        await this.ensureOrganization(organizationId);
        const contract = await this.lifecycle.createDraft({
          organizationId,
          currency,
          actorUserId: actor.actorUserId,
        });
        const result = this.wrapContract(organizationId, contract);
        return {
          result,
          after: result,
          aggregateId: contract.subscription.id,
          resultReference: contract.subscription.id,
        };
      },
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
    const payload = { priceVersionId, priceBookId: priceBookId ?? null, lockVersion: actor.lockVersion ?? null };
    return this.commands.execute({
      organizationId,
      commandType: BillingCommandType.MASTER_SUBSCRIPTION_SELECT_PRICE_VERSION,
      actor,
      payload,
      audit: {
        action: 'MASTER_SUBSCRIPTION_PRICE_VERSION_SELECTED',
        entityType: 'BillingSubscriptionItem',
        changedFields: ['priceVersionId', 'priceBookId'],
      },
      handler: async () => {
        const subscription = await this.requireSubscriptionForOrg(organizationId);
        const baseItem = await this.requireMutableBaseItem(organizationId);
        const before = { priceVersionId: baseItem.priceVersionId, priceBookId: baseItem.priceBookId };

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

        const result = this.wrapContract(
          organizationId,
          await this.lifecycle.getContractState(subscription.id),
        );
        return {
          result,
          after: { priceVersionId: version.id },
          before,
          aggregateId: subscription.id,
          resultReference: subscription.id,
        };
      },
    });
  }

  async configureTrial(
    organizationId: string,
    actor: MasterSubscriptionActor,
    input: { priceVersionId: string; trialEndAt: Date; priceBookId?: string },
  ) {
    const payload = {
      priceVersionId: input.priceVersionId,
      trialEndAt: input.trialEndAt.toISOString(),
      priceBookId: input.priceBookId ?? null,
      lockVersion: actor.lockVersion ?? null,
    };
    return this.commands.execute({
      organizationId,
      commandType: BillingCommandType.MASTER_SUBSCRIPTION_CONFIGURE_TRIAL,
      actor,
      payload,
      audit: {
        action: 'MASTER_SUBSCRIPTION_TRIAL_CONFIGURED',
        entityType: 'BillingSubscription',
        changedFields: ['trialEndAt', 'priceVersionId'],
      },
      handler: async () => {
        const subscription = await this.requireSubscriptionForOrg(organizationId);
        const contract = await this.lifecycle.startTrial({
          subscriptionId: subscription.id,
          priceVersionId: input.priceVersionId,
          trialEndAt: input.trialEndAt,
          actorUserId: actor.actorUserId,
          lockVersion: actor.lockVersion ?? subscription.lockVersion,
        });
        const result = this.wrapContract(organizationId, contract);
        return {
          result,
          after: result,
          aggregateId: subscription.id,
          resultReference: subscription.id,
        };
      },
    });
  }

  async configureBillingAnchor(
    organizationId: string,
    actor: MasterSubscriptionActor,
    anchorDay: number,
  ) {
    const payload = { anchorDay, lockVersion: actor.lockVersion ?? null };
    return this.commands.execute({
      organizationId,
      commandType: BillingCommandType.MASTER_SUBSCRIPTION_BILLING_ANCHOR,
      actor,
      payload,
      audit: {
        action: 'MASTER_SUBSCRIPTION_BILLING_ANCHOR_CHANGED',
        entityType: 'BillingSubscription',
        changedFields: ['anchorDay'],
      },
      handler: async () => {
        const subscription = await this.requireSubscriptionForOrg(organizationId);
        const contract = await this.lifecycle.changeBillingAnchor({
          subscriptionId: subscription.id,
          anchorDay,
          actorUserId: actor.actorUserId,
          lockVersion: actor.lockVersion ?? subscription.lockVersion,
        });
        const result = this.wrapContract(organizationId, contract);
        return {
          result,
          after: result,
          aggregateId: subscription.id,
          resultReference: subscription.id,
        };
      },
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
    const payload = {
      priceVersionId: input.priceVersionId,
      priceBookId: input.priceBookId ?? null,
      lockVersion: actor.lockVersion ?? null,
    };
    return this.commands.execute({
      organizationId,
      commandType: BillingCommandType.MASTER_SUBSCRIPTION_ACTIVATE,
      actor,
      payload,
      audit: {
        action: 'MASTER_SUBSCRIPTION_ACTIVATED',
        entityType: 'BillingSubscription',
        changedFields: ['status', 'priceVersionId'],
      },
      handler: async () => {
        const subscription = await this.requireSubscriptionForOrg(organizationId);
        const contract = await this.lifecycle.activate({
          subscriptionId: subscription.id,
          priceVersionId: input.priceVersionId,
          priceBookId: input.priceBookId,
          actorUserId: actor.actorUserId,
          lockVersion: actor.lockVersion ?? subscription.lockVersion,
        });
        const result = this.wrapContract(organizationId, contract);
        return {
          result,
          after: result,
          aggregateId: subscription.id,
          resultReference: subscription.id,
        };
      },
    });
  }

  async pause(organizationId: string, actor: MasterSubscriptionActor) {
    return this.mutateLifecycle(
      organizationId,
      actor,
      BillingCommandType.MASTER_SUBSCRIPTION_PAUSE,
      'MASTER_SUBSCRIPTION_PAUSED',
      (subscription) =>
        this.lifecycle.pause({
          subscriptionId: subscription.id,
          actorUserId: actor.actorUserId,
          lockVersion: actor.lockVersion ?? subscription.lockVersion,
        }),
    );
  }

  async reactivate(organizationId: string, actor: MasterSubscriptionActor) {
    return this.mutateLifecycle(
      organizationId,
      actor,
      BillingCommandType.MASTER_SUBSCRIPTION_REACTIVATE,
      'MASTER_SUBSCRIPTION_REACTIVATED',
      (subscription) =>
        this.lifecycle.reactivate({
          subscriptionId: subscription.id,
          actorUserId: actor.actorUserId,
          lockVersion: actor.lockVersion ?? subscription.lockVersion,
        }),
    );
  }

  async scheduleCancel(organizationId: string, actor: MasterSubscriptionActor, cancelAt?: Date) {
    const payload = { cancelAt: cancelAt?.toISOString() ?? null, lockVersion: actor.lockVersion ?? null };
    return this.commands.execute({
      organizationId,
      commandType: BillingCommandType.MASTER_SUBSCRIPTION_SCHEDULE_CANCEL,
      actor,
      payload,
      audit: {
        action: 'MASTER_SUBSCRIPTION_CANCEL_SCHEDULED',
        entityType: 'BillingSubscription',
        changedFields: ['cancelAtPeriodEnd', 'cancelAt'],
      },
      handler: async () => {
        const subscription = await this.requireSubscriptionForOrg(organizationId);
        const contract = await this.lifecycle.scheduleCancelAtPeriodEnd({
          subscriptionId: subscription.id,
          cancelAt,
          actorUserId: actor.actorUserId,
          lockVersion: actor.lockVersion ?? subscription.lockVersion,
        });
        const result = this.wrapContract(organizationId, contract);
        return {
          result,
          after: result,
          aggregateId: subscription.id,
          resultReference: subscription.id,
        };
      },
    });
  }

  async revokeCancel(organizationId: string, actor: MasterSubscriptionActor) {
    return this.mutateLifecycle(
      organizationId,
      actor,
      BillingCommandType.MASTER_SUBSCRIPTION_REVOKE_CANCEL,
      'MASTER_SUBSCRIPTION_CANCEL_REVOKED',
      (subscription) =>
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
    const payload = {
      productKey: input.productKey,
      effectiveAt: input.effectiveAt.toISOString(),
      lockVersion: actor.lockVersion ?? null,
    };
    return this.commands.execute({
      organizationId,
      commandType: BillingCommandType.MASTER_SUBSCRIPTION_SCHEDULE_TARIFF_CHANGE,
      actor,
      payload,
      audit: {
        action: 'MASTER_SUBSCRIPTION_TARIFF_CHANGE_SCHEDULED',
        entityType: 'BillingSubscription',
        changedFields: ['productKey', 'effectiveAt'],
      },
      handler: async () => {
        const subscription = await this.requireSubscriptionForOrg(organizationId);
        const contract = await this.lifecycle.scheduleTariffChange({
          subscriptionId: subscription.id,
          productKey: input.productKey,
          effectiveAt: input.effectiveAt,
          actorUserId: actor.actorUserId,
          lockVersion: actor.lockVersion ?? subscription.lockVersion,
        });
        const result = this.wrapContract(organizationId, contract);
        return {
          result,
          after: result,
          aggregateId: subscription.id,
          resultReference: subscription.id,
        };
      },
    });
  }

  async schedulePriceVersionChange(
    organizationId: string,
    actor: MasterSubscriptionActor,
    input: { priceVersionId: string; effectiveAt: Date },
  ) {
    const payload = {
      priceVersionId: input.priceVersionId,
      effectiveAt: input.effectiveAt.toISOString(),
      lockVersion: actor.lockVersion ?? null,
    };
    return this.commands.execute({
      organizationId,
      commandType: BillingCommandType.MASTER_SUBSCRIPTION_SCHEDULE_PRICE_VERSION_CHANGE,
      actor,
      payload,
      audit: {
        action: 'MASTER_SUBSCRIPTION_PRICE_VERSION_CHANGE_SCHEDULED',
        entityType: 'BillingSubscription',
        changedFields: ['priceVersionId', 'effectiveAt'],
      },
      handler: async () => {
        const subscription = await this.requireSubscriptionForOrg(organizationId);
        const contract = await this.lifecycle.schedulePriceVersionChange({
          subscriptionId: subscription.id,
          priceVersionId: input.priceVersionId,
          effectiveAt: input.effectiveAt,
          actorUserId: actor.actorUserId,
          lockVersion: actor.lockVersion ?? subscription.lockVersion,
        });
        const result = this.wrapContract(organizationId, contract);
        return {
          result,
          after: result,
          aggregateId: subscription.id,
          resultReference: subscription.id,
        };
      },
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
    const payload = {
      discountType: input.discountType,
      percentBps: input.percentBps ?? null,
      fixedAmountCents: input.fixedAmountCents ?? null,
      currency: input.currency ?? null,
      validFrom: input.validFrom.toISOString(),
      validTo: input.validTo?.toISOString() ?? null,
      reason: input.reason ?? null,
      subscriptionItemId: input.subscriptionItemId ?? null,
      lockVersion: actor.lockVersion ?? null,
    };
    return this.commands.execute({
      organizationId,
      commandType: BillingCommandType.MASTER_SUBSCRIPTION_ADD_DISCOUNT,
      actor,
      payload,
      audit: {
        action: 'MASTER_SUBSCRIPTION_DISCOUNT_ADDED',
        entityType: 'BillingDiscount',
        reason: input.reason,
        changedFields: ['discountType', 'percentBps', 'fixedAmountCents', 'validFrom', 'validTo'],
      },
      handler: async () => {
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
        const result = { organizationId, discount };
        return {
          result,
          after: discount,
          aggregateId: subscription.id,
          resultReference: discount.id,
        };
      },
    });
  }

  async updateDiscount(
    organizationId: string,
    discountId: string,
    actor: MasterSubscriptionActor,
    input: { percentBps?: number; fixedAmountCents?: number; validTo?: Date; reason?: string },
  ) {
    const payload = {
      discountId,
      percentBps: input.percentBps ?? null,
      fixedAmountCents: input.fixedAmountCents ?? null,
      validTo: input.validTo?.toISOString() ?? null,
      reason: input.reason ?? null,
      lockVersion: actor.lockVersion ?? null,
    };
    return this.commands.execute({
      organizationId,
      commandType: BillingCommandType.MASTER_SUBSCRIPTION_UPDATE_DISCOUNT,
      actor,
      payload,
      audit: {
        action: 'MASTER_SUBSCRIPTION_DISCOUNT_UPDATED',
        entityType: 'BillingDiscount',
        entityId: discountId,
        reason: input.reason,
        changedFields: ['percentBps', 'fixedAmountCents', 'validTo', 'reason'],
      },
      handler: async () => {
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
        const result = { organizationId, discount: updated };
        return {
          result,
          before: existing,
          after: updated,
          aggregateId: subscription.id,
          resultReference: discountId,
        };
      },
    });
  }

  async endDiscount(
    organizationId: string,
    discountId: string,
    actor: MasterSubscriptionActor,
    input?: { validTo?: Date; reason?: string },
  ) {
    const payload = {
      discountId,
      validTo: input?.validTo?.toISOString() ?? null,
      reason: input?.reason ?? null,
      lockVersion: actor.lockVersion ?? null,
    };
    return this.commands.execute({
      organizationId,
      commandType: BillingCommandType.MASTER_SUBSCRIPTION_END_DISCOUNT,
      actor,
      payload,
      audit: {
        action: 'MASTER_SUBSCRIPTION_DISCOUNT_ENDED',
        entityType: 'BillingDiscount',
        entityId: discountId,
        reason: input?.reason,
        changedFields: ['validTo', 'status'],
      },
      handler: async () => {
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
        const result = { organizationId, discount: updated };
        return {
          result,
          before: existing,
          after: updated,
          aggregateId: subscription.id,
          resultReference: discountId,
        };
      },
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
    const commandType =
      productKey === 'RENTAL'
        ? BillingCommandType.MASTER_SUBSCRIPTION_ASSIGN_RENTAL
        : BillingCommandType.MASTER_SUBSCRIPTION_ASSIGN_FLEET;
    const payload = { priceBookId: priceBookId ?? null, lockVersion: actor.lockVersion ?? null };

    return this.commands.execute({
      organizationId,
      commandType,
      actor,
      payload,
      audit: {
        action: `MASTER_SUBSCRIPTION_${productKey}_ASSIGNED`,
        entityType: 'BillingSubscription',
        changedFields: ['productKey', 'priceBookId'],
      },
      handler: async () => {
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
        const result = this.wrapContract(organizationId, contract);
        return {
          result,
          after: result,
          aggregateId: subscription.id,
          resultReference: subscription.id,
        };
      },
    });
  }

  private async mutateLifecycle(
    organizationId: string,
    actor: MasterSubscriptionActor,
    commandType: BillingCommandType,
    auditAction: string,
    fn: (subscription: { id: string; lockVersion: number }) => Promise<unknown>,
  ) {
    const payload = { lockVersion: actor.lockVersion ?? null };
    return this.commands.execute({
      organizationId,
      commandType,
      actor,
      payload,
      audit: {
        action: auditAction,
        entityType: 'BillingSubscription',
        changedFields: ['status'],
      },
      handler: async () => {
        const subscription = await this.requireSubscriptionForOrg(organizationId);
        const contract = await fn(subscription);
        const result = this.wrapContract(organizationId, contract);
        return {
          result,
          after: result,
          aggregateId: subscription.id,
          resultReference: subscription.id,
        };
      },
    });
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
