import { readFileSync } from 'fs';
import { join } from 'path';

const schema = readFileSync(
  join(__dirname, '../../../prisma/schema.prisma'),
  'utf8',
);
const sql = readFileSync(
  join(
    __dirname,
    '../../../prisma/migrations/20260715280000_stripe_webhook_matrix/migration.sql',
  ),
  'utf8',
);

describe('Stripe webhook matrix schema (Prompt 24)', () => {
  it('extends webhook event status with unresolved mapping', () => {
    expect(schema).toMatch(/enum StripeWebhookEventStatus[\s\S]*UNRESOLVED_MAPPING/);
  });

  it('stores durable webhook metadata for retries and replay', () => {
    expect(schema).toMatch(/model StripeWebhookEvent[\s\S]*?organizationId/);
    expect(schema).toMatch(/model StripeWebhookEvent[\s\S]*?retryCount/);
    expect(schema).toMatch(/model StripeWebhookEvent[\s\S]*?safePayload/);
    expect(schema).toMatch(/model StripeWebhookEvent[\s\S]*?stripeObjectId/);
    expect(schema).toMatch(/model StripeWebhookEvent[\s\S]*?eventCreatedAt/);
  });

  it('defines billing dispute mirror model', () => {
    expect(schema).toMatch(/model BillingDispute/);
    expect(schema).toMatch(/enum BillingDisputeStatus/);
  });

  it('migration adds webhook matrix columns and disputes table', () => {
    expect(sql).toContain('UNRESOLVED_MAPPING');
    expect(sql).toContain('organization_id');
    expect(sql).toContain('safe_payload');
    expect(sql).toContain('billing_disputes');
  });
});
