import { NotFoundException } from '@nestjs/common';
import { OrganizationPaymentAccountStatus } from '@prisma/client';
import { BookingWizardCheckoutContextService } from './booking-wizard-checkout-context.service';

describe('BookingWizardCheckoutContextService', () => {
  const prisma = {
    booking: { findFirst: jest.fn() },
    bookingPriceSnapshot: { findFirst: jest.fn() },
    bookingDeposit: { findUnique: jest.fn() },
    bookingPaymentRequest: { findMany: jest.fn() },
  };

  const paymentsAccess = {
    isPaymentsEnabled: jest.fn(),
  };

  const organizationPaymentAccountService = {
    findByOrganization: jest.fn(),
  };

  const paymentFeeService = {
    buildFeeSnapshotForBooking: jest.fn(),
  };

  const bookingDepositSnapshot = {
    extractFrozenDepositFromPricingInput: jest.fn().mockReturnValue(null),
  };

  const service = new BookingWizardCheckoutContextService(
    prisma as never,
    paymentsAccess as never,
    organizationPaymentAccountService as never,
    paymentFeeService as never,
    bookingDepositSnapshot as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.booking.findFirst.mockResolvedValue({
      id: 'bk-1',
      organizationId: 'org-1',
      currency: 'EUR',
      totalPriceCents: 50_000,
      customer: { email: 'customer@example.com' },
    });
    prisma.bookingPriceSnapshot.findFirst.mockResolvedValue({
      currency: 'EUR',
      totalGrossCents: 50_000,
      totalDueNowCents: 45_000,
      depositAmountCents: 5_000,
    });
    paymentsAccess.isPaymentsEnabled.mockResolvedValue(true);
    organizationPaymentAccountService.findByOrganization.mockResolvedValue({
      stripeConnectedAccountId: 'acct_1',
      status: OrganizationPaymentAccountStatus.ACTIVE,
      chargesEnabled: true,
    });
    paymentFeeService.buildFeeSnapshotForBooking.mockResolvedValue({
      rentalPaymentAmountCents: 40_000,
    });
    prisma.bookingDeposit.findUnique.mockResolvedValue(null);
    prisma.bookingPaymentRequest.findMany.mockResolvedValue([]);
  });

  it('returns server-side amounts without client recalculation', async () => {
    const result = await service.getCheckoutContext('org-1', 'bk-1');

    expect(result.onlineAmountCents).toBe(40_000);
    expect(result.depositAmountCents).toBe(5_000);
    expect(result.totalGrossCents).toBe(50_000);
    expect(result.currency).toBe('EUR');
    expect(result.recipientEmail).toBe('customer@example.com');
  });

  it('marks payment_link eligible when org, connect, email and amount are ready', async () => {
    const result = await service.getCheckoutContext('org-1', 'bk-1');

    expect(result.paymentLinkEligibility.eligible).toBe(true);
    expect(result.paymentLinkEligibility.reasons).toHaveLength(0);
  });

  it('rejects payment_link when connect account is not ready', async () => {
    organizationPaymentAccountService.findByOrganization.mockResolvedValue({
      stripeConnectedAccountId: 'acct_1',
      status: OrganizationPaymentAccountStatus.PENDING,
      chargesEnabled: false,
    });

    const result = await service.getCheckoutContext('org-1', 'bk-1');

    expect(result.paymentLinkEligibility.eligible).toBe(false);
    expect(result.paymentLinkEligibility.reasons).toContain('CONNECT_ACCOUNT_NOT_READY');
  });

  it('rejects payment_link when customer email is missing', async () => {
    prisma.booking.findFirst.mockResolvedValue({
      id: 'bk-1',
      organizationId: 'org-1',
      currency: 'EUR',
      customer: { email: null },
    });

    const result = await service.getCheckoutContext('org-1', 'bk-1');

    expect(result.paymentLinkEligibility.eligible).toBe(false);
    expect(result.paymentLinkEligibility.reasons).toContain('MISSING_CUSTOMER_EMAIL');
  });

  it('rejects payment_link when payments are disabled', async () => {
    paymentsAccess.isPaymentsEnabled.mockResolvedValue(false);

    const result = await service.getCheckoutContext('org-1', 'bk-1');

    expect(result.paymentLinkEligibility.eligible).toBe(false);
    expect(result.paymentLinkEligibility.reasons).toContain('ORG_PAYMENTS_DISABLED');
  });

  it('throws when booking is not found', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);

    await expect(service.getCheckoutContext('org-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
