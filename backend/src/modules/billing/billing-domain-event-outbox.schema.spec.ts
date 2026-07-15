import { readFileSync } from 'fs';
import { join } from 'path';

const schema = readFileSync(
  join(__dirname, '../../../prisma/schema.prisma'),
  'utf8',
);
const sql = readFileSync(
  join(
    __dirname,
    '../../../prisma/migrations/20260715320000_billing_transactional_outbox/migration.sql',
  ),
  'utf8',
);

describe('Billing transactional outbox schema (Prompt 28)', () => {
  it('defines delivery tracking and dead letter states', () => {
    expect(schema).toMatch(/enum BillingDomainEventOutboxStatus[\s\S]*?DEAD_LETTER/);
    expect(schema).toMatch(/enum BillingDomainEventOutboxDeliveryStatus/);
    expect(schema).toMatch(/model BillingDomainEventOutboxDelivery[\s\S]*?consumerId/);
    expect(schema).toMatch(/model BillingDomainEventOutbox[\s\S]*?nextRetryAt/);
    expect(schema).toMatch(/model BillingDomainEventOutbox[\s\S]*?organizationId/);
  });

  it('migration adds delivery table and retry columns', () => {
    expect(sql).toContain('billing_domain_event_outbox_deliveries');
    expect(sql).toContain('next_retry_at');
    expect(sql).toContain('DEAD_LETTER');
  });
});
