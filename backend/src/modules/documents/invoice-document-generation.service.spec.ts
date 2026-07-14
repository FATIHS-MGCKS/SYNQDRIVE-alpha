import { OrgInvoiceType } from '@prisma/client';
import { DOCUMENT_GENERATION_STATUS, DOCUMENT_STATUS, DOCUMENT_TYPE } from './documents.constants';
import { InvoiceDocumentGenerationService } from './invoice-document-generation.service';
import { InvoiceDocumentGenerationError } from './invoice-document-generation.types';
import { PENDING_OBJECT_KEY } from './invoice-document-generation.util';

const ORG = 'org-a';
const INVOICE = 'inv-1';
const BOOKING = 'booking-1';

const baseInvoice = {
  id: INVOICE,
  organizationId: ORG,
  type: OrgInvoiceType.OUTGOING_BOOKING,
  bookingId: BOOKING,
};

const pdfBuffer = Buffer.from('%PDF-test');

function buildMocks() {
  const generatedDocument = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const orgInvoice = {
    findFirst: jest.fn(),
    update: jest.fn(),
  };

  const tx = {
    generatedDocument,
    orgInvoice,
  };

  const prisma = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    generatedDocument,
    orgInvoice,
  };

  const storage = {
    putObject: jest.fn().mockResolvedValue({
      objectKey: 'org/booking-invoice.pdf',
      storageProvider: 'local',
      sizeBytes: pdfBuffer.length,
    }),
  };

  const activityLog = { log: jest.fn().mockResolvedValue(undefined) };

  return { prisma, storage, activityLog, tx, generatedDocument, orgInvoice };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    invoiceId: INVOICE,
    documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
    title: 'Rechnung',
    fileName: 'booking_invoice-booking-1.pdf',
    renderPdf: jest.fn().mockResolvedValue(pdfBuffer),
    bookingId: BOOKING,
    force: false,
    ...overrides,
  };
}

