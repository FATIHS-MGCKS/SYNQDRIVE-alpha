import { BookingPriceLineItemType, BookingPaymentRequestStatus, OrganizationPaymentAccountStatus } from '@prisma/client';
import { BookingPaymentRequestService } from './booking-payment-request.service';
import { PaymentFeeService } from './payment-fee.service';
import { PaymentStatusService } from './payment-status.service';
import { PaymentsAccessService } from './payments-access.service';
import { OrganizationPaymentAccountService } from './organization-payment-account.service';
import { BookingPaymentRequestRepository } from './repositories/booking-payment-request.repository';
import {
  ActivePaymentRequestExistsError,
  ConnectAccountNotReadyError,
  IdempotencyKeyRequiredError,
  MissingRecipientEmailError,
} from './booking-payment-request.errors';
import { PaymentsFeatureDisabledConnectError } from './stripe/stripe-connect.errors';
import { PaymentFeeBasis } from './payment-fee.types';

describe('BookingPaymentRequestService', () => {
  const organizationId = 'org-1';
  const bookingId = 'bk-1';
  const actor = { id: 'user-1', organizationId, membershipRole: 'ORG_ADMIN' };

  const prisma = {
    booking: { findFirst: jest.fn() },
    bookingPriceSnapshot: { findFirst: jest.fn() },
    orgInvoice: { findFirst: jest.fn() },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    bookingPaymentRequest: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  const paymentsAccess = {
    assertPaymentsFeatureEnabled: jest.fn(),
    assertPaymentPermission: jest.fn(),
  };

  const paymentFeeService = {
    buildFeeSnapshotForBooking: jest.fn(),
    toImmutablePaymentRequestFields: jest.fn(),
  } as unknown as PaymentFeeService;

  const paymentStatusService = {
    transitionPaymentRequest: jest.fn(),
  } as unknown as PaymentStatusService;

  const paymentRequestRepository = {
    findByIdempotencyKey: jest.fn(),
    findActiveByInvoiceAndPurpose: jest.fn(),
  } as unknown as BookingPaymentRequestRepository;

  const organizationPaymentAccountService = {
    findByOrganization: jest.fn(),
  } as unknown as OrganizationPaymentAccountService;

  const invoicesService = {
    createBookingInvoice: jest.fn(),
  };

  const bookingInvoiceLifecycle = {
    resolveCanonicalBookingInvoice: jest.fn(),
  };

  let service: BookingPaymentRequestService;

  const lineItems = [
    {
      type: BookingPriceLineItemType.BASE_RENTAL,
      totalNetCents: 10_000,
      totalGrossCents: 11_900,
    },
    {
      type: BookingPriceLineItemType.DEPOSIT,
      totalNetCents: 50_000,
      totalGrossCents: 50_000,
    },
  ];

  const feeSnapshot = {
    rentalPaymentAmountCents: 11_900,
    commissionableAmountCents: 11_900,
    applicationFeeAmountCents: 382,
    feeRateBps: 250,
    fixedFeeCents: 25,
    feePolicyVersion: '2026-07-14-v1',
    feeBasis: PaymentFeeBasis.GROSS_RENTAL_EXCL_DEPOSIT,
    currency: 'EUR',
  };

  const invoice = {
    id: 'inv-1',
    organizationId,
    bookingId,
    currency: 'EUR',
    totalCents: 61_900,
    paidCents: 0,
    outstandingCents: 61_900,
    status: 'ISSUED',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BookingPaymentRequestService(
      prisma as never,
      paymentsAccess as never,
      paymentFeeService,
      paymentStatusService,
      paymentRequestRepository,
      organizationPaymentAccountService,
      invoicesService as never,
      bookingInvoiceLifecycle as never,
    );

    paymentsAccess.assertPaymentsFeatureEnabled.mockResolvedValue(undefined);
    paymentsAccess.assertPaymentPermission.mockResolvedValue(undefined);
    paymentRequestRepository.findByIdempotencyKey = jest.fn().mockResolvedValue(null);
    paymentRequestRepository.findActiveByInvoiceAndPurpose = jest.fn().mockResolvedValue(null);
    organizationPaymentAccountService.findByOrganization = jest.fn().mockResolvedValue({
      stripeConnectedAccountId: 'acct_test',
      status: OrganizationPaymentAccountStatus.ACTIVE,
      chargesEnabled: true,
    });
    prisma.booking.findFirst.mockResolvedValue({
      id: bookingId,
      organizationId,
      customerId: 'cust-1',
      vehicleId: 'veh-1',
      customer: { id: 'cust-1', email: 'renter@example.com' },
      totalPriceCents: 61_900,
      dailyRateCents: 1000,
      startDate: new Date(),
      endDate: new Date(),
      currency: 'EUR',
      kmIncluded: 1000,
    });
    (paymentFeeService.buildFeeSnapshotForBooking as jest.Mock).mockResolvedValue(feeSnapshot);
    (paymentFeeService.toImmutablePaymentRequestFields as jest.Mock).mockReturnValue({
      amountCents: 11_900,
      currency: 'EUR',
      commissionableAmountCents: 11_900,
      applicationFeeAmountCents: 382,
      feeRateBps: 250,
      fixedFeeCents: 25,
      feePolicyVersion: '2026-07-14-v1',
      feeBasis: PaymentFeeBasis.GROSS_RENTAL_EXCL_DEPOSIT,
    });
    prisma.bookingPriceSnapshot.findFirst.mockResolvedValue({
      currency: 'EUR',
      depositAmountCents: 50_000,
      lineItems,
    });
    bookingInvoiceLifecycle.resolveCanonicalBookingInvoice = jest
      .fn()
      .mockResolvedValue(invoice);
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn(prisma),
    );
    prisma.bookingPaymentRequest.findUnique.mockResolvedValue(null);
    prisma.bookingPaymentRequest.findFirst.mockResolvedValue(null);
    prisma.bookingPaymentRequest.create.mockResolvedValue({
      id: 'pr-1',
      status: BookingPaymentRequestStatus.DRAFT,
      amountCents: 11_900,
      currency: 'EUR',
      organizationId,
      applicationFeeAmountCents: 382,
      feePolicyVersion: '2026-07-14-v1',
      recipientEmail: 'renter@example.com',
      sendEmailOnLink: false,
      checkoutExpiresAt: new Date(),
    });
    (paymentStatusService.transitionPaymentRequest as jest.Mock).mockResolvedValue({
      request: {
        id: 'pr-1',
        status: BookingPaymentRequestStatus.OPEN,
        amountCents: 11_900,
        currency: 'EUR',
        organizationId,
        applicationFeeAmountCents: 382,
        feePolicyVersion: '2026-07-14-v1',
        recipientEmail: 'renter@example.com',
        sendEmailOnLink: false,
        checkoutExpiresAt: new Date(),
      },
    });
  });

  it('requires idempotency key', async () => {
    await expect(
      service.createRentalPaymentRequest({
        organizationId,
        bookingId,
        actor,
        idempotencyKey: '',
      }),
    ).rejects.toBeInstanceOf(IdempotencyKeyRequiredError);
  });

  it('blocks when payments feature disabled', async () => {
    paymentsAccess.assertPaymentsFeatureEnabled.mockRejectedValue(new Error('disabled'));
    await expect(
      service.createRentalPaymentRequest({
        organizationId,
        bookingId,
        actor,
        idempotencyKey: 'idem-1',
      }),
    ).rejects.toBeInstanceOf(PaymentsFeatureDisabledConnectError);
  });

  it('rejects missing recipient email', async () => {
    prisma.booking.findFirst.mockResolvedValue({
      id: bookingId,
      organizationId,
      customerId: 'cust-1',
      vehicleId: 'veh-1',
      customer: { id: 'cust-1', email: null },
    });
    await expect(
      service.createRentalPaymentRequest({
        organizationId,
        bookingId,
        actor,
        idempotencyKey: 'idem-1',
      }),
    ).rejects.toBeInstanceOf(MissingRecipientEmailError);
  });

  it('rejects when connect account is not active', async () => {
    organizationPaymentAccountService.findByOrganization = jest.fn().mockResolvedValue({
      stripeConnectedAccountId: 'acct_test',
      status: OrganizationPaymentAccountStatus.ONBOARDING,
      chargesEnabled: false,
    });
    await expect(
      service.createRentalPaymentRequest({
        organizationId,
        bookingId,
        actor,
        idempotencyKey: 'idem-1',
      }),
    ).rejects.toBeInstanceOf(ConnectAccountNotReadyError);
  });

  it('creates OPEN payment request from snapshot without deposit in amount', async () => {
    const result = await service.createRentalPaymentRequest({
      organizationId,
      bookingId,
      actor,
      idempotencyKey: 'idem-1',
    });

    expect(result.request.status).toBe(BookingPaymentRequestStatus.OPEN);
    expect(result.request.amountCents).toBe(11_900);
    expect(result.request.amountCents).not.toBe(61_900);
    expect(result.depositInfoCents).toBe(50_000);
    expect(prisma.bookingPaymentRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          purpose: 'RENTAL_PAYMENT',
          amountCents: 11_900,
          applicationFeeAmountCents: 382,
        }),
      }),
    );
    expect(paymentStatusService.transitionPaymentRequest).toHaveBeenCalled();
  });

  it('returns existing request for duplicate idempotency key', async () => {
    paymentRequestRepository.findByIdempotencyKey = jest.fn().mockResolvedValue({
      id: 'pr-existing',
      status: BookingPaymentRequestStatus.OPEN,
      amountCents: 11_900,
      currency: 'EUR',
      organizationId,
      applicationFeeAmountCents: 382,
      feePolicyVersion: 'v1',
      recipientEmail: 'renter@example.com',
      sendEmailOnLink: false,
      checkoutExpiresAt: new Date(),
    });

    const result = await service.createRentalPaymentRequest({
      organizationId,
      bookingId,
      actor,
      idempotencyKey: 'idem-dup',
    });

    expect(result.request.id).toBe('pr-existing');
    expect(prisma.bookingPaymentRequest.create).not.toHaveBeenCalled();
  });

  it('rejects second active rental payment for same invoice', async () => {
    paymentRequestRepository.findActiveByInvoiceAndPurpose = jest.fn().mockResolvedValue({
      id: 'pr-active',
    });
    await expect(
      service.createRentalPaymentRequest({
        organizationId,
        bookingId,
        actor,
        idempotencyKey: 'idem-2',
      }),
    ).rejects.toBeInstanceOf(ActivePaymentRequestExistsError);
  });

  it('hides application fee from workers without settings permission', async () => {
    const worker = { id: 'w-1', organizationId };
    paymentsAccess.assertPaymentPermission.mockImplementation(
      async (_org: string, _actor: unknown, action: string) => {
        if (action === 'payments.settings.manage') throw new Error('forbidden');
      },
    );

    const result = await service.createRentalPaymentRequest({
      organizationId,
      bookingId,
      actor: worker,
      idempotencyKey: 'idem-3',
    });

    expect(result.canViewFee).toBe(false);
  });
});
