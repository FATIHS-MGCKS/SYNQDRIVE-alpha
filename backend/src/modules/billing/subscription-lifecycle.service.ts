import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingPriceVersionStatus,
  BillingStatus,
  BillingSubscriptionItemRole,
  BillingSubscriptionItemStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingAuditService } from './billing-audit.service';
import { BillingDomainEventOutboxService } from './billing-domain-event-outbox.service';
import { BillingQuantityService } from './billing-quantity.service';
import { SubscriptionStatus } from './domain/billing-domain.types';
import { BillingDomainEventType } from './domain/billing-domain.events';
import {
  assertTransitionAllowed,
  mapDomainStatusToItemStatus,
  resolveSubscriptionDomainStatus,
  SubscriptionLifecycleContext,
  SubscriptionLifecycleErrorCode,
  SubscriptionLifecycleTransitionError,
} from './domain/subscription-lifecycle';
import { mapSubscriptionDomainToPrismaBillingStatus } from './domain/mappers/stripe-subscription-status.mapper';
import {
  buildBillingOutboxIdempotencyKey,
  resolveSubscriptionLifecycleOutboxEvent,
} from './domain/billing-outbox';
import { buildQuantityIdempotencyKey } from './domain/billing-quantity-ledger';

type BaseProductKey = 'RENTAL' | 'FLEET';

export interface LifecycleActorContext {
  actorUserId?: string | null;
  lockVersion?: number;
  allowImmediateCancel?: boolean;
}

export interface CreateDraftSubscriptionInput extends LifecycleActorContext {
  organizationId: string;
  currency?: string;
}

export interface AssignBasePlanInput extends LifecycleActorContext {
  subscriptionId: string;
  priceBookId?: string | null;
}

export interface StartTrialInput extends LifecycleActorContext {
  subscriptionId: string;
  priceVersionId: string;
  trialEndAt: Date;
}

export interface ActivateSubscriptionInput extends LifecycleActorContext {
  subscriptionId: string;
  priceVersionId: string;
  priceBookId?: string | null;
}

export interface SchedulePlanChangeInput extends LifecycleActorContext {
  subscriptionId: string;
  productKey?: BaseProductKey;
  priceVersionId?: string;
  effectiveAt: Date;
}

export interface ChangeBillingAnchorInput extends LifecycleActorContext {
  subscriptionId: string;
  anchorDay: number;
}

@Injectable()
export class SubscriptionLifecycleService {
  private readonly logger = new Logger(SubscriptionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: BillingAuditService,
    private readonly outbox: BillingDomainEventOutboxService,
    private readonly quantityLedger: BillingQuantityService,
  ) {}

