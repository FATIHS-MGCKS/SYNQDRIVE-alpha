import Stripe from 'stripe';
import {
  BillingPriceVersionStatus,
  BillingStripeMode,
  BillingStatus,
  Prisma,
} from '@prisma/client';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { getStripeClient } from '../stripe-client.util';
import { StripeCatalogMappingService } from '../stripe-catalog-mapping.service';
import { StripeCatalogSyncService } from '../stripe-catalog-sync.service';
import { StripeSubscriptionOrchestratorService } from '../stripe-subscription-orchestrator.service';
import { BillingReconciliationService } from '../billing-reconciliation.service';
import { BillingAuditService } from '../billing-audit.service';
import { resolveStripeModeFromSecretKey } from './billing-legacy-backfill.util';
import {
  BillingSandboxCanonicalizationAction,
  BillingSandboxCanonicalizationInput,
  BillingSandboxCanonicalizationReport,
} from './billing-sandbox-canonicalization.types';

@Injectable()
export class BillingSandboxCanonicalizationService {
  private readonly logger = new Logger(BillingSandboxCanonicalizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly catalogMappings: StripeCatalogMappingService,
    private readonly catalogSync: StripeCatalogSyncService,
    private readonly subscriptionOrchestrator: StripeSubscriptionOrchestratorService,
    private readonly reconciliation: BillingReconciliationService,
    private readonly audit: BillingAuditService,
  ) {}

