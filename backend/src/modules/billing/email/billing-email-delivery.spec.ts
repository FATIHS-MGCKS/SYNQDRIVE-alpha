import {
  BillingDomainEventOutboxDeliveryStatus,
  BillingEmailSuppressionReason,
  OutboundEmailEventType,
  OutboundEmailSourceType,
  OutboundEmailStatus,
} from '@prisma/client';
import { BillingEmailDeliveryAuditService } from './billing-email-delivery-audit.service';
import { BillingEmailRecipientService } from './billing-email-recipient.service';
import { BillingEmailResendService } from './billing-email-resend.service';
import { BillingDomainEventOutboxRepository } from '../billing-domain-event-outbox.repository';
import { OutboundEmailService } from '@modules/outbound-email/outbound-email.service';
import { ResendWebhookService } from '@modules/outbound-email/resend-webhook.service';
import { BillingEmailSenderService } from './billing-email-sender.service';
import { BillingDomainEventType } from '../domain/billing-domain.events';
import { BILLING_OUTBOX_EMAIL_CONSUMER_ID } from '../domain/billing-outbox';

describe('Billing email delivery audit (Prompt 30)', () => {
  const deliveryRow = {
    id: 'delivery-1',
    outboxEventId: 'outbox-1',
    consumerId: BILLING_OUTBOX_EMAIL_CONSUMER_ID,
    status: BillingDomainEventOutboxDeliveryStatus.DELIVERED,
    retryCount: 0,
    nextRetryAt: null,
    lastError: null,
    deliveredAt: new Date('2026-07-15T10:00:00.000Z'),
    createdAt: new Date('2026-07-15T09:00:00.000Z'),
    updatedAt: new Date('2026-07-15T10:00:00.000Z'),
    outboundEmailId: 'outbound-1',
    outboxEvent: {
      id: 'outbox-1',
      eventType: BillingDomainEventType.PAYMENT_SUCCEEDED,
      aggregateType: 'BillingPayment',
      aggregateId: 'pay-1',
      organizationId: 'org-1',
      idempotencyKey: 'payment:pay-1',
      payload: { organizationId: 'org-1' },
    },
    outboundEmail: {
      id: 'outbound-1',
      organizationId: 'org-1',
      bookingId: null,
      customerId: null,
      invoiceId: null,
      bookingPaymentRequestId: null,
      billingInvoiceId: 'inv-1',
      billingSubscriptionId: 'sub-1',
      billingOutboxDeliveryId: 'delivery-1',
      billingOutboxEventId: 'outbox-1',
      billingOutboxIdempotencyKey: 'payment:pay-1',
      sourceType: OutboundEmailSourceType.BILLING_EMAIL,
      status: OutboundEmailStatus.SENT,
      fromEmail: 'billing@synqdrive.eu',
      fromName: 'SynqDrive',
      replyToEmail: null,
      toEmail: 'billing@test.com',
      ccEmails: [],
      bccEmails: [],
      subject: 'Zahlung erfolgreich',
      bodyText: 'Hallo',
      bodyHtml: '<p>Hallo</p>',
      provider: 'resend',
      providerMessageId: 'em_123',
      errorCode: null,
      errorMessage: null,
      sentByUserId: null,
      sentAt: new Date('2026-07-15T09:30:00.000Z'),
      createdAt: new Date('2026-07-15T09:30:00.000Z'),
      attachments: [],
      events: [
        {
          id: 'evt-1',
          eventType: OutboundEmailEventType.QUEUED,
          occurredAt: new Date('2026-07-15T09:30:00.000Z'),
          payload: {},
        },
        {
          id: 'evt-2',
          eventType: OutboundEmailEventType.ACCEPTED,
          occurredAt: new Date('2026-07-15T09:30:01.000Z'),
          payload: { providerMessageId: 'em_123' },
        },
        {
          id: 'evt-3',
          eventType: OutboundEmailEventType.DELIVERED,
          occurredAt: new Date('2026-07-15T09:31:00.000Z'),
          payload: {},
        },
      ],
    },
  };

  const outboxRepo = {
    findEmailDeliveryById: jest.fn(),
    listEmailDeliveries: jest.fn(),
    requeueDeadLetterDelivery: jest.fn(),
  };
  const outboundEmailService = new OutboundEmailService({} as any);
  const auditService = new BillingEmailDeliveryAuditService(
    {} as any,
    outboxRepo as unknown as BillingDomainEventOutboxRepository,
    outboundEmailService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    outboxRepo.findEmailDeliveryById.mockResolvedValue(deliveryRow);
  });

  it('returns delivery status with resend message id and associations', async () => {
    const detail = await auditService.getDelivery('delivery-1');
    expect(detail.resendMessageId).toBe('em_123');
    expect(detail.billingInvoiceId).toBe('inv-1');
    expect(detail.billingSubscriptionId).toBe('sub-1');
    expect(detail.deliveryState).toBe('DELIVERED');
    expect(detail.timeline.some((entry) => entry.status === 'ACCEPTED')).toBe(true);
    expect(detail.timeline.some((entry) => entry.status === 'DELIVERED')).toBe(true);
  });

  it('exposes dead letter reason for failed deliveries', async () => {
    outboxRepo.findEmailDeliveryById.mockResolvedValue({
      ...deliveryRow,
      status: BillingDomainEventOutboxDeliveryStatus.DEAD_LETTER,
      lastError: 'provider timeout after 30s',
    });
    const detail = await auditService.getDelivery('delivery-1');
    expect(detail.deadLetterReason).toContain('provider timeout');
    expect(detail.capabilities.replayDeadLetter.allowed).toBe(true);
  });
});

