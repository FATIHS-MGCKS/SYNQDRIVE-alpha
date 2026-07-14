import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  BookingPaymentRequestStatus,
  PaymentEmailType,
} from '@prisma/client';
import paymentEmailConfig from '@config/payment-email.config';
import { PrismaService } from '@shared/database/prisma.service';
import { PaymentStatusService } from '../payment-status.service';
import { PaymentEmailOutboxRepository } from './payment-email-outbox.repository';
import { PaymentEmailSenderService } from './payment-email-sender.service';

@Injectable()
export class PaymentEmailProcessorService {
  constructor(
    @Inject(paymentEmailConfig.KEY)
    private readonly config: ConfigType<typeof paymentEmailConfig>,
    private readonly prisma: PrismaService,
    private readonly outboxRepo: PaymentEmailOutboxRepository,
    private readonly sender: PaymentEmailSenderService,
    private readonly paymentStatusService: PaymentStatusService,
  ) {}

  async processOutboxId(
    outboxId: string,
  ): Promise<'completed' | 'retry' | 'dead_letter' | 'skipped'> {
    const claimed = await this.outboxRepo.claimForProcessing(outboxId);
    if (!claimed) {
      return 'skipped';
    }

    const result = await this.sender.sendFromOutbox({
      organizationId: claimed.organizationId,
      paymentRequestId: claimed.paymentRequestId,
      emailType: claimed.emailType,
      sentByUserId: claimed.sentByUserId,
      outboxId: claimed.id,
    });

    if (result.success && result.outboundEmailId) {
      await this.applySuccessSideEffects(claimed);
      await this.outboxRepo.markCompleted(claimed.id, result.outboundEmailId);
      return 'completed';
    }

    await this.recordSendFailure(claimed.paymentRequestId, claimed.organizationId, result.errorMessage);

    if (!result.retryable || claimed.attempts >= this.config.maxAttempts) {
      await this.outboxRepo.markDeadLetter(
        claimed.id,
        result.errorMessage ?? result.errorCode ?? 'SEND_FAILED',
      );
      return 'dead_letter';
    }

    const retryAt = new Date(
      Date.now() + this.config.backoffMs * Math.pow(2, Math.max(0, claimed.attempts - 1)),
    );
    await this.outboxRepo.markRetry(
      claimed.id,
      result.errorMessage ?? result.errorCode ?? 'SEND_FAILED',
      retryAt,
    );
    return 'retry';
  }

  private async applySuccessSideEffects(claimed: {
    organizationId: string;
    paymentRequestId: string;
    emailType: PaymentEmailType;
  }) {
    const now = new Date();

    if (claimed.emailType === PaymentEmailType.BOOKING_PAYMENT_REQUEST) {
      const request = await this.prisma.bookingPaymentRequest.findFirst({
        where: {
          id: claimed.paymentRequestId,
          organizationId: claimed.organizationId,
        },
      });
      if (!request) {
        return;
      }

      if (request.status === BookingPaymentRequestStatus.CHECKOUT_READY) {
        await this.paymentStatusService.transitionPaymentRequest({
          organizationId: claimed.organizationId,
          paymentRequestId: claimed.paymentRequestId,
          toStatus: BookingPaymentRequestStatus.LINK_SENT,
        });
      }

      await this.prisma.bookingPaymentRequest.update({
        where: { id: claimed.paymentRequestId },
        data: {
          lastSentAt: now,
          sendAttemptCount: { increment: 1 },
          lastEmailErrorAt: null,
          lastEmailErrorMessage: null,
        },
      });
      return;
    }

    if (claimed.emailType === PaymentEmailType.PAYMENT_CONFIRMATION) {
      await this.prisma.bookingPaymentRequest.update({
        where: { id: claimed.paymentRequestId },
        data: {
          lastSentAt: now,
          sendAttemptCount: { increment: 1 },
          lastEmailErrorAt: null,
          lastEmailErrorMessage: null,
        },
      });
    }
  }

  private async recordSendFailure(
    paymentRequestId: string,
    organizationId: string,
    errorMessage?: string,
  ) {
    await this.prisma.bookingPaymentRequest.updateMany({
      where: { id: paymentRequestId, organizationId },
      data: {
        sendAttemptCount: { increment: 1 },
        lastEmailErrorAt: new Date(),
        lastEmailErrorMessage: errorMessage?.slice(0, 2000) ?? 'Email send failed',
      },
    });
  }
}