describe('InvoiceDocumentGenerationService', () => {
  let service: InvoiceDocumentGenerationService;
  let mocks: ReturnType<typeof buildMocks>;

  beforeEach(() => {
    mocks = buildMocks();
    service = new InvoiceDocumentGenerationService(
      mocks.prisma as never,
      mocks.storage as never,
      mocks.activityLog as never,
    );
    mocks.orgInvoice.findFirst.mockResolvedValue(baseInvoice);
    mocks.generatedDocument.findFirst.mockResolvedValue(null);
    mocks.generatedDocument.findMany.mockResolvedValue([]);
  });

  it('completes first generation with version 1 and activates cache pointer', async () => {
    mocks.generatedDocument.findFirst
      .mockResolvedValueOnce(null) // active stored
      .mockResolvedValueOnce(null); // max version in tx
    mocks.generatedDocument.create.mockResolvedValue({
      id: 'doc-new',
      versionNumber: 1,
      generationAttemptCount: 1,
    });
    mocks.generatedDocument.update.mockResolvedValue({
      id: 'doc-new',
      versionNumber: 1,
      status: DOCUMENT_STATUS.GENERATED,
      generationStatus: DOCUMENT_GENERATION_STATUS.SUCCEEDED,
      isActiveVersion: true,
    });

    const result = await service.generate(baseInput());

    expect(result.created).toBe(true);
    expect(result.versionNumber).toBe(1);
    expect(mocks.storage.putObject).toHaveBeenCalled();
    expect(mocks.orgInvoice.update).toHaveBeenCalledWith({
      where: { id: INVOICE },
      data: { generatedDocumentId: 'doc-new' },
    });
    expect(mocks.generatedDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationStatus: DOCUMENT_GENERATION_STATUS.PROCESSING,
          objectKey: PENDING_OBJECT_KEY,
          isActiveVersion: false,
          versionNumber: 1,
        }),
      }),
    );
    expect(mocks.activityLog.log).toHaveBeenCalled();
  });

  it('regenerates with force, voiding previous active only after success', async () => {
    mocks.generatedDocument.findMany
      .mockResolvedValueOnce([]) // in-flight
      .mockResolvedValueOnce([{ id: 'doc-old' }]); // previous active in tx

    mocks.generatedDocument.findFirst.mockResolvedValue({ versionNumber: 1 });
    mocks.generatedDocument.create.mockResolvedValue({ id: 'doc-v2', versionNumber: 2 });
    mocks.generatedDocument.update.mockResolvedValue({
      id: 'doc-v2',
      versionNumber: 2,
      isActiveVersion: true,
    });

    await service.generate(baseInput({ force: true }));

    expect(mocks.generatedDocument.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['doc-old'] } },
      data: expect.objectContaining({
        isActiveVersion: false,
        status: DOCUMENT_STATUS.VOID,
      }),
    });
  });

  it('returns existing active document when not forced (idempotent)', async () => {
    const existing = {
      id: 'doc-active',
      versionNumber: 1,
      status: DOCUMENT_STATUS.GENERATED,
      objectKey: 'stored.pdf',
    };
    mocks.generatedDocument.findFirst.mockResolvedValue(existing);

    const result = await service.generate(baseInput());

    expect(result.created).toBe(false);
    expect(result.document.id).toBe('doc-active');
    expect(mocks.storage.putObject).not.toHaveBeenCalled();
  });

  it('serializes parallel requests via advisory lock', async () => {
    const lockCalls: string[] = [];
    mocks.prisma.$executeRaw.mockImplementation(async (query: TemplateStringsArray) => {
      const sql = query.join('');
      if (sql.includes('advisory_lock')) lockCalls.push('lock');
      if (sql.includes('advisory_unlock')) lockCalls.push('unlock');
    });

    mocks.generatedDocument.findFirst.mockResolvedValue({
      id: 'doc-active',
      versionNumber: 1,
      status: DOCUMENT_STATUS.GENERATED,
      objectKey: 'stored.pdf',
    });

    await service.generate(baseInput());
    expect(lockCalls).toEqual(['lock', 'unlock']);
  });

  it('rejects concurrent generation without idempotency key', async () => {
    mocks.generatedDocument.findFirst.mockResolvedValue(null);
    mocks.generatedDocument.findMany.mockResolvedValue([
      {
        id: 'in-flight',
        generationStatus: DOCUMENT_GENERATION_STATUS.PROCESSING,
        status: DOCUMENT_STATUS.DRAFT,
        objectKey: PENDING_OBJECT_KEY,
      },
    ]);

    await expect(service.generate(baseInput())).rejects.toBeInstanceOf(
      InvoiceDocumentGenerationError,
    );
  });

  it('persists FAILED with storage error and keeps prior active version', async () => {
    mocks.generatedDocument.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mocks.generatedDocument.findMany.mockResolvedValue([]);
    mocks.generatedDocument.create.mockResolvedValue({ id: 'doc-fail', versionNumber: 1 });
    mocks.storage.putObject.mockRejectedValue(new Error('storage write failed'));

    await expect(service.generate(baseInput())).rejects.toThrow();

    expect(mocks.generatedDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-fail' },
        data: expect.objectContaining({
          status: DOCUMENT_STATUS.FAILED,
          generationErrorCode: 'STORAGE_ERROR',
          isActiveVersion: false,
        }),
      }),
    );
    expect(mocks.orgInvoice.update).not.toHaveBeenCalled();
  });

  it('persists FAILED on renderer error with retry schedule', async () => {
    mocks.generatedDocument.findFirst.mockResolvedValue(null);
    mocks.generatedDocument.create.mockResolvedValue({ id: 'doc-fail', versionNumber: 1 });

    await expect(
      service.generate(
        baseInput({
          renderPdf: jest.fn().mockRejectedValue(new Error('pdfkit render failed')),
        }),
      ),
    ).rejects.toThrow();

    expect(mocks.generatedDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationErrorCode: 'RENDERER_ERROR',
          generationStatus: DOCUMENT_GENERATION_STATUS.RETRY_SCHEDULED,
          nextRetryAt: expect.any(Date),
        }),
      }),
    );
  });

  it('persists DATABASE_ERROR on transaction failure during activation', async () => {
    mocks.generatedDocument.findFirst.mockResolvedValue(null);
    mocks.generatedDocument.findMany.mockResolvedValue([]);
    mocks.generatedDocument.create.mockResolvedValue({ id: 'doc-new', versionNumber: 1 });

    let txCalls = 0;
    mocks.prisma.$transaction.mockImplementation(async (fn: (t: typeof mocks.tx) => Promise<unknown>) => {
      txCalls += 1;
      if (txCalls === 2) {
        const err = Object.assign(new Error('unique'), { code: 'P2002', clientVersion: 'test' });
        throw err;
      }
      return fn(mocks.tx);
    });

    await expect(service.generate(baseInput())).rejects.toThrow();

    expect(mocks.generatedDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationErrorCode: 'DATABASE_ERROR',
        }),
      }),
    );
  });

  it('retries a failed document as a new forced version', async () => {
    mocks.generatedDocument.findFirst
      .mockResolvedValueOnce({
        id: 'doc-failed',
        organizationId: ORG,
        invoiceId: INVOICE,
        documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
        generationStatus: DOCUMENT_GENERATION_STATUS.FAILED,
        title: 'Rechnung',
        fileName: 'f.pdf',
        bookingId: BOOKING,
        customerId: null,
        vehicleId: null,
        documentNumber: null,
        templateKey: DOCUMENT_TYPE.BOOKING_INVOICE,
        templateVersion: '1',
        generatedByUserId: null,
        snapshot: null,
      })
      .mockResolvedValueOnce({ versionNumber: 1 });

    mocks.generatedDocument.findMany.mockResolvedValue([]);
    mocks.generatedDocument.create.mockResolvedValue({ id: 'doc-retry', versionNumber: 2 });
    mocks.generatedDocument.update.mockResolvedValue({ id: 'doc-retry', versionNumber: 2 });

    const result = await service.retryFailed(ORG, 'doc-failed', async () => pdfBuffer);

    expect(result.versionNumber).toBe(2);
    expect(mocks.storage.putObject).toHaveBeenCalled();
  });

  it('rejects foreign organization invoice', async () => {
    mocks.orgInvoice.findFirst.mockResolvedValue(null);

    await expect(service.generate(baseInput())).rejects.toMatchObject({
      code: 'INVOICE_NOT_FOUND',
    });
  });
});
