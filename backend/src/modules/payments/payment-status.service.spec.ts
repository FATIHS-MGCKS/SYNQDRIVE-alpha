import { NotFoundException } from '@nestjs/common';
import {
  BookingPaymentRequestStatus,
  BookingPaymentStatus,
  PaymentTransactionStatus,
  PaymentTransactionType,
} from '@prisma/client';
import { PaidWithoutConfirmedChargeError } from './payment-domain.errors';
import { PaymentStatusService } from './payment-status.service';
import { BookingPaymentRequestRepository } from './repositories/booking-payment-request.repository';
import { PaymentTransactionRepository } from './repositories/payment-transaction.repository';

describe('PaymentStatusService', () => {
  const organizationId = 'org-1';
  const paymentRequestId = 'bpr-1';
  const bookingId = 'bk-1';

  let requestStore: Record<string, unknown>;
  let transactionStore: Record<string, unknown>[];

  const paymentRequestRepository = {
    findById: jest.fn(async (orgId: string, id: string) => {
      const row = requestStore;
      return row && row.organizationId === orgId && row.id === id ? row : null;
    }),
    listByBooking: jest.fn(async () => [requestStore]),
    update: jest.fn(async (id: string, orgId: string, data: Record<string, unknown>) => {
      if (requestStore.id !== id || requestStore.organizationId !== orgId) {
        throw new Error('not found');
      }
      requestStore = { ...requestStore, ...data };
      return requestStore;
    }),
  };

  const paymentTransactionRepository = {
    listByPaymentRequest: jest.fn(async () => transactionStore),
  };

  const service = new PaymentStatusService(
    paymentRequestRepository as unknown as BookingPaymentRequestRepository,
    paymentTransactionRepository as unknown as PaymentTransactionRepository,
  );

  beforeEach(() => {
    requestStore = {
      id: paymentRequestId,
      organizationId,
      bookingId,
      status: BookingPaymentRequestStatus.PROCESSING,
      amountCents: 10_000,
      paidAmountCents: 0,
      refundedAmountCents: 0,
      version: 1,
    };
    transactionStore = [];
    jest.clearAllMocks();
  });

  it('throws NotFoundException when payment request is missing', async () => {
    requestStore = {};
    await expect(
      service.transitionPaymentRequest({
        organizationId,
        paymentRequestId,
        toStatus: BookingPaymentRequestStatus.PAID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('transitions to PAID when a succeeded charge exists', async () => {
    transactionStore = [
      {
        type: PaymentTransactionType.CHARGE,
        status: PaymentTransactionStatus.SUCCEEDED,
        amountCents: 10_000,
      },
    ];

    const result = await service.transitionPaymentRequest({
      organizationId,
      paymentRequestId,
      toStatus: BookingPaymentRequestStatus.PAID,
      now: new Date('2026-07-14T12:00:00.000Z'),
    });

    expect(result.request.status).toBe(BookingPaymentRequestStatus.PAID);
    expect(result.request.paidAmountCents).toBe(10_000);
    expect(result.derivedBookingPaymentStatus).toBe(BookingPaymentStatus.PAID);
    expect(paymentRequestRepository.update).toHaveBeenCalledWith(
      paymentRequestId,
      organizationId,
      expect.objectContaining({
        status: BookingPaymentRequestStatus.PAID,
        paidAmountCents: 10_000,
        version: 2,
      }),
    );
  });

  it('rejects PAID without ledger confirmation', async () => {
    await expect(
      service.transitionPaymentRequest({
        organizationId,
        paymentRequestId,
        toStatus: BookingPaymentRequestStatus.PAID,
      }),
    ).rejects.toBeInstanceOf(PaidWithoutConfirmedChargeError);
    expect(paymentRequestRepository.update).not.toHaveBeenCalled();
  });

  it('derives booking payment status from request snapshots', () => {
    expect(
      service.deriveBookingPaymentStatusFromRequests([
        {
          status: BookingPaymentRequestStatus.OPEN,
          amountCents: 10_000,
          paidAmountCents: 0,
          refundedAmountCents: 0,
        },
      ]),
    ).toBe(BookingPaymentStatus.PENDING);
  });
});
