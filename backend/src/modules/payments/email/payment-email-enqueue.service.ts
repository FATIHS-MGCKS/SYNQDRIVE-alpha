import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  BookingPaymentRequestStatus,
  PaymentEmailType,
} from '@prisma/client';
import paymentEmailConfig from '@config/payment-email.config';
import { PrismaService } from '@shared/database/prisma.service';
import { PaymentEmailOutboxRepository } from './payment-email-outbox.repository';
import { PaymentEmailSchedulerService } from './payment-email-scheduler.service';
import {
  buildPaymentEmailIdempotencyKey,
} from './payment-email-queue.util';

@Injectable()
export class PaymentEmailEnqueueService {
  private readonly logger = new Logger(PaymentEmailEnqueueService.name);

  constructor(
    @Inject(paymentEmailConfig.KEY)
    private readonly config: ConfigType<typeof paymentEmailConfig>,
    private readonly prisma: PrismaService,
    private readonly outboxRepo: PaymentEmailOutboxRepository,
    private readonly scheduler: PaymentEmailSchedulerService,
  ) {}

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async maybeEnqueueAfterCheckout(params: {
    organizationId: string;
    paymentRequestId: string;
  }): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const request = await this.prisma.bookingPaymentRequest.findFirst({
      where: {
        id: params.paymentRequestId,
        organizationId: params.organizationId,
      },
    });
    if (!request?.sendEmailOnLink || !request.checkoutUrl) {
      return null;
    }

    const suffix = request.stripeCheckoutSessionId ?? 'checkout';
    return this.enqueueBookingPaymentRequest({
      organizationId: params.organizationId,
      paymentRequestId: params.paymentRequestId,
      idempotencySuffix: suffix,
    });
  }

  async enqueueBookingPaymentRequest(params: {
    organizationId: string;
    paymentRequestId: string;
    idempotencySuffix: string;
    sentByUserId?: string | null;
  }): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const idempotencyKey = buildPaymentEmailIdempotencyKey({
      organizationId: params.organizationId,
      paymentRequestId: params.paymentRequestId,
      emailType: PaymentEmailType.BOOKING_PAYMENT_REQUEST,
      suffix: params.idempotencySuffix,
    });

    const row = await this.outboxRepo.createEntryIdempotent({
      organizationId: params.organizationId,
      paymentRequestId: params.paymentRequestId,
      emailType: PaymentEmailType.BOOKING_PAYMENT_REQUEST,
      idempotencyKey,
      sentByUserId: params.sentByUserId ?? null,
    });

    if (!row) {
      this.logger.debug(`Duplicate payment email outbox skipped: ${idempotencyKey}`);
      return null;
    }

    await this.scheduler.scheduleOutboxIds([row.id]);
    return row.id;
  }

  async enqueuePaymentConfirmation(params: {
    organizationId: string;
    paymentRequestId: string;
  }): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const request = await this.prisma.bookingPaymentRequest.findFirst({
      where: {
        id: params.paymentRequestId,
        organizationId: params.organizationId,
      },
    });
    if (!request || request.status !== BookingPaymentRequestStatus.PAID) {
      this.logger.warn(
        `Skipping payment confirmation enqueue — request ${params.paymentRequestId} not PAID`,
      );
      return null;
    }

    const idempotencyKey = buildPaymentEmailIdempotencyKey({
      organizationId: params.organizationId,
      paymentRequestId: params.paymentRequestId,
      emailType: PaymentEmailType.PAYMENT_CONFIRMATION,
      suffix: 'once',
    });

    const row = await this.outboxRepo.createEntryIdempotent({
      organizationId: params.organizationId,
      paymentRequestId: params.paymentRequestId,
      emailType: PaymentEmailType.PAYMENT_CONFIRMATION,
      idempotencyKey,
    });

    if (!row) {
      return null;
    }

    await this.scheduler.scheduleOutboxIds([row.id]);
    return row.id;
  }
}
