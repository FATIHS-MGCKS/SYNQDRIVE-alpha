import { BillingService } from './billing.service';
import { InvoiceStatus } from '@prisma/client';

describe('BillingService multi-tenant access characterization', () => {
  const build = () => {
    const prisma = {
      billingSubscription: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      billingInvoice: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      billingPaymentMethod: {
        findMany: jest.fn(),
      },
    };
    const svc = new BillingService(prisma as never, {} as never, {} as never, {} as never);
    return { svc, prisma };
  };

  describe('invoices', () => {
    it('returns empty paginated result when org has no subscriptions', async () => {
      const { svc, prisma } = build();
      prisma.billingSubscription.findMany.mockResolvedValue([]);

      const result = await svc.findInvoices('org-a');

      expect(prisma.billingSubscription.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-a' },
        select: { id: true },
      });
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(prisma.billingInvoice.findMany).not.toHaveBeenCalled();
    });

    it('scopes invoice queries to subscription ids of the requested org only', async () => {
      const { svc, prisma } = build();
      prisma.billingSubscription.findMany.mockResolvedValue([{ id: 'sub-a1' }, { id: 'sub-a2' }]);
      prisma.billingInvoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          subscriptionId: 'sub-a1',
          stripeInvoiceId: 'in_1',
          amountCents: 5000,
          currency: 'eur',
          status: InvoiceStatus.PAID,
          invoiceDate: new Date('2026-06-01'),
          dueDate: null,
          paidAt: new Date('2026-06-02'),
          invoicePdfUrl: null,
          createdAt: new Date('2026-06-01'),
          updatedAt: new Date('2026-06-01'),
          lines: [],
        },
      ]);
      prisma.billingInvoice.count.mockResolvedValue(1);

      const result = await svc.findInvoices('org-a');

      expect(prisma.billingInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { subscriptionId: { in: ['sub-a1', 'sub-a2'] } },
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('inv-1');
    });
  });

  describe('payment methods', () => {
    it('lists payment methods scoped to organizationId', async () => {
      const { svc, prisma } = build();
      const methods = [{ id: 'pm-1', organizationId: 'org-a', isDefault: true }];
      prisma.billingPaymentMethod.findMany.mockResolvedValue(methods);

      const result = await svc.findPaymentMethods('org-a');

      expect(prisma.billingPaymentMethod.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-a' },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
      expect(result).toBe(methods);
    });

    it('does not return payment methods when querying a different org id', async () => {
      const { svc, prisma } = build();
      prisma.billingPaymentMethod.findMany.mockResolvedValue([]);

      await svc.findPaymentMethods('org-b');

      expect(prisma.billingPaymentMethod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-b' } }),
      );
    });
  });
});
