import { InvoiceOverdueSchedulerService } from './invoice-overdue-scheduler.service';

describe('InvoiceOverdueSchedulerService', () => {
  const prisma = {
    orgInvoice: {
      updateMany: jest.fn(),
    },
  };

  const invoicePaymentTasks = {
    resolveOnFullPayment: jest.fn().mockResolvedValue(0),
    refreshOpenPaymentCheckTasks: jest.fn().mockResolvedValue(0),
  };

  let service: InvoiceOverdueSchedulerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InvoiceOverdueSchedulerService(
      prisma as never,
      invoicePaymentTasks as never,
    );
  });

  it('marks open past-due invoices as OVERDUE', async () => {
    prisma.orgInvoice.updateMany.mockResolvedValue({ count: 2 });

    await service.markOverdueInvoices();

    expect(prisma.orgInvoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          outstandingCents: { gt: 0 },
          status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID'] },
        }),
        data: { status: 'OVERDUE' },
      }),
    );
    expect(invoicePaymentTasks.refreshOpenPaymentCheckTasks).toHaveBeenCalled();
  });

  it('reconciles fully paid OVERDUE invoices to PAID', async () => {
    prisma.orgInvoice.updateMany.mockResolvedValue({ count: 1 });

    await service.reconcileStaleOverdue();

    expect(prisma.orgInvoice.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'OVERDUE',
        outstandingCents: { lte: 0 },
      },
      data: { status: 'PAID' },
    });
  });
});
