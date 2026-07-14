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

  const draftInvoice = {
    id: 'inv-1',
    organizationId: 'org',
    bookingId: 'bk-1',
    status: 'DRAFT',
    totalCents: 10_000,
    paidCents: 0,
  };

  const issuedInvoice = { ...draftInvoice, status: 'ISSUED' };

  function mockIssueFlow(invoice = draftInvoice) {
    jest.spyOn(service, 'resolveCanonicalBookingInvoice').mockResolvedValue(invoice as never);
    jest.spyOn(service, 'voidDuplicateBookingInvoices').mockResolvedValue(0);
    (prisma.orgInvoice.findFirst as jest.Mock).mockResolvedValue(invoice);
    (prisma.orgInvoice.findFirstOrThrow as jest.Mock).mockResolvedValue(
      invoice.status === 'DRAFT' ? issuedInvoice : invoice,
    );
    (invoicesService.issue as jest.Mock).mockResolvedValue(issuedInvoice);
    (invoicesService.recordPayment as jest.Mock).mockResolvedValue({ status: 'PAID' });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('resolveCanonicalBookingInvoice prefers document-linked invoice', async () => {
    const invA = { id: 'a', status: 'DRAFT', paidCents: 0, createdAt: new Date('2026-07-01') };
    const invB = { id: 'b', status: 'DRAFT', paidCents: 0, createdAt: new Date('2026-07-02') };
    (prisma.orgInvoice.findMany as jest.Mock).mockResolvedValue([invB, invA]);
    (prisma.generatedDocument.findFirst as jest.Mock).mockResolvedValue({ invoiceId: 'a' });

    const result = await service.resolveCanonicalBookingInvoice('org', 'booking');
    expect(result?.id).toBe('a');
  });

  describe('syncOnBookingConfirmed — payment intent must not simulate payment', () => {
    it('payment_link: issues draft invoice but does not record payment (invoice stays open)', async () => {
      mockIssueFlow();

      const result = await service.syncOnBookingConfirmed('org', 'bk-1', {
        paymentIntent: 'payment_link',
        userId: 'user-1',
      });

      expect(invoicesService.issue).toHaveBeenCalledWith('inv-1', 'org');
      expect(invoicesService.recordPayment).not.toHaveBeenCalled();
      expect(result?.status).toBe('ISSUED');
    });

    it('payment_link: does not create OrgInvoicePayment (no recordPayment call)', async () => {
      mockIssueFlow();

      await service.syncOnBookingConfirmed('org', 'bk-1', {
        paymentIntent: 'payment_link',
      });

      expect(invoicesService.recordPayment).not.toHaveBeenCalled();
    });

    it('payment_link: does not trigger immediate Stripe payment (no recordPayment)', async () => {
      mockIssueFlow();

      await service.syncOnBookingConfirmed('org', 'bk-1', {
        paymentIntent: 'payment_link',
      });

      expect(invoicesService.recordPayment).not.toHaveBeenCalled();
    });

    it('pay_on_pickup: invoice stays open', async () => {
      mockIssueFlow();

      const result = await service.syncOnBookingConfirmed('org', 'bk-1', {
        paymentIntent: 'pay_on_pickup',
      });

      expect(invoicesService.issue).toHaveBeenCalled();
      expect(invoicesService.recordPayment).not.toHaveBeenCalled();
      expect(result?.status).toBe('ISSUED');
    });

    it('invoice: issues draft but invoice stays open', async () => {
      mockIssueFlow();

      const result = await service.syncOnBookingConfirmed('org', 'bk-1', {
        paymentMethod: 'invoice',
      });

      expect(invoicesService.issue).toHaveBeenCalled();
      expect(invoicesService.recordPayment).not.toHaveBeenCalled();
      expect(result?.status).toBe('ISSUED');
    });

    it('cash without explicit markPaid: invoice stays open', async () => {
      mockIssueFlow();

      const result = await service.syncOnBookingConfirmed('org', 'bk-1', {
        paymentMethod: 'cash',
      });

      expect(invoicesService.recordPayment).not.toHaveBeenCalled();
      expect(result?.status).toBe('ISSUED');
    });

    it('explicit markPaid=true records authorized manual payment', async () => {
      mockIssueFlow();

      await service.syncOnBookingConfirmed('org', 'bk-1', {
        paymentMethod: 'cash',
        markPaid: true,
        userId: 'user-1',
      });

      expect(invoicesService.recordPayment).toHaveBeenCalledWith(
        'inv-1',
        'org',
        expect.objectContaining({
          amountCents: 10_000,
          method: 'CASH',
        }),
        'user-1',
      );
    });

    it('markPaid=true without paymentMethod uses BANK_TRANSFER', async () => {
      mockIssueFlow();

      await service.syncOnBookingConfirmed('org', 'bk-1', {
        markPaid: true,
        userId: 'ops-1',
      });

      expect(invoicesService.recordPayment).toHaveBeenCalledWith(
        'inv-1',
        'org',
        expect.objectContaining({
          amountCents: 10_000,
          method: 'BANK_TRANSFER',
        }),
        'ops-1',
      );
    });

    it('markPaid=true with paymentIntent=payment_link still uses BANK_TRANSFER (intent only)', async () => {
      mockIssueFlow();

      await service.syncOnBookingConfirmed('org', 'bk-1', {
        paymentIntent: 'payment_link',
        markPaid: true,
        userId: 'user-1',
      });

      expect(invoicesService.recordPayment).toHaveBeenCalledWith(
        'inv-1',
        'org',
        expect.objectContaining({
          method: 'BANK_TRANSFER',
        }),
        'user-1',
      );
    });

    it('duplicate manual payment is prevented when invoice already paid', async () => {
      const paidInvoice = { ...issuedInvoice, status: 'PAID', paidCents: 10_000 };
      mockIssueFlow(paidInvoice);

      const result = await service.syncOnBookingConfirmed('org', 'bk-1', {
        markPaid: true,
      });

      expect(invoicesService.recordPayment).not.toHaveBeenCalled();
      expect(result?.status).toBe('PAID');
    });

    it('duplicate manual payment is prevented when outstanding is zero', async () => {
      const fullyPaid = { ...issuedInvoice, status: 'ISSUED', paidCents: 10_000, totalCents: 10_000 };
      mockIssueFlow(fullyPaid);

      await service.syncOnBookingConfirmed('org', 'bk-1', {
        markPaid: true,
      });

      expect(invoicesService.recordPayment).not.toHaveBeenCalled();
    });
  });
});
