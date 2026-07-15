import { BillingPaymentProvider, BillingPaymentStatus } from '@prisma/client';
import { TenantBillingPaymentsListService } from './tenant-billing-payments-list.service';

describe('TenantBillingPaymentsListService', () => {
  const prisma = {
    billingPayment: { findMany: jest.fn(), count: jest.fn() },
  };

  let service: TenantBillingPaymentsListService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TenantBillingPaymentsListService(prisma as never);
  });

  it('returns paginated payments without stripe identifiers', async () => {
    prisma.billingPayment.findMany.mockResolvedValue([
      {
        id: 'pay-1',
        amountCents: 3570,
        currency: 'EUR',
        status: BillingPaymentStatus.SUCCEEDED,
        provider: BillingPaymentProvider.STRIPE,
        refundedAmountCents: 0,
        remainingAmountCents: 0,
        succeededAt: new Date('2026-07-01'),
        failedAt: null,
        invoice: {
          id: 'inv-1',
          invoiceNumber: 'RE-2026-0001',
          invoiceDate: new Date('2026-06-30'),
          currency: 'EUR',
        },
      },
    ]);
    prisma.billingPayment.count.mockResolvedValue(1);

    const result = await service.listPayments('org-a', { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].invoiceNumberLabel).toBe('RE-2026-0001');
    expect(JSON.stringify(result.data[0])).not.toMatch(/stripe/i);
  });
});
