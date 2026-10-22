import * as fs from 'node:fs';
import * as path from 'node:path';

const migrationPath = path.join(
  process.cwd(),
  'prisma/migrations/20261022130000_di_v0_m7a_road_assignment_shadow_v1/migration.sql',
);

describe('M7A road-assignment shadow schema migration', () => {
  it('defines outbox + runs with idempotency indexes', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('CREATE TABLE di_v0_m7a_road_assignment_shadow_runs_v1');
    expect(sql).toContain('CREATE TABLE di_v0_m7a_road_assignment_shadow_outbox_v1');
    expect(sql).toContain('di_v0_m7a_road_assignment_shadow_runs_succeeded_intent_uq');
    expect(sql).toContain('di_v0_m7a_road_assignment_shadow_outbox_wi_intent_uq');
  });
});
