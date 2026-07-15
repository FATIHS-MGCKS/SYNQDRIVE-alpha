import { ForbiddenException } from '@nestjs/common';
import { BillingManualPaymentService } from './billing-manual-payment.service';

describe('BillingManualPaymentService', () => {
  const invoiceId = 'inv-manual-1';
  const orgId = 'org-manual-1';

  const invoice = {
    id: invoiceId,
    currency: 'EUR',
    subscription: { organizationId: orgId },
  };

  const prisma = {
    billingInvoice: {
      findUnique: jest.fn(),
    },
  };

  const ledger = {
    recordPayment: jest.fn(),
  };

  const audit = {
    log: jest.fn(),
  };

  let service: BillingManualPaymentService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.billingInvoice.findUnique.mockResolvedValue(invoice);
    ledger.recordPayment.mockResolvedValue({
      id: 'pay-manual-1',
      amountCents: 1500,
    });
    service = new BillingManualPaymentService(prisma as any, ledger as any, audit as any);
  });

  it('records manual payment with audit trail', async () => {
    const payment = await service.recordManualPayment({
      invoiceId,
      organizationId: orgId,
      amountCents: 1500,
      paymentType: 'BANK_TRANSFER',
      reference: 'UE-123',
      receiptNote: 'Bank transfer received',
      actorUserId: 'master-admin-1',
      idempotencyKey: 'manual-payment:1',
    });

    expect(payment.id).toBe('pay-manual-1');
    expect(ledger.recordPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'MANUAL',
        manualPaymentType: 'BANK_TRANSFER',
        manualReference: 'UE-123',
        recordedByUserId: 'master-admin-1',
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'BILLING_MANUAL_PAYMENT_RECORDED',
        entityType: 'BillingPayment',
        actorUserId: 'master-admin-1',
      }),
    );
  });

  it('rejects manual payment for foreign organization', async () => {
    await expect(
      service.recordManualPayment({
        invoiceId,
        organizationId: 'other-org',
        amountCents: 1500,
        paymentType: 'CASH',
        actorUserId: 'master-admin-1',
        idempotencyKey: 'manual-payment:2',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ledger.recordPayment).not.toHaveBeenCalled();
  });
});
