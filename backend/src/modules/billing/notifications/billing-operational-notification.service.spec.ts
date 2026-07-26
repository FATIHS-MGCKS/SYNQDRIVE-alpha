import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import { BillingDomainEventType } from '../domain/billing-domain.events';
import { BillingOperationalNotificationService } from './billing-operational-notification.service';

describe('BillingOperationalNotificationService', () => {
  const ingestCandidate = jest.fn();

  let service: BillingOperationalNotificationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    ingestCandidate.mockResolvedValue({ enabled: true, operation: 'created' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        BillingOperationalNotificationService,
        {
          provide: NotificationCoreService,
          useValue: {
            isEnabled: () => true,
            ingestCandidate,
          },
        },
        {
          provide: PrismaService,
          useValue: {
            billingInvoice: {
              findFirst: jest.fn().mockResolvedValue({ invoiceNumber: 'SUB-2026-0042' }),
            },
          },
        },
      ],
    }).compile();

    service = moduleRef.get(BillingOperationalNotificationService);
  });

  it('ingests PAYMENT_FAILED with stable Stripe sourceEventId', async () => {
    await service.handleDomainEvent({
      type: BillingDomainEventType.PAYMENT_FAILED,
      organizationId: 'org-1',
      occurredAt: new Date('2026-07-26T10:00:00.000Z'),
      payload: {
        invoiceId: 'inv-1',
        stripeInvoiceId: 'in_stripe_123',
      },
    });

    expect(ingestCandidate).toHaveBeenCalledTimes(1);
    const candidate = ingestCandidate.mock.calls[0][0];
    expect(candidate.eventType).toBe('PAYMENT_FAILED');
    expect(candidate.entityType).toBe('INVOICE');
    expect(candidate.entityId).toBe('inv-1');
    expect(candidate.sourceEventId).toBe('billing:stripe:PAYMENT_FAILED:in_stripe_123');
    expect(candidate.templateParams.invoiceRef).toBe('SUB-2026-0042');
    expect(candidate.metadata).not.toHaveProperty('stripeInvoiceId');
  });

  it('ingests INVOICE_OVERDUE for billing domain events', async () => {
    await service.handleDomainEvent({
      type: BillingDomainEventType.INVOICE_OVERDUE,
      organizationId: 'org-1',
      occurredAt: new Date('2026-07-26T10:00:00.000Z'),
      payload: { invoiceId: 'inv-2' },
    });

    expect(ingestCandidate).toHaveBeenCalledTimes(1);
    expect(ingestCandidate.mock.calls[0][0].eventType).toBe('INVOICE_OVERDUE');
    expect(ingestCandidate.mock.calls[0][0].sourceEventId).toBe(
      'billing:billing.invoice.overdue:inv-2',
    );
  });

  it('resolves PAYMENT_FAILED and INVOICE_OVERDUE on PAYMENT_SUCCEEDED', async () => {
    await service.handleDomainEvent({
      type: BillingDomainEventType.PAYMENT_SUCCEEDED,
      organizationId: 'org-1',
      occurredAt: new Date('2026-07-26T11:00:00.000Z'),
      payload: {
        invoiceId: 'inv-3',
        stripeInvoiceId: 'in_stripe_456',
      },
    });

    expect(ingestCandidate).toHaveBeenCalledTimes(2);
    const types = ingestCandidate.mock.calls.map((c) => c[0].eventType);
    expect(types).toEqual(expect.arrayContaining(['PAYMENT_FAILED', 'INVOICE_OVERDUE']));
    expect(ingestCandidate.mock.calls.every((c) => c[0].severity === 'SUCCESS')).toBe(true);
  });

  it('skips ingest when notifications are disabled', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        BillingOperationalNotificationService,
        {
          provide: NotificationCoreService,
          useValue: { isEnabled: () => false, ingestCandidate },
        },
        { provide: PrismaService, useValue: { billingInvoice: { findFirst: jest.fn() } } },
      ],
    }).compile();

    await moduleRef.get(BillingOperationalNotificationService).handleDomainEvent({
      type: BillingDomainEventType.PAYMENT_FAILED,
      organizationId: 'org-1',
      occurredAt: new Date(),
      payload: { invoiceId: 'inv-1' },
    });

    expect(ingestCandidate).not.toHaveBeenCalled();
  });
});
