import * as fs from 'fs';
import * as path from 'path';

describe('vehicle station position metadata migration', () => {
  const migrationPath = path.join(
    __dirname,
    '../../../prisma/migrations/20260718150000_vehicle_station_position_metadata/migration.sql',
  );

  it('exists and adds nullable position metadata columns without data cleanup', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('vehicle_station_position_source');
    expect(sql).toContain("'MANUAL'");
    expect(sql).toContain("'PICKUP'");
    expect(sql).toContain("'RETURN'");
    expect(sql).toContain("'TRANSFER'");
    expect(sql).toContain("'IMPORT'");
    expect(sql).toContain("'GEOFENCE_SHADOW'");
    expect(sql).toContain("'GEOFENCE_CONFIRMED'");
    expect(sql).toContain("'UNKNOWN'");
    expect(sql).toContain('current_station_source');
    expect(sql).toContain('current_station_confirmed_at');
    expect(sql).toContain('current_station_confirmed_by_user_id');
    expect(sql).toContain('expected_station_source');
    expect(sql).toContain('expected_station_set_at');
    expect(sql).toContain('station_position_version');
    expect(sql).toContain('DEFAULT 0');
    expect(sql).toContain('vehicles_org_current_station_idx');
    expect(sql).toContain('vehicles_org_expected_station_idx');
    expect(sql).not.toContain('UPDATE "vehicles"');
    expect(sql).not.toContain('DELETE FROM');
    expect(sql).not.toContain('DROP COLUMN');
    expect(sql).not.toContain('TRUNCATE');
  });
});
