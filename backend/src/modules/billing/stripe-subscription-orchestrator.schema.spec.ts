import { readFileSync } from 'fs';
import { join } from 'path';

const schema = readFileSync(
  join(__dirname, '../../../prisma/schema.prisma'),
  'utf8',
);
const sql = readFileSync(
  join(
    __dirname,
    '../../../prisma/migrations/20260715260000_stripe_subscription_sync/migration.sql',
  ),
  'utf8',
);

describe('Stripe subscription orchestrator schema (Prompt 22)', () => {
  it('defines stripe sync status fields on billing subscription', () => {
    expect(schema).toMatch(/model BillingSubscription[\s\S]*?stripeSyncStatus/);
    expect(schema).toMatch(/model BillingSubscription[\s\S]*?lastStripeSyncedAt/);
    expect(schema).toMatch(/model BillingSubscription[\s\S]*?lastStripeSyncError/);
  });

  it('migration adds stripe subscription sync columns', () => {
    expect(sql).toContain('stripe_sync_status');
    expect(sql).toContain('last_stripe_synced_at');
    expect(sql).toContain('last_stripe_sync_error');
    expect(sql).toContain('billing_subscriptions_stripe_sync_status_idx');
  });
});
