import { Test, TestingModule } from '@nestjs/testing';
import { LegalDocumentUsageService } from './legal-document-usage.service';
import { PrismaService } from '@shared/database/prisma.service';
import { LegalDocumentNotFoundError } from './legal-documents-api.errors';

describe('LegalDocumentUsageService', () => {
  let service: LegalDocumentUsageService;

  const prisma = {
    organizationLegalDocument: {
      findFirst: jest.fn(),
    },
    generatedDocument: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    rentalContract: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    legalDocumentDeliveryEvidence: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegalDocumentUsageService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(LegalDocumentUsageService);
  });

  it('throws when document is not in tenant scope', async () => {
    prisma.organizationLegalDocument.findFirst.mockResolvedValue(null);
    await expect(service.getUsage('org-1', 'missing', {})).rejects.toBeInstanceOf(
      LegalDocumentNotFoundError,
    );
  });

  it('aggregates usage with batched contract lookup (no N+1)', async () => {
    prisma.organizationLegalDocument.findFirst.mockResolvedValue({ id: 'doc-1' });
    prisma.generatedDocument.count.mockResolvedValue(5);
    prisma.generatedDocument.findMany
      .mockResolvedValueOnce([{ bookingId: 'book-1' }, { bookingId: 'book-2' }])
      .mockResolvedValueOnce([
        {
          id: 'gen-1',
          bookingId: 'book-1',
          documentType: 'TERMS_AND_CONDITIONS',
          generatedAt: new Date('2026-07-01'),
        },
      ]);
    prisma.rentalContract.count.mockResolvedValue(2);
    prisma.legalDocumentDeliveryEvidence.count.mockResolvedValue(3);
    prisma.legalDocumentDeliveryEvidence.groupBy.mockResolvedValue([
      { deliveryStatus: 'DELIVERED', _count: { _all: 2 } },
      { deliveryStatus: 'PENDING', _count: { _all: 1 } },
    ]);
    prisma.rentalContract.findMany.mockResolvedValue([
      { bookingId: 'book-1', contractNumber: 'MV-2026-001' },
    ]);

    const result = await service.getUsage('org-1', 'doc-1', { page: 1, limit: 10 });

    expect(result.summary).toEqual({
      snapshotCount: 5,
      bookingCount: 2,
      contractCount: 2,
      deliveryEvidenceCount: 3,
      deliveryByStatus: { DELIVERED: 2, PENDING: 1 },
    });
    expect(result.references.data[0]).toMatchObject({
      contractNumber: 'MV-2026-001',
      bookingLabel: 'Buchung book-1',
    });
    expect(prisma.rentalContract.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.rentalContract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', bookingId: { in: ['book-1'] } },
      }),
    );
  });
});
