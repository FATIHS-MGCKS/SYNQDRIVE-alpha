import Stripe from 'stripe';
import {
  BillingDiscountStatus,
  BillingStripeMappingStatus,
  BillingStripeMode,
  BillingSubscriptionItemStatus,
  Prisma,
} from '@prisma/client';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { getStripeClient } from './stripe-client.util';
import { StripeCatalogMappingService } from './stripe-catalog-mapping.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { BillingEventPublisher } from './events/billing-event.publisher';
import { SyncStatus, SubscriptionStatus } from './domain/billing-domain.types';
import { StripeCatalogMappingErrorCode } from './domain/stripe-catalog-mapping';
import {
  StripeSubscriptionLinePlan,
  StripeSubscriptionOrchestratorErrorCode,
  StripeSubscriptionOrchestratorResult,
  STRIPE_SUBSCRIPTION_SYNC_MAX_RETRIES,
  STRIPE_SUBSCRIPTION_SYNC_RATE_LIMIT_DELAY_MS,
  buildStripeSubscriptionIdempotencyKey,
  buildStripeSubscriptionMetadata,
  computeBillingCycleAnchorUnix,
  isSyncableSubscriptionItem,
  mapProrationBehaviorToStripe,
  mapStripeMappingStatusToSyncStatus,
  resolveStripeItemQuantity,
  resolveTrialEndUnix,
  truncateSubscriptionSyncError,
  translateStripeSubscriptionProviderError,
} from './domain/stripe-subscription-orchestrator';

export interface SyncStripeSubscriptionInput {
  organizationId: string;
  subscriptionId?: string;
  actorUserId?: string | null;
}

@Injectable()
export class StripeSubscriptionOrchestratorService {
  private readonly logger = new Logger(StripeSubscriptionOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly catalogMappings: StripeCatalogMappingService,
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly events: BillingEventPublisher,
  ) {}

  async syncOrganizationSubscription(
    input: SyncStripeSubscriptionInput,
  ): Promise<StripeSubscriptionOrchestratorResult> {
    const stripeMode = this.requireRuntimeStripeMode();
    const subscription = await this.resolveSubscription(input);
    const contract = await this.lifecycle.getContractState(subscription.id);
    const now = new Date();

    const syncableItems = contract.items.filter((item) =>
      isSyncableSubscriptionItem(item, now),
    );

    if (syncableItems.length === 0) {
      await this.persistSyncFailure(subscription.id, StripeSubscriptionOrchestratorErrorCode.NO_SYNCABLE_ITEMS);
      throw new ConflictException({
        code: StripeSubscriptionOrchestratorErrorCode.NO_SYNCABLE_ITEMS,
        message: StripeSubscriptionOrchestratorErrorCode.NO_SYNCABLE_ITEMS,
      });
    }

    try {
      const stripe = this.requireStripe();
      const customerId = await this.ensureCustomerForOrganization(input.organizationId);
      const linePlans = await this.buildLinePlans({
        organizationId: input.organizationId,
        subscription,
        items: syncableItems,
        stripeMode,
      });
      const discounts = await this.resolveStripeDiscounts(subscription.id, stripeMode);
      const metadata = buildStripeSubscriptionMetadata({
        organizationId: input.organizationId,
        subscriptionId: subscription.id,
      });
      const removedItems = await this.findRemovedStripeItems(subscription.id, stripeMode, syncableItems);
      const prorationBehavior = mapProrationBehaviorToStripe(
        syncableItems.find((item) => item.itemRole === 'BASE_PLAN')?.prorationBehavior ??
          syncableItems[0].prorationBehavior,
      );

      const existingStripeSub = await this.findExistingStripeSubscription({
        stripe,
        customerId,
        organizationId: input.organizationId,
        subscription,
        stripeMode,
      });

      let stripeSub: Stripe.Subscription;
      let created = false;

      if (existingStripeSub) {
        stripeSub = await this.updateStripeSubscription({
          stripe,
          existingStripeSub,
          linePlans,
          removedItems,
          metadata,
          discounts,
          prorationBehavior,
          subscription,
          contractDomainStatus: contract.domainStatus,
        });
      } else {
        stripeSub = await this.createStripeSubscription({
          stripe,
          customerId,
          subscription,
          linePlans,
          metadata,
          discounts,
          contractDomainStatus: contract.domainStatus,
          stripeMode,
        });
        created = true;
      }

      await this.persistStripeMappings({
        subscriptionId: subscription.id,
        organizationId: input.organizationId,
        stripeMode,
        stripeCustomerId: customerId,
        stripeSub,
        linePlans,
        removedItems,
      });

      const result: StripeSubscriptionOrchestratorResult = {
        organizationId: input.organizationId,
        subscriptionId: subscription.id,
        stripeMode,
        stripeCustomerId: customerId,
        stripeSubscriptionId: stripeSub.id,
        syncStatus: SyncStatus.SYNCED,
        created,
        updated: !created,
        removedItemCount: removedItems.length,
        itemCount: linePlans.length,
        message: null,
        lastError: null,
      };

      await this.events.publishSubscriptionSynced(input.organizationId, {
        subscriptionId: subscription.id,
        stripeSubscriptionId: stripeSub.id,
        stripeMode,
        itemCount: linePlans.length,
        created,
      }, subscription.id);

      return result;
    } catch (error) {
      const translated = this.translateError(error);
      await this.persistSyncFailure(subscription.id, translated.message, {
        driftDetected: translated.code === StripeSubscriptionOrchestratorErrorCode.DUPLICATE_STRIPE_SUBSCRIPTION,
      });
      throw this.toHttpException(translated);
    }
  }

