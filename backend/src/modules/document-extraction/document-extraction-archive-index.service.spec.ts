import { DocumentExtractionArchiveIndexService } from './document-extraction-archive-index.service';

describe('DocumentExtractionArchiveIndexService', () => {
  it('upserts denormalized archive index row for extraction record', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      documentExtractionArchiveIndex: { upsert },
      vehicleDocumentExtraction: { findMany: jest.fn() },
    };
    const service = new DocumentExtractionArchiveIndexService(prisma as never);

    await service.upsertForRecord({
      id: 'ext-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      status: 'READY_FOR_REVIEW',
      effectiveDocumentType: 'INVOICE',
      sourceFileName: 'invoice.pdf',
      confirmedData: { invoiceNumber: 'INV-1' },
      createdAt: new Date('2026-07-17T10:00:00.000Z'),
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { extractionId: 'ext-1' },
        create: expect.objectContaining({
          extractionId: 'ext-1',
          organizationId: 'org-1',
          invoiceNumber: 'INV-1',
        }),
        update: expect.objectContaining({
          organizationId: 'org-1',
          invoiceNumber: 'INV-1',
        }),
      }),
    );
  });

  it('backfills only missing archive rows for org', async () => {
    const findManyIndex = jest
      .fn()
      .mockResolvedValueOnce([{ extractionId: 'ext-1' }])
      .mockResolvedValue([]);
    const findManyExtractions = jest.fn().mockResolvedValue([
      {
        id: 'ext-2',
        organizationId: 'org-1',
        vehicleId: null,
        status: 'READY_FOR_REVIEW',
        createdAt: new Date('2026-07-17T10:00:00.000Z'),
      },
    ]);
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      documentExtractionArchiveIndex: {
        findMany: findManyIndex,
        upsert,
      },
      vehicleDocumentExtraction: { findMany: findManyExtractions },
    };
    const service = new DocumentExtractionArchiveIndexService(prisma as never);

    await service.ensureIndexedForOrg('org-1', ['ext-1', 'ext-2']);

    expect(findManyExtractions).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', id: { in: ['ext-2'] } },
    });
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
