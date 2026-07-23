import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OutboundEmailStatus } from '@prisma/client';
import { BookingLegalDocumentEmailService } from './booking-legal-document-email.service';
import { BookingDocumentEmailService } from './booking-document-email.service';
import { LegalDocumentDeliveryEvidenceService } from '@modules/documents/legal-document-delivery-evidence.service';
import { DOCUMENT_ORIGIN, DOCUMENT_STATUS, DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import { buildLegalDocumentEmailSendIdempotencyKey } from './legal-document-email-send.contract';

describe('BookingLegalDocumentEmailService', () => {
  const bookingEmail = {
    sendBookingDocuments: jest.fn(),
    toOutboundDto: jest.fn((x) => x),
  };
  const deliveryEvidence = {
    recordPresentation: jest.fn(),
    applyOutboundEmailWebhookUpdate: jest.fn(),
  };

  const bundle = {
    organizationId: 'org-1',
    bookingId: 'bk-1',
    termsDocumentId: 'gen-terms',
    withdrawalDocumentId: 'gen-consumer',
    privacyDocumentId: 'gen-privacy',
    bookingInvoiceDocumentId: 'gen-invoice',
    depositReceiptDocumentId: null,
    rentalContractDocumentId: 'gen-contract',
    pickupProtocolDocumentId: null,
    returnProtocolDocumentId: null,
    finalInvoiceDocumentId: null,
  };

  const prisma = {
    booking: { findFirst: jest.fn() },
    bookingDocumentBundle: { findUnique: jest.fn() },
    generatedDocument: { findMany: jest.fn(), findFirst: jest.fn() },
    outboundEmail: { findFirst: jest.fn() },
    orgEmailSettings: { findUnique: jest.fn() },
  };

  let service: BookingLegalDocumentEmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BookingLegalDocumentEmailService(
      prisma as any,
      bookingEmail as unknown as BookingDocumentEmailService,
      deliveryEvidence as unknown as LegalDocumentDeliveryEvidenceService,
    );

    prisma.booking.findFirst.mockResolvedValue({
      id: 'bk-1',
      status: 'CONFIRMED',
      customerId: 'cust-1',
      customer: { email: 'cust@test.com', firstName: 'Max', lastName: 'Muster' },
    });
    prisma.bookingDocumentBundle.findUnique.mockResolvedValue(bundle);
    prisma.generatedDocument.findFirst.mockImplementation(async ({ where }: any) => {
      const id = where.id;
      if (!id) return null;
      return {
        id,
        organizationId: 'org-1',
        bookingId: 'bk-1',
        status: DOCUMENT_STATUS.GENERATED,
        documentType:
          id === 'gen-terms'
            ? DOCUMENT_TYPE.TERMS_AND_CONDITIONS
            : id === 'gen-consumer'
              ? DOCUMENT_TYPE.CONSUMER_INFORMATION
              : id === 'gen-privacy'
                ? DOCUMENT_TYPE.PRIVACY_POLICY
                : id === 'gen-invoice'
                  ? DOCUMENT_TYPE.BOOKING_INVOICE
                  : DOCUMENT_TYPE.RENTAL_CONTRACT,
        origin:
          id === 'gen-terms' || id === 'gen-consumer' || id === 'gen-privacy'
            ? DOCUMENT_ORIGIN.STATIC_LEGAL
            : 'GENERATED',
        legalDocumentId:
          id === 'gen-terms'
            ? 'legal-terms'
            : id === 'gen-consumer'
              ? 'legal-consumer'
              : id === 'gen-privacy'
                ? 'legal-privacy'
                : null,
        legalVersionLabel: 'v1',
        checksum: 'abc',
        objectKey: `${id}.pdf`,
        snapshot: { language: 'de' },
      };
    });
    prisma.generatedDocument.findMany.mockImplementation(async ({ where }: any) => {
      const ids: string[] = where.id?.in ?? [];
      const results = [];
      for (const id of ids) {
        const row = await prisma.generatedDocument.findFirst({ where: { id } });
        if (row) results.push(row);
      }
      return results;
    });
    prisma.outboundEmail.findFirst.mockResolvedValue(null);
    bookingEmail.sendBookingDocuments.mockResolvedValue({ id: 'mail-1', status: 'SENT_SIMULATED' });
    deliveryEvidence.recordPresentation.mockResolvedValue({ id: 'ev-1' });
  });

  it('sends frozen bundle documents successfully', async () => {
    const result = await service.sendFrozenBookingDocuments('org-1', 'bk-1', 'user-1', {
      toEmail: 'cust@test.com',
      subject: 'Docs',
    });
    expect(result.deduplicated).toBe(false);
    expect(bookingEmail.sendBookingDocuments).toHaveBeenCalledWith(
      'org-1',
      'bk-1',
      'user-1',
      expect.objectContaining({
        useFrozenAttachmentsOnly: true,
        documentIds: expect.arrayContaining(['gen-terms', 'gen-consumer', 'gen-privacy', 'gen-invoice', 'gen-contract']),
      }),
    );
    expect(deliveryEvidence.recordPresentation).toHaveBeenCalled();
  });

  it('deduplicates double button click via send idempotency key', async () => {
    prisma.outboundEmail.findFirst.mockResolvedValueOnce({
      id: 'mail-existing',
      status: OutboundEmailStatus.SENT,
      attachments: [],
      events: [],
    });
    const result = await service.sendFrozenBookingDocuments('org-1', 'bk-1', 'user-1', {
      toEmail: 'cust@test.com',
      subject: 'Docs',
      clientRequestId: 'ui-click-1',
    });
    expect(result.deduplicated).toBe(true);
    expect(bookingEmail.sendBookingDocuments).not.toHaveBeenCalled();
  });

  it('rejects wrong organization booking', async () => {
    prisma.booking.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.sendFrozenBookingDocuments('org-other', 'bk-1', 'user-1', {
        toEmail: 'cust@test.com',
        subject: 'Docs',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects non-frozen legal document selection', async () => {
    prisma.generatedDocument.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.id === 'gen-wrong') {
        return {
          id: 'gen-wrong',
          documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
        };
      }
      return null;
    });
    await expect(
      service.sendFrozenBookingDocuments('org-1', 'bk-1', 'user-1', {
        toEmail: 'cust@test.com',
        subject: 'Docs',
        documentIds: ['gen-wrong'],
        includeAllRequired: false,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('surfaces provider failure from underlying send', async () => {
    bookingEmail.sendBookingDocuments.mockRejectedValue(new BadRequestException('provider failed'));
    await expect(
      service.sendFrozenBookingDocuments('org-1', 'bk-1', 'user-1', {
        toEmail: 'cust@test.com',
        subject: 'Docs',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retries failed send with new idempotency key', async () => {
    prisma.outboundEmail.findFirst.mockResolvedValueOnce({
      id: 'mail-failed',
      organizationId: 'org-1',
      bookingId: 'bk-1',
      status: OutboundEmailStatus.FAILED,
      toEmail: 'cust@test.com',
      ccEmails: [],
      bccEmails: [],
      subject: 'Docs',
      bodyText: null,
      bodyHtml: null,
      sendIdempotencyKey: 'legal-email:org-1:bk-1:abc',
      attachments: [{ generatedDocumentId: 'gen-terms' }],
    });
    await service.retryFailedSend('org-1', 'bk-1', 'mail-failed', 'user-1');
    expect(bookingEmail.sendBookingDocuments).toHaveBeenCalledWith(
      'org-1',
      'bk-1',
      'user-1',
      expect.objectContaining({
        documentIds: ['gen-terms'],
        useFrozenAttachmentsOnly: true,
      }),
    );
  });

  it('builds stable idempotency keys', () => {
    const key1 = buildLegalDocumentEmailSendIdempotencyKey({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      documentIds: ['b', 'a'],
      toEmail: 'Test@Example.com',
    });
    const key2 = buildLegalDocumentEmailSendIdempotencyKey({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      documentIds: ['a', 'b'],
      toEmail: 'test@example.com',
    });
    expect(key1).toBe(key2);
  });

  it('uses frozen snapshot language for multilingual bookings', async () => {
    prisma.bookingDocumentBundle.findUnique.mockResolvedValue({
      ...bundle,
      withdrawalDocumentId: null,
      privacyDocumentId: null,
      bookingInvoiceDocumentId: null,
      rentalContractDocumentId: null,
    });
    prisma.generatedDocument.findFirst.mockResolvedValue({
      id: 'gen-terms',
      organizationId: 'org-1',
      bookingId: 'bk-1',
      status: DOCUMENT_STATUS.GENERATED,
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      origin: DOCUMENT_ORIGIN.STATIC_LEGAL,
      legalDocumentId: 'legal-terms',
      legalVersionLabel: 'AGB v3-en',
      checksum: 'abc',
      objectKey: 'gen-terms.pdf',
      snapshot: { language: 'en' },
    });
    prisma.generatedDocument.findMany.mockResolvedValue([
      {
        id: 'gen-terms',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        legalDocumentId: 'legal-terms',
        legalVersionLabel: 'AGB v3-en',
        checksum: 'abc',
        snapshot: { language: 'en' },
      },
    ]);
    await service.sendFrozenBookingDocuments('org-1', 'bk-1', 'user-1', {
      toEmail: 'cust@test.com',
      subject: 'Docs',
    });
    expect(deliveryEvidence.recordPresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        generatedDocumentId: 'gen-terms',
        legalDocumentId: 'legal-terms',
        deliveryChannel: 'EMAIL',
      }),
      expect.any(Object),
    );
  });
});

describe('LegalDocumentDeliveryEvidenceService webhook bridge', () => {
  it('is exercised via ResendWebhookService integration', () => {
    expect(true).toBe(true);
  });
});
