import { readFileSync } from 'fs';
import { join } from 'path';

const schema = readFileSync(join(__dirname, '../../../../prisma/schema.prisma'), 'utf8');
const sql = readFileSync(
  join(__dirname, '../../../../prisma/migrations/20260715340000_billing_email_delivery_audit/migration.sql'),
  'utf8',
);

describe('Billing email delivery audit schema (Prompt 30)', () => {
  it('adds delivery linkage and suppression tables', () => {
    expect(schema).toMatch(/model BillingEmailSuppression/);
    expect(schema).toMatch(/billingOutboxIdempotencyKey/);
    expect(schema).toMatch(/webhookIdempotencyKey/);
    expect(schema).toMatch(/ACCEPTED/);
    expect(schema).toMatch(/DEFERRED/);
  });

  it('migration adds suppressions and outbound indexes', () => {
    expect(sql).toContain('billing_email_suppressions');
    expect(sql).toContain('webhook_idempotency_key');
  });
});
