import {
  OrgInvoiceProcessEntityType,
  OrgInvoiceProcessStatus,
  OrgInvoiceProcessType,
} from '@prisma/client';
import {
  buildProcessUserMessage,
  classifyProcessError,
  invoiceProcessTypeLabel,
  sanitizeProcessErrorMessage,
} from './invoice-process-error.util';
import {
  buildProcessIdempotencyKey,
  computeInvoiceProcessRetryAt,
} from './invoice-process-backoff.util';

describe('invoice-process utils', () => {
  it('computes exponential backoff with cap', () => {
    const t1 = computeInvoiceProcessRetryAt(1, 60_000);
    const t3 = computeInvoiceProcessRetryAt(3, 60_000);
    expect(t3.getTime() - t1.getTime()).toBeGreaterThan(0);
  });

  it('builds stable idempotency keys', () => {
    expect(
      buildProcessIdempotencyKey(
        OrgInvoiceProcessType.PAYMENT_SYNC,
        OrgInvoiceProcessEntityType.INVOICE,
        'inv-1',
      ),
    ).toBe('PAYMENT_SYNC:INVOICE:inv-1');
  });

  it('sanitizes sensitive fragments from error messages', () => {
    expect(sanitizeProcessErrorMessage('failed sk_live_abc for user@test.de')).not.toContain(
      'sk_live',
    );
  });

  it('classifies network errors as retryable', () => {
    const result = classifyProcessError(new Error('ECONNRESET timeout'));
    expect(result.retryable).toBe(true);
    expect(result.code).toBe('TRANSIENT_NETWORK');
  });

  it('exposes German labels for UI', () => {
    expect(invoiceProcessTypeLabel(OrgInvoiceProcessType.BOOKING_FINANCE_SYNC)).toBe(
      'Finanzsynchronisation',
    );
    expect(
      buildProcessUserMessage({
        processType: OrgInvoiceProcessType.INVOICE_EMAIL_SEND,
        status: OrgInvoiceProcessStatus.MANUAL_REVIEW,
      }),
    ).toContain('Manuelle Prüfung');
  });
});
