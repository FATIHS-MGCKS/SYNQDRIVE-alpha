import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

export const SYNTHETIC_CHARGING_DATASET_VERSION = 'synthetic-e6-2-pg-gate';

export async function probeChargingStationPostgresDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$queryRaw`SELECT PostGIS_Version()`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

export async function ensureChargingStationOsmSchema(prisma: PrismaClient): Promise<void> {
  const schemaPath = join(
    process.cwd(),
    'scripts/ops/osm-charging-stations/schema.sql',
  );
  const sql = readFileSync(schemaPath, 'utf8');
  const statements = sql
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith('--'));

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(`${statement};`);
  }

  const indexSql = readFileSync(
    join(process.cwd(), 'scripts/ops/osm-charging-stations/build_staging_indexes.sql'),
    'utf8',
  );
  for (const statement of indexSql
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)) {
    await prisma.$executeRawUnsafe(`${statement};`);
  }

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS charging_stations_centroid_gist
      ON osm.charging_stations USING GIST (centroid);
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS charging_stations_geom_geog_gist
      ON osm.charging_stations USING GIST ((geom::geography));
  `);
}

export async function seedSyntheticChargingDataset(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE osm.charging_stations CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE osm.charging_station_dataset_metadata CASCADE');

  const datasetVersion = SYNTHETIC_CHARGING_DATASET_VERSION;

  await prisma.$executeRawUnsafe(`
    INSERT INTO osm.charging_stations (
      osm_type, osm_id, name, brand, operator, network,
      street, city, country_code, access, fee, capacity,
      geom, centroid, dataset_version, tags
    ) VALUES
    (
      'node', 1001, 'Exact Node', 'BrandA', 'OpA', 'NetA',
      'Str', 'City', 'DE', 'yes', 'no', '2',
      ST_SetSRID(ST_MakePoint(8.001, 50.001), 4326),
      ST_SetSRID(ST_MakePoint(8.001, 50.001), 4326)::geography,
      '${datasetVersion}',
      '{"amenity":"charging_station","socket:type2":"2"}'::jsonb
    ),
    (
      'way', 2001, 'Site Polygon', 'BrandB', 'OpB', 'NetB',
      'Park', 'City', 'DE', 'yes', NULL, NULL,
      ST_SetSRID(ST_GeomFromText('POLYGON((8.000 50.000, 8.004 50.000, 8.004 50.004, 8.000 50.004, 8.000 50.000))'), 4326),
      ST_PointOnSurface(ST_SetSRID(ST_GeomFromText('POLYGON((8.000 50.000, 8.004 50.000, 8.004 50.004, 8.000 50.004, 8.000 50.000))'), 4326))::geography,
      '${datasetVersion}',
      '{"amenity":"charging_station"}'::jsonb
    ),
    (
      'node', 3001, 'Near A', 'BrandC', 'OpC', 'NetC',
      NULL, NULL, 'DE', 'private', 'yes', NULL,
      ST_SetSRID(ST_MakePoint(8.00105, 50.00105), 4326),
      ST_SetSRID(ST_MakePoint(8.00105, 50.00105), 4326)::geography,
      '${datasetVersion}',
      '{"amenity":"charging_station","socket:type2":"4","socket:type2:output":"22 kW"}'::jsonb
    ),
    (
      'node', 3002, 'Near B', 'BrandD', 'OpD', 'NetD',
      NULL, NULL, 'DE', NULL, NULL, NULL,
      ST_SetSRID(ST_MakePoint(8.00108, 50.00108), 4326),
      ST_SetSRID(ST_MakePoint(8.00108, 50.00108), 4326)::geography,
      '${datasetVersion}',
      '{"amenity":"charging_station"}'::jsonb
    ),
    (
      'node', 4001, 'Far Station', 'BrandE', 'OpE', 'NetE',
      NULL, NULL, 'DE', NULL, NULL, NULL,
      ST_SetSRID(ST_MakePoint(8.05, 50.05), 4326),
      ST_SetSRID(ST_MakePoint(8.05, 50.05), 4326)::geography,
      '${datasetVersion}',
      '{"amenity":"charging_station"}'::jsonb
    );
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO osm.charging_station_dataset_metadata (
      dataset_version, station_count, imported_at, promoted_at, is_current
    ) VALUES ('${datasetVersion}', 5, now(), now(), true);
  `);
}
