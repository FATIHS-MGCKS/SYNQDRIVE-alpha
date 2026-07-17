import { Prisma } from '@prisma/client';
import { DocumentUploadDuplicateBlockedException } from './document-upload-duplicate.errors';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentUploadDuplicateService } from './document-upload-duplicate.service';
import { computeDocumentContentSha256 } from './document-content-hash.util';
import { makeMalwareScanMock } from './document-extraction-test.helpers';
import { FIXTURE_TXT } from './__fixtures__/document-fixtures';

jest.mock('@shared/queue/queue-producer.util', () => ({
  canEnqueueQueue: jest.fn(() => true),
}));

function makeSharedPrisma() {
  const anchors = new Map<string, string>();
  const extractions = new Map<string, Record<string, unknown>>();

  const duplicateInclude = {
    fines: { select: { id: true } },
    orgInvoices: { select: { id: true } },
    damages: { select: { id: true } },
    serviceEvents: { select: { id: true } },
  };

  const enrich = (row: Record<string, unknown>) => ({
    fines: [],
    orgInvoices: [],
    damages: [],
    serviceEvents: [],
    createdAt: new Date(),
    appliedAt: null,
    processingStage: 'STORAGE',
    ...row,
  });

  const prisma = {
    documentExtractionContentAnchor: {
      findUnique: jest.fn(async ({ where, include }: any) => {
        const orgId = where.organizationId_contentSha256.organizationId;
        const hash = where.organizationId_contentSha256.contentSha256;
        const canonicalExtractionId = anchors.get(`${orgId}:${hash}`);
        if (!canonicalExtractionId) return null;
        const canonicalExtraction = enrich(extractions.get(canonicalExtractionId) ?? {});
        return include ? { canonicalExtraction } : { canonicalExtractionId };
      }),
      create: jest.fn(async ({ data }: any) => {
        const key = `${data.organizationId}:${data.contentSha256}`;
        if (anchors.has(key)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        anchors.set(key, data.canonicalExtractionId);
        return data;
      }),
    },
    vehicleDocumentExtraction: {
      create: jest.fn(async ({ data }: any) => {
        const id = `ext-${extractions.size + 1}`;
        const row = enrich({ id, vehicleId: 'v1', organizationId: 'org-1', ...data });
        extractions.set(id, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = enrich({ ...extractions.get(where.id), ...data });
        extractions.set(where.id, row);
        return row;
      }),
      delete: jest.fn(async ({ where }: any) => {
        extractions.delete(where.id);
      }),
      findUnique: jest.fn(async ({ where, include }: any) => {
        const row = extractions.get(where.id);
        if (!row) return null;
        return include ? enrich(row) : row;
      }),
      findFirst: jest.fn(async ({ where, include, orderBy }: any) => {
        const rows = [...extractions.values()]
          .filter((row) => {
            if (where.organizationId && row.organizationId !== where.organizationId) return false;
            if (where.contentSha256 && row.contentSha256 !== where.contentSha256) return false;
            if (where.status?.in && !where.status.in.includes(row.status)) return false;
            return true;
          })
          .sort((a, b) => {
            if (orderBy?.createdAt === 'asc') {
              return String(a.createdAt).localeCompare(String(b.createdAt));
            }
            return 0;
          });
        const row = rows[0];
        if (!row) return null;
        return include ? enrich(row) : row;
      }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      findFirst: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
    },
    vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };

  return { prisma, anchors, extractions, duplicateInclude };
}

function makeUploadService(shared = makeSharedPrisma()) {
  const { prisma, anchors, extractions } = shared;
  const uploadDuplicate = new DocumentUploadDuplicateService(prisma as any);
  const fileIdentification = {
    identify: jest.fn(async (input: { buffer: Buffer; originalName?: string }) => ({
      detectedKind: 'plain-text',
      detectedMime: 'text/plain',
      clientMime: 'text/plain',
      displayFileName: input.originalName ?? 'document.txt',
      sizeBytes: input.buffer.byteLength,
    })),
  };
  const storage = {
    putObject: jest.fn().mockResolvedValue({
      objectKey: 'organizations/org-1/vehicles/v1/documents/file.txt',
      storageProvider: 'local',
      mimeType: 'text/plain',
      sizeBytes: FIXTURE_TXT.length,
    }),
    getObject: jest.fn(),
    getObjectStream: jest.fn(),
    deleteObject: jest.fn(),
  };
  const queue = { add: jest.fn().mockResolvedValue({}), getJob: jest.fn().mockResolvedValue(null) };

  const svc = new DocumentExtractionService(
    prisma as any,
    { get: jest.fn((_k: string, d?: unknown) => d) } as any,
    {
      queueEnabled: true,
      allowPendingWithoutQueue: false,
      jobAttempts: 4,
      jobBackoffMs: 5000,
      jobTimeoutMs: 120000,
    } as any,
    storage as any,
    queue as any,
    { apply: jest.fn() } as any,
    { supportsExecutorPath: jest.fn(), executeConfirmedPlan: jest.fn() } as any,
    { runChecks: jest.fn() } as any,
    fileIdentification as any,
    uploadDuplicate,
    { assertAllowed: jest.fn().mockResolvedValue(undefined) } as any,
    makeMalwareScanMock(storage) as any,
    { logEvent: jest.fn(), recordApply: jest.fn(), observeStage: jest.fn((_a, _b, fn) => fn()) } as any,
  );

  return { svc, storage, queue, anchors, extractions, prisma };
}

describe('Document extraction upload duplicate policy', () => {
  it('marks first upload as UNIQUE and blocks second exact duplicate', async () => {
    const { svc, storage } = makeUploadService();
    const buffer = Buffer.from(FIXTURE_TXT);

    const first = await svc.createFromUpload({
      vehicleId: 'v1',
      documentType: 'SERVICE',
      originalName: 'a.txt',
      mimeType: 'text/plain',
      buffer,
    });

    expect(first.uploadDuplicateStatus).toBe('UNIQUE');
    expect(storage.putObject).toHaveBeenCalledTimes(1);

    await expect(
      svc.createFromUpload({
        vehicleId: 'v1',
        documentType: 'SERVICE',
        originalName: 'b.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(buffer),
      }),
    ).rejects.toBeInstanceOf(DocumentUploadDuplicateBlockedException);

    expect(storage.putObject).toHaveBeenCalledTimes(1);
  });

  it('allows authorized re-upload referencing the existing extraction', async () => {
    const { svc, storage } = makeUploadService();
    const buffer = Buffer.from(FIXTURE_TXT);

    const first = await svc.createFromUpload({
      vehicleId: 'v1',
      documentType: 'SERVICE',
      originalName: 'original.txt',
      mimeType: 'text/plain',
      buffer,
    });

    const second = await svc.createFromUpload({
      vehicleId: 'v1',
      documentType: 'SERVICE',
      originalName: 'reupload.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(buffer),
      reuploadReason: 'Accounting requested a second archival copy',
      relatedExtractionId: first.id,
    });

    expect(second.uploadDuplicateStatus).toBe('REUPLOAD_ALLOWED');
    expect(second.relatedExtractionId).toBe(first.id);
    expect(storage.putObject).toHaveBeenCalledTimes(2);
  });

  it('allows different content with the same filename', async () => {
    const { svc } = makeUploadService();
    const firstHash = await computeDocumentContentSha256(FIXTURE_TXT);
    const secondBuffer = Buffer.from(`${FIXTURE_TXT.toString('utf8')}-changed`);

    const first = await svc.createFromUpload({
      vehicleId: 'v1',
      documentType: 'SERVICE',
      originalName: 'same-name.txt',
      mimeType: 'text/plain',
      buffer: FIXTURE_TXT,
    });
    const second = await svc.createFromUpload({
      vehicleId: 'v1',
      documentType: 'SERVICE',
      originalName: 'same-name.txt',
      mimeType: 'text/plain',
      buffer: secondBuffer,
    });

    expect(first.contentSha256).toBe(firstHash);
    expect(second.contentSha256).not.toBe(firstHash);
    expect(second.uploadDuplicateStatus).toBe('UNIQUE');
  });

  it('resolves parallel identical uploads to one canonical record', async () => {
    const shared = makeSharedPrisma();
    const { svc, storage, anchors } = makeUploadService(shared);
    const buffer = Buffer.from(FIXTURE_TXT);

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, (_row, index) =>
        svc.createFromUpload({
          vehicleId: 'v1',
          documentType: 'SERVICE',
          originalName: `parallel-${index}.txt`,
          mimeType: 'text/plain',
          buffer: Buffer.from(buffer),
        }),
      ),
    );

    const fulfilled = results.filter((row) => row.status === 'fulfilled');
    const rejected = results.filter((row) => row.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(3);
    expect(anchors.size).toBe(1);
    expect(storage.putObject).toHaveBeenCalledTimes(1);
  });

  it('flags possible business duplicate by invoice number hint without blocking upload', async () => {
    const shared = makeSharedPrisma();
    shared.extractions.set('ext-existing', {
      id: 'ext-existing',
      vehicleId: 'v2',
      organizationId: 'org-1',
      status: 'CONFIRMED',
      processingStage: 'REVIEW',
      sourceFileName: 'invoice-old.pdf',
      effectiveDocumentType: 'INVOICE',
      requestedDocumentType: 'INVOICE',
      contentSha256: 'other-hash',
      confirmedData: { invoiceNumber: 'INV-2026-42' },
      extractedData: null,
      fines: [],
      orgInvoices: [{ id: 'inv-old' }],
      damages: [],
      serviceEvents: [],
      createdAt: new Date(),
      appliedAt: null,
    });
    shared.prisma.vehicleDocumentExtraction.findMany.mockResolvedValue([
      {
        id: 'ext-existing',
        confirmedData: { invoiceNumber: 'INV-2026-42' },
        extractedData: null,
      },
    ]);

    const { svc } = makeUploadService(shared);
    const created = await svc.createFromUpload({
      vehicleId: 'v1',
      documentType: 'INVOICE',
      originalName: 'invoice-new.pdf',
      mimeType: 'text/plain',
      buffer: Buffer.from('new-invoice-content'),
      invoiceNumberHint: 'INV-2026-42',
    });

    expect(created.uploadDuplicateStatus).toBe('POSSIBLE_BUSINESS_DUPLICATE');
    expect(created.relatedExtractionId).toBe('ext-existing');
  });
});
