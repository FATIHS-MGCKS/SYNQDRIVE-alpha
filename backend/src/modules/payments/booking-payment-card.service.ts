import { Injectable } from '@nestjs/common';
import { BookingPaymentPurpose } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { fromPrismaBookingPaymentIntent } from '@modules/bookings/booking-payment-intent.types';
import { PaymentsAccessService } from './payments-access.service';
import { BookingPaymentRequestRepository } from './repositories/booking-payment-request.repository';
import { PaymentTransactionRepository } from './repositories/payment-transaction.repository';
import {
  type BookingPaymentCardDto,
  mapInvoiceToCardDto,
  mapPaymentRequestToCardDto,
} from './dto/booking-payment-card.response';

@Injectable()
export class BookingPaymentCardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsAccess: PaymentsAccessService,
    private readonly paymentRequestRepository: BookingPaymentRequestRepository,
    private readonly paymentTransactionRepository: PaymentTransactionRepository,
  ) {}

  async buildForBooking(
    organizationId: string,
    bookingId: string,
  ): Promise<BookingPaymentCardDto> {
    const enabled = await this.paymentsAccess.isPaymentsEnabled(organizationId);
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: {
        paymentStatus: true,
        paymentIntent: true,
      },
    });

    if (!booking) {
      return {
        enabled,
        summary: { bookingPaymentStatus: 'UNPAID', paymentIntent: null },
        primaryRequest: null,
        requests: [],
        invoice: null,
      };
    }

    const paymentIntent = fromPrismaBookingPaymentIntent(booking.paymentIntent);

    if (!enabled) {
      return {
        enabled: false,
        summary: {
          bookingPaymentStatus: booking.paymentStatus,
          paymentIntent,
        },
        primaryRequest: null,
        requests: [],
        invoice: null,
      };
    }

    const [requests, priceSnapshot, canonicalInvoice] = await Promise.all([
      this.paymentRequestRepository.listByBooking(organizationId, bookingId, {
        purpose: BookingPaymentPurpose.RENTAL_PAYMENT,
      }),
      this.prisma.bookingPriceSnapshot.findFirst({
        where: { organizationId, bookingId },
        select: { depositAmountCents: true },
      }),
      this.prisma.orgInvoice.findFirst({
        where: {
          organizationId,
          bookingId,
          type: 'OUTGOING_BOOKING',
          status: { notIn: ['VOID', 'CANCELLED', 'CREDITED'] },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const depositAmountCents = priceSnapshot?.depositAmountCents ?? 0;

    const requestDtos = await Promise.all(
      requests.map(async (request) => {
        const transactions = await this.paymentTransactionRepository.listByPaymentRequest(
          organizationId,
          request.id,
        );
        return mapPaymentRequestToCardDto(request, depositAmountCents, transactions);
      }),
    );

    const primaryRequest = requestDtos[0] ?? null;

    return {
      enabled: true,
      summary: {
        bookingPaymentStatus: booking.paymentStatus,
        paymentIntent,
      },
      primaryRequest,
      requests: requestDtos,
      invoice: canonicalInvoice ? mapInvoiceToCardDto(canonicalInvoice) : null,
    };
  }
}
