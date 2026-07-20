import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ServiceCasesService } from './service-cases.service';

function baseCase(over: Record<string, unknown> = {}) {
  return {
    id: 'sc1',
    organizationId: 'org1',
    vehicleId: 'v1',
    vendorId: null,
    title: 'TÜV + Bremsen',
    description: '',
    category: 'INSPECTION',
    status: 'OPEN',
    priority: 'NORMAL',
    source: 'MANUAL',
    openedAt: new Date('2026-06-01T00:00:00Z'),
    scheduledAt: null,
    expectedReadyAt: null,
    completedAt: null,
    cancelledAt: null,
    estimatedCostCents: null,
    actualCostCents: null,
    downtimeStart: null,
    downtimeEnd: null,
    blocksRental: false,
    completionNotes: null,
    documentId: null,
    metadata: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    tasks: [],
    comments: [],
    attachments: [],
    ...over,
  };
}

function listRow(over: Record<string, unknown> = {}) {
  return {
    ...baseCase(over),
    _count: { tasks: 2 },
  };
}

function makePrisma() {
  return {
    serviceCase: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    serviceCaseComment: { create: jest.fn() },
    serviceCaseAttachment: { create: jest.fn() },
    vehicle: { findFirst: jest.fn() },
    vendor: { findFirst: jest.fn() },
  };
}

describe('ServiceCasesService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: ServiceCasesService;
  const serviceOverdueTasks = {
    linkServiceCase: jest.fn().mockResolvedValue(undefined),
    onServiceCaseCompleted: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    prisma = makePrisma();
    jest.clearAllMocks();
    svc = new ServiceCasesService(prisma as any, serviceOverdueTasks as any);
  });

  it('creates a case with vehicle org validation', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'v1' });
    prisma.serviceCase.create.mockResolvedValue(baseCase());

    const result = await svc.create(
      'org1',
      { title: 'TÜV', category: 'INSPECTION', vehicleId: 'v1' },
      'u1',
    );

    expect(result.title).toBe('TÜV + Bremsen');
    expect(prisma.serviceCase.create).toHaveBeenCalled();
  });

  it('rejects create when vehicle is not in org', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(
      svc.create('org1', { title: 'TÜV', category: 'INSPECTION', vehicleId: 'v1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('loads case by id or throws NotFound', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue(null);
    await expect(svc.getById('org1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists completed cases for vendor', async () => {
    prisma.vendor.findFirst.mockResolvedValue({ id: 'vendor1' });
    prisma.serviceCase.findMany.mockResolvedValue([listRow({ status: 'COMPLETED', vendorId: 'vendor1' })]);

    const rows = await svc.listCompletedForVendor('org1', 'vendor1');
    expect(rows).toHaveLength(1);
    expect(Array.isArray(rows) && rows[0]?.status).toBe('COMPLETED');
  });

  it('returns paginated list envelope with light projection', async () => {
    prisma.serviceCase.findMany.mockResolvedValue([
      listRow({ id: 'sc-1' }),
      listRow({ id: 'sc-2' }),
      listRow({ id: 'sc-3' }),
    ]);

    const result = await svc.list('org1', { limit: 2 });

    expect(result).toMatchObject({
      data: [
        expect.objectContaining({ id: 'sc-1', taskCount: 2 }),
        expect.objectContaining({ id: 'sc-2', taskCount: 2 }),
      ],
      meta: { limit: 2, nextCursor: expect.any(String) },
    });
    expect((result as { data: Array<Record<string, unknown>> }).data[0]).not.toHaveProperty('comments');
    expect((result as { data: Array<Record<string, unknown>> }).data[0]).not.toHaveProperty('attachments');
    expect((result as { data: Array<Record<string, unknown>> }).data[0]).not.toHaveProperty('tasks');
    expect(prisma.serviceCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org1' }),
        take: 3,
      }),
    );
  });

  it('applies list filters for status, vehicle, vendor, blocksRental and date ranges', async () => {
    prisma.serviceCase.findMany.mockResolvedValue([]);

    await svc.list('org1', {
      limit: 10,
      status: 'SCHEDULED',
      vehicleId: 'veh-1',
      vendorId: 'vendor-1',
      blocksRental: true,
      scheduledFrom: '2026-07-01T00:00:00.000Z',
      scheduledTo: '2026-07-31T23:59:59.999Z',
      expectedReadyFrom: '2026-07-05T00:00:00.000Z',
      expectedReadyTo: '2026-07-10T23:59:59.999Z',
    });

    expect(prisma.serviceCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org1',
          status: 'SCHEDULED',
          vehicleId: 'veh-1',
          vendorId: 'vendor-1',
          blocksRental: true,
          scheduledAt: {
            gte: new Date('2026-07-01T00:00:00.000Z'),
            lte: new Date('2026-07-31T23:59:59.999Z'),
          },
          expectedReadyAt: {
            gte: new Date('2026-07-05T00:00:00.000Z'),
            lte: new Date('2026-07-10T23:59:59.999Z'),
          },
        }),
      }),
    );
  });

  it('returns legacy flat array when pagination params are omitted', async () => {
    prisma.serviceCase.findMany.mockResolvedValue([listRow({ id: 'sc-legacy' })]);

    const rows = await svc.list('org1', { status: 'OPEN' });

    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(1);
    expect(prisma.serviceCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
  });

  it('aggregates dashboard summary separately from list rows', async () => {
    prisma.serviceCase.groupBy
      .mockResolvedValueOnce([
        { status: 'OPEN', _count: { _all: 3 } },
        { status: 'COMPLETED', _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([{ priority: 'NORMAL', _count: { _all: 4 } }]);
    prisma.serviceCase.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);

    const summary = await svc.getDashboardSummary('org1');

    expect(summary).toMatchObject({
      open: 3,
      completed: 2,
      cancelled: 1,
      blocksRental: 1,
      byStatus: { OPEN: 3, COMPLETED: 2 },
      byPriority: { NORMAL: 4 },
    });
    expect(prisma.serviceCase.findMany).not.toHaveBeenCalled();
  });

  it('rejects invalid status transition', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue(baseCase({ status: 'COMPLETED' }));
    await expect(svc.cancel('org1', 'sc1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('assertCaseAccessible rejects completed cases for task linking', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue({
      id: 'sc1',
      vehicleId: 'v1',
      vendorId: null,
      status: 'COMPLETED',
    });
    await expect(svc.assertCaseAccessible('org1', 'sc1', { vehicleId: 'v1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