  async createDraft(input: CreateDraftSubscriptionInput) {
    const org = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true },
    });
    if (!org) {
      throw new NotFoundException({
        code: SubscriptionLifecycleErrorCode.ORGANIZATION_NOT_FOUND,
        message: SubscriptionLifecycleErrorCode.ORGANIZATION_NOT_FOUND,
      });
    }

    const existing = await this.prisma.billingSubscription.findFirst({
      where: {
        organizationId: input.organizationId,
        status: { not: BillingStatus.CANCELLED },
        endedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return this.loadContract(existing.id);
    }

    const subscription = await this.prisma.$transaction(async (tx) => {
      const row = await tx.billingSubscription.create({
        data: {
          organizationId: input.organizationId,
          status: BillingStatus.TRIALING,
          currency: input.currency ?? 'EUR',
          createdByUserId: input.actorUserId ?? null,
          updatedByUserId: input.actorUserId ?? null,
        },
      });

      await this.outbox.enqueue(tx, {
        eventType: BillingDomainEventType.SUBSCRIPTION_CREATED,
        aggregateType: 'BillingSubscription',
        aggregateId: row.id,
        organizationId: input.organizationId,
        idempotencyKey: buildBillingOutboxIdempotencyKey([
          'subscription-created',
          row.id,
        ]),
        payload: {
          organizationId: input.organizationId,
          subscriptionId: row.id,
          status: SubscriptionStatus.DRAFT,
        },
      });

      return row;
    });

    await this.audit.log({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'SUBSCRIPTION_DRAFT_CREATED',
      entityType: 'BillingSubscription',
      entityId: subscription.id,
      after: subscription,
    });

    return this.loadContract(subscription.id);
  }

  async assignRental(input: AssignBasePlanInput) {
    return this.assignBasePlan('RENTAL', input);
  }

  async assignFleet(input: AssignBasePlanInput) {
    return this.assignBasePlan('FLEET', input);
  }

  async startTrial(input: StartTrialInput) {
    return this.transitionSubscription({
      subscriptionId: input.subscriptionId,
      toStatus: SubscriptionStatus.TRIALING,
      actorUserId: input.actorUserId,
      lockVersion: input.lockVersion,
      mutate: async ({ baseItem, tx, now }) => {
        if (!baseItem) {
          throw new ConflictException({
            code: SubscriptionLifecycleErrorCode.BASE_PLAN_NOT_ASSIGNED,
            message: SubscriptionLifecycleErrorCode.BASE_PLAN_NOT_ASSIGNED,
          });
        }

        const priceVersion = await this.requireActivatablePriceVersion(
          input.priceVersionId,
          now,
          tx,
        );

        await tx.billingSubscriptionItem.update({
          where: { id: baseItem.id },
          data: {
            status: BillingSubscriptionItemStatus.TRIALING,
            priceVersionId: priceVersion.id,
            priceBookId: priceVersion.priceBookId ?? baseItem.priceBookId,
            validFrom: now,
          },
        });

        return {
          status: BillingStatus.TRIALING,
          trialStartAt: now,
          trialEndAt: input.trialEndAt,
          priceBookId: priceVersion.priceBookId,
          priceVersionId: priceVersion.id,
        };
      },
    });
  }

  async activate(input: ActivateSubscriptionInput) {
    let activatedItemId: string | null = null;

    const result = await this.transitionSubscription({
      subscriptionId: input.subscriptionId,
      toStatus: SubscriptionStatus.ACTIVE,
      actorUserId: input.actorUserId,
      lockVersion: input.lockVersion,
      mutate: async ({ subscription, baseItem, tx, now }) => {
        if (!baseItem) {
          throw new ConflictException({
            code: SubscriptionLifecycleErrorCode.BASE_PLAN_NOT_ASSIGNED,
            message: SubscriptionLifecycleErrorCode.BASE_PLAN_NOT_ASSIGNED,
          });
        }

        const priceVersion = await this.requireActivatablePriceVersion(
          input.priceVersionId,
          now,
          tx,
        );

        const updatedItem = await tx.billingSubscriptionItem.update({
          where: { id: baseItem.id },
          data: {
            status: BillingSubscriptionItemStatus.ACTIVE,
            priceVersionId: priceVersion.id,
            priceBookId: input.priceBookId ?? priceVersion.priceBookId ?? baseItem.priceBookId,
            validFrom: baseItem.validFrom ?? now,
          },
        });
        activatedItemId = updatedItem.id;

        return {
          status: BillingStatus.ACTIVE,
          startedAt: subscription.startedAt ?? now,
          trialStartAt: subscription.trialStartAt,
          trialEndAt: subscription.trialEndAt,
          cancelAtPeriodEnd: false,
          cancelAt: null,
          priceBookId: priceVersion.priceBookId,
          priceVersionId: priceVersion.id,
        };
      },
    });

    if (activatedItemId) {
      await this.quantityLedger.recordSubscriptionActivated({
        organizationId: result.subscription.organizationId,
        subscriptionId: result.subscription.id,
        subscriptionItemId: activatedItemId,
        quantityDelta: Math.max(result.baseItem?.quantity ?? 0, 0) || 1,
        actorUserId: input.actorUserId,
        reason: 'Subscription activated',
        idempotencyKey: buildQuantityIdempotencyKey([
          'subscription-activated',
          result.subscription.id,
          activatedItemId,
        ]),
      });
    }

    return result;
  }

  async pause(input: LifecycleActorContext & { subscriptionId: string }) {
    let pausedItemId: string | null = null;
    let pausedQuantity = 1;

    const result = await this.transitionSubscription({
      subscriptionId: input.subscriptionId,
      toStatus: SubscriptionStatus.PAUSED,
      actorUserId: input.actorUserId,
      lockVersion: input.lockVersion,
      mutate: async ({ subscription, baseItem, tx }) => {
        if (!baseItem) {
          throw new ConflictException({
            code: SubscriptionLifecycleErrorCode.BASE_PLAN_NOT_ASSIGNED,
            message: SubscriptionLifecycleErrorCode.BASE_PLAN_NOT_ASSIGNED,
          });
        }

        await tx.billingSubscriptionItem.update({
          where: { id: baseItem.id },
          data: { status: BillingSubscriptionItemStatus.PAUSED },
        });
        pausedItemId = baseItem.id;
        pausedQuantity = Math.max(baseItem.quantity, 1);

        return { status: BillingStatus.ACTIVE };
      },
    });

    if (pausedItemId) {
      await this.quantityLedger.recordSubscriptionPaused({
        organizationId: result.subscription.organizationId,
        subscriptionId: result.subscription.id,
        subscriptionItemId: pausedItemId,
        quantityDelta: -pausedQuantity,
        actorUserId: input.actorUserId,
        reason: 'Subscription paused',
        idempotencyKey: buildQuantityIdempotencyKey(['subscription-paused', result.subscription.id]),
      });
    }

    return result;
  }

  async markPastDue(input: LifecycleActorContext & { subscriptionId: string }) {
    return this.transitionSubscription({
      subscriptionId: input.subscriptionId,
      toStatus: SubscriptionStatus.PAST_DUE,
      actorUserId: input.actorUserId,
      lockVersion: input.lockVersion,
      mutate: async () => ({ status: BillingStatus.PAST_DUE }),
    });
  }

  async reactivate(input: LifecycleActorContext & { subscriptionId: string }) {
    return this.transitionSubscription({
      subscriptionId: input.subscriptionId,
      toStatus: SubscriptionStatus.ACTIVE,
      actorUserId: input.actorUserId,
      lockVersion: input.lockVersion,
      mutate: async ({ subscription, baseItem, tx }) => {
        if (!baseItem) {
          throw new ConflictException({
            code: SubscriptionLifecycleErrorCode.BASE_PLAN_NOT_ASSIGNED,
            message: SubscriptionLifecycleErrorCode.BASE_PLAN_NOT_ASSIGNED,
          });
        }

        await tx.billingSubscriptionItem.update({
          where: { id: baseItem.id },
          data: { status: BillingSubscriptionItemStatus.ACTIVE },
        });

        return {
          status: BillingStatus.ACTIVE,
          cancelAtPeriodEnd: false,
          cancelAt: null,
        };
      },
    });
  }

  async scheduleCancelAtPeriodEnd(
    input: LifecycleActorContext & { subscriptionId: string; cancelAt?: Date | null },
  ) {
    return this.transitionSubscription({
      subscriptionId: input.subscriptionId,
      toStatus: SubscriptionStatus.CANCEL_SCHEDULED,
      actorUserId: input.actorUserId,
      lockVersion: input.lockVersion,
      mutate: async ({ subscription }) => ({
        status: BillingStatus.ACTIVE,
        cancelAtPeriodEnd: true,
        cancelAt: input.cancelAt ?? subscription.currentPeriodEnd ?? null,
      }),
    });
  }

  async cancelImmediately(
    input: LifecycleActorContext & { subscriptionId: string; allowImmediateCancel?: boolean },
  ) {
    if (!input.allowImmediateCancel) {
      throw new ForbiddenException({
        code: SubscriptionLifecycleErrorCode.IMMEDIATE_CANCEL_FORBIDDEN,
        message: SubscriptionLifecycleErrorCode.IMMEDIATE_CANCEL_FORBIDDEN,
      });
    }

    return this.transitionSubscription({
      subscriptionId: input.subscriptionId,
      toStatus: SubscriptionStatus.CANCELLED,
      actorUserId: input.actorUserId,
      lockVersion: input.lockVersion,
      allowImmediateCancel: true,
      mutate: async ({ subscription, baseItem, tx, now }) => {
        if (baseItem) {
          await tx.billingSubscriptionItem.update({
            where: { id: baseItem.id },
            data: {
              status: BillingSubscriptionItemStatus.CANCELLED,
              validTo: now,
            },
          });
        }

        return {
          status: BillingStatus.CANCELLED,
          cancelAtPeriodEnd: false,
          cancelAt: now,
          endedAt: now,
        };
      },
    });
  }

  async revokeCancellation(input: LifecycleActorContext & { subscriptionId: string }) {
    return this.reactivate(input);
  }

  async scheduleTariffChange(input: SchedulePlanChangeInput) {
    if (!input.productKey) {
      throw new ConflictException({
        code: SubscriptionLifecycleErrorCode.UNSUPPORTED_BASE_PRODUCT,
        message: SubscriptionLifecycleErrorCode.UNSUPPORTED_BASE_PRODUCT,
      });
    }

    return this.scheduleBasePlanReplacement({
      ...input,
      productKey: input.productKey,
      priceVersionId: input.priceVersionId,
    });
  }

  async schedulePriceVersionChange(input: SchedulePlanChangeInput) {
    if (!input.priceVersionId) {
      throw new ConflictException({
        code: SubscriptionLifecycleErrorCode.PRICE_VERSION_REQUIRED,
        message: SubscriptionLifecycleErrorCode.PRICE_VERSION_REQUIRED,
      });
    }

    return this.scheduleBasePlanReplacement({
      ...input,
      priceVersionId: input.priceVersionId,
    });
  }

  async changeBillingAnchor(input: ChangeBillingAnchorInput) {
    if (!Number.isInteger(input.anchorDay) || input.anchorDay < 1 || input.anchorDay > 28) {
      throw new ConflictException({
        code: SubscriptionLifecycleErrorCode.INVALID_ANCHOR_DAY,
        message: SubscriptionLifecycleErrorCode.INVALID_ANCHOR_DAY,
      });
    }

    const subscription = await this.requireSubscription(input.subscriptionId);
    const before = { ...subscription };

    const updated = await this.updateWithLock(subscription.id, subscription.lockVersion, {
      billingAnchorDay: input.anchorDay,
    }, input.lockVersion);

    await this.audit.log({
      organizationId: subscription.organizationId,
      actorUserId: input.actorUserId,
      action: 'SUBSCRIPTION_BILLING_ANCHOR_CHANGED',
      entityType: 'BillingSubscription',
      entityId: subscription.id,
      before,
      after: updated,
    });

    return this.loadContract(updated.id);
  }

  async getContractHistory(organizationId: string) {
    const [subscription, items, auditEntries] = await Promise.all([
      this.prisma.billingSubscription.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.billingSubscriptionItem.findMany({
        where: { organizationId },
        include: {
          billingProduct: { select: { key: true, name: true } },
          priceVersion: { select: { id: true, versionNumber: true, versionLabel: true, status: true } },
          priceBook: { select: { id: true, name: true, interval: true } },
        },
        orderBy: [{ validFrom: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.billingAuditLog.findMany({
        where: {
          organizationId,
          entityType: { in: ['BillingSubscription', 'BillingSubscriptionItem'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    return {
      organizationId,
      subscription,
      items,
      auditEntries,
      resolvedAt: new Date(),
    };
  }

  private async assignBasePlan(productKey: BaseProductKey, input: AssignBasePlanInput) {
    const subscription = await this.requireSubscription(input.subscriptionId);
    const currentStatus = await this.resolveCurrentStatus(subscription.id);

    if (
      currentStatus !== SubscriptionStatus.DRAFT &&
      currentStatus !== SubscriptionStatus.TRIALING &&
      currentStatus !== SubscriptionStatus.INCOMPLETE
    ) {
      assertTransitionAllowed(currentStatus, currentStatus);
    }

    const product = await this.prisma.billingCatalogProduct.findUnique({
      where: { key: productKey },
      select: { id: true, key: true },
    });
    if (!product) {
      throw new ConflictException({
        code: SubscriptionLifecycleErrorCode.UNSUPPORTED_BASE_PRODUCT,
        message: SubscriptionLifecycleErrorCode.UNSUPPORTED_BASE_PRODUCT,
      });
    }

    const activeBase = await this.findActiveBaseItem(subscription.organizationId);
    if (
      activeBase &&
      activeBase.status !== BillingSubscriptionItemStatus.DRAFT &&
      activeBase.status !== BillingSubscriptionItemStatus.ENDED &&
      activeBase.status !== BillingSubscriptionItemStatus.CANCELLED
    ) {
      const product = await this.prisma.billingCatalogProduct.findUnique({
        where: { id: activeBase.billingProductId },
        select: { key: true },
      });
      if (product?.key === productKey) {
        return this.loadContract(subscription.id);
      }
      throw new ConflictException({
        code: SubscriptionLifecycleErrorCode.BASE_PLAN_ALREADY_ACTIVE,
        message: SubscriptionLifecycleErrorCode.BASE_PLAN_ALREADY_ACTIVE,
      });
    }

    const now = new Date();

    const item = activeBase
      ? await this.prisma.billingSubscriptionItem.update({
          where: { id: activeBase.id },
          data: {
            billingProductId: product.id,
            priceBookId: input.priceBookId ?? activeBase.priceBookId,
            status: BillingSubscriptionItemStatus.DRAFT,
          },
        })
      : await this.prisma.billingSubscriptionItem.create({
          data: {
            subscriptionId: subscription.id,
            organizationId: subscription.organizationId,
            billingProductId: product.id,
            itemRole: BillingSubscriptionItemRole.BASE_PLAN,
            priceBookId: input.priceBookId ?? null,
            quantity: 0,
            validFrom: now,
            status: BillingSubscriptionItemStatus.DRAFT,
          },
        });

    await this.audit.log({
      organizationId: subscription.organizationId,
      actorUserId: input.actorUserId,
      action: 'SUBSCRIPTION_BASE_PLAN_ASSIGNED',
      entityType: 'BillingSubscriptionItem',
      entityId: item.id,
      after: { productKey, item },
    });

    return this.loadContract(subscription.id);
  }

  private async scheduleBasePlanReplacement(input: SchedulePlanChangeInput) {
    const subscription = await this.requireSubscription(input.subscriptionId);
    const baseItem = await this.findActiveBaseItem(subscription.organizationId);
    if (!baseItem) {
      throw new ConflictException({
        code: SubscriptionLifecycleErrorCode.BASE_PLAN_NOT_ASSIGNED,
        message: SubscriptionLifecycleErrorCode.BASE_PLAN_NOT_ASSIGNED,
      });
    }

    const now = new Date();
    const effectiveAt = input.effectiveAt;
    const priceVersion = input.priceVersionId
      ? await this.requireActivatablePriceVersion(input.priceVersionId, effectiveAt)
      : null;

    const product = input.productKey
      ? await this.prisma.billingCatalogProduct.findUniqueOrThrow({
          where: { key: input.productKey },
          select: { id: true },
        })
      : null;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.billingSubscriptionItem.update({
        where: { id: baseItem.id },
        data: {
          validTo: effectiveAt,
          status:
            effectiveAt <= now
              ? BillingSubscriptionItemStatus.ENDED
              : baseItem.status,
        },
      });

      const replacement = await tx.billingSubscriptionItem.create({
        data: {
          subscriptionId: subscription.id,
          organizationId: subscription.organizationId,
          billingProductId: product?.id ?? baseItem.billingProductId,
          itemRole: BillingSubscriptionItemRole.BASE_PLAN,
          priceBookId: priceVersion?.priceBookId ?? baseItem.priceBookId,
          priceVersionId: priceVersion?.id ?? baseItem.priceVersionId,
          quantity: baseItem.quantity,
          validFrom: effectiveAt,
          status:
            effectiveAt <= now
              ? BillingSubscriptionItemStatus.ACTIVE
              : BillingSubscriptionItemStatus.DRAFT,
          metadata: {
            scheduledReplacementOf: baseItem.id,
            scheduledAt: now.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      if (effectiveAt <= now) {
        await this.quantityLedger.recordBasePlanChanged({
          organizationId: subscription.organizationId,
          subscriptionId: subscription.id,
          subscriptionItemId: replacement.id,
          quantityDelta: 0,
          effectiveAt,
          actorUserId: input.actorUserId,
          reason: 'Base plan changed',
          idempotencyKey: buildQuantityIdempotencyKey([
            'base-plan-changed',
            subscription.id,
            replacement.id,
          ]),
          retroactiveAuthorized: true,
        });
      }

      if (priceVersion) {
        await tx.billingSubscription.update({
          where: { id: subscription.id },
          data: {
            priceBookId: priceVersion.priceBookId,
            priceVersionId: priceVersion.id,
            lockVersion: { increment: 1 },
          },
        });
      }

      return replacement;
    });

    await this.audit.log({
      organizationId: subscription.organizationId,
      actorUserId: input.actorUserId,
      action: 'SUBSCRIPTION_PLAN_CHANGE_SCHEDULED',
      entityType: 'BillingSubscriptionItem',
      entityId: result.id,
      after: result,
    });

    return this.loadContract(subscription.id);
  }

  private async transitionSubscription(params: {
    subscriptionId: string;
    toStatus: SubscriptionStatus;
    actorUserId?: string | null;
    lockVersion?: number;
    allowImmediateCancel?: boolean;
    mutate: (ctx: {
      subscription: Awaited<ReturnType<SubscriptionLifecycleService['requireSubscription']>>;
      baseItem: Awaited<ReturnType<SubscriptionLifecycleService['findActiveBaseItem']>>;
      tx: Prisma.TransactionClient;
      now: Date;
    }) => Promise<Prisma.BillingSubscriptionUpdateInput>;
  }) {
    const subscription = await this.requireSubscription(params.subscriptionId);
    const baseItem = await this.findActiveBaseItem(subscription.organizationId);
    const fromStatus = this.resolveStatusFromParts(subscription, baseItem?.status ?? null);

    try {
      assertTransitionAllowed(fromStatus, params.toStatus, {
        allowImmediateCancel: params.allowImmediateCancel,
      });
    } catch (error) {
      if (error instanceof SubscriptionLifecycleTransitionError) {
        throw new ConflictException({
          code: SubscriptionLifecycleErrorCode.INVALID_TRANSITION,
          fromStatus: error.fromStatus,
          toStatus: error.toStatus,
        });
      }
      throw error;
    }

    const now = new Date();
    const before = { subscription, baseItem };

    const updated = await this.prisma.$transaction(async (tx) => {
      const patch = await params.mutate({
        subscription,
        baseItem,
        tx,
        now,
      });

      const prismaStatus =
        patch.status != null
          ? (patch.status as BillingStatus)
          : mapSubscriptionDomainToPrismaBillingStatus(params.toStatus);

      const updateResult = await tx.billingSubscription.updateMany({
        where: {
          id: subscription.id,
          lockVersion: params.lockVersion ?? subscription.lockVersion,
        },
        data: {
          ...patch,
          status: prismaStatus,
          lockVersion: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          code: SubscriptionLifecycleErrorCode.OPTIMISTIC_LOCK_FAILED,
          message: SubscriptionLifecycleErrorCode.OPTIMISTIC_LOCK_FAILED,
        });
      }

      const row = await tx.billingSubscription.findUniqueOrThrow({ where: { id: subscription.id } });

      const eventType = resolveSubscriptionLifecycleOutboxEvent({
        fromStatus,
        toStatus: params.toStatus,
      });
      if (eventType) {
        await this.outbox.enqueue(tx, {
          eventType,
          aggregateType: 'BillingSubscription',
          aggregateId: subscription.id,
          organizationId: subscription.organizationId,
          idempotencyKey: buildBillingOutboxIdempotencyKey([
            'subscription-lifecycle',
            subscription.id,
            eventType,
            String(row.lockVersion),
          ]),
          payload: {
            organizationId: subscription.organizationId,
            subscriptionId: subscription.id,
            fromStatus,
            toStatus: params.toStatus,
            actorUserId: params.actorUserId ?? null,
          },
        });
      }

      return row;
    });

    await this.audit.log({
      organizationId: subscription.organizationId,
      actorUserId: params.actorUserId,
      action: 'SUBSCRIPTION_STATUS_TRANSITION',
      entityType: 'BillingSubscription',
      entityId: subscription.id,
      before,
      after: updated,
    });

    return this.loadContract(updated.id);
  }

  private async updateWithLock(
    subscriptionId: string,
    currentLockVersion: number,
    data: Prisma.BillingSubscriptionUpdateInput,
    expectedLockVersion?: number,
  ) {
    const result = await this.prisma.billingSubscription.updateMany({
      where: {
        id: subscriptionId,
        lockVersion: expectedLockVersion ?? currentLockVersion,
      },
      data: {
        ...data,
        lockVersion: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new ConflictException({
        code: SubscriptionLifecycleErrorCode.OPTIMISTIC_LOCK_FAILED,
        message: SubscriptionLifecycleErrorCode.OPTIMISTIC_LOCK_FAILED,
      });
    }

    return this.prisma.billingSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
  }

  private async requireActivatablePriceVersion(
    priceVersionId: string,
    asOf: Date,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (!priceVersionId) {
      throw new ConflictException({
        code: SubscriptionLifecycleErrorCode.PRICE_VERSION_REQUIRED,
        message: SubscriptionLifecycleErrorCode.PRICE_VERSION_REQUIRED,
      });
    }

    const version = await tx.billingPriceVersion.findUnique({
      where: { id: priceVersionId },
      select: {
        id: true,
        priceBookId: true,
        status: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    });

    if (!version) {
      throw new NotFoundException({
        code: SubscriptionLifecycleErrorCode.PRICE_VERSION_NOT_FOUND,
        message: SubscriptionLifecycleErrorCode.PRICE_VERSION_NOT_FOUND,
      });
    }

    if (version.status === BillingPriceVersionStatus.ARCHIVED) {
      throw new ConflictException({
        code: SubscriptionLifecycleErrorCode.PRICE_VERSION_ARCHIVED,
        message: SubscriptionLifecycleErrorCode.PRICE_VERSION_ARCHIVED,
      });
    }

    if (version.status !== BillingPriceVersionStatus.ACTIVE) {
      throw new ConflictException({
        code: SubscriptionLifecycleErrorCode.PRICE_VERSION_NOT_ACTIVE,
        message: SubscriptionLifecycleErrorCode.PRICE_VERSION_NOT_ACTIVE,
      });
    }

    if (version.effectiveFrom && version.effectiveFrom > asOf) {
      throw new ConflictException({
        code: SubscriptionLifecycleErrorCode.PRICE_VERSION_NOT_ACTIVE,
        message: SubscriptionLifecycleErrorCode.PRICE_VERSION_NOT_ACTIVE,
      });
    }

    if (version.effectiveTo && version.effectiveTo < asOf) {
      throw new ConflictException({
        code: SubscriptionLifecycleErrorCode.PRICE_VERSION_NOT_ACTIVE,
        message: SubscriptionLifecycleErrorCode.PRICE_VERSION_NOT_ACTIVE,
      });
    }

    return version;
  }

  private async requireSubscription(subscriptionId: string) {
    const subscription = await this.prisma.billingSubscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!subscription) {
      throw new NotFoundException({
        code: SubscriptionLifecycleErrorCode.SUBSCRIPTION_NOT_FOUND,
        message: SubscriptionLifecycleErrorCode.SUBSCRIPTION_NOT_FOUND,
      });
    }
    return subscription;
  }

  private async findActiveBaseItem(organizationId: string) {
    return this.prisma.billingSubscriptionItem.findFirst({
      where: {
        organizationId,
        itemRole: BillingSubscriptionItemRole.BASE_PLAN,
        status: {
          in: [
            BillingSubscriptionItemStatus.DRAFT,
            BillingSubscriptionItemStatus.TRIALING,
            BillingSubscriptionItemStatus.ACTIVE,
            BillingSubscriptionItemStatus.PAUSED,
          ],
        },
      },
      orderBy: { validFrom: 'desc' },
    });
  }

  private resolveStatusFromParts(
    subscription: {
      status: BillingStatus;
      cancelAtPeriodEnd: boolean;
      trialStartAt: Date | null;
      startedAt: Date | null;
      endedAt: Date | null;
    },
    baseItemStatus: BillingSubscriptionItemStatus | null,
  ) {
    return resolveSubscriptionDomainStatus({
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      trialStartAt: subscription.trialStartAt,
      startedAt: subscription.startedAt,
      endedAt: subscription.endedAt,
      baseItemStatus,
    });
  }

  private async resolveCurrentStatus(subscriptionId: string) {
    const subscription = await this.requireSubscription(subscriptionId);
    const baseItem = await this.findActiveBaseItem(subscription.organizationId);
    return this.resolveStatusFromParts(subscription, baseItem?.status ?? null);
  }

  async getContractState(subscriptionId: string) {
    return this.loadContract(subscriptionId);
  }

  private async loadContract(subscriptionId: string) {
    const subscription = await this.requireSubscription(subscriptionId);
    const [baseItem, items] = await Promise.all([
      this.findActiveBaseItem(subscription.organizationId),
      this.prisma.billingSubscriptionItem.findMany({
        where: { subscriptionId },
        include: {
          billingProduct: { select: { key: true, name: true } },
          priceVersion: { select: { id: true, versionNumber: true, status: true } },
        },
        orderBy: { validFrom: 'desc' },
      }),
    ]);

    const domainStatus = this.resolveStatusFromParts(subscription, baseItem?.status ?? null);

    return {
      subscription,
      domainStatus,
      baseItem,
      items,
      lockVersion: subscription.lockVersion,
    };
  }
}

export { SubscriptionLifecycleTransitionError };
