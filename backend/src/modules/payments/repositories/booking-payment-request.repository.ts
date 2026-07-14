import { Injectable } from '@nestjs/common';
import {
  BookingPaymentPurpose,
  BookingPaymentRequest,
  BookingPaymentRequestStatus,
  PaymentProvider,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface CreateBookingPaymentRequestInput {
  organizationId: string;
  bookingId: string;
  customerId: string;
  purpose: BookingPaymentPurpose;
  amountCents: number;
  currency?: string;
  invoiceId?: string | null;
  idempotencyKey: string;
  provider?: PaymentProvider;
  status?: BookingPaymentRequestStatus;
}

export interface UpdateBookingPaymentRequestInput {
  status?: BookingPaymentRequestStatus;
  paidAmountCents?: number;
  refundedAmountCents?: number;
  stripeConnectedAccountId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
  stripeApplicationFeeId?: string | null;
  commissionableAmountCents?: number | null;
  applicationFeeAmountCents?: number | null;
  feeRateBps?: number | null;
  fixedFeeCents?: number | null;
  checkoutUrl?: string | null;
  checkoutCreatedAt?: Date | null;
  checkoutExpiresAt?: Date | null;
  lastSentAt?: Date | null;
  sendAttemptCount?: number;
  paidAt?: Date | null;
  failedAt?: Date | null;
  cancelledAt?: Date | null;
  version?: number;
}

@Injectable()
export class BookingPaymentRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Status mutations must go through PaymentStatusService — do not call update() for
   * lifecycle transitions from controllers or unrelated modules.
   */
  findById(organizationId: string, id: string): Promise<BookingPaymentRequest | null> {
    return this.prisma.bookingPaymentRequest.findFirst({
      where: { id, organizationId },
    });
  }

  findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<BookingPaymentRequest | null> {
    return this.prisma.bookingPaymentRequest.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
    });
  }

  listByBooking(
    organizationId: string,
    bookingId: string,
    filters?: { purpose?: BookingPaymentPurpose; status?: BookingPaymentRequestStatus },
  ): Promise<BookingPaymentRequest[]> {
    return this.prisma.bookingPaymentRequest.findMany({
      where: {
        organizationId,
        bookingId,
        ...(filters?.purpose ? { purpose: filters.purpose } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: CreateBookingPaymentRequestInput): Promise<BookingPaymentRequest> {
    return this.prisma.bookingPaymentRequest.create({
      data: {
        organizationId: data.organizationId,
        bookingId: data.bookingId,
        customerId: data.customerId,
        purpose: data.purpose,
        amountCents: data.amountCents,
        currency: data.currency ?? 'EUR',
        invoiceId: data.invoiceId ?? null,
        idempotencyKey: data.idempotencyKey,
        provider: data.provider ?? PaymentProvider.STRIPE,
        status: data.status ?? BookingPaymentRequestStatus.DRAFT,
      },
    });
  }

  update(
    id: string,
    organizationId: string,
    data: UpdateBookingPaymentRequestInput,
  ): Promise<BookingPaymentRequest> {
    return this.prisma.bookingPaymentRequest.update({
      where: { id, organizationId },
      data,
    });
  }
}