describe('BillingEmailRecipientService', () => {
  const policy = { isValidEmail: (email: string) => email.includes('@') };
  const suppression = { isSuppressed: jest.fn() };
  const service = new BillingEmailRecipientService(policy as any, suppression as any);

  beforeEach(() => {
    suppression.isSuppressed.mockResolvedValue(false);
  });

  it('uses alternative billing contact when primary is suppressed', async () => {
    suppression.isSuppressed.mockImplementation(async (_org: string, email: string) =>
      email === 'invoice@test.com',
    );
    const resolved = await service.resolveRecipient('org-1', {
      invoiceEmail: 'invoice@test.com',
      email: 'office@test.com',
      managerEmail: 'manager@test.com',
    });
    expect(resolved?.email).toBe('office@test.com');
    expect(resolved?.source).toBe('organization_email');
  });

  it('returns null when all recipients are missing', async () => {
    const resolved = await service.resolveRecipient('org-1', {
      invoiceEmail: null,
      email: null,
      managerEmail: null,
    });
    expect(resolved).toBeNull();
  });
});

describe('BillingEmailResendService', () => {
  const outboxRepo = {
    findEmailDeliveryById: jest.fn(),
    requeueDeadLetterDelivery: jest.fn(),
  };
  const sender = { sendFromOutboxDelivery: jest.fn() };
  const audit = { log: jest.fn() };
  const deliveryAudit = {
    getDelivery: jest.fn(),
  };
  const service = new BillingEmailResendService(
    outboxRepo as any,
    sender as any,
    audit as any,
    deliveryAudit as any,
  );

  const deadLetterRow = {
    id: 'delivery-dl',
    status: BillingDomainEventOutboxDeliveryStatus.DEAD_LETTER,
    outboxEvent: {
      organizationId: 'org-1',
      eventType: BillingDomainEventType.PAYMENT_FAILED,
      idempotencyKey: 'payment:fail',
      payload: { organizationId: 'org-1' },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    outboxRepo.findEmailDeliveryById.mockResolvedValue(deadLetterRow);
    deliveryAudit.getDelivery.mockResolvedValue({
      capabilities: {
        replayDeadLetter: { allowed: true, reason: null },
        manualRetry: { allowed: true, reason: null },
      },
    });
  });

  it('replays dead letter delivery', async () => {
    outboxRepo.requeueDeadLetterDelivery.mockResolvedValue(true);
    await service.replayDeadLetter('delivery-dl', 'admin-1');
    expect(outboxRepo.requeueDeadLetterDelivery).toHaveBeenCalledWith('delivery-dl');
    expect(audit.log).toHaveBeenCalled();
  });

  it('supports manual resend with new idempotency key', async () => {
    sender.sendFromOutboxDelivery.mockResolvedValue({
      success: true,
      outboundEmailId: 'outbound-2',
    });
    await service.manualResend('delivery-dl', 'admin-1', 'retry-1');
    expect(sender.sendFromOutboxDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        outboxIdempotencyKey: expect.stringContaining(':manual:retry-1'),
        manual: true,
      }),
    );
  });
});

