import {
  BillingPaymentAttemptStatus,
  BillingPaymentProvider,
  BillingPaymentStatus,
  BillingRefundStatus,
  InvoiceStatus,
} from '@prisma/client';
import { TenantBillingPaymentsService } from './tenant-billing-payments.service';

describe('TenantBillingPaymentsService', () => {
  const invoices = {
    getInvoiceDetail: jest.fn(),
  };
  const paymentLedger = {
    getInvoicePaymentLedger: jest.fn(),
  };

  let service: TenantBillingPaymentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TenantBillingPaymentsService(invoices as never, paymentLedger as never);

    invoices.getInvoiceDetail.mockResolvedValue({
      id: 'inv-1',
      grossAmount: { cents: 3570, currency: 'EUR', formatted: '35,70 €' },
      amountDue: { cents: 0, currency: 'EUR', formatted: '0,00 €' },
      amountRemaining: { cents: 0, currency: 'EUR', formatted: '0,00 €' },
      status: InvoiceStatus.PAID,
    });
  });

  it('returns tenant-safe payment history without stripe identifiers', async () => {
    paymentLedger.getInvoicePaymentLedger.mockResolvedValue([
      {
        paymentId: 'pay-1',
        invoiceId: 'inv-1',
        amountCents: 3570,
        currency: 'EUR',
        status: BillingPaymentStatus.SUCCEEDED,
        provider: BillingPaymentProvider.STRIPE,
        refundedAmountCents: 0,
        remainingAmountCents: 0,
        stripePaymentIntentId: 'pi_secret',
        stripeChargeId: 'ch_secret',
        stripePaymentMethodId: 'pm_secret',
        succeededAt: '2026-07-01T10:00:00.000Z',
        failedAt: null,
        attempts: [
          {
            id: 'att-1',
            attemptNumber: 1,
            status: BillingPaymentAttemptStatus.SUCCEEDED,
            errorCode: null,
            declineCode: null,
            safeErrorMessage: null,
            nextRetryAt: null,
            attemptedAt: '2026-07-01T10:00:00.000Z',
          },
          {
            id: 'att-2',
            attemptNumber: 2,
            status: BillingPaymentAttemptStatus.FAILED,
            errorCode: 'card_declined',
            declineCode: 'generic_decline',
            safeErrorMessage: 'Karte abgelehnt',
            nextRetryAt: '2026-07-02T10:00:00.000Z',
            attemptedAt: '2026-07-01T11:00:00.000Z',
          },
        ],
        refunds: [
          {
            id: 'ref-1',
            amountCents: 1000,
            status: BillingRefundStatus.SUCCEEDED,
            isPartial: true,
            reason: 'Kulanz',
            refundedAt: '2026-07-05T10:00:00.000Z',
          },
        ],
        creditNotes: [
          {
            id: 'cn-1',
            amountCents: 1000,
            status: 'ISSUED',
            reason: 'Gutschrift',
            hostedUrl: 'https://invoice.stripe.com/cn/test',
            pdfUrl: 'https://pay.stripe.com/credit_note/test/pdf',
            issuedAt: '2026-07-05T10:00:00.000Z',
          },
        ],
      },
    ]);

    const history = await service.getInvoicePaymentHistory('org-a', 'inv-1');

    expect(history.invoiceId).toBe('inv-1');
    expect(history.payments).toHaveLength(1);
    expect(history.failedAttempts).toHaveLength(1);
    expect(history.refunds).toHaveLength(1);
    expect(history.creditNotes).toHaveLength(1);
    expect(history.amountRemaining.cents).toBe(0);
    expect(JSON.stringify(history)).not.toMatch(/pi_secret|ch_secret|pm_secret|pay-1|ref-1|cn-1/);
  });

  it('propagates foreign invoice rejection', async () => {
    invoices.getInvoiceDetail.mockRejectedValue(new Error('not found'));

    await expect(service.getInvoicePaymentHistory('org-a', 'inv-foreign')).rejects.toThrow(
      'not found',
    );
  });
});
