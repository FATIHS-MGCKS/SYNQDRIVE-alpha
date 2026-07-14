import { Test, TestingModule } from '@nestjs/testing';
import { OrgInvoiceStatus, OrgInvoiceType, OutboundEmailStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { InvoiceListReadService } from './invoice-list-read.service';

describe('InvoiceListReadService', () => {
  let service: InvoiceListReadService;

  const prisma = {
    orgInvoice: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    customer: { findMany: jest.fn() },
    vendor: { findMany: jest.fn() },
    vehicle: { findMany: jest.fn() },
    generatedDocument: { findMany: jest.fn() },
    booking: { findMany: jest.fn() },
    outboundEmail: { findMany: jest.fn() },
    orgTask: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };

  const sampleInvoice = {
    id: 'inv-1',
    type: OrgInvoiceType.OUTGOING_MANUAL,
    status: OrgInvoiceStatus.ISSUED,
    title: 'Wartung',
    customerId: 'cust-1',
    vendorId: null,
    vendorName: null,
    bookingId: 'book-12345678-abcd-ef01-2345-678901234567',
    vehicleId: 'veh-1',
    totalCents: 11900,
    paidCents: 0,
    outstandingCents: 11900,
    currency: 'EUR',
    invoiceDate: new Date('2026-07-01T00:00:00Z'),
    dueDate: new Date('2026-07-10T00:00:00Z'),
    generatedDocumentId: 'doc-1',
    documentExtractionId: null,
    invoiceNumberDisplay: '2026-0001',
    legacyInvoiceNumber: null,
    invoiceNumber: null,
    sequenceYear: 2026,
    sequenceNumber: 1,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma.orgInvoice.findMany.mockResolvedValue([sampleInvoice]);
    prisma.orgInvoice.count.mockResolvedValue(1);
    prisma.customer.findMany.mockResolvedValue([
      { id: 'cust-1', firstName: 'Max', lastName: 'Mustermann', company: null },
    ]);
    prisma.vendor.findMany.mockResolvedValue([]);
    prisma.vehicle.findMany.mockResolvedValue([
      {
        id: 'veh-1',
        make: 'BMW',
        model: '320d',
        vehicleName: null,
        licensePlate: 'KS-SD 100',
      },
    ]);
    prisma.generatedDocument.findMany.mockResolvedValue([
      { id: 'doc-1', status: 'GENERATED', invoiceId: 'inv-1' },
    ]);
    prisma.outboundEmail.findMany.mockResolvedValue([
      {
        id: 'mail-1',
        invoiceId: 'inv-1',
        status: OutboundEmailStatus.SENT,
        sentAt: new Date('2026-07-02T00:00:00Z'),
        createdAt: new Date('2026-07-02T00:00:00Z'),
      },
    ]);
    prisma.orgTask.findMany.mockResolvedValue([
      { id: 'task-1', invoiceId: 'inv-1', status: 'OPEN', title: 'Zahlung prüfen' },
    ]);
    prisma.$queryRaw.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [InvoiceListReadService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(InvoiceListReadService);
  });

  it('returns paginated list items with enriched display fields', async () => {
    const result = await service.list('org-1', { page: 1, limit: 20 });

    expect(result.meta.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      id: 'inv-1',
      invoiceNumber: '2026-0001',
      customerDisplayName: 'Max Mustermann',
      bookingNumber: 'BK-234567',
      vehicleDisplayName: 'BMW 320d',
      licensePlate: 'KS-SD 100',
      totalGross: 11900,
      paidAmount: 0,
      outstandingAmount: 11900,
      documentStatus: 'GENERATED',
      lastSendStatus: OutboundEmailStatus.SENT,
      hasOpenTask: true,
      isOverdue: true,
    });
    expect(result.data[0].invoiceNumber).not.toContain('inv-1');
    expect(result.data[0].bookingNumber).not.toContain('book-');
  });

  it('uses bounded query count for list enrichment (no per-row N+1)', async () => {
    prisma.orgInvoice.findMany.mockResolvedValue([
      sampleInvoice,
      { ...sampleInvoice, id: 'inv-2', customerId: 'cust-2' },
    ]);
    prisma.orgInvoice.count.mockResolvedValue(2);
    prisma.customer.findMany.mockResolvedValue([
      { id: 'cust-1', firstName: 'Max', lastName: 'Mustermann', company: null },
      { id: 'cust-2', firstName: 'Erika', lastName: 'Muster', company: 'ACME GmbH' },
    ]);

    await service.list('org-1', {});

    expect(prisma.orgInvoice.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.orgInvoice.count).toHaveBeenCalledTimes(1);
    expect(prisma.customer.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.vehicle.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.generatedDocument.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.outboundEmail.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.orgTask.findMany).toHaveBeenCalledTimes(1);
    // Fixed batch count regardless of page size — not 2× customers/vehicles.
    expect(prisma.customer.findMany.mock.calls[0][0].where.id.in).toHaveLength(2);
  });

  it('resolves search scope with parallel entity lookups', async () => {
    prisma.customer.findMany.mockResolvedValueOnce([{ id: 'cust-9' }]);
    prisma.vendor.findMany.mockResolvedValueOnce([]);
    prisma.vehicle.findMany.mockResolvedValueOnce([]);
    prisma.generatedDocument.findMany.mockResolvedValueOnce([]);
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await service.list('org-1', { search: 'Mustermann' });

    expect(prisma.customer.findMany).toHaveBeenCalled();
    expect(prisma.orgInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([{ customerId: { in: ['cust-9'] } }]),
            }),
          ]),
        }),
      }),
    );
  });
});