describe('ResendWebhookService billing delivery states', () => {
  const outboundEmail = { applyWebhookEvent: jest.fn() };
  const prisma = {
    outboundEmail: { findUnique: jest.fn() },
    billingEmailSuppression: { upsert: jest.fn() },
  };

  const createService = () =>
    new ResendWebhookService(
      outboundEmail as any,
      { get: jest.fn(() => '') } as any,
      prisma as any,
    );

  it('records bounce and suppresses billing recipient', async () => {
    outboundEmail.applyWebhookEvent.mockResolvedValue('outbound-1');
    prisma.outboundEmail.findUnique.mockResolvedValue({
      id: 'outbound-1',
      organizationId: 'org-1',
      toEmail: 'bounce@test.com',
      sourceType: OutboundEmailSourceType.BILLING_EMAIL,
    });
    const service = createService();
    await service.handle(
      Buffer.from('{}'),
      { type: 'email.bounced', data: { email_id: 'em_bounce' } },
      {},
    );
    expect(outboundEmail.applyWebhookEvent).toHaveBeenCalledWith(
      'em_bounce',
      OutboundEmailEventType.BOUNCED,
      expect.any(Object),
      null,
    );
    expect(prisma.billingEmailSuppression.upsert).toHaveBeenCalled();
  });

  it('is idempotent for duplicate webhook delivery', async () => {
    outboundEmail.applyWebhookEvent.mockResolvedValue('outbound-1');
    const service = createService();
    await service.handle(
      Buffer.from('{}'),
      { type: 'email.delivered', data: { email_id: 'em_1' } },
      { 'svix-id': 'msg_dup' },
    );
    expect(outboundEmail.applyWebhookEvent).toHaveBeenCalledWith(
      'em_1',
      OutboundEmailEventType.DELIVERED,
      expect.any(Object),
      'msg_dup',
    );
  });
});

describe('BillingEmailSenderService idempotency column', () => {
  it('uses billingOutboxIdempotencyKey for duplicate detection', async () => {
    const prisma = {
      outboundEmail: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-1', events: [] }),
      },
    };
    const service = new BillingEmailSenderService(
      { enabled: true, maxPdfBytes: 1, pdfFetchTimeoutMs: 1 } as any,
      prisma as any,
      { buildTemplateContext: jest.fn() } as any,
      { resolveRecipient: jest.fn() } as any,
      { getResolvedDefaults: jest.fn() } as any,
      { recordEvent: jest.fn() } as any,
      { resolve: jest.fn() } as any,
    );
    const result = await service.sendFromOutboxDelivery({
      deliveryId: 'delivery-1',
      eventType: BillingDomainEventType.INVOICE_FINALIZED,
      organizationId: 'org-1',
      outboxIdempotencyKey: 'invoice:1',
      payload: {},
    });
    expect(result.skipped).toBe(true);
    expect(prisma.outboundEmail.findFirst).toHaveBeenCalledWith({
      where: { billingOutboxIdempotencyKey: 'invoice:1' },
      include: { events: true },
    });
  });
});
