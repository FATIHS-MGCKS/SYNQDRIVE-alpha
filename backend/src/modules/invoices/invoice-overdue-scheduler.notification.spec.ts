import { InvoiceOverdueSchedulerService } from './invoice-overdue-scheduler.service';

describe('InvoiceOverdueSchedulerService notification hook', () => {
  it('syncs overdue notifications per transitioned invoice', async () => {
    const syncOverdueInvoice = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      orgInvoice: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'inv-a', organizationId: 'org-1' },
          { id: 'inv-b', organizationId: 'org-1' },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const invoicePaymentTasks = {
      refreshOpenPaymentCheckTasks: jest.fn().mockResolvedValue(0),
    };

    const service = new InvoiceOverdueSchedulerService(
      prisma as never,
      invoicePaymentTasks as never,
      { syncOverdueInvoice } as never,
    );

    await service.markOverdueInvoices();

    expect(syncOverdueInvoice).toHaveBeenCalledTimes(2);
    expect(syncOverdueInvoice).toHaveBeenCalledWith('org-1', 'inv-a');
    expect(syncOverdueInvoice).toHaveBeenCalledWith('org-1', 'inv-b');
  });
});
