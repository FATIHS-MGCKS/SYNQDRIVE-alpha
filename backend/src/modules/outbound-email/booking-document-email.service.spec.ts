import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BookingDocumentEmailService } from './booking-document-email.service';
import { OutboundEmailPolicyService } from './outbound-email-policy.service';
import { OutboundEmailService } from './outbound-email.service';
import { EmailProviderRegistry } from './providers/email-provider.registry';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import { DOCUMENTS_STORAGE } from '@modules/documents/storage/document-storage.interface';
import { DOCUMENT_STATUS } from '@modules/documents/documents.constants';

describe('BookingDocumentEmailService', () => {
  let service: BookingDocumentEmailService;

  const prisma = {
    outboundEmail: { count: jest.fn().mockResolvedValue(0), create: jest.fn(), update: jest.fn() },
    booking: { findFirst: jest.fn() },
    generatedDocument: { findMany: jest.fn(), updateMany: jest.fn() },
    organization: { findUnique: jest.fn() },
  };
  const policy = {
    isValidEmail: jest.fn(() => true),
    validateRecipientEmails: jest.fn(),
    resolveIdentity: jest.fn().mockResolvedValue({
      fromEmail: 'noreply@synqdrive.eu',
      fromName: 'SynqDrive',
      replyToEmail: 'billing@test.com',
      mode: 'SYNQDRIVE_DEFAULT',
      domainId: null,
    }),
  };
  const outboundEmail = { recordEvent: jest.fn(), toDto: jest.fn((x) => x) };
  const providers = {
    resolve: jest.fn(() => ({
      sendEmail: jest.fn().mockResolvedValue({
        provider: 'dev',
        providerMessageId: 'dev_1',
        status: 'SENT_SIMULATED',
      }),
    })),
  };
  const generatedDocuments = { getById: jest.fn() };
  const storage = { getObject: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
  const activityLog = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.booking.findFirst.mockResolvedValue({
      id: 'b1',
      organizationId: 'org-1',
      customerId: 'c1',
      customer: { email: 'customer@test.com' },
    });
    prisma.generatedDocument.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        organizationId: 'org-1',
        bookingId: 'b1',
        status: DOCUMENT_STATUS.GENERATED,
        fileName: 'invoice.pdf',
        mimeType: 'application/pdf',
        objectKey: 'key-1',
        documentType: 'BOOKING_INVOICE',
      },
    ]);
    prisma.organization.findUnique.mockResolvedValue({
      emailSignature: 'Legacy Sig',
      orgEmailSettings: { signatureHtml: null },
    });
    prisma.outboundEmail.create.mockResolvedValue({
      id: 'mail-1',
      toEmail: 'customer@test.com',
      ccEmails: [],
      bccEmails: [],
      subject: 'Test',
      attachments: [],
      events: [],
    });
    prisma.outboundEmail.update.mockResolvedValue({
      id: 'mail-1',
      status: 'SENT_SIMULATED',
      attachments: [],
      events: [],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingDocumentEmailService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn((_k, fb) => fb) } },
        { provide: OutboundEmailPolicyService, useValue: policy },
        { provide: OutboundEmailService, useValue: outboundEmail },
        { provide: EmailProviderRegistry, useValue: providers },
        { provide: GeneratedDocumentsService, useValue: generatedDocuments },
        { provide: DOCUMENTS_STORAGE, useValue: storage },
        { provide: ActivityLogService, useValue: activityLog },
      ],
    }).compile();

    service = module.get(BookingDocumentEmailService);
  });

  it('rejects documents from another booking (cross-org/booking scope)', async () => {
    prisma.generatedDocument.findMany.mockResolvedValueOnce([]);
    await expect(
      service.sendBookingDocuments('org-1', 'b1', 'user-1', {
        toEmail: 'customer@test.com',
        subject: 'Docs',
        documentIds: ['foreign-doc'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects voided documents', async () => {
    prisma.generatedDocument.findMany.mockResolvedValueOnce([
      {
        id: 'doc-void',
        organizationId: 'org-1',
        bookingId: 'b1',
        status: DOCUMENT_STATUS.VOID,
        fileName: 'void.pdf',
        mimeType: 'application/pdf',
        objectKey: 'key-void',
        documentType: 'BOOKING_INVOICE',
      },
    ]);

    await expect(
      service.sendBookingDocuments('org-1', 'b1', 'user-1', {
        toEmail: 'customer@test.com',
        subject: 'Docs',
        documentIds: ['doc-void'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sends booking documents and marks them SENT', async () => {
    await service.sendBookingDocuments('org-1', 'b1', 'user-1', {
      toEmail: 'customer@test.com',
      subject: 'Docs',
      documentIds: ['doc-1'],
    });

    expect(storage.getObject).toHaveBeenCalledWith('key-1');
    expect(prisma.generatedDocument.updateMany).toHaveBeenCalled();
    expect(activityLog.log).toHaveBeenCalled();
  });
});
