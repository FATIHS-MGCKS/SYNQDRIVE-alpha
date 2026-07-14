import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  OrgInvoiceStatus,
  OrgInvoiceType,
  OutboundEmailDeliveryStatus,
  OutboundEmailStatus,
} from '@prisma/client';
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

describe('InvoiceDocumentEmailService — audit trail', () => {
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
  const outboundEmail = {
    recordEvent: jest.fn(),
    toDto: jest.fn((x) => x),
  };
  const sendEmailMock = jest.fn();
  const providers = {
    resolve: jest.fn(() => ({
      sendEmail: sendEmailMock,
    })),
  };
  const generatedDocuments = { getById: jest.fn() };
  const invoiceDocuments = { getDocumentsForInvoice: jest.fn() };
  const storage = { getObject: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
  const activityLog = { log: jest.fn() };

  function mockInvoice(overrides: Record<string, unknown> = {}) {
    return {
      id: INV,
      organizationId: ORG,
      type: OrgInvoiceType.OUTGOING_MANUAL,
      status: OrgInvoiceStatus.ISSUED,
      sequenceNumber: 3,
      sequenceYear: 2026,
      invoiceNumberDisplay: 'FSM-2026-0003',
      legacyInvoiceNumber: null,
      invoiceNumber: null,
      title: 'Manuelle Rechnung',
      totalCents: 5000,
      currency: 'EUR',
      dueDate: null,
      bookingId: null,
      customerId: 'cust-1',
      generatedDocumentId: DOC,
      ...overrides,
    };
  }

  function mockDocsView() {
    return {
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
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.orgInvoice.findFirst.mockResolvedValue(mockInvoice());
    prisma.customer.findFirst.mockResolvedValue({
      id: 'cust-1',
      email: 'customer@test.com',
      firstName: 'Max',
      lastName: 'Müller',
      company: null,
    });
    invoiceDocuments.getDocumentsForInvoice.mockResolvedValue(mockDocsView());
    prisma.generatedDocument.findFirst.mockResolvedValue({
      id: DOC,
      organizationId: ORG,
      invoiceId: INV,
      versionNumber: 2,
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
      orgEmailSettings: null,
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
      status: OutboundEmailStatus.SENT_SIMULATED,
      deliveryStatus: OutboundEmailDeliveryStatus.ACCEPTED,
      attachments: [],
      events: [],
    });
    sendEmailMock.mockResolvedValue({
      provider: 'dev',
      providerMessageId: 'dev_1',
      status: 'SENT_SIMULATED',
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

  it('persists audit fields on successful send without bookingId', async () => {
    await service.sendInvoiceEmail(ORG, INV, 'user-1', {
      idempotencyKey: 'idem-ok',
      correlationId: 'corr-1',
    });

    expect(prisma.outboundEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: INV,
          bookingId: null,
          generatedDocumentId: DOC,
          documentVersionNumber: 2,
          deliveryStatus: OutboundEmailDeliveryStatus.PENDING,
          idempotencyKey: 'idem-ok',
          correlationId: 'corr-1',
        }),
      }),
    );
    expect(prisma.outboundEmail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryStatus: OutboundEmailDeliveryStatus.ACCEPTED,
          providerMessageId: 'dev_1',
          acceptedAt: expect.any(Date),
        }),
      }),
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('returns existing row for same idempotency key without resending', async () => {
    prisma.outboundEmail.findFirst.mockResolvedValue({
      id: 'mail-prior',
      invoiceId: INV,
      status: 'FAILED',
      deliveryStatus: 'FAILED',
      attachments: [],
      events: [],
    });

    await service.sendInvoiceEmail(ORG, INV, 'user-1', { idempotencyKey: 'idem-fail' });

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(prisma.outboundEmail.create).not.toHaveBeenCalled();
  });

  it('allows retry with a new idempotency key after failure', async () => {
    prisma.outboundEmail.findFirst.mockResolvedValue(null);

    await service.sendInvoiceEmail(ORG, INV, 'user-1', { idempotencyKey: 'idem-retry-2' });

    expect(prisma.outboundEmail.create).toHaveBeenCalled();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-tenant document linkage', async () => {
    prisma.generatedDocument.findFirst.mockResolvedValue(null);
    await expect(
      service.sendInvoiceEmail(ORG, INV, 'user-1', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records provider failure audit fields and throws', async () => {
    sendEmailMock.mockRejectedValue(new Error('Provider timeout bearer re_secret123'));

    await expect(
      service.sendInvoiceEmail(ORG, INV, 'user-1', {}),
    ).rejects.toBeInstanceOf(HttpException);

    expect(prisma.outboundEmail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OutboundEmailStatus.FAILED,
          deliveryStatus: OutboundEmailDeliveryStatus.FAILED,
          failedAt: expect.any(Date),
          errorMessage: expect.not.stringContaining('re_secret123'),
        }),
      }),
    );
  });

  it('rejects idempotency key reused for another invoice', async () => {
    prisma.outboundEmail.findFirst.mockResolvedValue({
      id: 'mail-other',
      invoiceId: 'other-inv',
      attachments: [],
      events: [],
    });

    await expect(
      service.sendInvoiceEmail(ORG, INV, 'user-1', { idempotencyKey: 'shared' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
