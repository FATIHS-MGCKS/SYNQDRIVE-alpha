import { NotFoundException } from '@nestjs/common';
import { OrgInvoiceType } from '@prisma/client';
import {
  BOOKING_REF,
  BOOKING_NUMBER,
  CUSTOMER_MUELLER,
  INVOICE_BOOKING,
  ORG_A,
  ORG_B,
  VEHICLE_GOLF,
  makeOrgInvoiceRow,
} from './__fixtures__/invoice-baseline.fixtures';
import { mockInvoiceDocumentsRead } from './__fixtures__/invoice-documents-read.mock';
import { InvoiceDetailReadService } from './invoice-detail-read.service';
import { InvoiceDocumentsReadService } from './invoice-documents-read.service';

describe('InvoiceDetailReadService', () => {
  let prisma: {
    orgInvoice: { findFirst: jest.Mock };
    customer: { findFirst: jest.Mock };
    vehicle: { findFirst: jest.Mock };
    booking: { findFirst: jest.Mock };
    organizationMembership: { findFirst: jest.Mock };
    outboundEmail: { findMany: jest.Mock };
    activityLog: { findMany: jest.Mock };
    organization: { findFirst: jest.Mock };
  };
  let invoiceDocuments: ReturnType<typeof mockInvoiceDocumentsRead>;
  let service: InvoiceDetailReadService;

  beforeEach(() => {
    invoiceDocuments = mockInvoiceDocumentsRead();
    prisma = {
      orgInvoice: { findFirst: jest.fn() },
      customer: { findFirst: jest.fn() },
      vehicle: { findFirst: jest.fn() },
      booking: { findFirst: jest.fn() },
      organizationMembership: { findFirst: jest.fn() },
      outboundEmail: { findMany: jest.fn().mockResolvedValue([]) },
      activityLog: { findMany: jest.fn().mockResolvedValue([]) },
      organization: {
        findFirst: jest.fn().mockResolvedValue({ defaultVatRate: 19, isSmallBusiness: false }),
      },
    };
    service = new InvoiceDetailReadService(
      prisma as never,
      invoiceDocuments as unknown as InvoiceDocumentsReadService,
    );
  });

  it('loads detail with resolved relations in one orchestrated read', async () => {
    const row = makeOrgInvoiceRow();
    prisma.orgInvoice.findFirst.mockResolvedValue(row);
    prisma.customer.findFirst.mockResolvedValue({
      id: CUSTOMER_MUELLER,
      firstName: 'Anna',
      lastName: 'Test',
      email: 'anna@test.de',
      phone: null,
      company: null,
      status: 'ACTIVE',
    });
    prisma.vehicle.findFirst.mockResolvedValue({
      id: VEHICLE_GOLF,
      make: 'VW',
      model: 'Golf',
      year: 2023,
      licensePlate: 'M-AB 100',
      vin: null,
      vehicleName: null,
    });
    prisma.booking.findFirst.mockResolvedValue({
      id: BOOKING_REF,
      customerId: CUSTOMER_MUELLER,
      status: 'CONFIRMED',
      startDate: new Date('2026-07-10T08:00:00.000Z'),
      endDate: new Date('2026-07-13T18:00:00.000Z'),
      pickupStationId: 'st-1',
      returnStationId: null,
      pickupStation: { id: 'st-1', name: 'Zentrum', code: 'ZEN' },
      returnStation: null,
    });
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    const detail = await service.findDetail(ORG_A, INVOICE_BOOKING);

    expect(detail.customer?.displayName).toBe('Anna Test');
    expect(detail.customer?.customerNumber).toMatch(/^K-/);
    expect(detail.vehicle?.displayName).toContain('Golf');
    expect(detail.booking?.bookingNumber).toMatch(/^BK-/);
    expect(detail.booking?.reference).toBe(BOOKING_NUMBER);
    expect(detail.provenance.classification).toBe('LEGACY');
    expect(detail.provenance.sourceType).toBe('BOOKING');
    expect(invoiceDocuments.getDocumentsForInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
        invoiceId: INVOICE_BOOKING,
        includeInternalErrors: false,
      }),
    );
    expect(prisma.orgInvoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INVOICE_BOOKING, organizationId: ORG_A },
      }),
    );
  });

  it('rejects foreign organization', async () => {
    prisma.orgInvoice.findFirst.mockResolvedValue(null);
    await expect(service.findDetail(ORG_B, INVOICE_BOOKING)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not resolve cross-tenant relation IDs (org-scoped findFirst returns null)', async () => {
    const row = makeOrgInvoiceRow();
    prisma.orgInvoice.findFirst.mockResolvedValue(row);
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.vehicle.findFirst.mockResolvedValue(null);
    prisma.booking.findFirst.mockResolvedValue(null);

    const detail = await service.findDetail(ORG_A, INVOICE_BOOKING);

    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: { id: CUSTOMER_MUELLER, organizationId: ORG_A },
    });
    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
      where: { id: VEHICLE_GOLF, organizationId: ORG_A },
    });
    expect(prisma.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BOOKING_REF, organizationId: ORG_A },
      }),
    );
    expect(detail.customer?.availability).toBe('DELETED');
    expect(detail.vehicle?.displayName).toBe('Fahrzeugdaten nicht verfügbar');
    expect(detail.booking?.availability).toBe('DELETED');
  });

  it('returns null booking summary when invoice has no bookingId', async () => {
    const row = makeOrgInvoiceRow({ bookingId: null });
    prisma.orgInvoice.findFirst.mockResolvedValue(row);
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.vehicle.findFirst.mockResolvedValue(null);

    const detail = await service.findDetail(ORG_A, INVOICE_BOOKING);

    expect(prisma.booking.findFirst).not.toHaveBeenCalled();
    expect(detail.booking).toBeNull();
    expect(detail.relations.customerDiverges).toBe(false);
  });

  it('includes outbound email history by invoice or booking', async () => {
    const row = makeOrgInvoiceRow();
    prisma.orgInvoice.findFirst.mockResolvedValue(row);
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.vehicle.findFirst.mockResolvedValue(null);
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.outboundEmail.findMany.mockResolvedValue([
      {
        id: 'mail-1',
        status: 'SENT',
        toEmail: 'k@example.com',
        subject: 'Rechnung',
        sentAt: new Date('2026-07-11T10:00:00.000Z'),
        createdAt: new Date('2026-07-11T09:00:00.000Z'),
        attachments: [{ generatedDocumentId: 'doc-1' }],
      },
    ]);

    const detail = await service.findDetail(ORG_A, INVOICE_BOOKING);

    expect(detail.outboundEmails).toHaveLength(1);
    expect(detail.outboundEmails[0].attachmentDocumentIds).toEqual(['doc-1']);
    expect(prisma.outboundEmail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG_A,
          OR: expect.arrayContaining([
            { invoiceId: INVOICE_BOOKING },
            { bookingId: BOOKING_REF },
          ]),
        }),
      }),
    );
  });

  it('resolves createdBy actor org-scoped for recorded provenance', async () => {
    const row = makeOrgInvoiceRow({
      creationChannel: 'MANUAL_UI',
      sourceType: 'MANUAL',
      triggeredByType: 'USER',
      createdByUserId: 'user-1',
    });
    prisma.orgInvoice.findFirst.mockResolvedValue(row);
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.vehicle.findFirst.mockResolvedValue(null);
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.organizationMembership.findFirst.mockResolvedValue({
      user: {
        id: 'user-1',
        name: null,
        firstName: 'Ops',
        lastName: 'User',
        email: 'ops@example.com',
      },
    });

    const detail = await service.findDetail(ORG_A, INVOICE_BOOKING);

    expect(prisma.organizationMembership.findFirst).toHaveBeenCalledWith({
      where: { organizationId: ORG_A, userId: 'user-1' },
      select: expect.any(Object),
    });
    expect(detail.provenance.classification).toBe('RECORDED');
    expect(detail.provenance.createdByUserDisplayName).toBe('Ops User');
  });

  it('does not expose internal document errors', async () => {
    const row = makeOrgInvoiceRow({ type: OrgInvoiceType.OUTGOING_BOOKING });
    prisma.orgInvoice.findFirst.mockResolvedValue(row);
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.vehicle.findFirst.mockResolvedValue(null);
    prisma.booking.findFirst.mockResolvedValue(null);

    (invoiceDocuments.getDocumentsForInvoice as jest.Mock).mockResolvedValue({
      activeDocumentId: null,
      cacheMismatch: false,
      documents: [
        {
          id: 'doc-fail',
          documentType: 'BOOKING_INVOICE',
          filename: 'f.pdf',
          version: 1,
          status: 'FAILED',
          generationStatus: 'FAILED',
          lifecycle: 'FAILED',
          isActive: false,
          createdAt: '2026-07-10T10:00:00.000Z',
          createdBy: null,
          mimeType: 'application/pdf',
          sizeBytes: null,
          downloadAvailable: false,
          previewAvailable: false,
          downloadPath: null,
          lastError: null,
          retryable: true,
        },
      ],
    });

    const detail = await service.findDetail(ORG_A, INVOICE_BOOKING);
    expect(detail.documents[0].lastError).toBeNull();
  });
});
