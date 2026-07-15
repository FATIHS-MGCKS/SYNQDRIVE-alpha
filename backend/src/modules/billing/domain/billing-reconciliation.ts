import {
  BillingDiscountStatus,
  BillingPaymentMethodStatus,
  BillingReconciliationDriftSeverity,
  BillingReconciliationDriftType,
  BillingStatus,
  BillingStripeMode,
  BillingSubscriptionItemStatus,
  InvoiceStatus,
  StripeWebhookEventStatus,
} from '@prisma/client';
import { mapStripeSubscriptionStatus } from './mappers/stripe-subscription-status.mapper';
import { isSyncableSubscriptionItem } from './stripe-subscription-orchestrator';

export const BILLING_RECONCILIATION_SCHEMA_VERSION = '1' as const;

export const BillingReconciliationErrorCode = {
  NOT_CONFIGURED: 'BILLING_RECONCILIATION_NOT_CONFIGURED',
  RUN_NOT_FOUND: 'BILLING_RECONCILIATION_RUN_NOT_FOUND',
  DRIFT_NOT_FOUND: 'BILLING_RECONCILIATION_DRIFT_NOT_FOUND',
  NOT_AUTO_FIXABLE: 'BILLING_RECONCILIATION_NOT_AUTO_FIXABLE',
  ALREADY_RESOLVED: 'BILLING_RECONCILIATION_ALREADY_RESOLVED',
  STRIPE_MODE_MISMATCH: 'BILLING_RECONCILIATION_STRIPE_MODE_MISMATCH',
} as const;

export type BillingReconciliationErrorCode =
  (typeof BillingReconciliationErrorCode)[keyof typeof BillingReconciliationErrorCode];

export const BILLING_RECONCILIATION_RATE_LIMIT_DELAY_MS = 150;
export const BILLING_RECONCILIATION_DEFAULT_BATCH_SIZE = 25;
export const BILLING_RECONCILIATION_STUCK_WEBHOOK_MIN_AGE_MS = 15 * 60 * 1000;
export const BILLING_RECONCILIATION_MAX_RETRIES = 3;

export interface BillingReconciliationLocalSubscription {
  id: string;
  organizationId: string;
  status: BillingStatus;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  stripeMode: BillingStripeMode | null;
  billingAnchorDay: number | null;
}

export interface BillingReconciliationLocalItem {
  id: string;
  status: BillingSubscriptionItemStatus;
  quantity: number;
  priceVersionId: string | null;
  stripeSubscriptionItemId: string | null;
  stripeMode: BillingStripeMode | null;
  validTo: Date | null;
  expectedStripePriceId: string | null;
}

export interface BillingReconciliationLocalDiscount {
  id: string;
  status: BillingDiscountStatus;
  stripeCouponId: string | null;
  stripeMode: BillingStripeMode | null;
}

export interface BillingReconciliationLocalInvoice {
  id: string;
  stripeInvoiceId: string | null;
  stripeMode: BillingStripeMode | null;
  status: InvoiceStatus;
  amountPaidCents: number | null;
}

export interface BillingReconciliationLocalPayment {
  id: string;
  invoiceId: string;
  stripePaymentIntentId: string | null;
  stripeMode: BillingStripeMode | null;
}

export interface BillingReconciliationLocalPaymentMethod {
  id: string;
  stripePaymentMethodId: string | null;
  isDefault: boolean;
  status: BillingPaymentMethodStatus;
}

export interface BillingReconciliationStripeSubscriptionItem {
  id: string;
  priceId: string;
  quantity: number;
  localItemId: string | null;
}

export interface BillingReconciliationStripeSubscription {
  id: string;
  status: string;
  livemode: boolean;
  billingCycleAnchorDay: number | null;
  items: BillingReconciliationStripeSubscriptionItem[];
  couponIds: string[];
  metadataOrganizationId: string | null;
  metadataSubscriptionId: string | null;
}

export interface BillingReconciliationStripeInvoice {
  id: string;
  status: string;
  amountPaid: number;
  paymentIntentId: string | null;
}

