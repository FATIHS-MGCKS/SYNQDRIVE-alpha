import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_SQL = path.join(
  __dirname,
  '../../../prisma/migrations/20260718220000_stations_v2_query_path_indexes/migration.sql',
);

const REQUIRED_INDEXES = [
  'vehicles_organization_id_home_station_id_idx',
  'bookings_organization_id_pickup_station_id_start_date_idx',
  'bookings_organization_id_return_station_id_end_date_idx',
  'vehicle_station_transfers_organization_id_from_station_id_stat_idx',
  'booking_handover_protocols_org_actual_station_performed_at_idx',
] as const;

describe('Stations V2 query path indexes migration', () => {
  const sql = fs.readFileSync(MIGRATION_SQL, 'utf8');

  it('is additive CREATE INDEX only', () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
    const createStatements = sql
      .split('\n')
      .filter((line) => line.trimStart().startsWith('CREATE INDEX'));
    expect(createStatements).toHaveLength(REQUIRED_INDEXES.length);
  });

  it.each(REQUIRED_INDEXES)('declares index %s', (indexName) => {
    expect(sql).toContain(indexName);
  });

  it('uses a partial index for handover actual_station_id lookups', () => {
    expect(sql).toContain('WHERE "actual_station_id" IS NOT NULL');
  });
});
