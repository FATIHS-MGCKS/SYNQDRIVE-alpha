import * as fs from 'fs';
import * as path from 'path';

describe('station one-primary-per-org migration', () => {
  const migrationPath = path.join(
    __dirname,
    '../../../prisma/migrations/20260718103000_station_one_primary_per_org/migration.sql',
  );

  it('exists and defines partial unique index plus reconcile steps', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('stations primary preflight');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "stations_one_primary_per_org"');
    expect(sql).toContain('WHERE "is_primary" = true AND "status" <> \'ARCHIVED\'');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "stations_org_status_primary_idx"');
    expect(sql).toContain('SET is_primary = false');
    expect(sql).toContain('ROW_NUMBER() OVER');
  });
});