  async run(
    input: BillingSandboxCanonicalizationInput = {},
  ): Promise<BillingSandboxCanonicalizationReport> {
    const dryRun = input.dryRun !== false;
    const runtimeStripeMode = this.requireRuntimeStripeMode();
    const actions: BillingSandboxCanonicalizationAction[] = [];

    if (runtimeStripeMode !== BillingStripeMode.TEST) {
      throw new ConflictException(
        'Sandbox canonicalization requires TEST runtime. Live cutover is intentionally deferred.',
      );
    }

    actions.push({
      phase: 'environment_audit',
      entityType: 'Runtime',
      entityId: 'stripe',
      detail: `runtime=${runtimeStripeMode} nodeEnv=${process.env.NODE_ENV ?? 'unknown'}`,
      outcome: 'applied',
    });

    const subscriptions = await this.prisma.billingSubscription.findMany({
      where: input.organizationId ? { organizationId: input.organizationId } : undefined,
      include: {
        items: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const stripe = this.requireStripe();

    for (const subscription of subscriptions) {
      if (subscription.stripeMode && subscription.stripeMode !== runtimeStripeMode) {
        const correction = await this.correctSubscriptionStripeMode({
          subscription,
          runtimeStripeMode,
          stripe,
          dryRun,
        });
        actions.push(correction);
      }
    }

    if (!input.skipCatalogSync) {
      const publishedVersions = await this.prisma.billingPriceVersion.findMany({
        where: {
          status: BillingPriceVersionStatus.PUBLISHED,
          priceBook: {
            billingProduct: {
              isActive: true,
            },
          },
        },
        select: {
          id: true,
          priceBook: {
            select: {
              billingProduct: {
                select: { key: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      for (const version of publishedVersions) {
        const productKey = version.priceBook.billingProduct?.key ?? 'unknown';
        if (dryRun) {
          actions.push({
            phase: 'catalog_sync',
            entityType: 'BillingPriceVersion',
            entityId: version.id,
            detail: `Would sync published price version for ${productKey}`,
            outcome: 'planned',
          });
          continue;
        }

        try {
          await this.catalogSync.syncPriceVersion({
            priceVersionId: version.id,
            stripeMode: runtimeStripeMode,
          });
          actions.push({
            phase: 'catalog_sync',
            entityType: 'BillingPriceVersion',
            entityId: version.id,
            detail: `Synced published price version for ${productKey}`,
            outcome: 'applied',
          });
        } catch (error) {
          actions.push({
            phase: 'catalog_sync',
            entityType: 'BillingPriceVersion',
            entityId: version.id,
            detail: `Failed: ${(error as Error).message}`,
            outcome: 'failed',
          });
        }
      }
    }

    if (!input.skipSubscriptionSync) {
      for (const subscription of subscriptions) {
        const expectsStripe =
          subscription.status === BillingStatus.ACTIVE ||
          subscription.status === BillingStatus.PAST_DUE ||
          subscription.status === BillingStatus.TRIALING;

        if (!expectsStripe || subscription.stripeSubscriptionId) {
          continue;
        }

        if (dryRun) {
          actions.push({
            phase: 'subscription_sync',
            entityType: 'BillingSubscription',
            entityId: subscription.id,
            detail: `Would sync Stripe subscription for org ${subscription.organizationId}`,
            outcome: 'planned',
          });
          continue;
        }

        try {
          await this.subscriptionOrchestrator.syncOrganizationSubscription({
            organizationId: subscription.organizationId,
            subscriptionId: subscription.id,
          });
          actions.push({
            phase: 'subscription_sync',
            entityType: 'BillingSubscription',
            entityId: subscription.id,
            detail: `Synced Stripe subscription for org ${subscription.organizationId}`,
            outcome: 'applied',
          });
        } catch (error) {
          actions.push({
            phase: 'subscription_sync',
            entityType: 'BillingSubscription',
            entityId: subscription.id,
            detail: `Failed: ${(error as Error).message}`,
            outcome: 'failed',
          });
        }
      }
    }

    let reconciliationReport: BillingSandboxCanonicalizationReport['reconciliation'];
    if (!input.skipReconciliation) {
      const reconciliationDryRun = dryRun || input.reconciliationDryRunOnly === true;
      const result = await this.reconciliation.runBatch({
        organizationId: input.organizationId,
        dryRun: reconciliationDryRun,
        batchSize: 100,
      });
      reconciliationReport = {
        dryRun: reconciliationDryRun,
        scanned: result.scanned,
        driftCount: result.driftCount,
        errorCount: result.errorCount,
        drifts: result.drifts.map((drift) => ({
          driftType: drift.driftType,
          severity: drift.severity,
          localValue: drift.localValue,
          stripeValue: drift.stripeValue,
        })),
      };

      if (!dryRun && !reconciliationDryRun) {
        await this.audit.log({
          organizationId: input.organizationId ?? null,
          actorUserId: null,
          action: 'BILLING_SANDBOX_CANONICALIZATION_RECONCILIATION',
          entityType: 'BillingReconciliationRun',
          entityId: result.runId ?? 'unknown',
          after: {
            scanned: result.scanned,
            driftCount: result.driftCount,
            errorCount: result.errorCount,
          },
        });
      }
    }

    const summary = actions.reduce(
      (acc, action) => {
        if (action.outcome === 'applied') acc.applied += 1;
        if (action.outcome === 'skipped') acc.skipped += 1;
        if (action.outcome === 'failed') acc.failed += 1;
        if (action.outcome === 'blocked') acc.blocked += 1;
        return acc;
      },
      { applied: 0, skipped: 0, failed: 0, blocked: 0 },
    );

    if (!dryRun) {
      await this.audit.log({
        organizationId: input.organizationId ?? null,
        actorUserId: null,
        action: 'BILLING_SANDBOX_CANONICALIZATION_RUN',
        entityType: 'BillingSandboxCanonicalization',
        entityId: input.organizationId ?? 'global',
        after: {
          summary,
          reconciliationDriftCount: reconciliationReport?.driftCount ?? null,
        },
      });
    }

    return {
      dryRun,
      runtimeStripeMode,
      actions,
      reconciliation: reconciliationReport,
      summary,
    };
  }

  private async correctSubscriptionStripeMode(input: {
    subscription: Prisma.BillingSubscriptionGetPayload<{ include: { items: true } }>;
    runtimeStripeMode: BillingStripeMode;
    stripe: Stripe;
    dryRun: boolean;
  }): Promise<BillingSandboxCanonicalizationAction> {
    const { subscription, runtimeStripeMode, stripe, dryRun } = input;

    if (!subscription.stripeCustomerId) {
      if (dryRun) {
        return {
          phase: 'stripe_mode_correction',
          entityType: 'BillingSubscription',
          entityId: subscription.id,
          detail: `Would set stripe_mode ${subscription.stripeMode} -> ${runtimeStripeMode} (no Stripe customer to verify)`,
          outcome: 'planned',
        };
      }

      await this.updateSubscriptionStripeMode(subscription, runtimeStripeMode);
      return {
        phase: 'stripe_mode_correction',
        entityType: 'BillingSubscription',
        entityId: subscription.id,
        detail: `Set stripe_mode ${subscription.stripeMode} -> ${runtimeStripeMode} without remote customer`,
        outcome: 'applied',
      };
    }

    const customer = await stripe.customers.retrieve(subscription.stripeCustomerId);
    if ('deleted' in customer && customer.deleted) {
      return {
        phase: 'stripe_mode_correction',
        entityType: 'BillingSubscription',
        entityId: subscription.id,
        detail: `Stripe customer ${subscription.stripeCustomerId} is deleted`,
        outcome: 'blocked',
      };
    }

    if (customer.livemode) {
      return {
        phase: 'stripe_mode_correction',
        entityType: 'BillingSubscription',
        entityId: subscription.id,
        detail: `Stripe customer ${subscription.stripeCustomerId} is LIVE — manual operator review required`,
        outcome: 'blocked',
      };
    }

    if (subscription.stripeSubscriptionId) {
      const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      if (stripeSub.livemode) {
        return {
          phase: 'stripe_mode_correction',
          entityType: 'BillingSubscription',
          entityId: subscription.id,
          detail: `Stripe subscription ${subscription.stripeSubscriptionId} is LIVE — manual operator review required`,
          outcome: 'blocked',
        };
      }
    }

    if (dryRun) {
      return {
        phase: 'stripe_mode_correction',
        entityType: 'BillingSubscription',
        entityId: subscription.id,
        detail: `Would set stripe_mode ${subscription.stripeMode} -> ${runtimeStripeMode} (verified Stripe TEST resources)`,
        outcome: 'planned',
      };
    }

    await this.updateSubscriptionStripeMode(subscription, runtimeStripeMode);
    return {
      phase: 'stripe_mode_correction',
      entityType: 'BillingSubscription',
      entityId: subscription.id,
      detail: `Set stripe_mode ${subscription.stripeMode} -> ${runtimeStripeMode} after Stripe TEST verification`,
      outcome: 'applied',
    };
  }

  private async updateSubscriptionStripeMode(
    subscription: Prisma.BillingSubscriptionGetPayload<{ include: { items: true } }>,
    runtimeStripeMode: BillingStripeMode,
  ) {
    await this.prisma.$transaction([
      this.prisma.billingSubscription.update({
        where: { id: subscription.id },
        data: { stripeMode: runtimeStripeMode },
      }),
      this.prisma.billingSubscriptionItem.updateMany({
        where: { subscriptionId: subscription.id },
        data: { stripeMode: runtimeStripeMode },
      }),
      this.prisma.billingSubscriptionDiscount.updateMany({
        where: { subscriptionId: subscription.id },
        data: { stripeMode: runtimeStripeMode },
      }),
      this.prisma.billingInvoice.updateMany({
        where: { subscriptionId: subscription.id },
        data: { stripeMode: runtimeStripeMode },
      }),
    ]);
  }

  private requireRuntimeStripeMode(): BillingStripeMode {
    const mode =
      this.catalogMappings.getRuntimeStripeMode() ??
      resolveStripeModeFromSecretKey(this.configService.get<string>('stripe.secretKey'));
    if (!mode) {
      throw new HttpException(
        'Stripe runtime mode is not configured',
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    return mode;
  }

  private requireStripe(): Stripe {
    const client = getStripeClient(this.configService.get<string>('stripe.secretKey'));
    if (!client) {
      throw new HttpException('Stripe is not configured', HttpStatus.NOT_IMPLEMENTED);
    }
    return client;
  }
}
