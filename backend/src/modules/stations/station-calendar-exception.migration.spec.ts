import * as fs from 'fs';
import * as path from 'path';

describe('station calendar exceptions migration', () => {
  const migrationPath = path.join(
    __dirname,
    '../../../prisma/migrations/20260718140000_station_calendar_exceptions/migration.sql',
  );

  it('creates normalized calendar exception enums and table', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('station_calendar_exception_type');
    expect(sql).toContain('station_calendar_recurrence_kind');
    expect(sql).toContain('station_calendar_exception_source');
    expect(sql).toContain('station_calendar_exception_status');
    expect(sql).toContain('CREATE TABLE "station_calendar_exceptions"');
    expect(sql).toContain('legacy_import_key');
    expect(sql).toContain('created_by_user_id');
    expect(sql).toContain('cancelled_at');
  });
});
