import { NotFoundException } from '@nestjs/common';
import { InvoicePaymentMethod, OrgInvoiceType } from '@prisma/client';

import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { InvoiceNumberService } from './invoice-number.service';
import { InvoiceDocumentsReadService } from './invoice-documents-read.service';
import { mockInvoiceDocumentsRead } from './__fixtures__/invoice-documents-read.mock';
import { InvoicesService } from './invoices.service';
import {
  BOOKING_REF,
  BOOKING_NUMBER,
  CUSTOMER_MUELLER,
  INVOICE_BOOKING,
  ORG_A,
  ORG_B,
  VEHICLE_GOLF,
  bookingInvoiceTitle,
  unpaidOutgoingTaskTitleIssued,
  makeBookingPriceSnapshot,
  makeOrgInvoicePolicies,
  makeOrgInvoiceRow,
} from './__fixtures__/invoice-baseline.fixtures';

describe('InvoicesService — baseline regression (audit 2026-07-14)', () => {
  let prisma: {
    orgInvoice: Record<string, jest.Mock>;
    orgInvoicePayment: Record<string, jest.Mock>;
    orgInvoiceSequence: Record<string, jest.Mock>;
    customer: Record<string, jest.Mock>;
    vehicle: Record<string, jest.Mock>;
    booking: Record<string, jest.Mock>;
    vendor: Record<string, jest.Mock>;
    organization: Record<string, jest.Mock>;
    orgTask: Record<string, jest.Mock>;
    bookingPriceSnapshot: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let tasksService: { upsertByDedup: jest.Mock };
  let invoiceNumbers: { allocate: jest.Mock };
  let invoiceDocuments: ReturnType<typeof mockInvoiceDocumentsRead>;
  let service: InvoicesService;

  beforeEach(() => {
    invoiceDocuments = mockInvoiceDocumentsRead();
    prisma = {
      orgInvoice: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      orgInvoicePayment: { create: jest.fn() },
      orgInvoiceSequence: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      customer: { findFirst: jest.fn() },
      vehicle: { findFirst: jest.fn() },
      booking: { findFirst: jest.fn() },
      vendor: { findFirst: jest.fn() },
      organization: { findFirst: jest.fn() },
      orgTask: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      bookingPriceSnapshot: { findFirst: jest.fn() },
      $transaction: jest.fn(async (cb: (tx: typeof prisma) => unknown) => cb(prisma)),
    };
    tasksService = { upsertByDedup: jest.fn().mockResolvedValue({ id: 'task-1' }) };
    invoiceNumbers = {
      allocate: jest.fn().mockResolvedValue({
        sequenceYear: 2026,
        sequenceNumber: 42,
        invoiceNumberDisplay: 'FSM-2026-0042',
      }),
    };
    prisma.organization.findFirst.mockResolvedValue(makeOrgInvoicePolicies());
    service = new InvoicesService(
      prisma as unknown as PrismaService,
      tasksService as unknown as TasksService,
      invoiceNumbers as unknown as InvoiceNumberService,
      invoiceDocuments as unknown as InvoiceDocumentsReadService,
    );
  });

  describe('invoice detail API shape (current: IDs only, no entity resolution)', () => {
    it('findById returns scalar link IDs but no resolved customer/booking/vehicle labels', async () => {
      const row = makeOrgInvoiceRow();
      prisma.orgInvoice.findFirst.mockResolvedValue(row);

      const dto = await service.findById(INVOICE_BOOKING, ORG_A);

      expect(dto.customerId).toBe(CUSTOMER_MUELLER);
      expect(dto.bookingId).toBe(BOOKING_REF);
      expect(dto.vehicleId).toBe(VEHICLE_GOLF);
      expect(dto).not.toHaveProperty('customerName');
      expect(dto).not.toHaveProperty('bookingRef');
      expect(dto).not.toHaveProperty('vehicleLabel');
      expect(dto).not.toHaveProperty('licensePlate');
    });

    it('findById enforces tenant isolation via organizationId filter', async () => {
      prisma.orgInvoice.findFirst.mockResolvedValue(null);

      await expect(service.findById(INVOICE_BOOKING, ORG_B)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.orgInvoice.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: INVOICE_BOOKING, organizationId: ORG_B },
        }),
      );
    });
  });

  describe('booking invoice creation (wizard / booking path)', () => {
    it('createBookingInvoice is idempotent per org+booking+OUTGOING_BOOKING', async () => {
      const existing = makeOrgInvoiceRow({ status: 'DRAFT' });
      prisma.orgInvoice.findFirst.mockResolvedValue(existing);
      prisma.orgInvoice.findFirst.mockResolvedValueOnce(existing);

      const result = await service.createBookingInvoice(ORG_A, {
        id: BOOKING_REF,
        customerId: CUSTOMER_MUELLER,
        vehicleId: VEHICLE_GOLF,
        totalPriceCents: 53550,
        dailyRateCents: 17850,
        startDate: new Date('2026-07-14'),
        endDate: new Date('2026-07-17'),
        currency: 'EUR',
        kmIncluded: 300,
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(INVOICE_BOOKING);
      expect(prisma.orgInvoice.create).not.toHaveBeenCalled();
    });

    it('createBookingInvoice uses booking number in title (no UUID fragment)', async () => {
      prisma.orgInvoice.findFirst.mockResolvedValue(null);
      prisma.bookingPriceSnapshot.findFirst.mockResolvedValue(makeBookingPriceSnapshot());
      prisma.customer.findFirst.mockResolvedValue({ id: CUSTOMER_MUELLER });
      prisma.vehicle.findFirst.mockResolvedValue({ id: VEHICLE_GOLF });
      prisma.booking.findFirst.mockResolvedValue({ id: BOOKING_REF });

      const created = makeOrgInvoiceRow({
        id: 'new-inv',
        status: 'DRAFT',
        invoiceNumberDisplay: null,
        sequenceNumber: null,
        title: bookingInvoiceTitle(),
      });
      prisma.orgInvoice.create.mockResolvedValue(created);
      prisma.orgInvoice.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(created);

      const result = await service.createBookingInvoice(ORG_A, {
        id: BOOKING_REF,
        customerId: CUSTOMER_MUELLER,
        vehicleId: VEHICLE_GOLF,
        totalPriceCents: 53550,
        dailyRateCents: 17850,
        startDate: new Date('2026-07-14'),
        endDate: new Date('2026-07-17'),
        currency: 'EUR',
      });

      expect(prisma.orgInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: OrgInvoiceType.OUTGOING_BOOKING,
            title: bookingInvoiceTitle(),
            bookingId: BOOKING_REF,
          }),
        }),
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain(BOOKING_NUMBER);
      expect(result!.title).not.toMatch(/#[0-9a-f]{8}/i);
    });

    it('createBookingInvoice uses org payment terms on INVOICE_DATE (not booking+14)', async () => {
      prisma.orgInvoice.findFirst.mockResolvedValue(null);
      prisma.bookingPriceSnapshot.findFirst.mockResolvedValue(makeBookingPriceSnapshot());
      prisma.customer.findFirst.mockResolvedValue({ id: CUSTOMER_MUELLER });
      prisma.vehicle.findFirst.mockResolvedValue({ id: VEHICLE_GOLF });
      prisma.booking.findFirst.mockResolvedValue({ id: BOOKING_REF });
      prisma.organization.findFirst.mockResolvedValue(makeOrgInvoicePolicies({ paymentTermsDays: 14 }));

      const created = makeOrgInvoiceRow({
        id: 'new-inv',
        status: 'DRAFT',
        invoiceNumberDisplay: null,
        sequenceNumber: null,
      });
      prisma.orgInvoice.create.mockResolvedValue(created);
      prisma.orgInvoice.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(created);

      await service.createBookingInvoice(ORG_A, {
        id: BOOKING_REF,
        customerId: CUSTOMER_MUELLER,
        vehicleId: VEHICLE_GOLF,
        totalPriceCents: 53550,
        dailyRateCents: 17850,
        startDate: new Date('2026-07-14'),
        endDate: new Date('2026-07-17'),
        currency: 'EUR',
      });

      expect(prisma.orgInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dueDateBase: 'INVOICE_DATE',
            paymentTermsDaysAtCreate: 14,
          }),
        }),
      );
      const createData = prisma.orgInvoice.create.mock.calls[0][0].data;
      expect(createData.dueDate).toBeInstanceOf(Date);
      expect(createData.dueDate.getTime()).not.toBe(
        new Date('2026-07-28').setHours(0, 0, 0, 0),
      );
    });
  });

  describe('markPaid payment method (current: always BANK_TRANSFER)', () => {
    it('markPaid records the outstanding balance with BANK_TRANSFER even after CARD checkout', async () => {
      const row = makeOrgInvoiceRow({
        status: 'ISSUED',
        paidCents: 0,
        outstandingCents: 53550,
      });
      const paidRow = {
        ...row,
        paidCents: 53550,
        outstandingCents: 0,
        status: 'PAID',
        payments: [],
        tasks: [],
      };

      prisma.orgInvoice.findFirst.mockImplementation((args: { include?: unknown }) =>
        args?.include ? Promise.resolve(paidRow) : Promise.resolve(row),
      );
      prisma.orgInvoicePayment.create.mockResolvedValue({ id: 'pay-1' });
      prisma.orgInvoice.update.mockResolvedValue(paidRow);

      await service.markPaid(INVOICE_BOOKING, ORG_A);

      expect(prisma.orgInvoicePayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: ORG_A,
          invoiceId: INVOICE_BOOKING,
          amountCents: 53550,
          method: InvoicePaymentMethod.BANK_TRANSFER,
        }),
      });
    });
  });

  describe('unpaid task titles use business references', () => {
    it('issue() creates task title with invoice number after allocation', async () => {
      const draft = makeOrgInvoiceRow({
        status: 'DRAFT',
        sequenceNumber: null,
        invoiceNumberDisplay: null,
        title: bookingInvoiceTitle(),
      });
      const issued = makeOrgInvoiceRow({ status: 'ISSUED' });

      prisma.orgInvoice.findFirst
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce(issued);
      prisma.orgInvoice.update.mockResolvedValue(issued);

      await service.issue(INVOICE_BOOKING, ORG_A);

      expect(tasksService.upsertByDedup).toHaveBeenCalledWith(
        ORG_A,
        `invoice:unpaid:${INVOICE_BOOKING}`,
        expect.objectContaining({
          title: unpaidOutgoingTaskTitleIssued(),
        }),
      );
    });

    it('issue() updates booking invoice title to include allocated number', async () => {
      const draft = makeOrgInvoiceRow({
        status: 'DRAFT',
        sequenceNumber: null,
        invoiceNumberDisplay: null,
        title: bookingInvoiceTitle(),
        type: OrgInvoiceType.OUTGOING_BOOKING,
        bookingId: BOOKING_REF,
      });
      const issued = makeOrgInvoiceRow({ status: 'ISSUED' });

      prisma.orgInvoice.findFirst
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce(issued);
      prisma.orgInvoice.update.mockResolvedValue(issued);

      await service.issue(INVOICE_BOOKING, ORG_A);

      expect(prisma.orgInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: `Buchungsrechnung · FSM-2026-0042`,
          }),
        }),
      );
    });
  });

  describe.skip('target state — enable after invoice detail enrichment (phase P1)', () => {
    it('findById should expose customerName and vehicle licensePlate', async () => {
      // Activate when InvoicesService joins customer/vehicle for detail DTO.
      const row = makeOrgInvoiceRow();
      prisma.orgInvoice.findFirst.mockResolvedValue(row);
      const dto = await service.findById(INVOICE_BOOKING, ORG_A);
      expect(dto).toHaveProperty('customerName');
      expect(dto).toHaveProperty('vehicleLabel');
    });
  });
});
