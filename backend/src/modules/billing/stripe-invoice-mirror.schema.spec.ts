import { readFileSync } from 'fs';
import { join } from 'path';

const schema = readFileSync(
  join(__dirname, '../../../prisma/schema.prisma'),
  'utf8',
);
const sql = readFileSync(
  join(
    __dirname,
    '../../../prisma/migrations/20260715290000_billing_invoice_mirror/migration.sql',
  ),
  'utf8',
);

describe('Stripe invoice mirror schema (Prompt 25)', () => {
  it('defines full invoice header mirror fields', () => {
    expect(schema).toMatch(/model BillingInvoice[\s\S]*?invoiceNumber/);
    expect(schema).toMatch(/model BillingInvoice[\s\S]*?hostedInvoiceUrl/);
    expect(schema).toMatch(/model BillingInvoice[\s\S]*?netAmountCents/);
    expect(schema).toMatch(/model BillingInvoice[\s\S]*?discountAmountCents/);
    expect(schema).toMatch(/model BillingInvoice[\s\S]*?taxAmountCents/);
    expect(schema).toMatch(/model BillingInvoice[\s\S]*?amountDueCents/);
    expect(schema).toMatch(/model BillingInvoice[\s\S]*?customerSnapshotJson/);
    expect(schema).toMatch(/model BillingInvoice[\s\S]*?companySnapshotJson/);
    expect(schema).toMatch(/model BillingInvoice[\s\S]*?billingAddressJson/);
    expect(schema).toMatch(/model BillingInvoice[\s\S]*?taxIdSnapshot/);
    expect(schema).toMatch(/model BillingInvoice[\s\S]*?voidedAt/);
  });

  it('defines line tax and discount detail snapshots', () => {
    expect(schema).toMatch(/model BillingInvoiceLine[\s\S]*?discountDetailsJson/);
    expect(schema).toMatch(/model BillingInvoiceLine[\s\S]*?taxDetailsJson/);
  });

  it('migration adds invoice mirror columns', () => {
    expect(sql).toContain('invoice_number');
    expect(sql).toContain('hosted_invoice_url');
    expect(sql).toContain('customer_snapshot_json');
    expect(sql).toContain('discount_details_json');
  });
});
