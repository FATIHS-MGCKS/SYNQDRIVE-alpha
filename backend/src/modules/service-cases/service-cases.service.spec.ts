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

function makePrisma() {
  return {
    serviceCase: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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

  it('does not return a service case from another organization (tenant scoping)', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue(null);

    await expect(svc.getById('org1', 'sc-other-org')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.serviceCase.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sc-other-org', organizationId: 'org1' },
      }),
    );
  });

  it('returns nested tasks, comments, attachments and cost fields only for in-org detail', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue(
      baseCase({
        estimatedCostCents: 25000,
        actualCostCents: 19950,
        scheduledAt: new Date('2026-06-10T09:00:00Z'),
        documentId: 'doc-1',
        tasks: [
          {
            id: 't1',
            title: 'Bremsen prüfen',
            status: 'OPEN',
            type: 'BRAKE_CHECK',
            dueDate: new Date('2026-06-12T00:00:00Z'),
          },
        ],
        comments: [{ id: 'c1', userId: 'u1', body: 'Werkstatt informiert', createdAt: new Date() }],
        attachments: [
          {
            id: 'a1',
            fileUrl: 'https://files.example/a.pdf',
            fileName: 'angebot.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            uploadedByUserId: 'u1',
            createdAt: new Date(),
          },
        ],
      }),
    );

    const detail = await svc.getById('org1', 'sc1');

    expect(detail.estimatedCostCents).toBe(25000);
    expect(detail.actualCostCents).toBe(19950);
    expect(detail.scheduledAt).toBe('2026-06-10T09:00:00.000Z');
    expect(detail.documentId).toBe('doc-1');
    expect(detail.tasks).toHaveLength(1);
    expect(detail.comments).toHaveLength(1);
    expect(detail.attachments).toHaveLength(1);
  });

  it('scopes list queries to organizationId', async () => {
    prisma.serviceCase.findMany.mockResolvedValue([]);

    await svc.list('org1', { status: 'OPEN' });

    expect(prisma.serviceCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org1', status: 'OPEN' }),
      }),
    );
  });

  it('rejects vehicle-scoped list when vehicle is outside org', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);

    await expect(svc.listForVehicle('org1', 'veh-other', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.serviceCase.findMany).not.toHaveBeenCalled();
  });

  it('rejects vendor-scoped list when vendor is outside org', async () => {
    prisma.vendor.findFirst.mockResolvedValue(null);

    await expect(svc.listForVendor('org1', 'vendor-other', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.serviceCase.findMany).not.toHaveBeenCalled();
  });

  it('lists cases for an in-org vehicle without leaking foreign vendor records', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'v1' });
    prisma.serviceCase.findMany.mockResolvedValue([
      baseCase({ vehicleId: 'v1', vendorId: 'vendor-1' }),
    ]);

    const rows = await svc.listForVehicle('org1', 'v1', {});

    expect(rows).toHaveLength(1);
    expect(rows[0].vendorId).toBe('vendor-1');
    expect(prisma.serviceCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org1', vehicleId: 'v1' }),
      }),
    );
  });

  it('lists completed cases for vendor', async () => {
    prisma.vendor.findFirst.mockResolvedValue({ id: 'vendor1' });
    prisma.serviceCase.findMany.mockResolvedValue([baseCase({ status: 'COMPLETED', vendorId: 'vendor1' })]);

    const rows = await svc.listCompletedForVendor('org1', 'vendor1');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('COMPLETED');
  });

  it('rejects invalid status transition', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue(baseCase({ status: 'COMPLETED' }));
    await expect(svc.cancel('org1', 'sc1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects COMPLETED status via generic update path', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue(baseCase({ status: 'OPEN' }));

    await expect(svc.update('org1', 'sc1', { status: 'COMPLETED' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.serviceCase.update).not.toHaveBeenCalled();
  });

  it('rejects CANCELLED status via generic update path', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue(baseCase({ status: 'OPEN' }));

    await expect(svc.update('org1', 'sc1', { status: 'CANCELLED' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.serviceCase.update).not.toHaveBeenCalled();
  });

  it('rejects vendor reassignment to a partner outside the org', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue(baseCase({ vendorId: 'vendor-1' }));
    prisma.vendor.findFirst.mockResolvedValue(null);

    await expect(svc.update('org1', 'sc1', { vendorId: 'vendor-other' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.serviceCase.update).not.toHaveBeenCalled();
  });

  it('rejects create when vehicle belongs to another organization', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);

    await expect(
      svc.create('org1', { title: 'Service', category: 'SERVICE', vehicleId: 'veh-other' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.serviceCase.create).not.toHaveBeenCalled();
  });

  it('records updatedByUserId from authenticated actor on update', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue(baseCase());
    prisma.serviceCase.update.mockResolvedValue(baseCase({ title: 'Updated', updatedByUserId: 'u2' }));

    await svc.update('org1', 'sc1', { title: 'Updated' }, 'u2');

    expect(prisma.serviceCase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ updatedByUserId: 'u2', title: 'Updated' }),
      }),
    );
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
