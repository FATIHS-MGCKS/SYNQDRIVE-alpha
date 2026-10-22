import * as fs from 'node:fs';
import * as path from 'node:path';

const MIGRATION = path.join(
  process.cwd(),
  'prisma/migrations/20261021220000_di_v0_motion_core_shadow_v1/migration.sql',
);

describe('DiV0 motion-core shadow schema', () => {
  it('migration defines outbox and runs with idempotency indexes', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain('CREATE TABLE di_v0_motion_core_shadow_runs_v1');
    expect(sql).toContain('CREATE TABLE di_v0_motion_core_shadow_outbox_v1');
    expect(sql).toContain('di_v0_motion_core_shadow_runs_succeeded_intent_uq');
    expect(sql).toContain('di_v0_motion_core_shadow_outbox_wi_intent_uq');
  });
});
