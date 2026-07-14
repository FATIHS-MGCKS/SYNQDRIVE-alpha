import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { DOCUMENTS_STORAGE } from '@modules/documents/storage/document-storage.interface';
import { DOCUMENT_STATUS } from '@modules/documents/documents.constants';
import { InvoiceDocumentsReadService } from '@modules/invoices/invoice-documents-read.service';
import { InvoiceDocumentEmailService } from './invoice-document-email.service';
import { OutboundEmailPolicyService } from './outbound-email-policy.service';
import { OutboundEmailService } from './outbound-email.service';
import { EmailProviderRegistry } from './providers/email-provider.registry';

const ORG = 'org-1';
const INV = 'inv-1';
const DOC = 'doc-1';

describe('InvoiceDocumentEmailService', () => {
  let service: InvoiceDocumentEmailService;

  const prisma = {
    outboundEmail: { count: jest.fn().mockResolvedValue(0), create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    orgInvoice: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    generatedDocument: { findFirst: jest.fn(), updateMany: jest.fn() },
    organization: { findUnique: jest.fn() },
  };
  const policy = {
    isValidEmail: jest.fn(() => true),
    validateRecipientEmails: jest.fn(),
    resolveIdentity: jest.fn().mockResolvedValue({
      fromEmail: 'noreply@synqdrive.eu',
      fromName: 'SynqDrive',
      replyToEmail: 'billing@test.com',
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
  const invoiceDocuments = { getDocumentsForInvoice: jest.fn() };
  const storage = { getObject: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
  const activityLog = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.orgInvoice.findFirst.mockResolvedValue({
      id: INV,
      organizationId: ORG,
      type: OrgInvoiceType.OUTGOING_BOOKING,
      status: OrgInvoiceStatus.ISSUED,
      sequenceNumber: 1,
      sequenceYear: 2026,
      invoiceNumberDisplay: 'FSM-2026-0001',
      legacyInvoiceNumber: null,
      invoiceNumber: null,
      title: 'Rechnung',
      totalCents: 11900,
      currency: 'EUR',
      dueDate: new Date('2026-08-01'),
      bookingId: null,
      customerId: 'cust-1',
      generatedDocumentId: DOC,
    });
    prisma.customer.findFirst.mockResolvedValue({
      id: 'cust-1',
      email: 'customer@test.com',
      firstName: 'Max',
      lastName: 'Müller',
      company: null,
    });
    invoiceDocuments.getDocumentsForInvoice.mockResolvedValue({
      activeDocumentId: DOC,
      cacheMismatch: false,
      documents: [
        {
          id: DOC,
          documentType: 'BOOKING_INVOICE',
          filename: 'invoice.pdf',
          version: 1,
          status: DOCUMENT_STATUS.GENERATED,
          generationStatus: 'SUCCEEDED',
          lifecycle: 'ACTIVE',
          isActive: true,
          downloadAvailable: true,
          previewAvailable: true,
          downloadPath: '/x',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          createdAt: '2026-07-10T10:00:00.000Z',
          createdBy: null,
          lastError: null,
          retryable: false,
        },
      ],
    });
    prisma.generatedDocument.findFirst.mockResolvedValue({
      id: DOC,
      organizationId: ORG,
      invoiceId: INV,
      status: DOCUMENT_STATUS.GENERATED,
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      objectKey: 'key-1',
      documentType: 'BOOKING_INVOICE',
      origin: 'GENERATED',
      title: 'Rechnung',
      legalDocumentId: null,
    });
    prisma.organization.findUnique.mockResolvedValue({
      emailSignature: null,
      orgEmailSettings: { signatureHtml: '<p>Sig</p>' },
    });
    prisma.outboundEmail.create.mockResolvedValue({
      id: 'mail-1',
      toEmail: 'customer@test.com',
      ccEmails: [],
      bccEmails: [],
      subject: 'Rechnung',
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
        InvoiceDocumentEmailService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn((_k, fb) => fb) } },
        { provide: OutboundEmailPolicyService, useValue: policy },
        { provide: OutboundEmailService, useValue: outboundEmail },
        { provide: EmailProviderRegistry, useValue: providers },
        { provide: GeneratedDocumentsService, useValue: generatedDocuments },
        { provide: InvoiceDocumentsReadService, useValue: invoiceDocuments },
        { provide: DOCUMENTS_STORAGE, useValue: storage },
        { provide: ActivityLogService, useValue: activityLog },
      ],
    }).compile();

    service = module.get(InvoiceDocumentEmailService);
  });

  it('rejects cross-tenant invoice', async () => {
    prisma.orgInvoice.findFirst.mockResolvedValue(null);
    await expect(
      service.sendInvoiceEmail(ORG, INV, 'user-1', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects draft invoice', async () => {
    prisma.orgInvoice.findFirst.mockResolvedValue({
      id: INV,
      organizationId: ORG,
      type: OrgInvoiceType.OUTGOING_BOOKING,
      status: OrgInvoiceStatus.DRAFT,
      sequenceNumber: null,
      sequenceYear: null,
      invoiceNumberDisplay: null,
      legacyInvoiceNumber: null,
      invoiceNumber: null,
      title: 'Rechnung',
      totalCents: 11900,
      currency: 'EUR',
      dueDate: null,
      bookingId: null,
      customerId: 'cust-1',
      generatedDocumentId: DOC,
    });
    prisma.customer.findFirst.mockResolvedValue({
      id: 'cust-1',
      email: 'customer@test.com',
      firstName: 'Max',
      lastName: 'Müller',
      company: null,
    });
    await expect(
      service.sendInvoiceEmail(ORG, INV, 'user-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects document not linked to invoice', async () => {
    prisma.generatedDocument.findFirst.mockResolvedValue(null);
    await expect(
      service.sendInvoiceEmail(ORG, INV, 'user-1', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns prior send for idempotency key', async () => {
    prisma.outboundEmail.findFirst.mockResolvedValue({
      id: 'mail-prior',
      invoiceId: INV,
      status: 'SENT',
      attachments: [],
      events: [],
    });
    const result = await service.sendInvoiceEmail(ORG, INV, 'user-1', {
      idempotencyKey: 'idem-1',
    });
    expect(result.id).toBe('mail-prior');
    expect(prisma.orgInvoice.findFirst).not.toHaveBeenCalled();
  });

  it('sends invoice email without bookingId', async () => {
    await service.sendInvoiceEmail(ORG, INV, 'user-1', {
      subject: 'Custom subject',
      message: 'Custom body',
    });

    expect(prisma.outboundEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: INV,
          bookingId: null,
          sourceType: 'INVOICE_SINGLE',
          toEmail: 'customer@test.com',
        }),
      }),
    );
    expect(storage.getObject).toHaveBeenCalledWith('key-1');
    expect(activityLog.log).toHaveBeenCalledTimes(2);
    expect(prisma.generatedDocument.updateMany).toHaveBeenCalled();
  });
});
