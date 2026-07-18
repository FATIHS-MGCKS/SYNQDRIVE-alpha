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

describe('Stations V2 query performance package', () => {
  describe('additive DB indexes for hot read paths', () => {
    const sql = fs.readFileSync(MIGRATION_SQL, 'utf8');

    it('declares only additive CREATE INDEX statements', () => {
      expect(sql).not.toMatch(/\bDROP\b/i);
      expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
      const createStatements = sql
        .split('\n')
        .filter((line) => line.trimStart().startsWith('CREATE INDEX'));
      expect(createStatements).toHaveLength(REQUIRED_INDEXES.length);
    });

    it.each(REQUIRED_INDEXES)('includes performance index %s', (indexName) => {
      expect(sql).toContain(indexName);
    });
  });

  describe('org summaries batching contract', () => {
    it('documents the aggregation cap constant in the resolver module', () => {
      const resolverSource = fs.readFileSync(
        path.join(__dirname, '../../shared/stations/station-org-summaries.resolver.ts'),
        'utf8',
      );
      expect(resolverSource).toContain('STATION_ORG_SUMMARIES_MAX_AGGREGATION_STATIONS');
    });
  });

  describe('home assignment preview batch cap', () => {
    it('exports a 500-vehicle preview batch limit', () => {
      const typesSource = fs.readFileSync(
        path.join(__dirname, './vehicle-home-assignment-preview.types.ts'),
        'utf8',
      );
      expect(typesSource).toContain('HOME_ASSIGNMENT_PREVIEW_MAX_BATCH');
      expect(typesSource).toMatch(/=\s*500/);
    });
  });
});
