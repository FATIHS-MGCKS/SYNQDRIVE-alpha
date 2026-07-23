import { ConflictException } from '@nestjs/common';
import { BookingInvoiceLifecycleService } from '@modules/invoices/booking-invoice-lifecycle.service';
import { InvoicesService } from '@modules/invoices/invoices.service';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingFinancialStateService } from './booking-financial-state.service';

describe('BookingFinancialStateService', () => {
  const booking = {
    id: 'bk-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    vehicleId: 'veh-1',
    status: 'CONFIRMED',
    totalPriceCents: 10_000,
    dailyRateCents: 3_333,
    startDate: new Date('2026-08-01T10:00:00.000Z'),
    endDate: new Date('2026-08-04T10:00:00.000Z'),
    currency: 'EUR',
    kmIncluded: 600,
    paymentStatus: 'UNPAID',
    invoiceProcessingAttemptCount: 0,
  };

  const issuedInvoice = {
    id: 'inv-1',
    organizationId: 'org-1',
    bookingId: 'bk-1',
    customerId: 'cust-1',
    status: 'ISSUED',
    totalCents: 10_000,
    paidCents: 0,
    outstandingCents: 10_000,
    currency: 'EUR',
    bookingPriceSnapshotId: 'snap-1',
  };

  const prisma = {
    booking: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    orgInvoice: {
      findFirst: jest.fn(),
    },
    bookingPriceSnapshot: {
      findFirst: jest.fn(),
    },
    bookingPaymentRequest: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  const bookingInvoiceLifecycle = {
    syncOnBookingConfirmed: jest.fn(),
    resolveCanonicalBookingInvoice: jest.fn(),
  } as unknown as BookingInvoiceLifecycleService;

  const invoicesService = {
    bootstrapBookingInvoice: jest.fn(),
  } as unknown as InvoicesService;

  const service = new BookingFinancialStateService(
    prisma,
    bookingInvoiceLifecycle,
    invoicesService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue(booking);
    (prisma.booking.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.orgInvoice.findFirst as jest.Mock).mockResolvedValue(issuedInvoice);
    (prisma.bookingPriceSnapshot.findFirst as jest.Mock).mockResolvedValue({
      id: 'snap-1',
      currency: 'EUR',
    });
    (invoicesService.bootstrapBookingInvoice as jest.Mock).mockResolvedValue(issuedInvoice);
    (bookingInvoiceLifecycle.syncOnBookingConfirmed as jest.Mock).mockResolvedValue(issuedInvoice);
    (bookingInvoiceLifecycle.resolveCanonicalBookingInvoice as jest.Mock).mockResolvedValue(issuedInvoice);
  });

  it('ensureBookingInvoiceOnConfirm is idempotent when invoice already issued', async () => {
    const result = await service.ensureBookingInvoiceOnConfirm('org-1', 'bk-1');
    expect(invoicesService.bootstrapBookingInvoice).toHaveBeenCalled();
    expect(bookingInvoiceLifecycle.syncOnBookingConfirmed).toHaveBeenCalled();
    expect(result?.id).toBe('inv-1');
  });

  it('marks invoice processing FAILED and rethrows on sync error', async () => {
    (bookingInvoiceLifecycle.syncOnBookingConfirmed as jest.Mock).mockRejectedValue(
      new Error('issue failed'),
    );

    await expect(service.ensureBookingInvoiceOnConfirm('org-1', 'bk-1')).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(prisma.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bk-1', organizationId: 'org-1' },
        data: expect.objectContaining({
          invoiceProcessingState: 'FAILED',
          invoiceProcessingError: 'issue failed',
        }),
      }),
    );
  });

  it('retryInvoiceProcessing rejects when not in FAILED state', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      invoiceProcessingState: 'READY',
    });

    await expect(service.retryInvoiceProcessing('org-1', 'bk-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'BOOKING_INVOICE_RETRY_NOT_ALLOWED' }),
    });
  });

  it('retryInvoiceProcessing reruns pipeline from FAILED state', async () => {
    (prisma.booking.findFirst as jest.Mock)
      .mockResolvedValueOnce({ invoiceProcessingState: 'FAILED' })
      .mockResolvedValue(booking);

    await service.retryInvoiceProcessing('org-1', 'bk-1');
    expect(bookingInvoiceLifecycle.syncOnBookingConfirmed).toHaveBeenCalled();
  });

  it('rejects invoice snapshot mismatch bindings', async () => {
    (prisma.orgInvoice.findFirst as jest.Mock).mockResolvedValue({
      ...issuedInvoice,
      bookingPriceSnapshotId: 'snap-old',
    });

    await expect(service.ensureBookingInvoiceOnConfirm('org-1', 'bk-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'BOOKING_INVOICE_SNAPSHOT_MISMATCH' }),
    });
  });
});