export interface BillingReconciliationStripeCustomer {
  id: string;
  defaultPaymentMethodId: string | null;
}

export interface BillingReconciliationStuckWebhook {
  id: string;
  stripeEventId: string;
  type: string;
  organizationId: string | null;
  status: StripeWebhookEventStatus;
  retryCount: number;
  createdAt: Date;
}

export interface BillingReconciliationCompareInput {
  runtimeStripeMode: BillingStripeMode;
  now?: Date;
  subscription: BillingReconciliationLocalSubscription;
  items: BillingReconciliationLocalItem[];
  discounts: BillingReconciliationLocalDiscount[];
  invoices: BillingReconciliationLocalInvoice[];
  payments: BillingReconciliationLocalPayment[];
  paymentMethods: BillingReconciliationLocalPaymentMethod[];
  stripeSubscription: BillingReconciliationStripeSubscription | null;
  stripeInvoices: BillingReconciliationStripeInvoice[];
  stripeCustomer: BillingReconciliationStripeCustomer | null;
  unknownStripeSubscriptions?: BillingReconciliationStripeSubscription[];
  stuckWebhooks?: BillingReconciliationStuckWebhook[];
}

export interface BillingReconciliationDriftFinding {
  organizationId: string;
  subscriptionId: string | null;
  driftType: BillingReconciliationDriftType;
  severity: BillingReconciliationDriftSeverity;
  localValue: string | null;
  stripeValue: string | null;
  suggestedAction: string;
  autoFixable: boolean;
  idempotencyKey: string;
  stripeMode: BillingStripeMode | null;
}

export function buildBillingReconciliationDriftIdempotencyKey(input: {
  organizationId: string;
  subscriptionId?: string | null;
  driftType: BillingReconciliationDriftType;
  detailKey?: string;
}): string {
  const detail = input.detailKey ?? 'default';
  const subscription = input.subscriptionId ?? 'none';
  return `billing-reconciliation:${input.organizationId}:${subscription}:${input.driftType}:${detail}:v${BILLING_RECONCILIATION_SCHEMA_VERSION}`;
}

export function stripeLivemodeToBillingMode(livemode: boolean): BillingStripeMode {
  return livemode ? BillingStripeMode.LIVE : BillingStripeMode.TEST;
}

export function extractStripeBillingAnchorDay(anchorUnix: number | null | undefined): number | null {
  if (!anchorUnix) {
    return null;
  }
  return new Date(anchorUnix * 1000).getUTCDate();
}

