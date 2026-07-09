import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  OrgEmailDomainStatus,
  OrgEmailMode,
  OutboundEmailSourceType,
  OutboundEmailStatus,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { CustomerTimelineService } from '@modules/customers/customer-timeline.service';
import { OutboundEmailService } from '@modules/outbound-email/services/outbound-email.service';
import { OrgEmailSettingsService } from '@modules/outbound-email/services/org-email-settings.service';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingDocumentEmailService } from './booking-document-email.service';
import { DOCUMENT_STATUS, DOCUMENT_TYPE } from './documents.constants';
import { GeneratedDocumentsService } from './generated-documents.service';

describe('BookingDocumentEmailService', () => {
  const orgId = 'org-1';
  const bookingId = 'booking-1';
  const userId = 'user-1';

  let service: BookingDocumentEmailService;
  let prisma: {
    booking: { findFirst: jest.Mock };
    generatedDocument: { updateMany: jest.Mock };
  };
  let generatedDocs: {
    getById: jest.Mock;
    getAttachmentBuffer: jest.Mock;
  };
  let outboundEmail: { sendExplicit: jest.Mock };
  let emailSettings: { getOrCreate: jest.Mock };
  let timeline: { addEvent: jest.Mock };
  let audit: { record: jest.Mock };

  const booking = {
    id: bookingId,
    organizationId: orgId,
    customerId: 'cust-1',
    startDate: new Date('2026-07-01T10:00:00Z'),
    endDate: new Date('2026-07-05T10:00:00Z'),
    customer: {
      id: 'cust-1',
      firstName: 'Max',
      lastName: 'Mustermann',
      email: 'max@example.test',
    },
    vehicle: { licensePlate: 'B-AB 123', make: 'VW', model: 'Golf' },
    organization: { companyName: 'Acme Rental' },
  };

  const doc = {
    id: 'doc-1',
    organizationId: orgId,
    bookingId,
    documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
    status: DOCUMENT_STATUS.GENERATED,
    fileName: 'rechnung.pdf',
  };

  beforeEach(() => {
    prisma = {
      booking: { findFirst: jest.fn().mockResolvedValue(booking) },
      generatedDocument: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    generatedDocs = {
      getById: jest.fn().mockResolvedValue(doc),
      getAttachmentBuffer: jest.fn().mockResolvedValue({
        buffer: Buffer.from('%PDF'),
        fileName: 'rechnung.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4,
        document: doc,
      }),
    };
    outboundEmail = {
      sendExplicit: jest.fn().mockResolvedValue({
        id: 'mail-1',
        status: OutboundEmailStatus.SENT_SIMULATED,
        to: 'max@example.test',
        fromEmail: 'noreply@synqdrive.eu',
        fromName: 'SynqDrive',
        replyToEmail: 'billing@acme.test',
        providerMessageId: 'dev-1',
        errorMessage: null,
      }),
    };
    emailSettings = {
      getOrCreate: jest.fn().mockResolvedValue({
        mode: OrgEmailMode.SYNQDRIVE_DEFAULT,
        signatureText: null,
        signatureHtml: null,
      }),
    };
    timeline = { addEvent: jest.fn().mockResolvedValue({ id: 'tl-1' }) };
    audit = { record: jest.fn().mockResolvedValue('log-1') };

    service = new BookingDocumentEmailService(
      prisma as unknown as PrismaService,
      generatedDocs as unknown as GeneratedDocumentsService,
      outboundEmail as unknown as OutboundEmailService,
      emailSettings as unknown as OrgEmailSettingsService,
      timeline as unknown as CustomerTimelineService,
      audit as unknown as AuditService,
    );
  });

  it('rejects document from another booking', async () => {
    generatedDocs.getById.mockResolvedValue({
      ...doc,
      bookingId: 'other-booking',
    });

    await expect(
      service.sendBookingDocumentsEmail(orgId, bookingId, { documentIds: ['doc-1'] }, userId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects VOID documents', async () => {
    generatedDocs.getById.mockResolvedValue({
      ...doc,
      status: DOCUMENT_STATUS.VOID,
    });

    await expect(
      service.sendBookingDocumentsEmail(orgId, bookingId, { documentIds: ['doc-1'] }, userId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when customer has no email and to is missing', async () => {
    prisma.booking.findFirst.mockResolvedValue({
      ...booking,
      customer: { ...booking.customer, email: null },
    });

    await expect(
      service.sendBookingDocumentsEmail(orgId, bookingId, { documentIds: ['doc-1'] }, userId),
    ).rejects.toThrow(/keine gültige E-Mail-Adresse/);
  });

  it('sends with default recipient and simulated status', async () => {
    const result = await service.sendBookingDocumentsEmail(
      orgId,
      bookingId,
      { documentIds: ['doc-1'] },
      userId,
    );

    expect(outboundEmail.sendExplicit).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        bookingId,
        customerId: 'cust-1',
        to: 'max@example.test',
        sourceType: OutboundEmailSourceType.INVOICE,
        attachments: [
          expect.objectContaining({
            generatedDocumentId: 'doc-1',
            fileName: 'rechnung.pdf',
          }),
        ],
      }),
    );
    expect(result.status).toBe(OutboundEmailStatus.SENT_SIMULATED);
    expect(result.outboundEmailId).toBe('mail-1');
    expect(prisma.generatedDocument.updateMany).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metaJson: expect.objectContaining({ eventType: 'DOCUMENT_EMAIL_SENT' }),
      }),
    );
  });

  it('uses explicit to override when provided', async () => {
    await service.sendBookingDocumentsEmail(
      orgId,
      bookingId,
      { documentIds: ['doc-1'], to: 'other@example.test' },
      userId,
    );

    expect(outboundEmail.sendExplicit).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'other@example.test' }),
    );
  });

  it('throws when booking not found', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    await expect(
      service.sendBookingDocumentsEmail(orgId, bookingId, { documentIds: ['doc-1'] }, userId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
