import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinesService } from './fines.service';

describe('FinesService.createFromDocumentExtraction', () => {
  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    documentExtractionId: 'ext-fine-1',
    documentActionIdempotencyKey: 'ext-fine-1:v1:fp:a1:CREATE_FINE_DRAFT',
    fineNumber: 'REF-2025-001',
    title: 'Parkverstoß',
    description: 'Parkverstoß ohne Ticket',
    offenseType: 'Parkverstoß',
    offenseDate: '2025-10-24',
    amountCents: 1750,
    currency: 'EUR',
    bookingId: 'booking-1',
    customerId: 'customer-1',
    driverCustomerId: 'driver-1',
  };

  const tasksService = {
    upsertByDedup: jest.fn().mockResolvedValue({ id: 'task-1' }),
  };

  function createHarness() {
    const prisma = {
      fine: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      booking: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'booking-1',
          customerId: 'customer-1',
        }),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      },
    };

    const svc = new FinesService(prisma as any, tasksService as any);
    return { svc, prisma };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns existing fine on retry for the same documentExtractionId', async () => {
    const { svc, prisma } = createHarness();
    prisma.fine.findUnique.mockResolvedValue({
      id: 'fine-existing',
      organizationId: 'org-1',
      documentExtractionId: 'ext-fine-1',
      offenseDate: new Date('2025-10-24'),
      receivedDate: null,
      dueDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tasks: [],
    });

    const result = await svc.createFromDocumentExtraction(baseInput);

    expect(result.id).toBe('fine-existing');
    expect(prisma.fine.create).not.toHaveBeenCalled();
    expect(tasksService.upsertByDedup).toHaveBeenCalledWith(
      'org-1',
      'document-extraction:fine:ext-fine-1',
      expect.objectContaining({ fineId: 'fine-existing' }),
    );
  });

  it('creates UNDER_REVIEW draft with documentExtractionId and confirmed links only', async () => {
    const { svc, prisma } = createHarness();
    prisma.fine.findUnique.mockResolvedValue(null);
    prisma.fine.findFirst.mockResolvedValue(null);
    prisma.fine.create.mockResolvedValue({ id: 'fine-new' });
    prisma.fine.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'fine-new',
      organizationId: 'org-1',
      documentExtractionId: 'ext-fine-1',
      status: 'UNDER_REVIEW',
      offenseDate: new Date('2025-10-24'),
      receivedDate: null,
      dueDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tasks: [],
    });

    jest.spyOn(svc, 'findById').mockResolvedValue({
      id: 'fine-new',
      status: 'UNDER_REVIEW',
    } as any);

    const result = await svc.createFromDocumentExtraction(baseInput);

    expect(result.id).toBe('fine-new');
    expect(prisma.fine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentExtractionId: 'ext-fine-1',
          status: 'UNDER_REVIEW',
          bookingId: 'booking-1',
          customerId: 'customer-1',
          amountCents: 1750,
        }),
      }),
    );
  });

  it('rejects duplicate reference numbers for the same organization', async () => {
    const { svc, prisma } = createHarness();
    prisma.fine.findUnique.mockResolvedValue(null);
    prisma.fine.findFirst.mockResolvedValue({ id: 'fine-dup' });

    await expect(svc.createFromDocumentExtraction(baseInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.fine.create).not.toHaveBeenCalled();
  });

  it('handles parallel create races via unique constraint and returns existing fine', async () => {
    const { svc, prisma } = createHarness();
    const racedFine = {
      id: 'fine-raced',
      organizationId: 'org-1',
      documentExtractionId: 'ext-fine-1',
      offenseDate: new Date('2025-10-24'),
      receivedDate: null,
      dueDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tasks: [],
    };
    let extractionLookupCount = 0;
    prisma.fine.findUnique.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if (args.where.organizationId_documentExtractionId) {
        extractionLookupCount += 1;
        if (extractionLookupCount <= 2) return null;
        return racedFine;
      }
      if (args.where.id === 'fine-raced') {
        return racedFine;
      }
      return null;
    });
    prisma.fine.findFirst.mockResolvedValue(null);
    prisma.fine.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    jest.spyOn(svc, 'findById').mockResolvedValue({ id: 'fine-raced', status: 'UNDER_REVIEW' } as any);

    const results = await Promise.all([
      svc.createFromDocumentExtraction(baseInput),
      svc.createFromDocumentExtraction(baseInput),
    ]);

    expect(results[0].id).toBe('fine-raced');
    expect(results[1].id).toBe('fine-raced');
    expect(prisma.fine.create).toHaveBeenCalledTimes(2);
    expect(tasksService.upsertByDedup).toHaveBeenCalledTimes(2);
  });
});
