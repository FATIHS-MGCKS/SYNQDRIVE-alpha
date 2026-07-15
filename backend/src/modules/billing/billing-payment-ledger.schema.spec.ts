import { readFileSync } from 'fs';
import { join } from 'path';

const schema = readFileSync(
  join(__dirname, '../../../prisma/schema.prisma'),
  'utf8',
);
const sql = readFileSync(
  join(
    __dirname,
    '../../../prisma/migrations/20260715300000_billing_payment_ledger/migration.sql',
  ),
  'utf8',
);

describe('Billing payment ledger schema (Prompt 26)', () => {
  it('defines payment ledger fields on BillingPayment', () => {
    expect(schema).toMatch(/model BillingPayment[\s\S]*?stripePaymentMethodId/);
    expect(schema).toMatch(/model BillingPayment[\s\S]*?refundedAmountCents/);
    expect(schema).toMatch(/model BillingPayment[\s\S]*?remainingAmountCents/);
    expect(schema).toMatch(/model BillingPayment[\s\S]*?manualPaymentType/);
    expect(schema).toMatch(/model BillingPayment[\s\S]*?idempotencyKey/);
  });

  it('defines attempt, refund and credit note ledger fields', () => {
    expect(schema).toMatch(/model BillingPaymentAttempt[\s\S]*?declineCode/);
    expect(schema).toMatch(/model BillingPaymentAttempt[\s\S]*?safeErrorMessage/);
    expect(schema).toMatch(/model BillingPaymentAttempt[\s\S]*?nextRetryAt/);
    expect(schema).toMatch(/model BillingRefund[\s\S]*?isPartial/);
    expect(schema).toMatch(/model BillingRefund[\s\S]*?refundedAt/);
    expect(schema).toMatch(/model BillingCreditNote[\s\S]*?hostedUrl/);
    expect(schema).toMatch(/model BillingCreditNote[\s\S]*?pdfUrl/);
  });

  it('migration adds payment ledger columns and idempotency keys', () => {
    expect(sql).toContain('BillingManualPaymentType');
    expect(sql).toContain('stripe_payment_method_id');
    expect(sql).toContain('refunded_amount_cents');
    expect(sql).toContain('decline_code');
    expect(sql).toContain('safe_error_message');
    expect(sql).toContain('is_partial');
    expect(sql).toContain('hosted_url');
    expect(sql).toContain('idempotency_key');
  });
});
