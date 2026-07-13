import { BookingInvoiceLifecycleService } from './booking-invoice-lifecycle.service';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('BookingInvoiceLifecycleService', () => {
  const prisma = {
    orgInvoice: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    generatedDocument: {
      findFirst: jest.fn(),
    },
    booking: {
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;

  const invoicesService = {
    issue: jest.fn(),
    recordPayment: jest.fn(),
  } as unknown as InvoicesService;

  const service = new BookingInvoiceLifecycleService(prisma, invoicesService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolveCanonicalBookingInvoice prefers document-linked invoice', async () => {
    const invA = { id: 'a', status: 'DRAFT', paidCents: 0, createdAt: new Date('2026-07-01') };
    const invB = { id: 'b', status: 'DRAFT', paidCents: 0, createdAt: new Date('2026-07-02') };
    (prisma.orgInvoice.findMany as jest.Mock).mockResolvedValue([invB, invA]);
    (prisma.generatedDocument.findFirst as jest.Mock).mockResolvedValue({ invoiceId: 'a' });

    const result = await service.resolveCanonicalBookingInvoice('org', 'booking');
    expect(result?.id).toBe('a');
  });

  it('syncOnBookingConfirmed issues draft and records card payment', async () => {
    const draft = {
      id: 'inv-1',
      organizationId: 'org',
      bookingId: 'bk-1',
      status: 'DRAFT',
      totalCents: 10_000,
      paidCents: 0,
    };
    const issued = { ...draft, status: 'ISSUED' };

    jest.spyOn(service, 'resolveCanonicalBookingInvoice').mockResolvedValue(draft as never);
    jest.spyOn(service, 'voidDuplicateBookingInvoices').mockResolvedValue(2);
    (prisma.orgInvoice.findFirst as jest.Mock)
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(issued);
    (prisma.orgInvoice.findFirstOrThrow as jest.Mock).mockResolvedValue(issued);
    (invoicesService.issue as jest.Mock).mockResolvedValue(issued);
    (invoicesService.recordPayment as jest.Mock).mockResolvedValue({ status: 'PAID' });

    await service.syncOnBookingConfirmed('org', 'bk-1', {
      paymentMethod: 'card',
      userId: 'user-1',
    });

    expect(service.voidDuplicateBookingInvoices).toHaveBeenCalledWith('org', 'bk-1', 'inv-1');
    expect(invoicesService.issue).toHaveBeenCalledWith('inv-1', 'org');
    expect(invoicesService.recordPayment).toHaveBeenCalled();
  });
});
