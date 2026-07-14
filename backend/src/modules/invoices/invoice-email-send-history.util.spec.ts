import { OutboundEmailDeliveryStatus, OutboundEmailSourceType, OutboundEmailStatus } from '@prisma/client';
import { mapInvoiceEmailSendHistory } from './invoice-email-send-history.util';

describe('invoice-email-send-history.util', () => {
  const baseRow = {
    id: 'mail-1',
    invoiceId: 'inv-1',
    sourceType: OutboundEmailSourceType.INVOICE_SINGLE,
    status: OutboundEmailStatus.SENT,
    deliveryStatus: OutboundEmailDeliveryStatus.DELIVERED,
    toEmail: 'customer@test.com',
    ccEmails: ['cc@test.com'],
    bccEmails: [],
    subject: 'Rechnung',
    fromEmail: 'noreply@synqdrive.eu',
    fromName: 'SynqDrive',
    replyToEmail: 'billing@test.com',
    provider: 'resend',
    providerMessageId: 'em_1',
    errorCode: null,
    errorMessage: null,
    generatedDocumentId: 'doc-1',
    documentVersionNumber: 2,
    sentByUserId: 'user-1',
    idempotencyKey: 'idem-1',
    correlationId: 'corr-1',
    requestedAt: new Date('2026-07-14T10:00:00.000Z'),
    acceptedAt: new Date('2026-07-14T10:00:01.000Z'),
    sentAt: new Date('2026-07-14T10:00:01.000Z'),
    deliveredAt: new Date('2026-07-14T10:05:00.000Z'),
    failedAt: null,
    createdAt: new Date('2026-07-14T10:00:00.000Z'),
    attachments: [{ generatedDocumentId: 'doc-1' }],
    sentByUser: {
      id: 'user-1',
      name: null,
      firstName: 'Anna',
      lastName: 'Admin',
      email: 'anna@test.com',
    },
  };

  it('maps audit fields for invoice send history', () => {
    const [entry] = mapInvoiceEmailSendHistory([baseRow]);
    expect(entry.recipient).toBe('customer@test.com');
    expect(entry.channel).toBe('E-Mail (Rechnung)');
    expect(entry.documentId).toBe('doc-1');
    expect(entry.documentVersion).toBe(2);
    expect(entry.deliveryStatus).toBe('DELIVERED');
    expect(entry.triggeredByDisplayName).toBe('Anna Admin');
    expect(entry.retryPossible).toBe(false);
    expect(entry.occurredAt).toBe(baseRow.deliveredAt!.toISOString());
  });

  it('sorts newest requestedAt first', () => {
    const older = {
      ...baseRow,
      id: 'mail-old',
      requestedAt: new Date('2026-07-01T10:00:00.000Z'),
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
      deliveredAt: null,
      deliveryStatus: OutboundEmailDeliveryStatus.ACCEPTED,
    };
    const mapped = mapInvoiceEmailSendHistory([older, baseRow]);
    expect(mapped[0].id).toBe('mail-1');
    expect(mapped[1].id).toBe('mail-old');
  });

  it('flags failed delivery as retryable', () => {
    const [entry] = mapInvoiceEmailSendHistory([
      {
        ...baseRow,
        status: OutboundEmailStatus.FAILED,
        deliveryStatus: OutboundEmailDeliveryStatus.BOUNCED,
        failedAt: new Date('2026-07-14T11:00:00.000Z'),
        errorCode: 'BOUNCED',
        errorMessage: 'Mailbox full',
      },
    ]);
    expect(entry.retryPossible).toBe(true);
    expect(entry.errorMessage).toBe('Mailbox full');
  });
});
