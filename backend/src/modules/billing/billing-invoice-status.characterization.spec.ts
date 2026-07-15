import { BillingService } from './billing.service';
import { InvoiceStatus } from '@prisma/client';
import { mapStripeInvoiceStatus } from './stripe-status.mapper';

describe('Billing invoice status mapping characterization', () => {
  const buildBillingService = () =>
    new BillingService({} as never, {} as never, {} as never, {} as never);

  const baseInvoice = {
    id: 'inv-1',
    subscriptionId: 'sub-1',
    stripeInvoiceId: 'in_test',
    amountCents: 9900,
    currency: 'eur',
    invoiceDate: new Date('2026-06-01T00:00:00.000Z'),
    dueDate: null,
    paidAt: null,
    invoicePdfUrl: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    lines: [],
  };

  it('maps PAID to displayStatus Paid', () => {
    const svc = buildBillingService();
    const formatted = svc.formatInvoiceForApi({
      ...baseInvoice,
      status: InvoiceStatus.PAID,
      paidAt: new Date('2026-06-02'),
    });
    expect(formatted.displayStatus).toBe('Paid');
    expect(formatted.status).toBe(InvoiceStatus.PAID);
  });

  it('maps OPEN with future due date to Pending', () => {
    const svc = buildBillingService();
    const formatted = svc.formatInvoiceForApi({
      ...baseInvoice,
      status: InvoiceStatus.OPEN,
      dueDate: new Date('2099-12-31'),
    });
    expect(formatted.displayStatus).toBe('Pending');
  });

  it('maps OPEN with past due date to Overdue', () => {
    const svc = buildBillingService();
    const formatted = svc.formatInvoiceForApi({
      ...baseInvoice,
      status: InvoiceStatus.OPEN,
      dueDate: new Date('2020-01-01'),
    });
    expect(formatted.displayStatus).toBe('Overdue');
  });

  it('maps UNCOLLECTIBLE to Overdue display', () => {
    const svc = buildBillingService();
    const formatted = svc.formatInvoiceForApi({
      ...baseInvoice,
      status: InvoiceStatus.UNCOLLECTIBLE,
    });
    expect(formatted.displayStatus).toBe('Overdue');
  });

  it('legacy behavior – VOID maps to displayStatus Paid (to be corrected in prompt 25)', () => {
    // Current behavior: VOID invoices are shown as "Paid" in tenant/admin UI.
    // Problematic: voided invoices should not appear as successfully paid.
    const svc = buildBillingService();
    const formatted = svc.formatInvoiceForApi({
      ...baseInvoice,
      status: InvoiceStatus.VOID,
    });
    expect(formatted.status).toBe(InvoiceStatus.VOID);
    expect(formatted.displayStatus).toBe('Paid');
  });

  it('maps Stripe void status to local VOID enum', () => {
    expect(mapStripeInvoiceStatus('void')).toBe('VOID');
  });

  it('maps unknown Stripe invoice status to DRAFT default', () => {
    expect(mapStripeInvoiceStatus('unknown_status')).toBe('DRAFT');
  });
});
