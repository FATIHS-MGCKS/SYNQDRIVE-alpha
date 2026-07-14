import {
  BookingPaymentPurpose,
  BookingPaymentRequestStatus,
  PaymentProvider,
  PaymentTransactionStatus,
  PaymentTransactionType,
} from '@prisma/client';
import { BookingPaymentRefundService } from './booking-payment-refund.service';
import { PaymentsAccessService } from './payments-access.service';
import { PaymentFeeService } from './payment-fee.service';
import { BookingPaymentRequestRepository } from './repositories/booking-payment-request.repository';
import { PaymentTransactionRepository } from './repositories/payment-transaction.repository';
import { OrganizationPaymentAccountService } from './organization-payment-account.service';
import type { StripeConnectAdapter } from './stripe/stripe-connect.adapter';
import { ConnectProviderError } from './stripe/stripe-connect.errors';
import { PrismaService } from '@shared/database/prisma.service';

describe('BookingPaymentRefundService', () => {
  const organizationId = 'org-1';
  const paymentRequestId = 'pr-1';
  const actor = { id: 'user-1', platformRole: 'USER' as const };

  const paidRequest = {
    id: paymentRequestId,
    organizationId,
    bookingId: 'booking-1',
    invoiceId: 'inv-1',
    purpose: BookingPaymentPurpose.RENTAL_PAYMENT,
    status: BookingPaymentRequestStatus.PAID,
    amountCents: 10_000,
    paidAmountCents: 10_000,
    refundedAmountCents: 0,
    currency: 'EUR',
    applicationFeeAmountCents: 250,
    stripeConnectedAccountId: 'acct_1',
    stripePaymentIntentId: 'pi_1',
    stripeChargeId: 'ch_1',
    stripeLivemode: false,
    version: 1,
  };

  const chargeTx = {
    id: 'tx-charge',
    type: PaymentTransactionType.CHARGE,
    status: PaymentTransactionStatus.SUCCEEDED,
    amountCents: 10_000,
  };

  const tx = {
    $executeRaw: jest.fn(),
    bookingPaymentRequest: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    paymentTransaction: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    orgInvoice: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    booking: { update: jest.fn() },
    activityLog: { create: jest.fn() },
  };

  const prisma = {
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    bookingPriceSnapshot: { findFirst: jest.fn().mockResolvedValue({ depositAmountCents: 0 }) },
    paymentTransaction: { findUnique: jest.fn() },
  };

  const paymentsAccess = {
    assertPaymentsFeatureEnabled: jest.fn(),
    assertPaymentPermission: jest.fn(),
  };

  const paymentFeeService = {
    calculateRefundFee: jest.fn().mockReturnValue({
      refundAmountCents: 10_000,
      applicationFeeRefundCents: 250,
      remainingApplicationFeeCents: 0,
      isFullRefund: true,
    }),
  };

  const stripeAdapter: jest.Mocked<Pick<StripeConnectAdapter, 'createRefund'>> = {
    createRefund: jest.fn().mockResolvedValue({
      refundId: 're_1',
      amountCents: 10_000,
      currency: 'EUR',
      status: 'succeeded',
      livemode: false,
    }),
  };

  const paymentTransactionRepository = {
    findByProviderEvent: jest.fn().mockResolvedValue(null),
  };

  const paymentRequestRepository = {
    findById: jest.fn(),
  };

  const organizationPaymentAccountService = {
    findByOrganization: jest.fn().mockResolvedValue({ stripeConnectedAccountId: 'acct_1' }),
  };

  let service: BookingPaymentRefundService;

  beforeEach(() => {
    jest.clearAllMocks();
    paymentsAccess.assertPaymentsFeatureEnabled.mockResolvedValue(undefined);
    paymentsAccess.assertPaymentPermission.mockResolvedValue(undefined);
    service = new BookingPaymentRefundService(
      prisma as unknown as PrismaService,
      paymentsAccess as unknown as PaymentsAccessService,
      paymentFeeService as unknown as PaymentFeeService,
      paymentRequestRepository as unknown as BookingPaymentRequestRepository,
      paymentTransactionRepository as unknown as PaymentTransactionRepository,
      organizationPaymentAccountService as unknown as OrganizationPaymentAccountService,
      stripeAdapter as unknown as StripeConnectAdapter,
    );

    tx.bookingPaymentRequest.findFirst.mockResolvedValue(paidRequest);
    tx.bookingPaymentRequest.findUniqueOrThrow.mockResolvedValue({
      ...paidRequest,
      status: BookingPaymentRequestStatus.REFUNDED,
      refundedAmountCents: 10_000,
    });
    tx.bookingPaymentRequest.update.mockResolvedValue({
      ...paidRequest,
      status: BookingPaymentRequestStatus.REFUNDED,
      refundedAmountCents: 10_000,
    });
    tx.paymentTransaction.findMany.mockResolvedValue([chargeTx]);
    tx.paymentTransaction.findFirst.mockResolvedValue(chargeTx);
    tx.paymentTransaction.findUnique.mockResolvedValue(null);
    tx.paymentTransaction.create.mockImplementation(({ data }) => ({ id: `tx-${data.type}`, ...data }));
    tx.orgInvoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      totalCents: 10_000,
      paidCents: 10_000,
      status: 'PAID',
      type: 'OUTGOING_BOOKING',
      paidAt: new Date(),
    });
    tx.bookingPaymentRequest.findMany.mockResolvedValue([]);
    paymentTransactionRepository.findByProviderEvent.mockResolvedValue(null);
    prisma.paymentTransaction.findUnique.mockResolvedValue(null);
    paymentRequestRepository.findById.mockResolvedValue(null);
  });

  it('requires idempotency key', async () => {
    await expect(
      service.refundPaymentRequest({
        organizationId,
        paymentRequestId,
        actor,
        idempotencyKey: '',
        reason: 'test',
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  });

  it('performs full refund', async () => {
    const result = await service.refundPaymentRequest({
      organizationId,
      paymentRequestId,
      actor,
      idempotencyKey: 'idem-full',
      reason: 'Customer request',
    });

    expect(stripeAdapter.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        connectedAccountId: 'acct_1',
        paymentIntentId: 'pi_1',
        amountCents: 10_000,
        refundApplicationFee: true,
      }),
    );
    expect(result.refundAmountCents).toBe(10_000);
    expect(result.applicationFeeRefundCents).toBe(250);
    expect(tx.orgInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paidCents: 0 }),
      }),
    );
  });

  it('performs partial refund', async () => {
    paymentFeeService.calculateRefundFee.mockReturnValue({
      refundAmountCents: 2_500,
      applicationFeeRefundCents: 63,
      remainingApplicationFeeCents: 187,
      isFullRefund: false,
    });
    stripeAdapter.createRefund.mockResolvedValue({
      refundId: 're_partial',
      amountCents: 2_500,
      currency: 'EUR',
      status: 'succeeded',
      livemode: false,
    });
    tx.bookingPaymentRequest.update.mockResolvedValue({
      ...paidRequest,
      status: BookingPaymentRequestStatus.PARTIALLY_REFUNDED,
      refundedAmountCents: 2_500,
    });

    const result = await service.refundPaymentRequest({
      organizationId,
      paymentRequestId,
      actor,
      idempotencyKey: 'idem-partial',
      amountCents: 2_500,
      reason: 'Partial',
    });

    expect(result.refundAmountCents).toBe(2_500);
    expect(tx.orgInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paidCents: 7_500 }),
      }),
    );
  });

  it('rejects refund exceeding refundable amount', async () => {
    await expect(
      service.refundPaymentRequest({
        organizationId,
        paymentRequestId,
        actor,
        idempotencyKey: 'idem-over',
        amountCents: 20_000,
        reason: 'Too much',
      }),
    ).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_REFUNDABLE' });
    expect(stripeAdapter.createRefund).not.toHaveBeenCalled();
  });

  it('replays idempotent refund without second Stripe call', async () => {
    paymentTransactionRepository.findByProviderEvent.mockResolvedValue({
      id: 'tx-refund',
      amountCents: 10_000,
      status: PaymentTransactionStatus.SUCCEEDED,
      providerObjectId: 're_1',
    });
    prisma.paymentTransaction.findUnique.mockResolvedValue({
      amountCents: 250,
      type: PaymentTransactionType.REFUND_APPLICATION_FEE,
    });
    paymentRequestRepository.findById.mockResolvedValue({
      ...paidRequest,
      status: BookingPaymentRequestStatus.REFUNDED,
      refundedAmountCents: 10_000,
    });

    const result = await service.refundPaymentRequest({
      organizationId,
      paymentRequestId,
      actor,
      idempotencyKey: 'idem-replay',
      reason: 'Again',
    });

    expect(result.idempotentReplay).toBe(true);
    expect(stripeAdapter.createRefund).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('maps Stripe provider errors', async () => {
    stripeAdapter.createRefund.mockRejectedValueOnce(new ConnectProviderError('card declined'));

    await expect(
      service.refundPaymentRequest({
        organizationId,
        paymentRequestId,
        actor,
        idempotencyKey: 'idem-stripe-fail',
        reason: 'Fail',
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_REQUEST_NOT_REFUNDABLE' });
  });

  it('rejects wrong organization via not found', async () => {
    tx.bookingPaymentRequest.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.refundPaymentRequest({
        organizationId: 'other-org',
        paymentRequestId,
        actor,
        idempotencyKey: 'idem-org',
        reason: 'Wrong org',
      }),
    ).rejects.toThrow('Payment request not found');
  });

  it('enforces payments.refund permission', async () => {
    paymentsAccess.assertPaymentPermission.mockRejectedValueOnce(new Error('forbidden'));

    await expect(
      service.refundPaymentRequest({
        organizationId,
        paymentRequestId,
        actor,
        idempotencyKey: 'idem-perm',
        reason: 'No perm',
      }),
    ).rejects.toThrow('forbidden');
  });

  it('writes REFUND and REFUND_APPLICATION_FEE ledger rows', async () => {
    await service.refundPaymentRequest({
      organizationId,
      paymentRequestId,
      actor,
      idempotencyKey: 'idem-ledger',
      reason: 'Ledger',
    });

    expect(tx.paymentTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: PaymentTransactionType.REFUND }),
      }),
    );
    expect(tx.paymentTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: PaymentTransactionType.REFUND_APPLICATION_FEE }),
      }),
    );
  });
});
