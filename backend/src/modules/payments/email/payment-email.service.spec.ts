import {
  BookingPaymentRequestStatus,
  PaymentEmailOutboxStatus,
  PaymentEmailType,
} from '@prisma/client';
import { PaymentEmailEnqueueService } from './payment-email-enqueue.service';
import { PaymentEmailProcessorService } from './payment-email-processor.service';
import { PaymentConfirmationNotifierService } from '../payment-confirmation-notifier.service';
import { PrismaService } from '@shared/database/prisma.service';
import { PaymentStatusService } from '../payment-status.service';
import { PaymentEmailOutboxRepository } from './payment-email-outbox.repository';
import { PaymentEmailSenderService } from './payment-email-sender.service';
import { PaymentEmailSchedulerService } from './payment-email-scheduler.service';

describe('PaymentEmailEnqueueService', () => {
  const outboxRepo = {
    createEntryIdempotent: jest.fn(),
  };
  const scheduler = {
    scheduleOutboxIds: jest.fn(),
  };
  const prisma = {
    bookingPaymentRequest: { findFirst: jest.fn() },
  };

  let service: PaymentEmailEnqueueService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentEmailEnqueueService(
      { enabled: true, maxAttempts: 5, backoffMs: 1000, pollBatchSize: 10, jobAttempts: 3, jobBackoffMs: 1000 },
      prisma as unknown as PrismaService,
      outboxRepo as unknown as PaymentEmailOutboxRepository,
      scheduler as unknown as PaymentEmailSchedulerService,
    );
  });

  it('does not enqueue confirmation when request is not PAID', async () => {
    prisma.bookingPaymentRequest.findFirst.mockResolvedValue({
      id: 'pr-1',
      status: BookingPaymentRequestStatus.PROCESSING,
    });

    const result = await service.enqueuePaymentConfirmation({
      organizationId: 'org-1',
      paymentRequestId: 'pr-1',
    });

    expect(result).toBeNull();
    expect(outboxRepo.createEntryIdempotent).not.toHaveBeenCalled();
  });

  it('enqueues confirmation only for PAID requests', async () => {
    prisma.bookingPaymentRequest.findFirst.mockResolvedValue({
      id: 'pr-1',
      status: BookingPaymentRequestStatus.PAID,
    });
    outboxRepo.createEntryIdempotent.mockResolvedValue({ id: 'outbox-1' });

    const result = await service.enqueuePaymentConfirmation({
      organizationId: 'org-1',
      paymentRequestId: 'pr-1',
    });

    expect(result).toBe('outbox-1');
    expect(outboxRepo.createEntryIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({ emailType: PaymentEmailType.PAYMENT_CONFIRMATION }),
    );
    expect(scheduler.scheduleOutboxIds).toHaveBeenCalledWith(['outbox-1']);
  });

  it('skips duplicate booking payment request outbox entries', async () => {
    outboxRepo.createEntryIdempotent.mockResolvedValue(null);
    const result = await service.enqueueBookingPaymentRequest({
      organizationId: 'org-1',
      paymentRequestId: 'pr-1',
      idempotencySuffix: 'cs_1',
    });
    expect(result).toBeNull();
  });
});

describe('PaymentEmailProcessorService', () => {
  const outboxRepo = {
    claimForProcessing: jest.fn(),
    markCompleted: jest.fn(),
    markDeadLetter: jest.fn(),
    markRetry: jest.fn(),
  };
  const sender = { sendFromOutbox: jest.fn() };
  const paymentStatusService = { transitionPaymentRequest: jest.fn() };
  const prisma = { bookingPaymentRequest: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() } };

  let processor: PaymentEmailProcessorService;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new PaymentEmailProcessorService(
      { enabled: true, maxAttempts: 3, backoffMs: 1000, pollBatchSize: 10, jobAttempts: 3, jobBackoffMs: 1000 },
      prisma as unknown as PrismaService,
      outboxRepo as unknown as PaymentEmailOutboxRepository,
      sender as unknown as PaymentEmailSenderService,
      paymentStatusService as unknown as PaymentStatusService,
    );
  });

  it('sets LINK_SENT only after successful booking payment email', async () => {
    outboxRepo.claimForProcessing.mockResolvedValue({
      id: 'outbox-1',
      organizationId: 'org-1',
      paymentRequestId: 'pr-1',
      emailType: PaymentEmailType.BOOKING_PAYMENT_REQUEST,
      attempts: 1,
      sentByUserId: null,
    });
    sender.sendFromOutbox.mockResolvedValue({
      success: true,
      outboundEmailId: 'email-1',
      retryable: false,
    });
    prisma.bookingPaymentRequest.findFirst.mockResolvedValue({
      id: 'pr-1',
      status: BookingPaymentRequestStatus.CHECKOUT_READY,
    });
    paymentStatusService.transitionPaymentRequest.mockResolvedValue({
      request: { id: 'pr-1', status: BookingPaymentRequestStatus.LINK_SENT },
    });

    const result = await processor.processOutboxId('outbox-1');

    expect(result).toBe('completed');
    expect(paymentStatusService.transitionPaymentRequest).toHaveBeenCalledWith({
      organizationId: 'org-1',
      paymentRequestId: 'pr-1',
      toStatus: BookingPaymentRequestStatus.LINK_SENT,
    });
    expect(outboxRepo.markCompleted).toHaveBeenCalledWith('outbox-1', 'email-1');
  });

  it('does not set LINK_SENT on provider failure', async () => {
    outboxRepo.claimForProcessing.mockResolvedValue({
      id: 'outbox-2',
      organizationId: 'org-1',
      paymentRequestId: 'pr-1',
      emailType: PaymentEmailType.BOOKING_PAYMENT_REQUEST,
      attempts: 1,
      sentByUserId: null,
    });
    sender.sendFromOutbox.mockResolvedValue({
      success: false,
      retryable: true,
      errorMessage: 'provider down',
    });

    const result = await processor.processOutboxId('outbox-2');

    expect(result).toBe('retry');
    expect(paymentStatusService.transitionPaymentRequest).not.toHaveBeenCalled();
    expect(prisma.bookingPaymentRequest.updateMany).toHaveBeenCalled();
  });
});

describe('PaymentConfirmationNotifierService', () => {
  it('enqueues confirmation outside transaction flow', () => {
    const enqueue = { enqueuePaymentConfirmation: jest.fn().mockResolvedValue('outbox-1') };
    const notifier = new PaymentConfirmationNotifierService(
      enqueue as unknown as PaymentEmailEnqueueService,
    );
    notifier.schedulePaymentConfirmation('pr-1', 'org-1');
    expect(enqueue.enqueuePaymentConfirmation).toHaveBeenCalledWith({
      paymentRequestId: 'pr-1',
      organizationId: 'org-1',
    });
  });
});