export function detectBillingReconciliationDrift(
  input: BillingReconciliationCompareInput,
): BillingReconciliationDriftFinding[] {
  const findings: BillingReconciliationDriftFinding[] = [];
  const now = input.now ?? new Date();
  const { subscription, runtimeStripeMode } = input;

  if (subscription.stripeMode && subscription.stripeMode !== runtimeStripeMode) {
    findings.push(
      buildFinding({
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        driftType: BillingReconciliationDriftType.TEST_LIVE_MODE_CONFLICT,
        severity: BillingReconciliationDriftSeverity.CRITICAL,
        localValue: subscription.stripeMode,
        stripeValue: runtimeStripeMode,
        suggestedAction:
          'Resolve environment mismatch before syncing. Local records use a different Stripe mode than the active secret key.',
        autoFixable: false,
        stripeMode: subscription.stripeMode,
        detailKey: 'subscription-mode',
      }),
    );
  }

  for (const webhook of input.stuckWebhooks ?? []) {
    if (webhook.organizationId && webhook.organizationId !== subscription.organizationId) {
      continue;
    }
    findings.push(
      buildFinding({
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        driftType: BillingReconciliationDriftType.STUCK_WEBHOOK,
        severity: BillingReconciliationDriftSeverity.WARNING,
        localValue: webhook.type,
        stripeValue: webhook.stripeEventId,
        suggestedAction:
          'Replay or investigate the stored webhook event. Technical projection can be retried without changing contract data.',
        autoFixable: true,
        stripeMode: runtimeStripeMode,
        detailKey: webhook.stripeEventId,
      }),
    );
  }

  const expectsStripe =
    subscription.status === BillingStatus.ACTIVE ||
    subscription.status === BillingStatus.PAST_DUE ||
    subscription.status === BillingStatus.TRIALING;

  if (expectsStripe && !subscription.stripeSubscriptionId) {
    findings.push(
      buildFinding({
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        driftType: BillingReconciliationDriftType.LOCAL_SUBSCRIPTION_WITHOUT_STRIPE,
        severity: BillingReconciliationDriftSeverity.WARNING,
        localValue: subscription.id,
        stripeValue: null,
        suggestedAction:
          'Review contract state and run subscription sync after admin approval. Do not overwrite local contract data automatically.',
        autoFixable: false,
        stripeMode: runtimeStripeMode,
      }),
    );
  }

  for (const unknown of input.unknownStripeSubscriptions ?? []) {
    findings.push(
      buildFinding({
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        driftType: BillingReconciliationDriftType.STRIPE_SUBSCRIPTION_WITHOUT_LOCAL,
        severity: BillingReconciliationDriftSeverity.CRITICAL,
        localValue: null,
        stripeValue: unknown.id,
        suggestedAction:
          'Map or archive the orphan Stripe subscription manually. Contract linkage requires admin decision.',
        autoFixable: false,
        stripeMode: stripeLivemodeToBillingMode(unknown.livemode),
        detailKey: unknown.id,
      }),
    );
  }

  if (!input.stripeSubscription) {
    return findings;
  }

  const stripeSub = input.stripeSubscription;
  const mappedStatus = mapStripeSubscriptionStatus(stripeSub.status, {
    cancelAtPeriodEnd: false,
  });

  if (mappedStatus.billingStatus !== subscription.status) {
    findings.push(
      buildFinding({
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        driftType: BillingReconciliationDriftType.STATUS_MISMATCH,
        severity: BillingReconciliationDriftSeverity.WARNING,
        localValue: subscription.status,
        stripeValue: stripeSub.status,
        suggestedAction:
          'Compare lifecycle state and resolve via admin workflow. Status is contract-sensitive and not auto-overwritten.',
        autoFixable: false,
        stripeMode: runtimeStripeMode,
      }),
    );
  }

  if (
    subscription.billingAnchorDay != null &&
    stripeSub.billingCycleAnchorDay != null &&
    subscription.billingAnchorDay !== stripeSub.billingCycleAnchorDay
  ) {
    findings.push(
      buildFinding({
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        driftType: BillingReconciliationDriftType.BILLING_ANCHOR_MISMATCH,
        severity: BillingReconciliationDriftSeverity.WARNING,
        localValue: String(subscription.billingAnchorDay),
        stripeValue: String(stripeSub.billingCycleAnchorDay),
        suggestedAction:
          'Align billing anchor through approved subscription change. Anchor drift affects contract billing cycles.',
        autoFixable: false,
        stripeMode: runtimeStripeMode,
      }),
    );
  }

  const syncableItems = input.items.filter((item) =>
    isSyncableSubscriptionItem(item, now),
  );
  const stripeItemsByLocalId = new Map(
    stripeSub.items
      .filter((item) => item.localItemId)
      .map((item) => [item.localItemId!, item]),
  );
  const matchedStripeItemIds = new Set<string>();

  for (const localItem of syncableItems) {
    const stripeItem =
      (localItem.stripeSubscriptionItemId
        ? stripeSub.items.find((item) => item.id === localItem.stripeSubscriptionItemId)
        : null) ?? stripeItemsByLocalId.get(localItem.id) ?? null;

    if (!stripeItem) {
      findings.push(
        buildFinding({
          organizationId: subscription.organizationId,
          subscriptionId: subscription.id,
          driftType: BillingReconciliationDriftType.MISSING_ITEM,
          severity: BillingReconciliationDriftSeverity.WARNING,
          localValue: localItem.id,
          stripeValue: null,
          suggestedAction:
            'Push missing subscription item to Stripe after catalog mapping review. Requires admin-approved sync.',
          autoFixable: false,
          stripeMode: runtimeStripeMode,
          detailKey: localItem.id,
        }),
      );
      continue;
    }

    matchedStripeItemIds.add(stripeItem.id);

    if (
      localItem.expectedStripePriceId &&
      stripeItem.priceId !== localItem.expectedStripePriceId
    ) {
      findings.push(
        buildFinding({
          organizationId: subscription.organizationId,
          subscriptionId: subscription.id,
          driftType: BillingReconciliationDriftType.WRONG_PRICE_ID,
          severity: BillingReconciliationDriftSeverity.WARNING,
          localValue: localItem.expectedStripePriceId,
          stripeValue: stripeItem.priceId,
          suggestedAction:
            'Verify price version mapping before updating Stripe. Price drift is contract-sensitive.',
          autoFixable: false,
          stripeMode: runtimeStripeMode,
          detailKey: `${localItem.id}:${stripeItem.id}`,
        }),
      );
    }

    if (stripeItem.quantity !== localItem.quantity) {
      findings.push(
        buildFinding({
          organizationId: subscription.organizationId,
          subscriptionId: subscription.id,
          driftType: BillingReconciliationDriftType.QUANTITY_MISMATCH,
          severity: BillingReconciliationDriftSeverity.WARNING,
          localValue: String(localItem.quantity),
          stripeValue: String(stripeItem.quantity),
          suggestedAction:
            'Reconcile billable quantity from local usage ledger, then sync with admin approval.',
          autoFixable: false,
          stripeMode: runtimeStripeMode,
          detailKey: `${localItem.id}:${stripeItem.id}`,
        }),
      );
    }
  }

  for (const stripeItem of stripeSub.items) {
    if (matchedStripeItemIds.has(stripeItem.id)) {
      continue;
    }
    const linkedLocally = syncableItems.some(
      (item) =>
        item.stripeSubscriptionItemId === stripeItem.id ||
        item.id === stripeItem.localItemId,
    );
    if (!linkedLocally) {
      findings.push(
        buildFinding({
          organizationId: subscription.organizationId,
          subscriptionId: subscription.id,
          driftType: BillingReconciliationDriftType.EXTRA_ITEM,
          severity: BillingReconciliationDriftSeverity.WARNING,
          localValue: null,
          stripeValue: stripeItem.id,
          suggestedAction:
            'Review orphan Stripe subscription item. Removal requires admin decision to avoid contract loss.',
          autoFixable: false,
          stripeMode: runtimeStripeMode,
          detailKey: stripeItem.id,
        }),
      );
    }
  }

  const activeDiscounts = input.discounts.filter(
    (discount) =>
      discount.status === BillingDiscountStatus.ACTIVE && discount.stripeCouponId,
  );
  for (const discount of activeDiscounts) {
    if (!stripeSub.couponIds.includes(discount.stripeCouponId!)) {
      findings.push(
        buildFinding({
          organizationId: subscription.organizationId,
          subscriptionId: subscription.id,
          driftType: BillingReconciliationDriftType.MISSING_DISCOUNT,
          severity: BillingReconciliationDriftSeverity.WARNING,
          localValue: discount.stripeCouponId,
          stripeValue: null,
          suggestedAction:
            'Apply missing coupon in Stripe only after commercial approval. Discounts are contract-sensitive.',
          autoFixable: false,
          stripeMode: runtimeStripeMode,
          detailKey: discount.id,
        }),
      );
    }
  }

  const defaultLocalPm = input.paymentMethods.find(
    (method) =>
      method.isDefault && method.status === BillingPaymentMethodStatus.ACTIVE,
  );
  const stripeDefaultPm = input.stripeCustomer?.defaultPaymentMethodId ?? null;
  if (stripeDefaultPm && !defaultLocalPm) {
    findings.push(
      buildFinding({
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        driftType: BillingReconciliationDriftType.MISSING_DEFAULT_PAYMENT_METHOD,
        severity: BillingReconciliationDriftSeverity.INFO,
        localValue: null,
        stripeValue: stripeDefaultPm,
        suggestedAction:
          'Run controlled payment-method sync to mirror Stripe default payment method locally.',
        autoFixable: true,
        stripeMode: runtimeStripeMode,
      }),
    );
  } else if (
    defaultLocalPm?.stripePaymentMethodId &&
    stripeDefaultPm &&
    defaultLocalPm.stripePaymentMethodId !== stripeDefaultPm
  ) {
    findings.push(
      buildFinding({
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        driftType: BillingReconciliationDriftType.MISSING_DEFAULT_PAYMENT_METHOD,
        severity: BillingReconciliationDriftSeverity.WARNING,
        localValue: defaultLocalPm.stripePaymentMethodId,
        stripeValue: stripeDefaultPm,
        suggestedAction:
          'Sync payment methods or confirm the intended default with the customer.',
        autoFixable: true,
        stripeMode: runtimeStripeMode,
        detailKey: 'default-mismatch',
      }),
    );
  }

  const localInvoiceIds = new Set(
    input.invoices
      .filter((invoice) => invoice.stripeInvoiceId)
      .map((invoice) => invoice.stripeInvoiceId!),
  );
  for (const stripeInvoice of input.stripeInvoices) {
    if (['draft', 'void'].includes(stripeInvoice.status)) {
      continue;
    }
    if (!localInvoiceIds.has(stripeInvoice.id)) {
      findings.push(
        buildFinding({
          organizationId: subscription.organizationId,
          subscriptionId: subscription.id,
          driftType: BillingReconciliationDriftType.MISSING_LOCAL_INVOICE,
          severity: BillingReconciliationDriftSeverity.WARNING,
          localValue: null,
          stripeValue: stripeInvoice.id,
          suggestedAction:
            'Mirror invoice projection from Stripe webhook or controlled resync. Safe for technical projection only.',
          autoFixable: false,
          stripeMode: runtimeStripeMode,
          detailKey: stripeInvoice.id,
        }),
      );
    }
  }

  const localPaymentIntentIds = new Set(
    input.payments
      .filter((payment) => payment.stripePaymentIntentId)
      .map((payment) => payment.stripePaymentIntentId!),
  );
  for (const stripeInvoice of input.stripeInvoices) {
    if (stripeInvoice.amountPaid <= 0 || !stripeInvoice.paymentIntentId) {
      continue;
    }
    if (!localPaymentIntentIds.has(stripeInvoice.paymentIntentId)) {
      findings.push(
        buildFinding({
          organizationId: subscription.organizationId,
          subscriptionId: subscription.id,
          driftType: BillingReconciliationDriftType.MISSING_LOCAL_PAYMENT,
          severity: BillingReconciliationDriftSeverity.WARNING,
          localValue: null,
          stripeValue: stripeInvoice.paymentIntentId,
          suggestedAction:
            'Replay payment webhook or mirror payment ledger entry. Does not mutate the original Stripe charge.',
          autoFixable: false,
          stripeMode: runtimeStripeMode,
          detailKey: stripeInvoice.paymentIntentId,
        }),
      );
    }
  }

  return findings;
}

function buildFinding(input: {
  organizationId: string;
  subscriptionId: string | null;
  driftType: BillingReconciliationDriftType;
  severity: BillingReconciliationDriftSeverity;
  localValue: string | null;
  stripeValue: string | null;
  suggestedAction: string;
  autoFixable: boolean;
  stripeMode: BillingStripeMode | null;
  detailKey?: string;
}): BillingReconciliationDriftFinding {
  return {
    organizationId: input.organizationId,
    subscriptionId: input.subscriptionId,
    driftType: input.driftType,
    severity: input.severity,
    localValue: input.localValue,
    stripeValue: input.stripeValue,
    suggestedAction: input.suggestedAction,
    autoFixable: input.autoFixable,
    stripeMode: input.stripeMode,
    idempotencyKey: buildBillingReconciliationDriftIdempotencyKey({
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      driftType: input.driftType,
      detailKey: input.detailKey,
    }),
  };
}

export function sleepForBillingReconciliation(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
