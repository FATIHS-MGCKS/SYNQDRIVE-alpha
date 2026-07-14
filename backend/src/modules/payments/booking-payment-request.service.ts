import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BookingPaymentPurpose,
  BookingPaymentRequest,
  BookingPaymentRequestStatus,
  OrganizationPaymentAccountStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { PermissionActor } from '@shared/auth/permission.util';
import { BookingInvoiceLifecycleService } from '@modules/invoices/booking-invoice-lifecycle.service';
import { InvoicesService } from '@modules/invoices/invoices.service';
import {
  resolveRecipientEmail,
  validateSnapshotInvoiceAlignment,
} from './booking-payment-invoice.validation';
import {
  ActivePaymentRequestExistsError,
  ConnectAccountNotReadyError,
  IdempotencyKeyRequiredError,
  MissingRecipientEmailError,
  MissingInvoiceError,
  ZeroPaymentAmountError,
} from './booking-payment-request.errors';
import { PaymentsFeatureDisabledConnectError } from './stripe/stripe-connect.errors';
import { PaymentFeeService } from './payment-fee.service';
import { computeCommissionableAmountFromLineItems } from './payment-policy.service';
import { PaymentFeeBasis } from './payment-fee.types';
import { PaymentStatusService } from './payment-status.service';
import { PaymentsAccessService } from './payments-access.service';
import { OrganizationPaymentAccountService } from './organization-payment-account.service';
import { BookingPaymentRequestRepository } from './repositories/booking-payment-request.repository';

export interface CreateBookingPaymentRequestInput {
  organizationId: string;
  bookingId: string;
  actor: PermissionActor;
  idempotencyKey: string;
  recipientEmail?: string;
  expiresInSeconds?: number;
  sendEmail?: boolean;
}

export interface BookingPaymentRequestResult {
  request: BookingPaymentRequest;
  depositInfoCents: number;
  canViewFee: boolean;
}

const DEFAULT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

const ACTIVE_STATUSES: BookingPaymentRequestStatus[] = [
  BookingPaymentRequestStatus.DRAFT,
  BookingPaymentRequestStatus.OPEN,
  BookingPaymentRequestStatus.LINK_PENDING,
  BookingPaymentRequestStatus.CHECKOUT_READY,
  BookingPaymentRequestStatus.LINK_SENT,
  BookingPaymentRequestStatus.PROCESSING,
];

