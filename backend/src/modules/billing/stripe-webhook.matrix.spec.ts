import { ConfigService } from '@nestjs/config';
import { StripeWebhookDispatcherService } from './stripe-webhook-dispatcher.service';
import * as stripeClientUtil from './stripe-client.util';
import { STRIPE_BILLING_WEBHOOK_EVENT_TYPES } from './domain/stripe-webhook-matrix';

describe('StripeWebhookDispatcherService matrix', () => {
  const prisma = {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        billingDomainEventOutbox: { create: jest.fn() },
      }),
    ),
  };

  const configService = {
    get: jest.fn((key: string) => (key === 'stripe.secretKey' ? 'sk_test' : undefined)),
  } as unknown as ConfigService;

  const stripeBilling = {
    findOrganizationIdByStripeCustomer: jest.fn(),
    findOrganizationIdByStripeSubscription: jest.fn(),
    syncPaymentMethods: jest.fn(),
  };

  const stripeAdapter = {
    applyStripeSubscription: jest.fn().mockResolvedValue({ syncStatus: 'SYNCED' }),
    syncPaymentMethods: jest.fn().mockResolvedValue({ syncStatus: 'SYNCED', synced: 0 }),
  };

  const invoiceMirror = {
    mirrorStripeInvoice: jest.fn().mockResolvedValue('inv-local-1'),
  };

  const billingEvents = {
    publishSubscriptionSynced: jest.fn(),
    publishInvoiceMirrored: jest.fn(),
    publish: jest.fn(),
  };

  const paymentMethods = {
    syncPaymentMethods: jest.fn(),
    handlePaymentMethodDetached: jest.fn(),
    handlePaymentMethodUpdated: jest.fn(),
    handleSetupIntentSucceeded: jest.fn(),
    handleSetupIntentFailed: jest.fn(),
  };

  const paymentLedger = {
    mirrorPaymentIntent: jest.fn(),
    mirrorChargeRefunded: jest.fn(),
    mirrorCreditNote: jest.fn(),
    mirrorDispute: jest.fn(),
  };

  const outbox = {
    enqueue: jest.fn(),
  };

  const stripeMock = {
    subscriptions: { retrieve: jest.fn() },
  };

  let dispatcher: StripeWebhookDispatcherService;

  beforeEach(() => {
    jest.clearAllMocks();
    dispatcher = new StripeWebhookDispatcherService(
      prisma as never,
      configService,
      stripeBilling as never,
      stripeAdapter as never,
      invoiceMirror as never,
      billingEvents as never,
      paymentMethods as never,
      paymentLedger as never,
      outbox as never,
    );
    jest.spyOn(stripeClientUtil, 'getStripeClient').mockReturnValue(stripeMock as never);
    stripeBilling.findOrganizationIdByStripeCustomer.mockResolvedValue('org-1');
    stripeBilling.findOrganizationIdByStripeSubscription.mockResolvedValue('org-1');
    stripeMock.subscriptions.retrieve.mockResolvedValue({ id: 'sub_1', status: 'active' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const matrixCases: Array<{
    type: (typeof STRIPE_BILLING_WEBHOOK_EVENT_TYPES)[number];
    object: Record<string, unknown>;
    assert: () => void;
  }> = [
    {
      type: 'customer.subscription.created',
      object: { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { organizationId: 'org-1' } },
      assert: () => expect(stripeAdapter.applyStripeSubscription).toHaveBeenCalled(),
    },
    {
      type: 'customer.subscription.updated',
      object: { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { organizationId: 'org-1' } },
      assert: () => expect(stripeAdapter.applyStripeSubscription).toHaveBeenCalled(),
    },
    {
      type: 'customer.subscription.deleted',
      object: { id: 'sub_1', customer: 'cus_1', status: 'canceled', metadata: { organizationId: 'org-1' } },
      assert: () => expect(stripeAdapter.applyStripeSubscription).toHaveBeenCalled(),
    },
    {
      type: 'invoice.created',
      object: { id: 'in_1', customer: 'cus_1', subscription: 'sub_1', status: 'draft' },
      assert: () => expect(invoiceMirror.mirrorStripeInvoice).toHaveBeenCalled(),
    },
    {
      type: 'invoice.finalized',
      object: { id: 'in_1', customer: 'cus_1', subscription: 'sub_1', status: 'open' },
      assert: () => expect(invoiceMirror.mirrorStripeInvoice).toHaveBeenCalled(),
    },
    {
      type: 'invoice.paid',
      object: { id: 'in_1', customer: 'cus_1', subscription: 'sub_1', status: 'paid' },
      assert: () => expect(invoiceMirror.mirrorStripeInvoice).toHaveBeenCalled(),
    },
    {
      type: 'invoice.payment_failed',
      object: { id: 'in_1', customer: 'cus_1', subscription: 'sub_1', status: 'open' },
      assert: () => expect(invoiceMirror.mirrorStripeInvoice).toHaveBeenCalled(),
    },
    {
      type: 'invoice.voided',
      object: { id: 'in_1', customer: 'cus_1', subscription: 'sub_1', status: 'void' },
      assert: () => expect(invoiceMirror.mirrorStripeInvoice).toHaveBeenCalled(),
    },
    {
      type: 'invoice.marked_uncollectible',
      object: { id: 'in_1', customer: 'cus_1', subscription: 'sub_1', status: 'uncollectible' },
      assert: () => expect(invoiceMirror.mirrorStripeInvoice).toHaveBeenCalled(),
    },
    {
      type: 'payment_intent.succeeded',
      object: { id: 'pi_1', customer: 'cus_1', status: 'succeeded', amount: 1000 },
      assert: () => expect(paymentLedger.mirrorPaymentIntent).toHaveBeenCalled(),
    },
    {
      type: 'payment_intent.payment_failed',
      object: { id: 'pi_1', customer: 'cus_1', status: 'requires_payment_method', amount: 1000 },
      assert: () => expect(paymentLedger.mirrorPaymentIntent).toHaveBeenCalled(),
    },
    {
      type: 'setup_intent.succeeded',
      object: { id: 'seti_1', customer: 'cus_1', metadata: { organizationId: 'org-1' } },
      assert: () => expect(paymentMethods.handleSetupIntentSucceeded).toHaveBeenCalled(),
    },
    {
      type: 'payment_method.attached',
      object: { id: 'pm_1', customer: 'cus_1' },
      assert: () => expect(paymentMethods.syncPaymentMethods).toHaveBeenCalledWith('org-1'),
    },
    {
      type: 'payment_method.detached',
      object: { id: 'pm_1', customer: 'cus_1' },
      assert: () => expect(paymentMethods.handlePaymentMethodDetached).toHaveBeenCalled(),
    },
    {
      type: 'charge.refunded',
      object: { id: 'ch_1', customer: 'cus_1', refunds: { data: [] } },
      assert: () => expect(paymentLedger.mirrorChargeRefunded).toHaveBeenCalled(),
    },
    {
      type: 'credit_note.created',
      object: { id: 'cn_1', invoice: 'in_1', status: 'issued', total: 500 },
      assert: () => expect(paymentLedger.mirrorCreditNote).toHaveBeenCalled(),
    },
    {
      type: 'charge.dispute.created',
      object: { id: 'dp_1', charge: 'ch_1', amount: 1000, status: 'warning_needs_response' },
      assert: () => expect(paymentLedger.mirrorDispute).toHaveBeenCalled(),
    },
    {
      type: 'charge.dispute.closed',
      object: { id: 'dp_1', charge: 'ch_1', amount: 1000, status: 'won' },
      assert: () => expect(paymentLedger.mirrorDispute).toHaveBeenCalled(),
    },
    {
      type: 'customer.updated',
      object: { id: 'cus_1', metadata: { organizationId: 'org-1' } },
      assert: () => expect(stripeBilling.syncPaymentMethods).toHaveBeenCalledWith('org-1'),
    },
  ];

  it.each(matrixCases)('happy path processes $type', async ({ type, object, assert }) => {
    const event = {
      id: `evt_${type}`,
      type,
      created: 1_700_000_000,
      livemode: false,
      data: { object },
    };

    const result = await dispatcher.dispatch({ event: event as never, organizationId: 'org-1' });

    expect(result.outcome).toBe('processed');
    assert();
  });

  it.each(matrixCases)('idempotent re-dispatch for $type still succeeds', async ({ type, object }) => {
    const event = {
      id: `evt_${type}_dup`,
      type,
      created: 1_700_000_001,
      livemode: false,
      data: { object },
    };

    await dispatcher.dispatch({ event: event as never, organizationId: 'org-1' });
    const second = await dispatcher.dispatch({ event: event as never, organizationId: 'org-1' });

    expect(second.outcome).toBe('processed');
  });

  it('returns unresolved_mapping for unknown subscription without org metadata', async () => {
    stripeBilling.findOrganizationIdByStripeCustomer.mockResolvedValue(null);
    stripeBilling.findOrganizationIdByStripeSubscription.mockResolvedValue(null);

    const result = await dispatcher.dispatch({
      event: {
        id: 'evt_unknown_sub',
        type: 'customer.subscription.updated',
        created: 1,
        livemode: false,
        data: { object: { id: 'sub_unknown', customer: 'cus_unknown', status: 'active' } },
      } as never,
      organizationId: null,
    });

    expect(result.outcome).toBe('unresolved_mapping');
    expect(outbox.enqueue).toHaveBeenCalled();
    expect(billingEvents.publish).toHaveBeenCalled();
    expect(stripeAdapter.applyStripeSubscription).not.toHaveBeenCalled();
  });

  it('resolves organization from metadata before customer lookup', async () => {
    const result = await dispatcher.resolveOrganizationId({
      id: 'evt_meta',
      type: 'invoice.paid',
      created: 1,
      livemode: false,
      data: {
        object: {
          id: 'in_meta',
          customer: 'cus_meta',
          metadata: { organizationId: 'org-meta' },
        },
      },
    } as never);

    expect(result).toBe('org-meta');
    expect(stripeBilling.findOrganizationIdByStripeCustomer).not.toHaveBeenCalled();
  });

  it('applies out-of-order subscription updates using latest Stripe payload', async () => {
    const older = {
      id: 'evt_old',
      type: 'customer.subscription.updated',
      created: 100,
      livemode: false,
      data: {
        object: {
          id: 'sub_oo',
          customer: 'cus_1',
          status: 'active',
          metadata: { organizationId: 'org-1' },
        },
      },
    };
    const newer = {
      id: 'evt_new',
      type: 'customer.subscription.updated',
      created: 200,
      livemode: false,
      data: {
        object: {
          id: 'sub_oo',
          customer: 'cus_1',
          status: 'past_due',
          metadata: { organizationId: 'org-1' },
        },
      },
    };

    await dispatcher.dispatch({ event: older as never, organizationId: 'org-1' });
    await dispatcher.dispatch({ event: newer as never, organizationId: 'org-1' });

    expect(stripeAdapter.applyStripeSubscription).toHaveBeenLastCalledWith(
      'org-1',
      expect.objectContaining({ status: 'past_due' }),
    );
  });
});
