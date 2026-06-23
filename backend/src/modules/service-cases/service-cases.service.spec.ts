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

  beforeEach(() => {
    prisma = makePrisma();
    svc = new ServiceCasesService(prisma as any);
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
    prisma.serviceCase.findMany.mockResolvedValue([baseCase({ status: 'COMPLETED', vendorId: 'vendor1' })]);

    const rows = await svc.listCompletedForVendor('org1', 'vendor1');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('COMPLETED');
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
