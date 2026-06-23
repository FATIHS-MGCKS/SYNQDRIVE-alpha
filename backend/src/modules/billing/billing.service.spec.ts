import { BillingService } from './billing.service';
import { InvoiceStatus } from '@prisma/client';

describe('BillingService.formatInvoice legacy safety', () => {
  const build = () => {
    const prisma = {} as any;
    const usageService = {} as any;
    const pricebookService = {} as any;
    const audit = {} as any;
    const svc = new BillingService(prisma, usageService, pricebookService, audit);
    return svc as any;
  };

  it('does not crash for legacy invoices without line items', () => {
    const svc = build();
    const formatted = svc.formatInvoice({
      id: 'inv-1',
      subscriptionId: 'sub-1',
      stripeInvoiceId: null,
      amountCents: 9900,
      currency: 'eur',
      status: InvoiceStatus.PAID,
      invoiceDate: new Date('2026-05-01T00:00:00.000Z'),
      dueDate: null,
      paidAt: new Date('2026-05-02T00:00:00.000Z'),
      invoicePdfUrl: null,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      lines: undefined,
    });

    expect(formatted.netAmountCents).toBe(9900);
    expect(formatted.invoiceLines).toEqual([]);
    expect(formatted.periodStart).toBeNull();
  });
});
