import { Injectable, NotFoundException } from '@nestjs/common';
import { BookingPaymentRequest, BookingPaymentRequestStatus } from '@prisma/client';
import { PaymentDomainError, PaymentDomainErrorCode } from './payment-domain.errors';
import {
  BookingPaymentStatus,
  PaymentRequestSummary,
  PaymentRequestTransitionPatch,
  PaymentTransitionContext,
} from './payment-domain.types';
import {
  applyTransition,
  assertTransition,
  deriveBookingPaymentStatus,
} from './payment-status.transitions';
import { BookingPaymentRequestRepository } from './repositories/booking-payment-request.repository';
import { PaymentTransactionRepository } from './repositories/payment-transaction.repository';

export interface TransitionPaymentRequestInput {
  organizationId: string;
  paymentRequestId: string;
  toStatus: BookingPaymentRequestStatus;
  refundAmountCents?: number;
  now?: Date;
}

export interface TransitionPaymentRequestResult {
  request: BookingPaymentRequest;
  derivedBookingPaymentStatus: BookingPaymentStatus;
}

/**
 * Central gate for BookingPaymentRequest status changes.
 * Controllers and other modules must not update payment request status directly.
 */
@Injectable()
export class PaymentStatusService {
  constructor(
    private readonly paymentRequestRepository: BookingPaymentRequestRepository,
    private readonly paymentTransactionRepository: PaymentTransactionRepository,
  ) {}

  async transitionPaymentRequest(
    input: TransitionPaymentRequestInput,
  ): Promise<TransitionPaymentRequestResult> {
    const request = await this.paymentRequestRepository.findById(
      input.organizationId,
      input.paymentRequestId,
    );
    if (!request) {
      throw new NotFoundException('Payment request not found');
    }

    const transactions = await this.paymentTransactionRepository.listByPaymentRequest(
      input.organizationId,
      input.paymentRequestId,
    );

    const context: PaymentTransitionContext = {
      request: {
        status: request.status,
        amountCents: request.amountCents,
        paidAmountCents: request.paidAmountCents,
        refundedAmountCents: request.refundedAmountCents,
      },
      transactions: transactions.map((tx) => ({
        type: tx.type,
        status: tx.status,
        amountCents: tx.amountCents,
      })),
      refundAmountCents: input.refundAmountCents,
    };

    const patch = applyTransition(request.status, input.toStatus, context, input.now ?? new Date());
    const updated = await this.paymentRequestRepository.update(
      request.id,
      input.organizationId,
      this.toRepositoryPatch(patch, request.version),
    );

    const siblingRequests = await this.paymentRequestRepository.listByBooking(
      input.organizationId,
      request.bookingId,
    );

    return {
      request: updated,
      derivedBookingPaymentStatus: this.deriveBookingPaymentStatusFromRequests(siblingRequests),
    };
  }

  deriveBookingPaymentStatusFromRequests(
    requests: readonly PaymentRequestSummary[],
  ): BookingPaymentStatus {
    return deriveBookingPaymentStatus(requests);
  }

  assertPaymentRequestTransition(
    from: BookingPaymentRequestStatus,
    to: BookingPaymentRequestStatus,
    context: PaymentTransitionContext,
  ): void {
    assertTransition(from, to, context);
  }

  isPaymentDomainError(error: unknown): error is PaymentDomainError {
    return error instanceof PaymentDomainError;
  }

  getPaymentDomainErrorCode(error: unknown): PaymentDomainErrorCode | null {
    return error instanceof PaymentDomainError ? error.code : null;
  }

  private toRepositoryPatch(
    patch: PaymentRequestTransitionPatch,
    currentVersion: number,
  ): PaymentRequestTransitionPatch & { version: number } {
    return {
      ...patch,
      version: patch.version ?? currentVersion + 1,
    };
  }
}
