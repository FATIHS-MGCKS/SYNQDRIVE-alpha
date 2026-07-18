import { Prisma } from '@prisma/client';
import { DocumentUploadDuplicateService } from './document-upload-duplicate.service';
import { computeDocumentContentSha256 } from './document-content-hash.util';
import { FIXTURE_TXT } from './__fixtures__/document-fixtures';

function makeDuplicateService(prismaOverrides: Record<string, unknown> = {}) {
  const anchors = new Map<string, { canonicalExtractionId: string }>();
  const extractions = new Map<string, Record<string, unknown>>();

  const prisma: any = {
    documentExtractionContentAnchor: {
      findUnique: jest.fn(async ({ where }: { where: { organizationId_contentSha256: { organizationId: string; contentSha256: string } } }) => {
        const key = `${where.organizationId_contentSha256.organizationId}:${where.organizationId_contentSha256.contentSha256}`;
        const row = anchors.get(key);
        if (!row) return null;
        const extraction = extractions.get(row.canonicalExtractionId);
        return extraction ? { canonicalExtraction: extraction } : null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const key = `${data.organizationId}:${data.contentSha256}`;
        if (anchors.has(key)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        anchors.set(key, { canonicalExtractionId: data.canonicalExtractionId });
        return data;
      }),
    },
    vehicleDocumentExtraction: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    ...prismaOverrides,
  };

  return { svc: new DocumentUploadDuplicateService(prisma as any), prisma, anchors };
}

describe('DocumentUploadDuplicateService', () => {
  const contentSha256 = 'abc123';
  const organizationId = 'org-1';

  it('returns UNIQUE when no org-scoped content or business match exists', async () => {
    const { svc, prisma } = makeDuplicateService();
    prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue(null);

    const result = await svc.assess({ organizationId, contentSha256 });
    expect(result).toEqual({ status: 'UNIQUE', blocked: false });
  });

  it('blocks exact duplicate within the same organization', async () => {
    const { svc, prisma } = makeDuplicateService();
    prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue({
      id: 'ext-existing',
      vehicleId: 'v1',
      organizationId,
      status: 'APPLIED',
      processingStage: 'APPLY',
      sourceFileName: 'invoice.pdf',
      effectiveDocumentType: 'INVOICE',
      requestedDocumentType: 'INVOICE',
      contentSha256,
      createdAt: new Date('2026-07-01T10:00:00.000Z'),
      appliedAt: new Date('2026-07-02T10:00:00.000Z'),
      fines: [],
      orgInvoices: [{ id: 'inv-1' }],
      damages: [],
      serviceEvents: [],
    });

    const result = await svc.assess({ organizationId, contentSha256 });
    expect(result.status).toBe('DUPLICATE_BLOCKED');
    expect(result.blocked).toBe(true);
    expect(result.existingExtraction?.id).toBe('ext-existing');
    expect(result.existingExtraction?.entityLinks.invoiceIds).toEqual(['inv-1']);
  });

  it('allows re-upload with authorized reason and links to existing extraction', async () => {
    const { svc, prisma } = makeDuplicateService();
    prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue({
      id: 'ext-existing',
      vehicleId: 'v1',
      organizationId,
      status: 'READY_FOR_REVIEW',
      processingStage: 'REVIEW',
      sourceFileName: 'invoice.pdf',
      effectiveDocumentType: 'INVOICE',
      requestedDocumentType: 'INVOICE',
      contentSha256,
      createdAt: new Date(),
      appliedAt: null,
      fines: [],
      orgInvoices: [],
      damages: [],
      serviceEvents: [],
    });

    const result = await svc.assess({
      organizationId,
      contentSha256,
      reuploadReason: 'Corrected scan requested by accounting',
    });

    expect(result).toMatchObject({
      status: 'REUPLOAD_ALLOWED',
      blocked: false,
      relatedExtractionId: 'ext-existing',
      reuploadReason: 'Corrected scan requested by accounting',
    });
  });

  it('detects possible business duplicate by invoice number hint within organization', async () => {
    const { svc, prisma } = makeDuplicateService();
    prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue(null);
    prisma.vehicleDocumentExtraction.findMany.mockResolvedValue([
      {
        id: 'ext-invoice',
        confirmedData: { invoiceNumber: 'INV-2026-42' },
        extractedData: null,
      },
    ]);
    prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue({
      id: 'ext-invoice',
      vehicleId: 'v2',
      organizationId,
      status: 'CONFIRMED',
      processingStage: 'REVIEW',
      sourceFileName: 'invoice-old.pdf',
      effectiveDocumentType: 'INVOICE',
      requestedDocumentType: 'INVOICE',
      contentSha256: 'different-hash',
      createdAt: new Date(),
      appliedAt: null,
      fines: [],
      orgInvoices: [{ id: 'inv-old' }],
      damages: [],
      serviceEvents: [],
    });

    const result = await svc.assess({
      organizationId,
      contentSha256: 'new-hash',
      invoiceNumberHint: 'inv-2026-42',
    });

    expect(result.status).toBe('POSSIBLE_BUSINESS_DUPLICATE');
    expect(result.blocked).toBe(false);
    expect(result.businessMatch).toEqual({
      matchedExtractionId: 'ext-invoice',
      invoiceNumber: 'INV-2026-42',
    });
  });

  it('detects possible business duplicate by reference number hint', async () => {
    const { svc, prisma } = makeDuplicateService();
    prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue(null);
    prisma.vehicleDocumentExtraction.findMany.mockResolvedValue([
      {
        id: 'ext-fine',
        confirmedData: null,
        extractedData: { reportNumber: 'AZ-2026-4412' },
      },
    ]);
    prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue({
      id: 'ext-fine',
      vehicleId: 'v2',
      organizationId,
      status: 'APPLIED',
      processingStage: 'APPLY',
      sourceFileName: 'fine.pdf',
      effectiveDocumentType: 'FINE',
      requestedDocumentType: 'FINE',
      contentSha256: 'other-hash',
      createdAt: new Date(),
      appliedAt: new Date(),
      fines: [{ id: 'fine-1' }],
      orgInvoices: [],
      damages: [],
      serviceEvents: [],
    });

    const result = await svc.assess({
      organizationId,
      contentSha256: 'new-hash',
      referenceNumberHint: 'AZ-2026-4412',
    });

    expect(result.status).toBe('POSSIBLE_BUSINESS_DUPLICATE');
    expect(result.businessMatch?.referenceNumber).toBe('AZ-2026-4412');
    expect(result.existingExtraction?.entityLinks.fineIds).toEqual(['fine-1']);
  });

  it('secures parallel uploads via unique content anchor constraint', async () => {
    const { svc, prisma, anchors } = makeDuplicateService();
    const hash = await computeDocumentContentSha256(FIXTURE_TXT);

    const first = await svc.claimContentAnchor({
      organizationId,
      contentSha256: hash,
      extractionId: 'ext-1',
    });
    const second = await svc.claimContentAnchor({
      organizationId,
      contentSha256: hash,
      extractionId: 'ext-2',
    });

    expect(first).toBe('claimed');
    expect(second).toBe('conflict');
    expect(anchors.size).toBe(1);
    expect(prisma.documentExtractionContentAnchor.create).toHaveBeenCalledTimes(2);
  });
});
