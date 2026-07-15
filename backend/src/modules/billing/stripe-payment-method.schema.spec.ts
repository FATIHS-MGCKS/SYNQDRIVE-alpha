import { readFileSync } from 'fs';
import { join } from 'path';

const schema = readFileSync(
  join(__dirname, '../../../prisma/schema.prisma'),
  'utf8',
);
const sql = readFileSync(
  join(
    __dirname,
    '../../../prisma/migrations/20260715270000_billing_payment_methods_sepa/migration.sql',
  ),
  'utf8',
);

describe('Stripe payment methods schema (Prompt 23)', () => {
  it('defines SEPA and stripe mode fields on billing payment method', () => {
    expect(schema).toMatch(/model BillingPaymentMethod[\s\S]*?stripeMode/);
    expect(schema).toMatch(/model BillingPaymentMethod[\s\S]*?country/);
    expect(schema).toMatch(/model BillingPaymentMethod[\s\S]*?billingName/);
    expect(schema).toMatch(/model BillingPaymentMethod[\s\S]*?sepaMandateStatus/);
    expect(schema).toMatch(/model BillingPaymentMethod[\s\S]*?sepaBankCode/);
  });

  it('indexes organization default and status lookups', () => {
    expect(schema).toMatch(/@@index\(\[organizationId, isDefault\]\)/);
    expect(schema).toMatch(/@@index\(\[organizationId, status\]\)/);
  });

  it('migration adds payment method metadata columns and indexes', () => {
    expect(sql).toContain('stripe_mode');
    expect(sql).toContain('country');
    expect(sql).toContain('billing_name');
    expect(sql).toContain('sepa_mandate_status');
    expect(sql).toContain('sepa_bank_code');
    expect(sql).toContain('billing_payment_methods_organization_id_is_default_idx');
    expect(sql).toContain('billing_payment_methods_organization_id_status_idx');
  });
});