  async retrySyncOrganizationSubscription(
    organizationId: string,
    subscriptionId?: string,
  ): Promise<StripeSubscriptionOrchestratorResult> {
    return this.syncOrganizationSubscription({ organizationId, subscriptionId });
  }

  private async buildLinePlans(input: {
    organizationId: string;
    subscription: { id: string; priceVersionId: string | null };
    items: Array<{
      id: string;
      itemRole: StripeSubscriptionLinePlan['itemRole'];
      priceVersionId: string | null;
      quantity: number;
      prorationBehavior: StripeSubscriptionLinePlan['prorationBehavior'];
      stripeSubscriptionItemId: string | null;
      stripeMode: BillingStripeMode | null;
    }>;
    stripeMode: BillingStripeMode;
  }): Promise<StripeSubscriptionLinePlan[]> {
    const plans: StripeSubscriptionLinePlan[] = [];

    for (const item of input.items) {
      const priceVersionId = item.priceVersionId;
      if (!priceVersionId) {
        throw new ConflictException({
          code: StripeSubscriptionOrchestratorErrorCode.MAPPING_MISSING,
          message: StripeSubscriptionOrchestratorErrorCode.MAPPING_MISSING,
        });
      }

      const resolved = await this.catalogMappings.resolveStripePrice({
        organizationId: input.organizationId,
        priceVersionId,
        subscriptionPriceVersionId: input.subscription.priceVersionId,
        subscriptionItemPriceVersionId: priceVersionId,
        allowLegacyFallback: false,
      });

      if (resolved.stripeMode !== input.stripeMode) {
        throw new ConflictException({
          code: StripeSubscriptionOrchestratorErrorCode.STRIPE_MODE_MISMATCH,
          message: StripeSubscriptionOrchestratorErrorCode.STRIPE_MODE_MISMATCH,
        });
      }

      plans.push({
        localItemId: item.id,
        itemRole: item.itemRole,
        priceVersionId,
        stripePriceId: resolved.stripePriceId,
        quantity: resolveStripeItemQuantity(item.quantity),
        prorationBehavior: item.prorationBehavior,
        existingStripeItemId:
          item.stripeMode === input.stripeMode ? item.stripeSubscriptionItemId : null,
      });
    }

    return plans;
  }

