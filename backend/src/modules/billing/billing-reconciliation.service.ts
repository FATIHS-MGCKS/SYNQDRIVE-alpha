import Stripe from 'stripe';
import {
  BillingReconciliationDriftSeverity,
  BillingReconciliationDriftType,
  BillingReconciliationRunStatus,
  BillingStripeMode,
  Prisma,
  StripeWebhookEventStatus,
} from '@prisma/client';
import {
  BadRequestException,
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
import { StripePaymentMethodService } from './stripe-payment-method.service';
import { BillingAuditService } from './billing-audit.service';
import { BillingMonitoringService } from './billing-monitoring.service';
import { resolveStripeModeFromSecretKey } from './migration/billing-legacy-backfill.util';
import {
  BILLING_RECONCILIATION_DEFAULT_BATCH_SIZE,
  BILLING_RECONCILIATION_MAX_RETRIES,
  BILLING_RECONCILIATION_RATE_LIMIT_DELAY_MS,
  BILLING_RECONCILIATION_STUCK_WEBHOOK_MIN_AGE_MS,
  BillingReconciliationCompareInput,
  BillingReconciliationDriftFinding,
  BillingReconciliationErrorCode,
  BillingReconciliationStripeCustomer,
  BillingReconciliationStripeInvoice,
  BillingReconciliationStripeSubscription,
  BillingReconciliationStripeSubscriptionItem,
  detectBillingReconciliationDrift,
  extractStripeBillingAnchorDay,
  sleepForBillingReconciliation,
} from './domain/billing-reconciliation';

export interface RunBillingReconciliationBatchInput {
  runId?: string;
  organizationId?: string;
  batchSize?: number;
  cursor?: string | null;
  actorUserId?: string | null;
}

export interface BillingReconciliationBatchResult {
  runId: string;
  status: BillingReconciliationRunStatus;
  scanned: number;
  driftCount: number;
  errorCount: number;
  cursor: string | null;
  hasMore: boolean;
  drifts: Array<{
    id: string;
    driftType: BillingReconciliationDriftType;
    severity: BillingReconciliationDriftSeverity;
    localValue: string | null;
    stripeValue: string | null;
    suggestedAction: string;
    autoFixable: boolean;
  }>;
}

@Injectable()
export class BillingReconciliationService {
  private readonly logger = new Logger(BillingReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly catalogMappings: StripeCatalogMappingService,
    private readonly paymentMethods: StripePaymentMethodService,
    private readonly audit: BillingAuditService,
    private readonly monitoring: BillingMonitoringService,
  ) {}

  async runBatch(
    input: RunBillingReconciliationBatchInput = {},
  ): Promise<BillingReconciliationBatchResult> {
    const stripeMode = this.requireRuntimeStripeMode();
    const batchSize = input.batchSize ?? BILLING_RECONCILIATION_DEFAULT_BATCH_SIZE;

    const run =
      input.runId != null
        ? await this.requireRun(input.runId)
        : await this.prisma.billingReconciliationRun.create({
            data: {
              stripeMode,
              status: BillingReconciliationRunStatus.RUNNING,
              batchSize,
              organizationId: input.organizationId ?? null,
              startedAt: new Date(),
              cursor: input.cursor ?? null,
            },
          });

    if (run.status === BillingReconciliationRunStatus.COMPLETED) {
      throw new BadRequestException({
        code: BillingReconciliationErrorCode.RUN_NOT_FOUND,
        message: 'Reconciliation run already completed',
      });
    }

    await this.prisma.billingReconciliationRun.update({
      where: { id: run.id },
      data: {
        status: BillingReconciliationRunStatus.RUNNING,
        startedAt: run.startedAt ?? new Date(),
      },
    });

    const subscriptions = await this.prisma.billingSubscription.findMany({
      where: {
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        ...(input.cursor || run.cursor
          ? { id: { gt: input.cursor ?? run.cursor ?? undefined } }
          : {}),
      },
      orderBy: { id: 'asc' },
      take: batchSize,
      include: {
        items: true,
        discounts: true,
        invoices: {
          select: {
            id: true,
            stripeInvoiceId: true,
            stripeMode: true,
            status: true,
            amountPaidCents: true,
            payments: {
              select: {
                id: true,
                invoiceId: true,
                stripePaymentIntentId: true,
                stripeMode: true,
              },
            },
          },
        },
      },
    });

    const stuckWebhooks = await this.loadStuckWebhooks(input.organizationId);
    const stripe = this.tryStripe();
    let scanned = 0;
    let driftCount = 0;
    let errorCount = 0;
    let lastCursor: string | null = null;
    const persistedDrifts: BillingReconciliationBatchResult['drifts'] = [];

    for (const subscription of subscriptions) {
      lastCursor = subscription.id;
      try {
        const findings = await this.detectForSubscription({
          subscription,
          stripeMode,
          stripe,
          stuckWebhooks: stuckWebhooks.filter(
            (row) =>
              !row.organizationId || row.organizationId === subscription.organizationId,
          ),
        });
        const rows = await this.persistFindings(run.id, findings);
        scanned += 1;
        driftCount += rows.length;
        persistedDrifts.push(...rows);
      } catch (error) {
        errorCount += 1;
        this.logger.warn(
          `Reconciliation failed for subscription ${subscription.id}: ${(error as Error).message}`,
        );
      }

      await sleepForBillingReconciliation(BILLING_RECONCILIATION_RATE_LIMIT_DELAY_MS);
    }

    const hasMore = subscriptions.length === batchSize;
    const status =
      errorCount > 0
        ? BillingReconciliationRunStatus.PARTIAL
        : hasMore
          ? BillingReconciliationRunStatus.RUNNING
          : BillingReconciliationRunStatus.COMPLETED;

    const updatedRun = await this.prisma.billingReconciliationRun.update({
      where: { id: run.id },
      data: {
        status,
        cursor: hasMore ? lastCursor : null,
        totalScanned: { increment: scanned },
        driftCount: { increment: driftCount },
        errorCount: { increment: errorCount },
        completedAt: hasMore ? null : new Date(),
        lastError: errorCount > 0 ? `${errorCount} subscription(s) failed in batch` : null,
      },
    });

    if (input.actorUserId) {
      await this.audit.log({
        organizationId: input.organizationId ?? null,
        actorUserId: input.actorUserId,
        action: 'BILLING_RECONCILIATION_BATCH_RUN',
        entityType: 'BillingReconciliationRun',
        entityId: run.id,
        after: {
          scanned,
          driftCount,
          errorCount,
          status,
          cursor: updatedRun.cursor,
        },
      });
    }

    return {
      runId: run.id,
      status: updatedRun.status,
      scanned,
      driftCount,
      errorCount,
      cursor: updatedRun.cursor,
      hasMore,
      drifts: persistedDrifts,
    };
  }

  async runPeriodicReconciliation(): Promise<{
    runId: string;
    status: BillingReconciliationRunStatus;
    scanned: number;
    driftCount: number;
    errorCount: number;
    alerts: Awaited<ReturnType<BillingMonitoringService['collectAlerts']>>;
  }> {
    let runId: string | undefined;
    let cursor: string | null = null;
    let scanned = 0;
    let driftCount = 0;
    let errorCount = 0;
    let status: BillingReconciliationRunStatus = BillingReconciliationRunStatus.RUNNING;

    do {
      const batch = await this.runBatch({
        runId,
        cursor,
        actorUserId: null,
      });
      runId = batch.runId;
      scanned += batch.scanned;
      driftCount += batch.driftCount;
      errorCount += batch.errorCount;
      status = batch.status;
      cursor = batch.hasMore ? batch.cursor : null;
    } while (cursor && status === BillingReconciliationRunStatus.RUNNING);

    const alerts = await this.monitoring.collectAlerts();
    return {
      runId: runId!,
      status,
      scanned,
      driftCount,
      errorCount,
      alerts,
    };
  }

  async detectOrganizationDrift(organizationId: string) {
    const stripeMode = this.requireRuntimeStripeMode();
    const subscriptions = await this.prisma.billingSubscription.findMany({
      where: { organizationId },
      include: {
        items: true,
        discounts: true,
        invoices: {
          select: {
            id: true,
            stripeInvoiceId: true,
            stripeMode: true,
            status: true,
            amountPaidCents: true,
            payments: {
              select: {
                id: true,
                invoiceId: true,
                stripePaymentIntentId: true,
                stripeMode: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    const subscription = subscriptions[0];
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    const findings = await this.detectForSubscription({
      subscription,
      stripeMode,
      stripe: this.tryStripe(),
      stuckWebhooks: await this.loadStuckWebhooks(organizationId),
    });

    return this.persistFindings(null, findings);
  }

  async listOpenDrifts(filters?: {
    organizationId?: string;
    subscriptionId?: string;
    severity?: BillingReconciliationDriftSeverity;
  }) {
    return this.prisma.billingReconciliationDrift.findMany({
      where: {
        organizationId: filters?.organizationId,
        subscriptionId: filters?.subscriptionId,
        severity: filters?.severity,
        resolvedAt: null,
      },
      orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
    });
  }

  async resolveDrift(driftId: string, actorUserId: string) {
    const drift = await this.prisma.billingReconciliationDrift.findUnique({
      where: { id: driftId },
    });
    if (!drift) {
      throw new NotFoundException({
        code: BillingReconciliationErrorCode.DRIFT_NOT_FOUND,
        message: BillingReconciliationErrorCode.DRIFT_NOT_FOUND,
      });
    }
    if (drift.resolvedAt) {
      throw new BadRequestException({
        code: BillingReconciliationErrorCode.ALREADY_RESOLVED,
        message: BillingReconciliationErrorCode.ALREADY_RESOLVED,
      });
    }

    const resolved = await this.prisma.billingReconciliationDrift.update({
      where: { id: driftId },
      data: {
        resolvedAt: new Date(),
        resolvedByUserId: actorUserId,
      },
    });

    await this.audit.log({
      organizationId: drift.organizationId,
      actorUserId,
      action: 'BILLING_RECONCILIATION_DRIFT_RESOLVED',
      entityType: 'BillingReconciliationDrift',
      entityId: drift.id,
      before: { driftType: drift.driftType, severity: drift.severity },
      after: { resolvedAt: resolved.resolvedAt?.toISOString() ?? null },
    });

    return resolved;
  }

  async applyAutoFix(driftId: string, actorUserId: string) {
    const drift = await this.prisma.billingReconciliationDrift.findUnique({
      where: { id: driftId },
    });
    if (!drift) {
      throw new NotFoundException({
        code: BillingReconciliationErrorCode.DRIFT_NOT_FOUND,
        message: BillingReconciliationErrorCode.DRIFT_NOT_FOUND,
      });
    }
    if (!drift.autoFixable) {
      throw new BadRequestException({
        code: BillingReconciliationErrorCode.NOT_AUTO_FIXABLE,
        message: BillingReconciliationErrorCode.NOT_AUTO_FIXABLE,
      });
    }

    if (
      drift.driftType === BillingReconciliationDriftType.MISSING_DEFAULT_PAYMENT_METHOD
    ) {
      await this.withRetries(() =>
        this.paymentMethods.syncPaymentMethods(drift.organizationId),
      );
    } else if (drift.driftType === BillingReconciliationDriftType.STUCK_WEBHOOK) {
      await this.prisma.stripeWebhookEvent.updateMany({
        where: {
          stripeEventId: drift.stripeValue ?? undefined,
          status: { in: [StripeWebhookEventStatus.FAILED, StripeWebhookEventStatus.RECEIVED] },
        },
        data: {
          status: StripeWebhookEventStatus.RECEIVED,
          retryCount: { increment: 1 },
          errorMessage: null,
        },
      });
    } else {
      throw new BadRequestException({
        code: BillingReconciliationErrorCode.NOT_AUTO_FIXABLE,
        message: 'No auto-fix handler is registered for this drift type yet',
      });
    }

    await this.audit.log({
      organizationId: drift.organizationId,
      actorUserId,
      action: 'BILLING_RECONCILIATION_AUTO_FIX_APPLIED',
      entityType: 'BillingReconciliationDrift',
      entityId: drift.id,
      after: { driftType: drift.driftType },
    });

    return this.resolveDrift(driftId, actorUserId);
  }

  private async detectForSubscription(input: {
    subscription: Prisma.BillingSubscriptionGetPayload<{
      include: {
        items: true;
        discounts: true;
        invoices: {
          select: {
            id: true;
            stripeInvoiceId: true;
            stripeMode: true;
            status: true;
            amountPaidCents: true;
            payments: {
              select: {
                id: true;
                invoiceId: true;
                stripePaymentIntentId: true;
                stripeMode: true;
              };
            };
          };
        };
      };
    }>;
    stripeMode: BillingStripeMode;
    stripe: Stripe | null;
    stuckWebhooks: Awaited<ReturnType<BillingReconciliationService['loadStuckWebhooks']>>;
  }): Promise<BillingReconciliationDriftFinding[]> {
    const { subscription, stripeMode, stripe } = input;
    const now = new Date();

    const priceMappings = await Promise.all(
      subscription.items
        .filter((item) => item.priceVersionId)
        .map(async (item) => {
          const mapping = item.priceVersionId
            ? await this.catalogMappings.getMappingForVersion(item.priceVersionId, stripeMode)
            : null;
          return { itemId: item.id, stripePriceId: mapping?.stripePriceId ?? null };
        }),
    );
    const priceByItemId = new Map(priceMappings.map((row) => [row.itemId, row.stripePriceId]));

    const paymentMethods = await this.prisma.billingPaymentMethod.findMany({
      where: { organizationId: subscription.organizationId },
      select: {
        id: true,
        stripePaymentMethodId: true,
        isDefault: true,
        status: true,
      },
    });

    let stripeSubscription: BillingReconciliationStripeSubscription | null = null;
    let stripeInvoices: BillingReconciliationStripeInvoice[] = [];
    let stripeCustomer: BillingReconciliationStripeCustomer | null = null;
    let unknownStripeSubscriptions: BillingReconciliationStripeSubscription[] = [];

    if (stripe && subscription.stripeCustomerId) {
      if (subscription.stripeSubscriptionId) {
        const retrieved = await this.withRetries(() =>
          stripe.subscriptions.retrieve(subscription.stripeSubscriptionId!, {
            expand: ['items.data.price', 'discounts'],
          }),
        );
        stripeSubscription = this.mapStripeSubscription(retrieved);
      } else {
        const listed = await this.withRetries(() =>
          stripe.subscriptions.list({
            customer: subscription.stripeCustomerId!,
            status: 'all',
            limit: 20,
            expand: ['data.items.data.price', 'data.discounts'],
          }),
        );
        const metadataMatches = listed.data.filter((row) => {
          const metadata = row.metadata ?? {};
          return (
            metadata.organizationId === subscription.organizationId &&
            metadata.synqdriveSubscriptionId === subscription.id
          );
        });
        stripeSubscription = metadataMatches[0]
          ? this.mapStripeSubscription(metadataMatches[0])
          : null;
        unknownStripeSubscriptions = listed.data
          .filter((row) => {
            const metadata = row.metadata ?? {};
            return (
              metadata.organizationId === subscription.organizationId &&
              metadata.synqdriveSubscriptionId !== subscription.id &&
              ['active', 'trialing', 'past_due', 'unpaid'].includes(row.status)
            );
          })
          .map((row) => this.mapStripeSubscription(row));
      }

      const customer = await this.withRetries(() =>
        stripe.customers.retrieve(subscription.stripeCustomerId!, {
          expand: ['invoice_settings.default_payment_method'],
        }),
      );
      if (!('deleted' in customer && customer.deleted)) {
        const defaultPm = customer.invoice_settings?.default_payment_method;
        stripeCustomer = {
          id: customer.id,
          defaultPaymentMethodId:
            typeof defaultPm === 'string' ? defaultPm : defaultPm?.id ?? null,
        };
      }

      const invoiceList = await this.withRetries(() =>
        stripe.invoices.list({
          customer: subscription.stripeCustomerId!,
          limit: 24,
        }),
      );
      stripeInvoices = invoiceList.data.map((invoice) => ({
        id: invoice.id!,
        status: invoice.status ?? 'draft',
        amountPaid: invoice.amount_paid ?? 0,
        paymentIntentId: this.readStripeId(invoice.payment_intent),
      }));
    }

    const compareInput: BillingReconciliationCompareInput = {
      runtimeStripeMode: stripeMode,
      now,
      subscription: {
        id: subscription.id,
        organizationId: subscription.organizationId,
        status: subscription.status,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeMode: subscription.stripeMode,
        billingAnchorDay: subscription.billingAnchorDay,
      },
      items: subscription.items.map((item) => ({
        id: item.id,
        status: item.status,
        quantity: item.quantity,
        priceVersionId: item.priceVersionId,
        stripeSubscriptionItemId: item.stripeSubscriptionItemId,
        stripeMode: item.stripeMode,
        validTo: item.validTo,
        expectedStripePriceId: priceByItemId.get(item.id) ?? null,
      })),
      discounts: subscription.discounts.map((discount) => ({
        id: discount.id,
        status: discount.status,
        stripeCouponId: discount.stripeCouponId,
        stripeMode: discount.stripeMode,
      })),
      invoices: subscription.invoices.map((invoice) => ({
        id: invoice.id,
        stripeInvoiceId: invoice.stripeInvoiceId,
        stripeMode: invoice.stripeMode,
        status: invoice.status,
        amountPaidCents: invoice.amountPaidCents,
      })),
      payments: subscription.invoices.flatMap((invoice) => invoice.payments),
      paymentMethods,
      stripeSubscription,
      stripeInvoices,
      stripeCustomer,
      unknownStripeSubscriptions,
      stuckWebhooks: input.stuckWebhooks,
    };

    return detectBillingReconciliationDrift(compareInput);
  }

  private async persistFindings(
    runId: string | null,
    findings: BillingReconciliationDriftFinding[],
  ) {
    const rows: BillingReconciliationBatchResult['drifts'] = [];

    for (const finding of findings) {
      const existing = finding.idempotencyKey
        ? await this.prisma.billingReconciliationDrift.findUnique({
            where: { idempotencyKey: finding.idempotencyKey },
          })
        : null;

      if (existing && !existing.resolvedAt) {
        rows.push({
          id: existing.id,
          driftType: existing.driftType,
          severity: existing.severity,
          localValue: existing.localValue,
          stripeValue: existing.stripeValue,
          suggestedAction: existing.suggestedAction,
          autoFixable: existing.autoFixable,
        });
        continue;
      }

      const created = await this.prisma.billingReconciliationDrift.create({
        data: {
          runId,
          organizationId: finding.organizationId,
          subscriptionId: finding.subscriptionId,
          driftType: finding.driftType,
          severity: finding.severity,
          localValue: finding.localValue,
          stripeValue: finding.stripeValue,
          suggestedAction: finding.suggestedAction,
          autoFixable: finding.autoFixable,
          stripeMode: finding.stripeMode,
          idempotencyKey: finding.idempotencyKey,
        },
      });

      rows.push({
        id: created.id,
        driftType: created.driftType,
        severity: created.severity,
        localValue: created.localValue,
        stripeValue: created.stripeValue,
        suggestedAction: created.suggestedAction,
        autoFixable: created.autoFixable,
      });
    }

    return rows;
  }

  private mapStripeSubscription(
    subscription: Stripe.Subscription,
  ): BillingReconciliationStripeSubscription {
    const items: BillingReconciliationStripeSubscriptionItem[] = subscription.items.data.map(
      (item) => ({
        id: item.id,
        priceId: typeof item.price === 'string' ? item.price : item.price?.id ?? '',
        quantity: item.quantity ?? 0,
        localItemId: item.metadata?.synqdriveSubscriptionItemId ?? null,
      }),
    );

    const couponIds = (subscription.discounts ?? [])
      .map((discount) => {
        if (!discount || typeof discount === 'string') {
          return null;
        }
        const coupon = discount.coupon;
        return typeof coupon === 'string' ? coupon : coupon?.id ?? null;
      })
      .filter((value): value is string => Boolean(value));

    return {
      id: subscription.id,
      status: subscription.status,
      livemode: subscription.livemode,
      billingCycleAnchorDay: extractStripeBillingAnchorDay(subscription.billing_cycle_anchor),
      items,
      couponIds,
      metadataOrganizationId: subscription.metadata?.organizationId ?? null,
      metadataSubscriptionId: subscription.metadata?.synqdriveSubscriptionId ?? null,
    };
  }

  private readStripeId(value: string | { id: string } | null | undefined): string | null {
    if (!value) return null;
    return typeof value === 'string' ? value : value.id ?? null;
  }

  private async loadStuckWebhooks(organizationId?: string) {
    const threshold = new Date(Date.now() - BILLING_RECONCILIATION_STUCK_WEBHOOK_MIN_AGE_MS);
    return this.prisma.stripeWebhookEvent.findMany({
      where: {
        organizationId,
        status: { in: [StripeWebhookEventStatus.FAILED, StripeWebhookEventStatus.RECEIVED] },
        createdAt: { lte: threshold },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: {
        id: true,
        stripeEventId: true,
        type: true,
        organizationId: true,
        status: true,
        retryCount: true,
        createdAt: true,
      },
    });
  }

  private requireRuntimeStripeMode(): BillingStripeMode {
    const mode =
      this.catalogMappings.getRuntimeStripeMode() ??
      resolveStripeModeFromSecretKey(this.configService.get<string>('stripe.secretKey'));
    if (!mode) {
      throw new HttpException(
        {
          code: BillingReconciliationErrorCode.NOT_CONFIGURED,
          message: BillingReconciliationErrorCode.NOT_CONFIGURED,
        },
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    return mode;
  }

  private tryStripe(): Stripe | null {
    return getStripeClient(this.configService.get<string>('stripe.secretKey'));
  }

  private async requireRun(runId: string) {
    const run = await this.prisma.billingReconciliationRun.findUnique({
      where: { id: runId },
    });
    if (!run) {
      throw new NotFoundException({
        code: BillingReconciliationErrorCode.RUN_NOT_FOUND,
        message: BillingReconciliationErrorCode.RUN_NOT_FOUND,
      });
    }
    return run;
  }

  private async withRetries<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < BILLING_RECONCILIATION_MAX_RETRIES; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        await sleepForBillingReconciliation(BILLING_RECONCILIATION_RATE_LIMIT_DELAY_MS);
      }
    }
    throw lastError;
  }
}
