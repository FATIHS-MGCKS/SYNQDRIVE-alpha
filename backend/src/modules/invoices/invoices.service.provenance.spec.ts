import { OrgInvoiceType } from '@prisma/client';
import { ORG_A, BOOKING_REF, CUSTOMER_MUELLER, VEHICLE_GOLF, makeOrgInvoicePolicies } from './__fixtures__/invoice-baseline.fixtures';
import { mockInvoiceDocumentsRead } from './__fixtures__/invoice-documents-read.mock';
import { InvoiceDocumentsReadService } from './invoice-documents-read.service';
import { InvoiceNumberService } from './invoice-number.service';
import { InvoicePaymentService } from './invoice-payment.service';
import { InvoicesService } from './invoices.service';
import {
  provenanceForDocumentExtractionInvoice,
  provenanceForManualUiInvoice,
} from './invoice-provenance-write.util';

const loadedInvoice = {
  id: 'inv-new',
  organizationId: ORG_A,
  type: OrgInvoiceType.OUTGOING_BOOKING,
  status: 'DRAFT',
  totalCents: 53550,
  paidCents: 0,
  tasks: [],
  payments: [],
  vendor: null,
};

describe('InvoicesService — provenance on create paths', () => {
  let prisma: {
    orgInvoice: { findFirst: jest.Mock; create: jest.Mock };
    customer: { findFirst: jest.Mock };
    vehicle: { findFirst: jest.Mock };
    booking: { findFirst: jest.Mock };
    organizationMembership: { findFirst: jest.Mock };
    bookingPriceSnapshot: { findFirst: jest.Mock };
    organization: { findFirst: jest.Mock };
  };
  let service: InvoicesService;

  beforeEach(() => {
    const invoiceDocuments = mockInvoiceDocumentsRead();
    prisma = {
      orgInvoice: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      customer: { findFirst: jest.fn().mockResolvedValue({ id: CUSTOMER_MUELLER }) },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: VEHICLE_GOLF }) },
      booking: { findFirst: jest.fn().mockResolvedValue({ id: BOOKING_REF }) },
      organizationMembership: { findFirst: jest.fn().mockResolvedValue({ userId: 'user-1' }) },
      bookingPriceSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
      organization: { findFirst: jest.fn().mockResolvedValue(makeOrgInvoicePolicies()) },
    };
    service = new InvoicesService(
      prisma as never,
      { upsertByDedup: jest.fn() } as never,
      { allocate: jest.fn() } as unknown as InvoiceNumberService,
      invoiceDocuments as unknown as InvoiceDocumentsReadService,
      { recordPayment: jest.fn(), recordFullBalancePayment: jest.fn() } as unknown as InvoicePaymentService,
    );
    prisma.orgInvoice.create.mockImplementation(async ({ data }) => ({
      id: 'inv-new',
      ...data,
    }));
  });

  it('createBookingInvoice persists BOOKING_WIZARD + USER provenance', async () => {
    prisma.orgInvoice.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(loadedInvoice);

    await service.createBookingInvoice(
      ORG_A,
      {
        id: BOOKING_REF,
        customerId: CUSTOMER_MUELLER,
        vehicleId: VEHICLE_GOLF,
        totalPriceCents: 53550,
        dailyRateCents: 15000,
        startDate: new Date('2026-07-10'),
        endDate: new Date('2026-07-13'),
        currency: 'EUR',
      },
      { userId: 'user-1', correlationId: 'req-1' },
    );

    expect(prisma.orgInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creationChannel: 'BOOKING_WIZARD',
          triggeredByType: 'USER',
          sourceType: 'BOOKING',
          sourceId: BOOKING_REF,
          createdByUserId: 'user-1',
          correlationId: 'req-1',
        }),
      }),
    );
  });

  it('manual create persists MANUAL_UI provenance with org-scoped user', async () => {
    prisma.orgInvoice.findFirst.mockResolvedValueOnce(loadedInvoice);

    await service.create(
      ORG_A,
      {
        type: 'OUTGOING_MANUAL',
        title: 'Manual',
        customerId: CUSTOMER_MUELLER,
        totalCents: 5000,
      },
      { userId: 'user-1', correlationId: 'req-2' },
    );

    expect(prisma.orgInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creationChannel: 'MANUAL_UI',
          triggeredByType: 'USER',
          sourceType: 'MANUAL',
          createdByUserId: 'user-1',
        }),
      }),
    );
  });

  it('strips createdByUserId when user is not org member', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);
    prisma.orgInvoice.findFirst.mockResolvedValueOnce(loadedInvoice);

    await service.create(
      ORG_A,
      {
        type: 'OUTGOING_MANUAL',
        title: 'Manual',
        totalCents: 5000,
      },
      {
        userId: 'foreign-user',
        provenance: provenanceForManualUiInvoice({ userId: 'foreign-user' }),
      },
    );

    expect(prisma.orgInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdByUserId: null,
          triggeredByType: 'USER',
        }),
      }),
    );
  });

  it('document extraction create uses DOCUMENT_EXTRACTION channel', async () => {
    prisma.orgInvoice.findFirst.mockResolvedValueOnce(loadedInvoice);

    await service.create(
      ORG_A,
      {
        type: 'INCOMING_UPLOADED',
        title: 'Scan',
        vehicleId: VEHICLE_GOLF,
        totalCents: 1000,
        documentExtractionId: 'ext-42',
        fromExtraction: true,
      },
      {
        userId: 'user-1',
        provenance: provenanceForDocumentExtractionInvoice({
          extractionId: 'ext-42',
          userId: 'user-1',
        }),
      },
    );

    expect(prisma.orgInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creationChannel: 'DOCUMENT_EXTRACTION',
          sourceType: 'DOCUMENT',
          sourceId: 'ext-42',
        }),
      }),
    );
  });

  it('createFinalInvoice persists AUTOMATION pipeline provenance', async () => {
    prisma.orgInvoice.findFirst.mockResolvedValue(null);
    prisma.orgInvoice.create.mockResolvedValue({ id: 'final-1' });

    await service.createFinalInvoice(
      ORG_A,
      {
        id: BOOKING_REF,
        customerId: CUSTOMER_MUELLER,
        vehicleId: VEHICLE_GOLF,
        currency: 'EUR',
      },
      {
        userId: 'user-1',
        totalCents: 1200,
        originalInvoiceId: 'inv-orig',
      },
    );

    expect(prisma.orgInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'OUTGOING_FINAL',
          creationChannel: 'AUTOMATION',
          triggeredByType: 'USER',
          automationId: 'booking-final-invoice',
          sourceType: 'BOOKING',
        }),
      }),
    );
  });

  it('does not overwrite provenance on idempotent createBookingInvoice hit', async () => {
    const existing = {
      id: 'existing-inv',
      organizationId: ORG_A,
      tasks: [],
      payments: [],
      vendor: null,
    };
    prisma.orgInvoice.findFirst
      .mockResolvedValueOnce({ id: 'existing-inv' })
      .mockResolvedValueOnce(existing);

    await service.createBookingInvoice(
      ORG_A,
      {
        id: BOOKING_REF,
        customerId: CUSTOMER_MUELLER,
        vehicleId: VEHICLE_GOLF,
        startDate: new Date(),
        endDate: new Date(),
        totalPriceCents: 100,
      },
      { userId: 'user-1' },
    );

    expect(prisma.orgInvoice.create).not.toHaveBeenCalled();
  });
});