  private async resolveStripeDiscounts(subscriptionId: string, stripeMode: BillingStripeMode) {
    const now = new Date();
    const rows = await this.prisma.billingDiscount.findMany({
      where: {
        subscriptionId,
        status: BillingDiscountStatus.ACTIVE,
        validFrom: { lte: now },
        stripeCouponId: { not: null },
        AND: [
          { OR: [{ validTo: null }, { validTo: { gt: now } }] },
          { OR: [{ stripeMode: null }, { stripeMode }] },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows
      .filter((row) => row.stripeCouponId)
      .map((row) => ({
        couponId: row.stripeCouponId!,
        discountId: row.id,
      }));
  }

  private async findRemovedStripeItems(
    subscriptionId: string,
    stripeMode: BillingStripeMode,
    syncableItems: Array<{ id: string }>,
  ) {
    const syncableIds = new Set(syncableItems.map((item) => item.id));
    const rows = await this.prisma.billingSubscriptionItem.findMany({
      where: {
        subscriptionId,
        stripeSubscriptionItemId: { not: null },
        stripeMode,
      },
      select: {
        id: true,
        stripeSubscriptionItemId: true,
        status: true,
        prorationBehavior: true,
      },
    });

    return rows.filter(
      (row) =>
        !syncableIds.has(row.id) ||
        row.status === BillingSubscriptionItemStatus.ENDED ||
        row.status === BillingSubscriptionItemStatus.CANCELLED,
    );
  }

  private async findExistingStripeSubscription(input: {
    stripe: Stripe;
    customerId: string;
    organizationId: string;
    subscription: {
      id: string;
      stripeSubscriptionId: string | null;
      stripeMode: BillingStripeMode | null;
    };
    stripeMode: BillingStripeMode;
  }): Promise<Stripe.Subscription | null> {
    if (
      input.subscription.stripeSubscriptionId &&
      input.subscription.stripeMode === input.stripeMode
    ) {
      return this.executeStripeCall(() =>
        input.stripe.subscriptions.retrieve(input.subscription.stripeSubscriptionId!),
      );
    }

    const list = await this.executeStripeCall(() =>
      input.stripe.subscriptions.list({
        customer: input.customerId,
        status: 'all',
        limit: 20,
      }),
    );

    const metadataMatches = list.data.filter((row) => {
      const metadata = row.metadata ?? {};
      return (
        metadata.organizationId === input.organizationId &&
        metadata.synqdriveSubscriptionId === input.subscription.id
      );
    });

    if (metadataMatches.length > 1) {
      throw new ConflictException({
        code: StripeSubscriptionOrchestratorErrorCode.DUPLICATE_STRIPE_SUBSCRIPTION,
        message: StripeSubscriptionOrchestratorErrorCode.DUPLICATE_STRIPE_SUBSCRIPTION,
      });
    }

    if (metadataMatches.length === 1) {
      return metadataMatches[0]!;
    }

    const activeForOrg = list.data.filter((row) => {
      const metadata = row.metadata ?? {};
      return (
        metadata.organizationId === input.organizationId &&
        ['active', 'trialing', 'past_due', 'unpaid'].includes(row.status)
      );
    });

    if (activeForOrg.length > 1) {
      throw new ConflictException({
        code: StripeSubscriptionOrchestratorErrorCode.DUPLICATE_STRIPE_SUBSCRIPTION,
        message: StripeSubscriptionOrchestratorErrorCode.DUPLICATE_STRIPE_SUBSCRIPTION,
      });
    }

    return activeForOrg[0] ?? null;
  }

  private async createStripeSubscription(input: {
    stripe: Stripe;
    customerId: string;
    subscription: {
      id: string;
      trialEndAt: Date | null;
      billingAnchorDay: number | null;
    };
    linePlans: StripeSubscriptionLinePlan[];
    metadata: Record<string, string>;
    discounts: Array<{ couponId: string }>;
    contractDomainStatus: SubscriptionStatus;
    stripeMode: BillingStripeMode;
  }) {
    const trialEnd = resolveTrialEndUnix(
      input.contractDomainStatus === SubscriptionStatus.TRIALING
        ? input.subscription.trialEndAt
        : null,
    );

    const params: Stripe.SubscriptionCreateParams = {
      customer: input.customerId,
      items: input.linePlans.map((line) => ({
        price: line.stripePriceId,
        quantity: line.quantity,
        metadata: {
          synqdriveSubscriptionItemId: line.localItemId,
          synqdriveItemRole: line.itemRole,
        },
      })),
      metadata: input.metadata,
      proration_behavior: mapProrationBehaviorToStripe(input.linePlans[0]?.prorationBehavior),
    };

    if (input.discounts.length > 0) {
      params.discounts = input.discounts.map((discount) => ({ coupon: discount.couponId }));
    }

    if (trialEnd) {
      params.trial_end = trialEnd;
    }

    if (input.subscription.billingAnchorDay) {
      params.billing_cycle_anchor = computeBillingCycleAnchorUnix(
        input.subscription.billingAnchorDay,
      );
    }

    return this.executeStripeCall(() =>
      input.stripe.subscriptions.create(params, {
        idempotencyKey: buildStripeSubscriptionIdempotencyKey(
          input.subscription.id,
          input.stripeMode,
        ),
      }),
    );
  }

  private async updateStripeSubscription(input: {
    stripe: Stripe;
    existingStripeSub: Stripe.Subscription;
    linePlans: StripeSubscriptionLinePlan[];
    removedItems: Array<{
      stripeSubscriptionItemId: string | null;
      prorationBehavior: StripeSubscriptionLinePlan['prorationBehavior'];
    }>;
    metadata: Record<string, string>;
    discounts: Array<{ couponId: string }>;
    prorationBehavior: ReturnType<typeof mapProrationBehaviorToStripe>;
    subscription: { trialEndAt: Date | null };
    contractDomainStatus: SubscriptionStatus;
  }) {
    const existingByStripeItemId = new Map(
      input.existingStripeSub.items.data.map((item) => [item.id, item]),
    );
    const existingByLocalItem = new Map<string, string>();

    for (const stripeItem of input.existingStripeSub.items.data) {
      const localItemId = stripeItem.metadata?.synqdriveSubscriptionItemId;
      if (localItemId) {
        existingByLocalItem.set(localItemId, stripeItem.id);
      }
    }

    const updateItems: Stripe.SubscriptionUpdateParams.Item[] = [];

    for (const line of input.linePlans) {
      const stripeItemId =
        line.existingStripeItemId ??
        existingByLocalItem.get(line.localItemId) ??
        null;

      if (stripeItemId && existingByStripeItemId.has(stripeItemId)) {
        const current = existingByStripeItemId.get(stripeItemId)!;
        const currentPriceId =
          typeof current.price === 'string' ? current.price : current.price?.id;
        if (currentPriceId === line.stripePriceId && current.quantity === line.quantity) {
          continue;
        }
        updateItems.push({
          id: stripeItemId,
          price: line.stripePriceId,
          quantity: line.quantity,
        });
      } else {
        updateItems.push({
          price: line.stripePriceId,
          quantity: line.quantity,
          metadata: {
            synqdriveSubscriptionItemId: line.localItemId,
            synqdriveItemRole: line.itemRole,
          },
        });
      }
    }

    for (const removed of input.removedItems) {
      if (!removed.stripeSubscriptionItemId) {
        continue;
      }
      updateItems.push({
        id: removed.stripeSubscriptionItemId,
        deleted: true,
      });
    }

    const trialEnd = resolveTrialEndUnix(
      input.contractDomainStatus === SubscriptionStatus.TRIALING
        ? input.subscription.trialEndAt
        : null,
    );

    const params: Stripe.SubscriptionUpdateParams = {
      metadata: input.metadata,
      proration_behavior: input.prorationBehavior,
    };

    if (input.discounts.length > 0) {
      params.discounts = input.discounts.map((discount) => ({ coupon: discount.couponId }));
    }

    if (updateItems.length > 0) {
      params.items = updateItems;
    }

    if (trialEnd) {
      params.trial_end = trialEnd;
    }

    return this.executeStripeCall(() =>
      input.stripe.subscriptions.update(input.existingStripeSub.id, params),
    );
  }

  private async persistStripeMappings(input: {
    subscriptionId: string;
    organizationId: string;
    stripeMode: BillingStripeMode;
    stripeCustomerId: string;
    stripeSub: Stripe.Subscription;
    linePlans: StripeSubscriptionLinePlan[];
    removedItems: Array<{ id: string; stripeSubscriptionItemId: string | null }>;
  }) {
    const stripeItemByLocalId = new Map<string, string>();
    for (const stripeItem of input.stripeSub.items.data) {
      const localItemId = stripeItem.metadata?.synqdriveSubscriptionItemId;
      if (localItemId) {
        stripeItemByLocalId.set(localItemId, stripeItem.id);
      }
    }

    await this.prisma.billingSubscription.update({
      where: { id: input.subscriptionId },
      data: {
        stripeSubscriptionId: input.stripeSub.id,
        stripeCustomerId: input.stripeCustomerId,
        stripeMode: input.stripeMode,
        stripeSyncStatus: BillingStripeMappingStatus.SYNCED,
        lastStripeSyncedAt: new Date(),
        lastStripeSyncError: null,
        currentPeriodStart: input.stripeSub.current_period_start
          ? new Date(input.stripeSub.current_period_start * 1000)
          : null,
        currentPeriodEnd: input.stripeSub.current_period_end
          ? new Date(input.stripeSub.current_period_end * 1000)
          : null,
        cancelAtPeriodEnd: input.stripeSub.cancel_at_period_end ?? false,
      },
    });

    for (const line of input.linePlans) {
      const stripeItemId = stripeItemByLocalId.get(line.localItemId);
      if (!stripeItemId) {
        continue;
      }
      await this.prisma.billingSubscriptionItem.update({
        where: { id: line.localItemId },
        data: {
          stripeSubscriptionItemId: stripeItemId,
          stripeMode: input.stripeMode,
        },
      });
    }

    for (const removed of input.removedItems) {
      await this.prisma.billingSubscriptionItem.update({
        where: { id: removed.id },
        data: {
          stripeSubscriptionItemId: null,
        },
      });
    }
  }

  private async persistSyncFailure(
    subscriptionId: string,
    message: string,
    opts?: { driftDetected?: boolean },
  ) {
    await this.prisma.billingSubscription.update({
      where: { id: subscriptionId },
      data: {
        stripeSyncStatus: opts?.driftDetected
          ? BillingStripeMappingStatus.DRIFTED
          : BillingStripeMappingStatus.FAILED,
        lastStripeSyncError: truncateSubscriptionSyncError(message),
      },
    });
  }

  private async resolveSubscription(input: SyncStripeSubscriptionInput) {
    if (input.subscriptionId) {
      const row = await this.prisma.billingSubscription.findFirst({
        where: {
          id: input.subscriptionId,
          organizationId: input.organizationId,
        },
      });
      if (!row) {
        throw new NotFoundException({
          code: StripeSubscriptionOrchestratorErrorCode.SUBSCRIPTION_NOT_FOUND,
          message: StripeSubscriptionOrchestratorErrorCode.SUBSCRIPTION_NOT_FOUND,
        });
      }
      return row;
    }

    const row = await this.prisma.billingSubscription.findFirst({
      where: {
        organizationId: input.organizationId,
        endedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!row) {
      throw new NotFoundException({
        code: StripeSubscriptionOrchestratorErrorCode.SUBSCRIPTION_NOT_FOUND,
        message: StripeSubscriptionOrchestratorErrorCode.SUBSCRIPTION_NOT_FOUND,
      });
    }

    return row;
  }

  private async ensureCustomerForOrganization(organizationId: string): Promise<string> {
    const existing = await this.prisma.billingSubscription.findFirst({
      where: { organizationId, stripeCustomerId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { stripeCustomerId: true },
    });
    if (existing?.stripeCustomerId) {
      return existing.stripeCustomerId;
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        companyName: true,
        legalCompanyName: true,
        email: true,
        invoiceEmail: true,
        managerEmail: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        country: true,
      },
    });
    if (!org) {
      throw new NotFoundException({
        code: StripeSubscriptionOrchestratorErrorCode.SUBSCRIPTION_NOT_FOUND,
        message: StripeSubscriptionOrchestratorErrorCode.SUBSCRIPTION_NOT_FOUND,
      });
    }

    const stripe = this.requireStripe();
    const customer = await this.executeStripeCall(() =>
      stripe.customers.create({
        email: org.invoiceEmail || org.email || org.managerEmail || undefined,
        name: org.legalCompanyName || org.companyName,
        phone: org.phone || undefined,
        metadata: {
          organizationId: org.id,
          synqdrive: 'true',
        },
        address: org.address
          ? {
              line1: org.address,
              city: org.city || undefined,
              state: org.state || undefined,
              postal_code: org.zip || undefined,
              country: org.country || undefined,
            }
          : undefined,
      }),
    );

    const subscription =
      (await this.prisma.billingSubscription.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      })) ??
      (await this.prisma.billingSubscription.create({
        data: { organizationId },
      }));

    await this.prisma.billingSubscription.update({
      where: { id: subscription.id },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  private requireStripe(): Stripe {
    const client = getStripeClient(this.configService.get<string>('stripe.secretKey'));
    if (!client) {
      throw new HttpException(
        {
          code: StripeSubscriptionOrchestratorErrorCode.NOT_CONFIGURED,
          message: StripeSubscriptionOrchestratorErrorCode.NOT_CONFIGURED,
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
          await this.delay(STRIPE_SUBSCRIPTION_SYNC_RATE_LIMIT_DELAY_MS * attempt);
        } else {
          await this.delay(STRIPE_SUBSCRIPTION_SYNC_RATE_LIMIT_DELAY_MS);
        }
        return await fn();
      } catch (error) {
        const translated = translateStripeSubscriptionProviderError(error);
        if (
          translated.code === StripeSubscriptionOrchestratorErrorCode.RATE_LIMITED &&
          attempt < STRIPE_SUBSCRIPTION_SYNC_MAX_RETRIES
        ) {
          attempt += 1;
          continue;
        }
        throw error;
      }
    }
  }

  private translateError(error: unknown): { code: string; message: string } {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (response && typeof response === 'object' && 'code' in response) {
        return {
          code: String((response as { code: string }).code),
          message: String(
            (response as { message?: string }).message ?? (response as { code: string }).code,
          ),
        };
      }
    }

    if (error && typeof error === 'object' && 'type' in error) {
      return translateStripeSubscriptionProviderError(error);
    }

    if (error && typeof error === 'object' && 'code' in error) {
      const code = String((error as { code: string }).code);
      if (Object.values(StripeSubscriptionOrchestratorErrorCode).includes(code as never)) {
        return {
          code,
          message: error instanceof Error ? error.message : code,
        };
      }
    }

    return translateStripeSubscriptionProviderError(error);
  }

  private toHttpException(error: { code: string; message: string }): HttpException {
    if (error.code === StripeSubscriptionOrchestratorErrorCode.NOT_CONFIGURED) {
      return new HttpException({ code: error.code, message: error.message }, HttpStatus.NOT_IMPLEMENTED);
    }
    if (
      error.code === StripeSubscriptionOrchestratorErrorCode.PROVIDER_TIMEOUT ||
      error.code === StripeSubscriptionOrchestratorErrorCode.RATE_LIMITED
    ) {
      return new HttpException({ code: error.code, message: error.message }, HttpStatus.GATEWAY_TIMEOUT);
    }
    if (error.code === StripeSubscriptionOrchestratorErrorCode.SUBSCRIPTION_NOT_FOUND) {
      return new NotFoundException({ code: error.code, message: error.message });
    }
    return new ConflictException({ code: error.code, message: error.message });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  mapPersistedSyncStatus(status: string): SyncStatus {
    return mapStripeMappingStatusToSyncStatus(status);
  }
}