@Injectable()
export class BookingPaymentRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsAccess: PaymentsAccessService,
    private readonly paymentFeeService: PaymentFeeService,
    private readonly paymentStatusService: PaymentStatusService,
    private readonly paymentRequestRepository: BookingPaymentRequestRepository,
    private readonly organizationPaymentAccountService: OrganizationPaymentAccountService,
    private readonly invoicesService: InvoicesService,
    private readonly bookingInvoiceLifecycle: BookingInvoiceLifecycleService,
  ) {}

  async createRentalPaymentRequest(
    input: CreateBookingPaymentRequestInput,
  ): Promise<BookingPaymentRequestResult> {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new IdempotencyKeyRequiredError();
    }

    await this.assertCreateAccess(input.organizationId, input.actor);

    const existing = await this.paymentRequestRepository.findByIdempotencyKey(
      input.organizationId,
      idempotencyKey,
    );
    if (existing) {
      return this.toResult(existing, input.actor, await this.loadDepositInfo(input.bookingId));
    }

    const connectAccount = await this.assertConnectAccountReady(input.organizationId);

    const booking = await this.prisma.booking.findFirst({
      where: { id: input.bookingId, organizationId: input.organizationId },
      include: { customer: { select: { id: true, email: true } } },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (!booking.customerId || !booking.customer) {
      throw new NotFoundException('Customer not found for booking');
    }

    const recipientEmail = resolveRecipientEmail(
      input.recipientEmail,
      booking.customer.email,
      null,
    );
    if (!recipientEmail) {
      throw new MissingRecipientEmailError();
    }

    const feeSnapshot = await this.paymentFeeService.buildFeeSnapshotForBooking(
      input.organizationId,
      input.bookingId,
    );
    const immutableFields = this.paymentFeeService.toImmutablePaymentRequestFields(feeSnapshot);
    if (immutableFields.amountCents <= 0) {
      throw new ZeroPaymentAmountError();
    }

    const snapshot = await this.prisma.bookingPriceSnapshot.findFirst({
      where: { organizationId: input.organizationId, bookingId: input.bookingId },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!snapshot) {
      throw new NotFoundException('Booking price snapshot not found');
    }

    const commissionable = computeCommissionableAmountFromLineItems(
      snapshot.lineItems.map((li) => ({
        type: li.type,
        totalNetCents: li.totalNetCents,
        totalGrossCents: li.totalGrossCents,
      })),
      feeSnapshot.feeBasis as PaymentFeeBasis,
      snapshot.currency,
    );

    const invoice = await this.resolvePayableInvoice(input.organizationId, booking);
    validateSnapshotInvoiceAlignment({
      snapshot,
      invoice,
      rentalPaymentAmountCents: immutableFields.amountCents,
      excludedDepositCents: commissionable.excludedDepositCents,
    });

    const activeExisting = await this.paymentRequestRepository.findActiveByInvoiceAndPurpose(
      input.organizationId,
      invoice.id,
      BookingPaymentPurpose.RENTAL_PAYMENT,
    );
    if (activeExisting) {
      throw new ActivePaymentRequestExistsError(invoice.id);
    }

    const expiresIn = input.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;
    const checkoutExpiresAt = new Date(Date.now() + expiresIn * 1000);

    const draft = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment-request:${input.organizationId}:${idempotencyKey}`}))`;

      const raced = await tx.bookingPaymentRequest.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: input.organizationId,
            idempotencyKey,
          },
        },
      });
      if (raced) {
        return raced;
      }

      const activeInTx = await tx.bookingPaymentRequest.findFirst({
        where: {
          organizationId: input.organizationId,
          invoiceId: invoice.id,
          purpose: BookingPaymentPurpose.RENTAL_PAYMENT,
          status: { in: ACTIVE_STATUSES },
        },
      });
      if (activeInTx) {
        throw new ActivePaymentRequestExistsError(invoice.id);
      }

      try {
        return await tx.bookingPaymentRequest.create({
          data: {
            organizationId: input.organizationId,
            bookingId: input.bookingId,
            customerId: booking.customerId,
            invoiceId: invoice.id,
            purpose: BookingPaymentPurpose.RENTAL_PAYMENT,
            amountCents: immutableFields.amountCents,
            currency: immutableFields.currency,
            idempotencyKey,
            status: BookingPaymentRequestStatus.DRAFT,
            stripeConnectedAccountId: connectAccount.stripeConnectedAccountId,
            commissionableAmountCents: immutableFields.commissionableAmountCents,
            applicationFeeAmountCents: immutableFields.applicationFeeAmountCents,
            feeRateBps: immutableFields.feeRateBps,
            fixedFeeCents: immutableFields.fixedFeeCents,
            feePolicyVersion: immutableFields.feePolicyVersion,
            feeBasis: immutableFields.feeBasis,
            recipientEmail,
            sendEmailOnLink: input.sendEmail === true,
            checkoutExpiresAt,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === 'P2002'
        ) {
          const dup = await tx.bookingPaymentRequest.findUnique({
            where: {
              organizationId_idempotencyKey: {
                organizationId: input.organizationId,
                idempotencyKey,
              },
            },
          });
          if (dup) return dup;
        }
        throw error;
      }
    });

    if (draft.status === BookingPaymentRequestStatus.OPEN) {
      return this.toResult(draft, input.actor, commissionable.excludedDepositCents);
    }

    const opened = await this.paymentStatusService.transitionPaymentRequest({
      organizationId: input.organizationId,
      paymentRequestId: draft.id,
      toStatus: BookingPaymentRequestStatus.OPEN,
    });

    return this.toResult(opened.request, input.actor, commissionable.excludedDepositCents);
  }

  private async resolvePayableInvoice(
    organizationId: string,
    booking: {
      id: string;
      customerId: string;
      vehicleId: string;
      totalPriceCents: number | null;
      dailyRateCents: number | null;
      startDate: Date;
      endDate: Date;
      currency: string;
      kmIncluded: number | null;
    },
  ) {
    let invoice = await this.bookingInvoiceLifecycle.resolveCanonicalBookingInvoice(
      organizationId,
      booking.id,
    );

    if (!invoice) {
      const created = await this.invoicesService.createBookingInvoice(organizationId, {
        id: booking.id,
        customerId: booking.customerId,
        vehicleId: booking.vehicleId,
        totalPriceCents: booking.totalPriceCents,
        dailyRateCents: booking.dailyRateCents,
        startDate: booking.startDate,
        endDate: booking.endDate,
        currency: booking.currency ?? undefined,
        kmIncluded: booking.kmIncluded,
      });
      if (!created) {
        throw new MissingInvoiceError(booking.id);
      }
      const createdId = String((created as { id: string }).id);
      invoice = await this.prisma.orgInvoice.findFirst({
        where: { id: createdId, organizationId },
      });
    }

    if (!invoice) {
      throw new MissingInvoiceError(booking.id);
    }

    return invoice;
  }

  private async assertCreateAccess(
    organizationId: string,
    actor: PermissionActor,
  ): Promise<void> {
    try {
      await this.paymentsAccess.assertPaymentsFeatureEnabled(organizationId, actor);
    } catch {
      throw new PaymentsFeatureDisabledConnectError(organizationId);
    }
    await this.paymentsAccess.assertPaymentPermission(
      organizationId,
      actor,
      'payments.create',
    );
  }

  private async assertConnectAccountReady(organizationId: string) {
    const account = await this.organizationPaymentAccountService.findByOrganization(organizationId);
    if (
      !account?.stripeConnectedAccountId
      || account.status !== OrganizationPaymentAccountStatus.ACTIVE
      || !account.chargesEnabled
    ) {
      throw new ConnectAccountNotReadyError();
    }
    return account;
  }

  private async loadDepositInfo(bookingId: string): Promise<number> {
    const snapshot = await this.prisma.bookingPriceSnapshot.findFirst({
      where: { bookingId },
      select: { depositAmountCents: true },
    });
    return snapshot?.depositAmountCents ?? 0;
  }

  private async toResult(
    request: BookingPaymentRequest,
    actor: PermissionActor,
    depositInfoCents: number,
  ): Promise<BookingPaymentRequestResult> {
    const canViewFee = await this.canViewApplicationFee(request.organizationId, actor);
    return { request, depositInfoCents, canViewFee };
  }

  private async canViewApplicationFee(
    organizationId: string,
    actor: PermissionActor,
  ): Promise<boolean> {
    if (actor.platformRole === 'MASTER_ADMIN' || actor.membershipRole === 'ORG_ADMIN') {
      return true;
    }
    try {
      await this.paymentsAccess.assertPaymentPermission(
        organizationId,
        actor,
        'payments.settings.manage',
      );
      return true;
    } catch {
      return false;
    }
  }
}
