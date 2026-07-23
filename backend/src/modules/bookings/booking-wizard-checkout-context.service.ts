import { Injectable, NotFoundException } from '@nestjs/common';
import { BookingPaymentRequestStatus, OrganizationPaymentAccountStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { OrganizationPaymentAccountService } from '@modules/payments/organization-payment-account.service';
import { PaymentsAccessService } from '@modules/payments/payments-access.service';
import { PaymentFeeService } from '@modules/payments/payment-fee.service';
import { resolveRecipientEmail } from '@modules/payments/booking-payment-invoice.validation';
import { BookingDepositSnapshotService } from '@modules/deposit/booking-deposit-snapshot.service';
import type { FrozenBookingDeposit } from '@modules/deposit/frozen-booking-deposit.types';

export interface PaymentLinkEligibilityResult {
  eligible: boolean;
  reasons: string[];
  paymentsEnabled: boolean;
  connectAccountReady: boolean;
  customerEmailPresent: boolean;
  paymentRequestPossible: boolean;
}

export interface WizardCheckoutContextResult {
  currency: string;
  /** Rental gross total (excludes deposit). */
  rentalAmountCents: number;
  onlineAmountCents: number;
  depositAmountCents: number;
  frozenDeposit: FrozenBookingDeposit | null;
  rentalPaidCents: number;
  depositPaidCents: number;
  depositPreauthorizedCents: number;
  depositDueAtPickupCents: number;
  totalGrossCents: number;
  recipientEmail: string | null;
  paymentLinkEligibility: PaymentLinkEligibilityResult;
  checkoutExpiresInSeconds: number;
}

@Injectable()
export class BookingWizardCheckoutContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsAccess: PaymentsAccessService,
    private readonly organizationPaymentAccountService: OrganizationPaymentAccountService,
    private readonly paymentFeeService: PaymentFeeService,
    private readonly bookingDepositSnapshot: BookingDepositSnapshotService,
  ) {}

  async getCheckoutContext(
    orgId: string,
    bookingId: string,
  ): Promise<WizardCheckoutContextResult> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      include: {
        customer: { select: { email: true } },
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const snapshot = await this.prisma.bookingPriceSnapshot.findFirst({
      where: { organizationId: orgId, bookingId },
    });

    let onlineAmountCents = 0;
    let currency = booking.currency?.toUpperCase() || 'EUR';
    if (snapshot) {
      currency = snapshot.currency.toUpperCase();
      try {
        const feeSnapshot = await this.paymentFeeService.buildFeeSnapshotForBooking(
          orgId,
          bookingId,
        );
        onlineAmountCents = feeSnapshot.rentalPaymentAmountCents;
      } catch {
        onlineAmountCents = snapshot.totalGrossCents;
      }
    }

    const depositAmountCents = snapshot?.depositAmountCents ?? 0;
    const frozenDeposit = snapshot
      ? this.bookingDepositSnapshot.extractFrozenDepositFromPricingInput(snapshot.pricingInputJson)
      : null;

    const [depositRow, rentalPaidCents] = await Promise.all([
      this.prisma.bookingDeposit.findUnique({
        where: { bookingId },
        select: { amountCents: true, status: true },
      }),
      this.sumSucceededRentalPayments(orgId, bookingId),
    ]);

    const depositPaidCents = this.resolveDepositPaidCents(depositRow);
    const depositPreauthorizedCents = 0;
    const depositDueAtPickupCents = Math.max(0, depositAmountCents - depositPaidCents - depositPreauthorizedCents);

    const recipientEmail = resolveRecipientEmail(undefined, booking.customer?.email ?? null, undefined);
    const paymentLinkEligibility = await this.evaluatePaymentLinkEligibility(
      orgId,
      bookingId,
      recipientEmail,
      onlineAmountCents,
    );

    return {
      currency,
      rentalAmountCents: snapshot?.totalGrossCents ?? booking.totalPriceCents ?? 0,
      onlineAmountCents,
      depositAmountCents,
      frozenDeposit,
      rentalPaidCents,
      depositPaidCents,
      depositPreauthorizedCents,
      depositDueAtPickupCents,
      totalGrossCents: snapshot?.totalGrossCents ?? booking.totalPriceCents ?? 0,
      recipientEmail,
      paymentLinkEligibility,
      checkoutExpiresInSeconds: 7 * 24 * 60 * 60,
    };
  }

  private resolveDepositPaidCents(
    deposit: { amountCents: number; status: string } | null,
  ): number {
    if (!deposit) return 0;
    if (
      deposit.status === 'RECEIVED' ||
      deposit.status === 'PARTIALLY_USED' ||
      deposit.status === 'REFUNDED' ||
      deposit.status === 'PARTIALLY_REFUNDED'
    ) {
      return deposit.amountCents;
    }
    return 0;
  }

  private async sumSucceededRentalPayments(
    organizationId: string,
    bookingId: string,
  ): Promise<number> {
    const requests = await this.prisma.bookingPaymentRequest.findMany({
      where: {
        organizationId,
        bookingId,
        status: BookingPaymentRequestStatus.PAID,
      },
      select: { amountCents: true },
    });
    return requests.reduce((sum, row) => sum + row.amountCents, 0);
  }

  async evaluatePaymentLinkEligibility(
    orgId: string,
    bookingId: string,
    recipientEmail: string | null,
    onlineAmountCents: number,
  ): Promise<PaymentLinkEligibilityResult> {
    const reasons: string[] = [];
    const paymentsEnabled = await this.paymentsAccess.isPaymentsEnabled(orgId);
    if (!paymentsEnabled) {
      reasons.push('ORG_PAYMENTS_DISABLED');
    }

    const account = await this.organizationPaymentAccountService.findByOrganization(orgId);
    const connectAccountReady =
      !!account?.stripeConnectedAccountId
      && account.status === OrganizationPaymentAccountStatus.ACTIVE
      && account.chargesEnabled === true;
    if (!connectAccountReady) {
      reasons.push('CONNECT_ACCOUNT_NOT_READY');
    }

    const customerEmailPresent = !!recipientEmail?.trim();
    if (!customerEmailPresent) {
      reasons.push('MISSING_CUSTOMER_EMAIL');
    }

    const snapshot = await this.prisma.bookingPriceSnapshot.findFirst({
      where: { organizationId: orgId, bookingId },
    });
    const paymentRequestPossible = !!snapshot && onlineAmountCents > 0;
    if (!paymentRequestPossible) {
      reasons.push('PAYMENT_AMOUNT_UNAVAILABLE');
    }

    const eligible =
      paymentsEnabled
      && connectAccountReady
      && customerEmailPresent
      && paymentRequestPossible;

    return {
      eligible,
      reasons,
      paymentsEnabled,
      connectAccountReady,
      customerEmailPresent,
      paymentRequestPossible,
    };
  }
}
