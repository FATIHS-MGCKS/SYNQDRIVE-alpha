import { ConfigService } from '@nestjs/config';
import {
  BookingPaymentPurpose,
  BookingPaymentRequestStatus,
  OrganizationPaymentAccountStatus,
} from '@prisma/client';
import { ConnectAccountNotReadyError } from './booking-payment-request.errors';
import { PaymentStatusService } from './payment-status.service';
import { PaymentsAccessService } from './payments-access.service';
import { OrganizationPaymentAccountService } from './organization-payment-account.service';
import { BookingPaymentRequestRepository } from './repositories/booking-payment-request.repository';
import { StripeCheckoutService } from './stripe-checkout.service';
import {
  CheckoutIdempotencyKeyRequiredError,
  PaymentRequestNotCheckoutEligibleError,
} from './stripe-checkout.errors';
import { STRIPE_CONNECT_ADAPTER } from './stripe/stripe-connect.adapter';
import type { StripeConnectAdapter } from './stripe/stripe-connect.adapter';
import { ConnectProviderError } from './stripe/stripe-connect.errors';
import { PrismaService } from '@shared/database/prisma.service';

describe('StripeCheckoutService', () => {
  const organizationId = 'org-1';
  const bookingId = 'booking-1';
  const paymentRequestId = 'pr-1';

  const baseRequest = {
    id: paymentRequestId,
    organizationId,
    bookingId,
    invoiceId: 'inv-1',
    customerId: 'cust-1',
    purpose: BookingPaymentPurpose.RENTAL_PAYMENT,
    status: BookingPaymentRequestStatus.OPEN,
    amountCents: 59_500,
    currency: 'EUR',
    applicationFeeAmountCents: 1_488,
    feeBasis: 'GROSS_RENTAL_EXCL_DEPOSIT',
    recipientEmail: 'customer@example.com',
    stripeConnectedAccountId: 'acct_test',
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    checkoutUrl: null,
    checkoutCreatedAt: null,
    checkoutExpiresAt: new Date(Date.now() + 3_600_000),
    checkoutIdempotencyKey: null,
    stripeLivemode: null,
  };

  const prisma = {
    bookingPriceSnapshot: {
      findFirst: jest.fn(),
    },
    bookingPaymentRequest: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  const paymentsAccess = {
    assertPaymentsFeatureEnabled: jest.fn(),
    assertPaymentPermission: jest.fn(),
  };

  const paymentStatusService = {
    transitionPaymentRequest: jest.fn(),
  };

  const paymentRequestRepository = {
    findById: jest.fn(),
    findByCheckoutIdempotencyKey: jest.fn(),
  };

  const organizationPaymentAccountService = {
    findByOrganization: jest.fn(),
  };

  const stripeConnectAdapter = {
    createCheckoutSession: jest.fn(),
    getConnectedAccountStatus: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string) => {
      const map: Record<string, string | string[]> = {
        'stripe.checkoutSuccessUrl': 'https://app.synqdrive.eu/success',
        'stripe.checkoutCancelUrl': 'https://app.synqdrive.eu/cancel',
        'app.corsOrigins': ['https://app.synqdrive.eu'],
      };
      return map[key];
    }),
  };

  const paymentEmailEnqueue = {
    maybeEnqueueAfterCheckout: jest.fn(),
  };

  let service: StripeCheckoutService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StripeCheckoutService(
      prisma as unknown as PrismaService,
      configService as unknown as ConfigService,
      paymentsAccess as unknown as PaymentsAccessService,
      paymentStatusService as unknown as PaymentStatusService,
      paymentRequestRepository as unknown as BookingPaymentRequestRepository,
      organizationPaymentAccountService as unknown as OrganizationPaymentAccountService,
      stripeConnectAdapter as unknown as StripeConnectAdapter,
      paymentEmailEnqueue as never,
    );

    paymentRequestRepository.findById.mockResolvedValue({ ...baseRequest });
    paymentRequestRepository.findByCheckoutIdempotencyKey.mockResolvedValue(null);
    organizationPaymentAccountService.findByOrganization.mockResolvedValue({
      stripeConnectedAccountId: 'acct_test',
      status: OrganizationPaymentAccountStatus.ACTIVE,
      chargesEnabled: true,
      livemode: false,
    });
    stripeConnectAdapter.getConnectedAccountStatus.mockResolvedValue({
      status: OrganizationPaymentAccountStatus.ACTIVE,
      chargesEnabled: true,
      disabledReason: null,
      defaultCurrency: 'EUR',
    });
    prisma.bookingPriceSnapshot.findFirst.mockResolvedValue({
      lineItems: [
        {
          type: 'BASE_RENTAL',
          label: 'Miete',
          totalNetCents: 50_000,
          totalGrossCents: 59_500,
        },
      ],
    });
    paymentStatusService.transitionPaymentRequest
      .mockResolvedValueOnce({
        request: { ...baseRequest, status: BookingPaymentRequestStatus.LINK_PENDING },
      })
      .mockResolvedValueOnce({
        request: {
          ...baseRequest,
          status: BookingPaymentRequestStatus.CHECKOUT_READY,
          stripeCheckoutSessionId: 'cs_test_1',
          checkoutUrl: 'https://checkout.stripe.test/cs_test_1',
          stripePaymentIntentId: 'pi_test_1',
          checkoutCreatedAt: new Date(),
          checkoutExpiresAt: new Date(Date.now() + 3_600_000),
          stripeLivemode: false,
        },
      });
    stripeConnectAdapter.createCheckoutSession.mockResolvedValue({
      sessionId: 'cs_test_1',
      url: 'https://checkout.stripe.test/cs_test_1',
      paymentIntentId: 'pi_test_1',
      expiresAt: new Date(Date.now() + 3_600_000),
      livemode: false,
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn(prisma),
    );
    prisma.bookingPaymentRequest.findFirst.mockResolvedValue({
      ...baseRequest,
      status: BookingPaymentRequestStatus.LINK_PENDING,
    });
    prisma.bookingPaymentRequest.update.mockResolvedValue({
      ...baseRequest,
      status: BookingPaymentRequestStatus.LINK_PENDING,
      stripeCheckoutSessionId: 'cs_test_1',
      checkoutUrl: 'https://checkout.stripe.test/cs_test_1',
      stripePaymentIntentId: 'pi_test_1',
      checkoutCreatedAt: new Date(),
      checkoutExpiresAt: new Date(Date.now() + 3_600_000),
      stripeLivemode: false,
    });
  });

  const input = {
    organizationId,
    bookingId,
    paymentRequestId,
    actor: {},
    idempotencyKey: 'checkout-idem-1',
  };

  it('requires idempotency key', async () => {
    await expect(
      service.createCheckoutSessionForPaymentRequest({ ...input, idempotencyKey: '' }),
    ).rejects.toBeInstanceOf(CheckoutIdempotencyKeyRequiredError);
  });

  it('creates direct-charge checkout session with application fee and metadata', async () => {
    const result = await service.createCheckoutSessionForPaymentRequest(input);

    expect(stripeConnectAdapter.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        connectedAccountId: 'acct_test',
        currency: 'EUR',
        applicationFeeAmountCents: 1_488,
        metadata: {
          organizationId,
          bookingId,
          invoiceId: 'inv-1',
          paymentRequestId,
        },
        stripeIdempotencyKey: `checkout:${organizationId}:${paymentRequestId}:checkout-idem-1`,
      }),
    );
    expect(result.status).toBe(BookingPaymentRequestStatus.CHECKOUT_READY);
    expect(result.checkoutSessionId).toBe('cs_test_1');
    expect(result.amountCents).toBe(59_500);
  });

  it('returns existing active session without calling Stripe again', async () => {
    paymentRequestRepository.findById.mockResolvedValue({
      ...baseRequest,
      status: BookingPaymentRequestStatus.CHECKOUT_READY,
      stripeCheckoutSessionId: 'cs_existing',
      checkoutUrl: 'https://checkout.stripe.test/cs_existing',
      checkoutExpiresAt: new Date(Date.now() + 3_600_000),
    });

    const result = await service.createCheckoutSessionForPaymentRequest(input);
    expect(stripeConnectAdapter.createCheckoutSession).not.toHaveBeenCalled();
    expect(result.checkoutSessionId).toBe('cs_existing');
  });

  it('does not reuse expired session', async () => {
    paymentRequestRepository.findById.mockResolvedValue({
      ...baseRequest,
      status: BookingPaymentRequestStatus.CHECKOUT_READY,
      stripeCheckoutSessionId: 'cs_expired',
      checkoutUrl: 'https://checkout.stripe.test/cs_expired',
      checkoutExpiresAt: new Date(Date.now() - 60_000),
    });

    await service.createCheckoutSessionForPaymentRequest(input);
    expect(stripeConnectAdapter.createCheckoutSession).toHaveBeenCalled();
  });

  it('rejects ineligible payment request status', async () => {
    paymentRequestRepository.findById.mockResolvedValue({
      ...baseRequest,
      status: BookingPaymentRequestStatus.PAID,
    });
    await expect(service.createCheckoutSessionForPaymentRequest(input)).rejects.toBeInstanceOf(
      PaymentRequestNotCheckoutEligibleError,
    );
  });

  it('rejects when connect account is not ready', async () => {
    organizationPaymentAccountService.findByOrganization.mockResolvedValue({
      stripeConnectedAccountId: 'acct_test',
      status: OrganizationPaymentAccountStatus.ONBOARDING,
      chargesEnabled: false,
    });
    await expect(service.createCheckoutSessionForPaymentRequest(input)).rejects.toBeInstanceOf(
      ConnectAccountNotReadyError,
    );
  });

  it('rolls back to OPEN when Stripe API fails', async () => {
    stripeConnectAdapter.createCheckoutSession.mockRejectedValue(
      new ConnectProviderError('stripe down'),
    );
    paymentStatusService.transitionPaymentRequest
      .mockReset()
      .mockResolvedValueOnce({
        request: { ...baseRequest, status: BookingPaymentRequestStatus.LINK_PENDING },
      })
      .mockResolvedValueOnce({
        request: { ...baseRequest, status: BookingPaymentRequestStatus.OPEN },
      });

    await expect(service.createCheckoutSessionForPaymentRequest(input)).rejects.toThrow(
      /stripe down/,
    );
    expect(paymentStatusService.transitionPaymentRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({ toStatus: BookingPaymentRequestStatus.OPEN }),
    );
  });

  it('transitions OPEN → LINK_PENDING → CHECKOUT_READY without PAID', async () => {
    await service.createCheckoutSessionForPaymentRequest(input);
    expect(paymentStatusService.transitionPaymentRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ toStatus: BookingPaymentRequestStatus.LINK_PENDING }),
    );
    expect(paymentStatusService.transitionPaymentRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ toStatus: BookingPaymentRequestStatus.CHECKOUT_READY }),
    );
    expect(paymentStatusService.transitionPaymentRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({ toStatus: BookingPaymentRequestStatus.PAID }),
    );
  });
});
