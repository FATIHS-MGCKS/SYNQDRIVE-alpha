import { readFileSync } from 'fs';
import { join } from 'path';

const schema = readFileSync(
  join(__dirname, '../../../prisma/schema.prisma'),
  'utf8',
);
const sql = readFileSync(
  join(
    __dirname,
    '../../../prisma/migrations/20260715310000_billing_reconciliation_drift/migration.sql',
  ),
  'utf8',
);

describe('Billing reconciliation schema (Prompt 27)', () => {
  it('defines drift enums and record fields', () => {
    expect(schema).toMatch(/enum BillingReconciliationDriftType/);
    expect(schema).toMatch(/enum BillingReconciliationDriftSeverity/);
    expect(schema).toMatch(/enum BillingReconciliationRunStatus/);
    expect(schema).toMatch(/model BillingReconciliationDrift[\s\S]*?driftType/);
    expect(schema).toMatch(/model BillingReconciliationDrift[\s\S]*?suggestedAction/);
    expect(schema).toMatch(/model BillingReconciliationDrift[\s\S]*?autoFixable/);
    expect(schema).toMatch(/model BillingReconciliationDrift[\s\S]*?resolvedAt/);
    expect(schema).toMatch(/model BillingReconciliationRun[\s\S]*?cursor/);
  });

  it('migration creates reconciliation tables', () => {
    expect(sql).toContain('billing_reconciliation_runs');
    expect(sql).toContain('billing_reconciliation_drifts');
    expect(sql).toContain('TEST_LIVE_MODE_CONFLICT');
    expect(sql).toContain('idempotency_key');
  });
});
