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
import { detectBillingReconciliationDrift } from './billing-reconciliation';

describe('billing-reconciliation domain', () => {
  const runtimeStripeMode = BillingStripeMode.TEST;
  const organizationId = 'org-recon-1';
  const subscriptionId = 'sub-recon-1';
  const now = new Date('2026-07-15T12:00:00.000Z');

  const baseInput = {
    runtimeStripeMode,
    now,
    subscription: {
      id: subscriptionId,
      organizationId,
      status: BillingStatus.ACTIVE,
      stripeSubscriptionId: 'sub_stripe_1',
      stripeCustomerId: 'cus_1',
      stripeMode: BillingStripeMode.TEST,
      billingAnchorDay: 15,
    },
    items: [
      {
        id: 'item-1',
        status: BillingSubscriptionItemStatus.ACTIVE,
        quantity: 3,
        priceVersionId: 'pv-1',
        stripeSubscriptionItemId: 'si_1',
        stripeMode: BillingStripeMode.TEST,
        validTo: null,
        expectedStripePriceId: 'price_expected',
      },
    ],
    discounts: [],
    invoices: [],
    payments: [],
    paymentMethods: [],
    stripeSubscription: {
      id: 'sub_stripe_1',
      status: 'active',
      livemode: false,
      billingCycleAnchorDay: 15,
      items: [
        {
          id: 'si_1',
          priceId: 'price_expected',
          quantity: 3,
          localItemId: 'item-1',
        },
      ],
      couponIds: [],
      metadataOrganizationId: organizationId,
      metadataSubscriptionId: subscriptionId,
    },
    stripeInvoices: [],
    stripeCustomer: null,
    unknownStripeSubscriptions: [],
    stuckWebhooks: [],
  };

  it('returns no drift when local and stripe subscription match', () => {
    const findings = detectBillingReconciliationDrift(baseInput);
    expect(findings).toHaveLength(0);
  });

  it('detects quantity drift', () => {
    const findings = detectBillingReconciliationDrift({
      ...baseInput,
      stripeSubscription: {
        ...baseInput.stripeSubscription!,
        items: [{ ...baseInput.stripeSubscription!.items[0], quantity: 5 }],
      },
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          driftType: BillingReconciliationDriftType.QUANTITY_MISMATCH,
          localValue: '3',
          stripeValue: '5',
          autoFixable: false,
        }),
      ]),
    );
  });

  it('detects price drift', () => {
    const findings = detectBillingReconciliationDrift({
      ...baseInput,
      stripeSubscription: {
        ...baseInput.stripeSubscription!,
        items: [{ ...baseInput.stripeSubscription!.items[0], priceId: 'price_other' }],
      },
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          driftType: BillingReconciliationDriftType.WRONG_PRICE_ID,
          localValue: 'price_expected',
          stripeValue: 'price_other',
        }),
      ]),
    );
  });

  it('detects missing local invoice projection', () => {
    const findings = detectBillingReconciliationDrift({
      ...baseInput,
      stripeInvoices: [
        {
          id: 'in_missing_local',
          status: 'paid',
          amountPaid: 2500,
          paymentIntentId: 'pi_1',
        },
      ],
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          driftType: BillingReconciliationDriftType.MISSING_LOCAL_INVOICE,
          stripeValue: 'in_missing_local',
          autoFixable: true,
        }),
      ]),
    );
  });

  it('detects unknown stripe subscription without local mapping', () => {
    const findings = detectBillingReconciliationDrift({
      ...baseInput,
      unknownStripeSubscriptions: [
        {
          id: 'sub_orphan_1',
          status: 'active',
          livemode: false,
          billingCycleAnchorDay: 1,
          items: [],
          couponIds: [],
          metadataOrganizationId: organizationId,
          metadataSubscriptionId: 'other-local-sub',
        },
      ],
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          driftType: BillingReconciliationDriftType.STRIPE_SUBSCRIPTION_WITHOUT_LOCAL,
          stripeValue: 'sub_orphan_1',
          severity: BillingReconciliationDriftSeverity.CRITICAL,
        }),
      ]),
    );
  });

  it('detects missing default payment method projection', () => {
    const findings = detectBillingReconciliationDrift({
      ...baseInput,
      stripeCustomer: { id: 'cus_1', defaultPaymentMethodId: 'pm_default' },
      paymentMethods: [],
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          driftType: BillingReconciliationDriftType.MISSING_DEFAULT_PAYMENT_METHOD,
          autoFixable: true,
        }),
      ]),
    );
  });

  it('detects stuck webhook events', () => {
    const findings = detectBillingReconciliationDrift({
      ...baseInput,
      stuckWebhooks: [
        {
          id: 'wh-1',
          stripeEventId: 'evt_stuck',
          type: 'invoice.paid',
          organizationId,
          status: StripeWebhookEventStatus.FAILED,
          retryCount: 2,
          createdAt: new Date('2026-07-15T10:00:00.000Z'),
        },
      ],
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          driftType: BillingReconciliationDriftType.STUCK_WEBHOOK,
          stripeValue: 'evt_stuck',
        }),
      ]),
    );
  });

  it('detects test/live mode conflict on stored subscription', () => {
    const findings = detectBillingReconciliationDrift({
      ...baseInput,
      subscription: {
        ...baseInput.subscription,
        stripeMode: BillingStripeMode.LIVE,
      },
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          driftType: BillingReconciliationDriftType.TEST_LIVE_MODE_CONFLICT,
        }),
      ]),
    );
  });
});
