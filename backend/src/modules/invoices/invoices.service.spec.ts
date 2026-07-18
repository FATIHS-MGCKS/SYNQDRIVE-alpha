import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InvoicesService } from './invoices.service';

describe('InvoicesService.createFromDocumentExtraction', () => {
  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    documentExtractionId: 'ext-inv-1',
    documentActionIdempotencyKey: 'ext-inv-1:v1:fp:a1:CREATE_INVOICE_DRAFT',
    vendorInvoiceNumber: 'INV-2026-001',
    vendorName: 'Werkstatt Müller GmbH',
    vendorId: 'vendor-1',
    title: 'Ölwechsel',
    description: 'Service',
    invoiceDate: '2026-03-10',
    dueDate: '2026-04-09',
    currency: 'EUR',
    lineItems: [
      {
        description: 'Ölwechsel',
        quantity: 1,
        unitPriceNetCents: 10000,
        taxRate: 19,
      },
    ],
    totalCents: 11900,
    isCreditNote: false,
    draftOnly: false,
  };

  const invoicePaymentTasks = {
    syncPaymentCheckTask: jest.fn().mockResolvedValue(undefined),
  };

  function createHarness() {
    const prisma = {
      orgInvoice: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      vendor: {
        findFirst: jest.fn(),
      },
    };

    const svc = new InvoicesService(
      prisma as any,
      { allocateNext: jest.fn() } as any,
      invoicePaymentTasks as any,
    );
    return { svc, prisma };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns existing invoice on retry for the same documentExtractionId', async () => {
    const { svc, prisma } = createHarness();
    prisma.orgInvoice.findUnique.mockResolvedValue({
      id: 'inv-existing',
      organizationId: 'org-1',
      documentExtractionId: 'ext-inv-1',
      status: 'NEEDS_REVIEW',
      type: 'INCOMING_UPLOADED',
      title: 'Ölwechsel',
      invoiceNumberDisplay: 'INV-2026-001',
      totalCents: 11900,
      paidCents: 0,
      currency: 'EUR',
      invoiceDate: new Date('2026-03-10'),
      dueDate: new Date('2026-04-09'),
      vehicleId: 'veh-1',
      bookingId: null,
      customerId: null,
    });
    prisma.orgInvoice.findFirst.mockResolvedValue({
      id: 'inv-existing',
      organizationId: 'org-1',
      status: 'NEEDS_REVIEW',
      type: 'INCOMING_UPLOADED',
      title: 'Ölwechsel',
      invoiceNumberDisplay: 'INV-2026-001',
      totalCents: 11900,
      paidCents: 0,
      currency: 'EUR',
      invoiceDate: new Date('2026-03-10'),
      dueDate: new Date('2026-04-09'),
      vehicleId: 'veh-1',
      bookingId: null,
      customerId: null,
    });
    jest.spyOn(svc, 'findById').mockResolvedValue({ id: 'inv-existing', status: 'NEEDS_REVIEW' } as any);

    const result = await svc.createFromDocumentExtraction(baseInput);

    expect(result.id).toBe('inv-existing');
    expect(prisma.orgInvoice.create).not.toHaveBeenCalled();
    expect(invoicePaymentTasks.syncPaymentCheckTask).toHaveBeenCalled();
  });

  it('creates NEEDS_REVIEW invoice with documentExtractionId and explicit tax lines', async () => {
    const { svc, prisma } = createHarness();
    prisma.orgInvoice.findUnique.mockResolvedValue(null);
    prisma.orgInvoice.findFirst.mockResolvedValue(null);
    prisma.vendor.findFirst.mockResolvedValue({ name: 'Werkstatt Müller GmbH' });
    prisma.orgInvoice.create.mockResolvedValue({ id: 'inv-new' });
    jest.spyOn(svc, 'findById').mockResolvedValue({ id: 'inv-new', status: 'NEEDS_REVIEW' } as any);

    const result = await svc.createFromDocumentExtraction(baseInput);

    expect(result.id).toBe('inv-new');
    expect(prisma.orgInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentExtractionId: 'ext-inv-1',
          status: 'NEEDS_REVIEW',
          invoiceNumberDisplay: 'INV-2026-001',
          totalCents: 11900,
          lineItems: expect.arrayContaining([
            expect.objectContaining({ taxRate: 19 }),
          ]),
        }),
      }),
    );
  });

  it('creates DRAFT invoice when draftOnly is true', async () => {
    const { svc, prisma } = createHarness();
    prisma.orgInvoice.findUnique.mockResolvedValue(null);
    prisma.orgInvoice.findFirst.mockResolvedValue(null);
    prisma.vendor.findFirst.mockResolvedValue({ name: 'Werkstatt Müller GmbH' });
    prisma.orgInvoice.create.mockResolvedValue({ id: 'inv-draft' });
    jest.spyOn(svc, 'findById').mockResolvedValue({ id: 'inv-draft', status: 'DRAFT' } as any);

    await svc.createFromDocumentExtraction({ ...baseInput, draftOnly: true });

    expect(prisma.orgInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRAFT' }),
      }),
    );
    expect(invoicePaymentTasks.syncPaymentCheckTask).not.toHaveBeenCalled();
  });

  it('stores negative totals for credit notes', async () => {
    const { svc, prisma } = createHarness();
    prisma.orgInvoice.findUnique.mockResolvedValue(null);
    prisma.orgInvoice.findFirst.mockResolvedValue(null);
    prisma.vendor.findFirst.mockResolvedValue({ name: 'Werkstatt Müller GmbH' });
    prisma.orgInvoice.create.mockResolvedValue({ id: 'inv-cn' });
    jest.spyOn(svc, 'findById').mockResolvedValue({ id: 'inv-cn', status: 'NEEDS_REVIEW' } as any);

    await svc.createFromDocumentExtraction({
      ...baseInput,
      vendorInvoiceNumber: 'CN-2026-001',
      isCreditNote: true,
      totalCents: -5950,
      lineItems: [
        {
          description: 'Gutschrift',
          quantity: 1,
          unitPriceNetCents: 5000,
          taxRate: 19,
        },
      ],
    });

    expect(prisma.orgInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalCents: -5950,
          subtotalCents: -5000,
        }),
      }),
    );
  });

  it('rejects duplicate vendor invoice numbers', async () => {
    const { svc, prisma } = createHarness();
    prisma.orgInvoice.findUnique.mockResolvedValue(null);
    prisma.orgInvoice.findFirst.mockResolvedValue({ id: 'inv-dup' });

    await expect(svc.createFromDocumentExtraction(baseInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.orgInvoice.create).not.toHaveBeenCalled();
  });

  it('handles parallel create races via unique constraint and returns existing invoice', async () => {
    const { svc, prisma } = createHarness();
    const racedInvoice = {
      id: 'inv-raced',
      organizationId: 'org-1',
      documentExtractionId: 'ext-inv-1',
      status: 'NEEDS_REVIEW',
      type: 'INCOMING_UPLOADED',
      title: 'Ölwechsel',
      invoiceNumberDisplay: 'INV-2026-001',
      totalCents: 11900,
      paidCents: 0,
      currency: 'EUR',
      invoiceDate: new Date('2026-03-10'),
      dueDate: new Date('2026-04-09'),
      vehicleId: 'veh-1',
      bookingId: null,
      customerId: null,
    };
    let extractionLookupCount = 0;
    prisma.orgInvoice.findUnique.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if (args.where.organizationId_documentExtractionId) {
        extractionLookupCount += 1;
        if (extractionLookupCount <= 2) return null;
        return racedInvoice;
      }
      return null;
    });
    prisma.orgInvoice.findFirst.mockResolvedValue(null);
    prisma.vendor.findFirst.mockResolvedValue({ name: 'Werkstatt Müller GmbH' });
    prisma.orgInvoice.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    jest.spyOn(svc, 'findById').mockResolvedValue({ id: 'inv-raced', status: 'NEEDS_REVIEW' } as any);

    const results = await Promise.all([
      svc.createFromDocumentExtraction(baseInput),
      svc.createFromDocumentExtraction(baseInput),
    ]);

    expect(results[0].id).toBe('inv-raced');
    expect(results[1].id).toBe('inv-raced');
    expect(prisma.orgInvoice.create).toHaveBeenCalledTimes(2);
  });
});
