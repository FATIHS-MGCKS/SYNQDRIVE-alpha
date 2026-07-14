import {
  BookingPaymentRequestStatus,
  BookingPaymentStatus,
  InvoicePaymentMethod,
  PaymentTransactionStatus,
  PaymentTransactionType,
  StripeConnectWebhookProcessingStatus,
} from '@prisma/client';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { PaymentConfirmationNotifierService } from './payment-confirmation-notifier.service';
import { OrganizationPaymentAccountService } from './organization-payment-account.service';
import type { StripeConnectAdapter } from './stripe/stripe-connect.adapter';
import { PrismaService } from '@shared/database/prisma.service';

describe('PaymentReconciliationService', () => {
  const organizationId = 'org-1';
  const bookingId = 'booking-1';
  const paymentRequestId = 'pr-1';
  const invoiceId = 'inv-1';

  const baseRequest = {
    id: paymentRequestId,
    organizationId,
    bookingId,
    invoiceId,
    customerId: 'cust-1',
    status: BookingPaymentRequestStatus.CHECKOUT_READY,
    amountCents: 59_500,
    paidAmountCents: 0,
    refundedAmountCents: 0,
    currency: 'EUR',
    applicationFeeAmountCents: 1_488,
    stripeConnectedAccountId: 'acct_1',
    stripePaymentIntentId: null,
    stripeChargeId: null,
    stripeCheckoutSessionId: 'cs_1',
    stripeLivemode: false,
    version: 1,
    paidAt: null,
    failedAt: null,
    cancelledAt: null,
  };

  const baseInvoice = {
    id: invoiceId,
    organizationId,
    totalCents: 59_500,
    paidCents: 0,
    status: 'SENT',
    type: 'OUTGOING_BOOKING',
    paidAt: null,
  };

  const metadata = {
    organizationId,
    bookingId,
    invoiceId,
    paymentRequestId,
  };

  const tx = {
    $executeRaw: jest.fn(),
    stripeConnectWebhookEvent: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    bookingPaymentRequest: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    paymentTransaction: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    orgInvoicePayment: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    orgInvoice: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    booking: {
      update: jest.fn(),
    },
    activityLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    stripeConnectWebhookEvent: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    organizationPaymentAccount: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const organizationPaymentAccountService = {
    findByOrganization: jest.fn(),
    buildStatusUpdate: jest.fn().mockReturnValue({ chargesEnabled: true }),
  };

  const paymentConfirmationNotifier = {
    schedulePaymentConfirmation: jest.fn(),
  };

  const stripeConnectAdapter = {
    getConnectedAccountStatus: jest.fn(),
    getSafePayoutSummary: jest.fn(),
  };

  let service: PaymentReconciliationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentReconciliationService(
      prisma as unknown as PrismaService,
      organizationPaymentAccountService as unknown as OrganizationPaymentAccountService,
      paymentConfirmationNotifier as unknown as PaymentConfirmationNotifierService,
      stripeConnectAdapter as unknown as StripeConnectAdapter,
    );

    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    );
    tx.stripeConnectWebhookEvent.findUnique.mockImplementation(async () => ({
      id: 'evt-row-1',
      stripeEventId: 'evt_1',
      eventType: 'payment_intent.succeeded',
      organizationId,
      stripeConnectedAccountId: 'acct_1',
      livemode: false,
      processingStatus: StripeConnectWebhookProcessingStatus.RECEIVED,
      safeEventData: {
        objectId: 'pi_1',
        objectType: 'payment_intent',
        amount: 59_500,
        currency: 'eur',
        payment_intent: 'pi_1',
        metadata,
      },
    }));
    tx.bookingPaymentRequest.findFirst.mockResolvedValue({ ...baseRequest });
    tx.bookingPaymentRequest.findUniqueOrThrow.mockImplementation(async () => ({
      ...baseRequest,
      status: BookingPaymentRequestStatus.PROCESSING,
    }));
    tx.bookingPaymentRequest.update.mockImplementation(async ({ data }) => ({
      ...baseRequest,
      ...data,
      status: data.status ?? baseRequest.status,
    }));
    tx.paymentTransaction.findFirst.mockResolvedValue(null);
    tx.paymentTransaction.findMany.mockImplementation(async () => []);
    tx.paymentTransaction.create.mockImplementation(async ({ data }) => ({ id: 'tx-1', ...data }));
    tx.orgInvoicePayment.findUnique.mockResolvedValue(null);
    tx.orgInvoice.findFirst.mockResolvedValue({ ...baseInvoice });
    tx.bookingPaymentRequest.findMany.mockResolvedValue([
      {
        status: BookingPaymentRequestStatus.PAID,
        amountCents: 59_500,
        paidAmountCents: 59_500,
        refundedAmountCents: 0,
      },
    ]);
    prisma.stripeConnectWebhookEvent.findUnique.mockResolvedValue({
      id: 'evt-row-1',
      stripeEventId: 'evt_1',
      eventType: 'payment_intent.succeeded',
      organizationId,
      processingStatus: StripeConnectWebhookProcessingStatus.RECEIVED,
      safeEventData: {
        objectId: 'pi_1',
        objectType: 'payment_intent',
        amount: 59_500,
        currency: 'eur',
        payment_intent: 'pi_1',
        metadata,
      },
    });
  });

  it('books payment exactly once on payment_intent.succeeded', async () => {
    tx.paymentTransaction.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          type: PaymentTransactionType.CHARGE,
          status: PaymentTransactionStatus.SUCCEEDED,
          amountCents: 59_500,
        },
      ]);
    tx.bookingPaymentRequest.findUniqueOrThrow.mockResolvedValue({
      ...baseRequest,
      status: BookingPaymentRequestStatus.PROCESSING,
    });

    const result = await service.processStoredWebhookEvent('evt-row-1');

    expect(result.outcome).toBe('processed');
    expect(tx.paymentTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: PaymentTransactionType.CHARGE,
          providerObjectId: 'pi_1',
          amountCents: 59_500,
        }),
      }),
    );
    expect(tx.orgInvoicePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          method: InvoicePaymentMethod.STRIPE,
          bookingPaymentRequestId: paymentRequestId,
          stripePaymentIntentId: 'pi_1',
        }),
      }),
    );
    expect(paymentConfirmationNotifier.schedulePaymentConfirmation).toHaveBeenCalledWith(
      paymentRequestId,
      organizationId,
    );
  });

  it('skips duplicate financial booking for same payment intent', async () => {
    tx.paymentTransaction.findFirst.mockResolvedValue({
      id: 'tx-existing',
      type: PaymentTransactionType.CHARGE,
      status: PaymentTransactionStatus.SUCCEEDED,
      providerObjectId: 'pi_1',
    });
    tx.orgInvoicePayment.findUnique.mockResolvedValue({ id: 'pay-1' });
    tx.bookingPaymentRequest.findFirst.mockResolvedValue({
      ...baseRequest,
      status: BookingPaymentRequestStatus.PAID,
      paidAmountCents: 59_500,
    });

    const result = await service.processStoredWebhookEvent('evt-row-1');
    expect(result.outcome).toBe('skipped_duplicate');
    expect(tx.orgInvoicePayment.create).not.toHaveBeenCalled();
  });

  it('checkout.session.completed does not create invoice payment', async () => {
    const sessionSafeEventData = {
      objectId: 'cs_1',
      objectType: 'checkout.session',
      amount_total: 59_500,
      currency: 'eur',
      payment_intent: 'pi_1',
      metadata,
    };
    prisma.stripeConnectWebhookEvent.findUnique.mockResolvedValue({
      id: 'evt-row-2',
      stripeEventId: 'evt_2',
      eventType: 'checkout.session.completed',
      organizationId,
      processingStatus: StripeConnectWebhookProcessingStatus.RECEIVED,
      safeEventData: sessionSafeEventData,
    });
    tx.stripeConnectWebhookEvent.findUnique.mockResolvedValue({
      id: 'evt-row-2',
      stripeEventId: 'evt_2',
      eventType: 'checkout.session.completed',
      organizationId,
      stripeConnectedAccountId: 'acct_1',
      livemode: false,
      processingStatus: StripeConnectWebhookProcessingStatus.RECEIVED,
      safeEventData: sessionSafeEventData,
    });

    const result = await service.processStoredWebhookEvent('evt-row-2');
    expect(result.outcome).toBe('skipped_no_financial');
    expect(tx.orgInvoicePayment.create).not.toHaveBeenCalled();
    expect(tx.paymentTransaction.create).not.toHaveBeenCalled();
  });

  it('does not downgrade PAID on late checkout.session.completed', async () => {
    tx.bookingPaymentRequest.findFirst.mockResolvedValue({
      ...baseRequest,
      status: BookingPaymentRequestStatus.PAID,
      paidAmountCents: 59_500,
    });
    prisma.stripeConnectWebhookEvent.findUnique.mockResolvedValue({
      id: 'evt-row-3',
      stripeEventId: 'evt_3',
      eventType: 'checkout.session.completed',
      organizationId,
      processingStatus: StripeConnectWebhookProcessingStatus.RECEIVED,
      safeEventData: {
        objectId: 'cs_1',
        amount_total: 59_500,
        currency: 'eur',
        payment_intent: 'pi_1',
        metadata,
      },
    });
    tx.stripeConnectWebhookEvent.findUnique.mockResolvedValue({
      id: 'evt-row-3',
      stripeEventId: 'evt_3',
      eventType: 'checkout.session.completed',
      organizationId,
      stripeConnectedAccountId: 'acct_1',
      livemode: false,
      processingStatus: StripeConnectWebhookProcessingStatus.RECEIVED,
      safeEventData: {
        objectId: 'cs_1',
        amount_total: 59_500,
        currency: 'eur',
        payment_intent: 'pi_1',
        metadata,
      },
    });

    const result = await service.processStoredWebhookEvent('evt-row-3');
    expect(result.outcome).toBe('skipped_paid');
    expect(tx.bookingPaymentRequest.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: BookingPaymentRequestStatus.PROCESSING }) }),
    );
  });

  it('marks failed payment without invoice booking', async () => {
    prisma.stripeConnectWebhookEvent.findUnique.mockResolvedValue({
      id: 'evt-row-4',
      stripeEventId: 'evt_4',
      eventType: 'payment_intent.payment_failed',
      organizationId,
      processingStatus: StripeConnectWebhookProcessingStatus.RECEIVED,
      safeEventData: {
        objectId: 'pi_failed',
        objectType: 'payment_intent',
        amount: 59_500,
        currency: 'eur',
        metadata,
        last_payment_error: { code: 'card_declined', message: 'declined' },
      },
    });
    tx.stripeConnectWebhookEvent.findUnique.mockResolvedValue({
      id: 'evt-row-4',
      stripeEventId: 'evt_4',
      eventType: 'payment_intent.payment_failed',
      organizationId,
      stripeConnectedAccountId: 'acct_1',
      livemode: false,
      processingStatus: StripeConnectWebhookProcessingStatus.RECEIVED,
      safeEventData: {
        objectId: 'pi_failed',
        amount: 59_500,
        currency: 'eur',
        metadata,
        last_payment_error: { code: 'card_declined', message: 'declined' },
      },
    });
    tx.bookingPaymentRequest.findUniqueOrThrow.mockResolvedValue({
      ...baseRequest,
      status: BookingPaymentRequestStatus.FAILED,
    });

    const result = await service.processStoredWebhookEvent('evt-row-4');
    expect(result.outcome).toBe('processed');
    expect(tx.orgInvoicePayment.create).not.toHaveBeenCalled();
  });

  it('expires unpaid checkout without touching PAID', async () => {
    prisma.stripeConnectWebhookEvent.findUnique.mockResolvedValue({
      id: 'evt-row-5',
      stripeEventId: 'evt_5',
      eventType: 'checkout.session.expired',
      organizationId,
      processingStatus: StripeConnectWebhookProcessingStatus.RECEIVED,
      safeEventData: {
        objectId: 'cs_expired',
        amount_total: 59_500,
        currency: 'eur',
        metadata,
      },
    });
    tx.stripeConnectWebhookEvent.findUnique.mockResolvedValue({
      id: 'evt-row-5',
      stripeEventId: 'evt_5',
      eventType: 'checkout.session.expired',
      organizationId,
      stripeConnectedAccountId: 'acct_1',
      livemode: false,
      processingStatus: StripeConnectWebhookProcessingStatus.RECEIVED,
      safeEventData: {
        objectId: 'cs_expired',
        amount_total: 59_500,
        currency: 'eur',
        metadata,
      },
    });
    tx.bookingPaymentRequest.findUniqueOrThrow.mockResolvedValue({
      ...baseRequest,
      status: BookingPaymentRequestStatus.EXPIRED,
    });

    const result = await service.processStoredWebhookEvent('evt-row-5');
    expect(result.outcome).toBe('processed');
    expect(tx.orgInvoicePayment.create).not.toHaveBeenCalled();
  });

  it('derives booking payment summary after success', async () => {
    tx.paymentTransaction.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          type: PaymentTransactionType.CHARGE,
          status: PaymentTransactionStatus.SUCCEEDED,
          amountCents: 59_500,
        },
      ]);
    tx.bookingPaymentRequest.findUniqueOrThrow.mockResolvedValue({
      ...baseRequest,
      status: BookingPaymentRequestStatus.PROCESSING,
    });

    await service.processStoredWebhookEvent('evt-row-1');
    expect(tx.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { paymentStatus: BookingPaymentStatus.PAID },
      }),
    );
  });
});
