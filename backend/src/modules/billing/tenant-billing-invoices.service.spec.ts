import { NotFoundException } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { TenantBillingInvoicesService } from './tenant-billing-invoices.service';
import { TenantBillingErrorCode } from './domain/tenant-billing.errors';

describe('TenantBillingInvoicesService', () => {
  const prisma = {
    billingSubscription: { findMany: jest.fn() },
    billingInvoice: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
  };

  let service: TenantBillingInvoicesService;

  const baseInvoice = {
    id: 'inv-1',
    subscriptionId: 'sub-1',
    stripeInvoiceId: 'in_test',
    stripeMode: 'TEST' as const,
    invoiceNumber: 'RE-2026-0001',
    amountCents: 3570,
    netAmountCents: 3000,
    discountAmountCents: 0,
    taxAmountCents: 570,
    amountDueCents: 0,
    amountPaidCents: 3570,
    amountRemainingCents: 0,
    currency: 'EUR',
    status: InvoiceStatus.PAID,
    periodStart: new Date('2026-06-01'),
    periodEnd: new Date('2026-06-30'),
    stripeCreatedAt: new Date('2026-06-30'),
    finalizedAt: new Date('2026-06-30'),
    invoiceDate: new Date('2026-06-30'),
    dueDate: new Date('2026-07-14'),
    paidAt: new Date('2026-07-01'),
    voidedAt: null,
    hostedInvoiceUrl: 'https://invoice.stripe.com/i/test',
    invoicePdfUrl: 'https://pay.stripe.com/invoice/test/pdf',
    customerSnapshotJson: null,
    companySnapshotJson: null,
    billingAddressJson: null,
    taxIdSnapshot: null,
    createdAt: new Date('2026-06-30'),
    updatedAt: new Date('2026-06-30'),
    lines: [],
    subscription: { organizationId: 'org-a' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TenantBillingInvoicesService(prisma as never);
    prisma.billingSubscription.findMany.mockResolvedValue([{ id: 'sub-1' }]);
  });

  it('returns paginated invoices for organization', async () => {
    prisma.billingInvoice.findMany.mockResolvedValue([baseInvoice]);
    prisma.billingInvoice.count.mockResolvedValue(1);

    const result = await service.listInvoices('org-a', { page: 1, limit: 10 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].invoiceNumber).toBe('RE-2026-0001');
    expect(result.data[0].statusLabel).toBe('Bezahlt');
    expect(result.data[0].hasPdf).toBe(true);
    expect(result.meta.total).toBe(1);
    expect(JSON.stringify(result.data[0])).not.toMatch(/stripeInvoiceId|subscriptionId/);
  });

  it('applies status filter', async () => {
    prisma.billingInvoice.findMany.mockResolvedValue([]);
    prisma.billingInvoice.count.mockResolvedValue(0);

    await service.listInvoices('org-a', { status: InvoiceStatus.OPEN });

    expect(prisma.billingInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: InvoiceStatus.OPEN }),
      }),
    );
  });

  it('applies date range and search filters', async () => {
    prisma.billingInvoice.findMany.mockResolvedValue([]);
    prisma.billingInvoice.count.mockResolvedValue(0);

    await service.listInvoices('org-a', {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T23:59:59.999Z',
      search: 'RE-2026',
    });

    expect(prisma.billingInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invoiceDate: expect.objectContaining({
            gte: new Date('2026-01-01T00:00:00.000Z'),
            lte: new Date('2026-12-31T23:59:59.999Z'),
          }),
          invoiceNumber: { contains: 'RE-2026', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('returns invoice detail for own organization', async () => {
    prisma.billingInvoice.findUnique.mockResolvedValue(baseInvoice);

    const detail = await service.getInvoiceDetail('org-a', 'inv-1');

    expect(detail.id).toBe('inv-1');
    expect(detail.grossAmount.cents).toBe(3570);
    expect(detail.invoiceNumberLabel).toBe('RE-2026-0001');
  });

  it('rejects foreign invoice with BILLING_INVOICE_NOT_FOUND', async () => {
    prisma.billingInvoice.findUnique.mockResolvedValue({
      ...baseInvoice,
      subscription: { organizationId: 'org-b' },
    });

    await expect(service.getInvoiceDetail('org-a', 'inv-1')).rejects.toMatchObject({
      response: { code: TenantBillingErrorCode.INVOICE_NOT_FOUND },
    });
  });

  it('returns verified hosted invoice url', async () => {
    prisma.billingInvoice.findUnique.mockResolvedValue(baseInvoice);

    await expect(service.getHostedInvoiceUrl('org-a', 'inv-1')).resolves.toEqual({
      url: 'https://invoice.stripe.com/i/test',
    });
  });

  it('throws BILLING_INVOICE_PDF_UNAVAILABLE when pdf is missing', async () => {
    prisma.billingInvoice.findUnique.mockResolvedValue({
      ...baseInvoice,
      invoicePdfUrl: null,
    });

    await expect(service.getInvoicePdfUrl('org-a', 'inv-1')).rejects.toMatchObject({
      response: { code: TenantBillingErrorCode.INVOICE_PDF_UNAVAILABLE },
    });
  });

  it('throws BILLING_INVOICE_PDF_UNAVAILABLE for non-stripe pdf url', async () => {
    prisma.billingInvoice.findUnique.mockResolvedValue({
      ...baseInvoice,
      invoicePdfUrl: 'https://evil.example/invoice.pdf',
    });

    await expect(service.getInvoicePdfUrl('org-a', 'inv-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
