import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { BookingDocumentBundleService } from '@modules/documents/booking-document-bundle.service';
import { DocumentNumberingService } from '@modules/documents/document-numbering.service';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { DOCUMENT_RENDERER } from '@modules/documents/renderers/render-model';
import { DOCUMENTS_STORAGE } from '@modules/documents/storage/document-storage.interface';
import { TaskLinkedObjectResolverService } from '@modules/tasks/task-linked-object-resolver.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { InvoiceDocumentEmailService } from '@modules/outbound-email/invoice-document-email.service';
import { OutboundEmailPolicyService } from '@modules/outbound-email/outbound-email-policy.service';
import { OutboundEmailService } from '@modules/outbound-email/outbound-email.service';
import { EmailProviderRegistry } from '@modules/outbound-email/providers/email-provider.registry';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingInvoiceLifecycleService } from './booking-invoice-lifecycle.service';
import { InvoiceDocumentsService } from './invoice-documents.service';
import { InvoiceNumberService } from './invoice-number.service';
import { InvoicePaymentTaskService } from './invoice-payment-task.service';
import { createNoopTaskAutomationOutboxDeps } from '@modules/tasks/outbox/task-automation-outbox-test.util';
import { createInvoiceTestStore, type InvoiceTestStore } from './invoices-test-store';
import { InvoicesService } from './invoices.service';

export type EmailProviderMockResult = {
  provider: string;
  providerMessageId: string;
  status: 'SENT' | 'SENT_SIMULATED' | 'FAILED';
  errorCode?: string;
  errorMessage?: string;
};

export interface InvoicePipelineHarness {
  store: InvoiceTestStore;
  invoices: InvoicesService;
  lifecycle: BookingInvoiceLifecycleService;
  documents: InvoiceDocumentsService;
  invoiceEmail: InvoiceDocumentEmailService;
  outboundEmail: OutboundEmailService;
  setProviderResult: (result: EmailProviderMockResult) => void;
  providerSendMock: jest.Mock;
  rendererMock: jest.Mock;
  storagePutMock: jest.Mock;
  bundleMock: {
    getBundleView: jest.Mock;
    generateInitialBundle: jest.Mock;
    regenerate: jest.Mock;
  };
}

export function createInvoicePipelineHarness(): InvoicePipelineHarness {
  const store = createInvoiceTestStore();
  const prisma = store.prisma as unknown as PrismaService;

  const providerSendMock = jest.fn();
  const setProviderResult = (result: EmailProviderMockResult) => {
    providerSendMock.mockResolvedValue(result);
  };
  setProviderResult({
    provider: 'dev',
    providerMessageId: 'dev-msg-1',
    status: 'SENT_SIMULATED',
  });

  const providers = {
    resolve: () => ({ sendEmail: providerSendMock }),
  };

  const policy = {
    isValidEmail: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    validateRecipientEmails: jest.fn(),
    resolveIdentity: jest.fn().mockResolvedValue({
      fromEmail: 'noreply@synqdrive.eu',
      fromName: 'SynqDrive Test',
      replyToEmail: 'billing@test.com',
      mode: 'SYNQDRIVE_DEFAULT',
      domainId: null,
    }),
  };

  const activityLog = { log: jest.fn() };

  const storageBuffers = new Map<string, Buffer>();
  const storagePutMock = jest.fn(async (args: { buffer: Buffer; organizationId: string }) => {
    const key = `organizations/${args.organizationId}/mem-${storageBuffers.size + 1}.pdf`;
    storageBuffers.set(key, args.buffer);
    return {
      storageProvider: 'memory',
      objectKey: key,
      sizeBytes: args.buffer.length,
    };
  });
  const storage = {
    putObject: storagePutMock,
    getObjectStream: jest.fn(async (key: string) => {
      const buf = storageBuffers.get(key) ?? Buffer.from('%PDF-test');
      return Readable.from(buf);
    }),
    getObject: jest.fn(async (key: string) => storageBuffers.get(key) ?? Buffer.from('%PDF-test')),
  };

  const rendererMock = jest.fn().mockResolvedValue(Buffer.from('%PDF-generated'));
  const numbering = { nextNumber: jest.fn().mockResolvedValue('RE-2026-0001') };

  const generatedDocs = new GeneratedDocumentsService(prisma, storage as never);

  const bundleMock = {
    getBundleView: jest.fn().mockResolvedValue({ documents: [] }),
    generateInitialBundle: jest.fn().mockResolvedValue(undefined),
    regenerate: jest.fn().mockResolvedValue(undefined),
  };

  const linkedObjectResolver = {
    resolveForTask: jest.fn().mockResolvedValue([]),
  } as unknown as TaskLinkedObjectResolverService;
  const tasks = new TasksService(prisma, activityLog as unknown as ActivityLogService, linkedObjectResolver);
  const { outboxEnqueue, outboxContext } = createNoopTaskAutomationOutboxDeps();
  const invoicePaymentTasks = new InvoicePaymentTaskService(
    prisma,
    tasks,
    outboxEnqueue,
    outboxContext,
  );
  const invoiceNumbers = new InvoiceNumberService(prisma);
  const invoices = new InvoicesService(prisma, invoiceNumbers, invoicePaymentTasks);
  const lifecycle = new BookingInvoiceLifecycleService(prisma, invoices);
  const outboundEmail = new OutboundEmailService(prisma);

  const config = {
    get: jest.fn((key: string, def?: unknown) => {
      if (key === 'documents.generationEnabled') return true;
      if (key === 'email.maxSendsPerHourPerOrg') return 100;
      return def;
    }),
  };

  const documents = new InvoiceDocumentsService(
    prisma,
    config as unknown as ConfigService,
    generatedDocs,
    bundleMock as unknown as BookingDocumentBundleService,
    numbering as unknown as DocumentNumberingService,
    { renderPdf: rendererMock },
  );

  const invoiceEmail = new InvoiceDocumentEmailService(
    prisma,
    config as unknown as ConfigService,
    policy as unknown as OutboundEmailPolicyService,
    outboundEmail,
    providers as unknown as EmailProviderRegistry,
    generatedDocs,
    storage as never,
    activityLog as unknown as ActivityLogService,
  );

  return {
    store,
    invoices,
    lifecycle,
    documents,
    invoiceEmail,
    outboundEmail,
    setProviderResult,
    providerSendMock,
    rendererMock,
    storagePutMock,
    bundleMock,
  };
}

/** Issue invoice and optionally link a generated PDF for send tests. Returns invoice id. */
export async function issueWithPdf(
  h: InvoicePipelineHarness,
  orgId: string,
  invoiceId: string,
  userId: string | null = null,
): Promise<string> {
  const uid = userId ?? h.store.ids.userAdmin;
  await h.invoices.issue(invoiceId, orgId);
  await h.documents.generate(orgId, invoiceId, uid);
  return invoiceId;
}
