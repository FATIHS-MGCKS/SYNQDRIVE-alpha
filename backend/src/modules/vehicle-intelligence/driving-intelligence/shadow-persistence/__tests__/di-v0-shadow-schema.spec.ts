import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.join(__dirname, '../../../../../../');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma/schema.prisma');
const MIGRATION_PATH = path.join(
  BACKEND_ROOT,
  'prisma/migrations/20260926193000_di_v0_shadow_persistence/migration.sql',
);

describe('DI V0 shadow persistence schema', () => {
  it('passes prisma validate', () => {
    const output = execSync('npx prisma validate', {
      cwd: BACKEND_ROOT,
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://synqdrive:synqdrive@localhost:5432/synqdrive',
      },
      encoding: 'utf8',
    });
    expect(output).toContain('valid');
  });

  it('defines isolated shadow tables with idempotency constraints', () => {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    expect(schema).toContain('model DiV0ShadowRun');
    expect(schema).toContain('model DiV0ShadowInterval');
    expect(schema).toMatch(/@@unique\(\[organizationId, idempotencyKey\]\)/);
    expect(schema).toMatch(/@@unique\(\[shadowRunId, intervalStart\]\)/);
    expect(schema).toContain('@@map("di_v0_shadow_runs")');
    expect(schema).toContain('@@map("di_v0_shadow_intervals")');
    expect(schema).toMatch(/model VehicleTrip[\s\S]*diV0ShadowRuns/);
    expect(schema).not.toMatch(/model VehicleTrip[\s\S]*shadow_interval_count/);
  });

  it('migration creates only shadow tables with CHECK constraints', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toContain('CREATE TABLE "di_v0_shadow_runs"');
    expect(sql).toContain('CREATE TABLE "di_v0_shadow_intervals"');
    expect(sql).not.toMatch(/ALTER TABLE "vehicle_trips"/);
    expect(sql).toContain('di_v0_shadow_runs_status_check');
    expect(sql).toContain('di_v0_shadow_intervals_interval_time_check');
    expect(sql).not.toContain('di_v0_shadow_intervals_shadow_run_id_interval_start_idx');
    const indexCreates = sql.match(/^CREATE (UNIQUE )?INDEX/gm) ?? [];
    expect(indexCreates.length).toBe(10);
  });
});
