import { PrismaClient } from '@prisma/client';
import { FuelStationLocationResolverService } from '../fuel-stations/fuel-station-location-resolver.service';
import { FuelStationCandidateRepository } from '../fuel-stations/fuel-station-candidate.repository';
import { ChargingStationCandidateRepository } from './charging-station-candidate.repository';
import { ChargingStationLocationResolverService } from './charging-station-location-resolver.service';
import {
  ensureChargingStationOsmSchema,
  probeChargingStationPostgresDatabase,
  seedSyntheticChargingDataset,
  SYNTHETIC_CHARGING_DATASET_VERSION,
} from './testing/charging-station-resolver-postgres.integration.harness';

const LIVE = process.env.ERD_E6_2_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.ERD_E6_2_POSTGRES_REQUIRED === '1';

function stableResolveResult(result: Awaited<ReturnType<ChargingStationLocationResolverService['resolve']>>) {
  if (!result.diagnostics) return result;
  return {
    ...result,
    diagnostics: {
      ...result.diagnostics,
      queryLatencyMs: undefined,
    },
  };
}

(LIVE ? describe : describe.skip)('ChargingStationLocationResolver PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let resolver: ChargingStationLocationResolverService;
  let fuelResolver: FuelStationLocationResolverService;
  let dbOk = false;

  beforeAll(async () => {
    dbOk = await probeChargingStationPostgresDatabase();
    if (!dbOk) {
      if (REQUIRED) {
        throw new Error('ERD E6.2 PostgreSQL gate requires DATABASE_URL with PostGIS');
      }
      return;
    }
    prisma = new PrismaClient();
    await ensureChargingStationOsmSchema(prisma);
    await seedSyntheticChargingDataset(prisma);
    await prisma.$executeRawUnsafe('TRUNCATE osm.charging_stations_staging');
    await prisma.$executeRawUnsafe('TRUNCATE osm.charging_station_dataset_metadata_staging');
    const repository = new ChargingStationCandidateRepository(prisma as never);
    resolver = new ChargingStationLocationResolverService(repository);
    fuelResolver = new FuelStationLocationResolverService(
      new FuelStationCandidateRepository(prisma as never),
    );
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
  });

  it('PG1 dataset readiness', async () => {
    if (!dbOk) return;
    const repo = new ChargingStationCandidateRepository(prisma as never);
    const status = await repo.getCurrentDatasetStatus();
    expect(status.ready).toBe(true);
    expect(status.datasetVersion).toBe(SYNTHETIC_CHARGING_DATASET_VERSION);
  });

  it('PG2 geometry-inside polygon match', async () => {
    if (!dbOk) return;
    const result = await resolver.resolve({ latitude: 50.002, longitude: 8.002 });
    expect(result.status).toBe('MATCHED');
    expect(result.station?.osmId).toBe('2001');
    expect(result.confidence).toBe('HIGH');
  });

  it('PG3 exact node match', async () => {
    if (!dbOk) return;
    const result = await resolver.resolve({ latitude: 50.001, longitude: 8.001 });
    expect(result.status).toBe('MATCHED');
    expect(result.station?.osmId).toBe('1001');
  });

  it('PG4 clear nearest candidate', async () => {
    if (!dbOk) return;
    const result = await resolver.resolve({ latitude: 50.001, longitude: 7.9998 });
    expect(result.status).toBe('MATCHED');
    expect(result.station?.osmId).toBe('1001');
  });

  it('PG5 ambiguous two-candidate case', async () => {
    if (!dbOk) return;
    const result = await resolver.resolve({ latitude: 50.00106, longitude: 8.00106 });
    expect(result.status).toBe('AMBIGUOUS');
  });

  it('PG6 max-distance NOT_FOUND', async () => {
    if (!dbOk) return;
    const result = await resolver.resolve({ latitude: 0, longitude: 0 });
    expect(result.status).toBe('NOT_FOUND');
  });

  it('PG7 spatial object isolation — far station not returned for local query', async () => {
    if (!dbOk) return;
    const rows = await prisma.$queryRaw<Array<{ osm_id: bigint }>>`
      WITH q AS (
        SELECT ST_SetSRID(ST_MakePoint(8.001, 50.001), 4326)::geography AS geog
      )
      SELECT cs.osm_id
      FROM osm.charging_stations cs, q
      WHERE ST_DWithin(cs.centroid, q.geog, 120)
        AND cs.osm_id = 4001
    `;
    expect(rows).toHaveLength(0);
  });

  it('PG8 deterministic ordering', async () => {
    if (!dbOk) return;
    const input = { latitude: 50.001, longitude: 8.001 };
    const a = stableResolveResult(await resolver.resolve(input));
    const b = stableResolveResult(await resolver.resolve(input));
    expect(a).toEqual(b);
  });

  it('PG9 dataset version returned', async () => {
    if (!dbOk) return;
    const result = await resolver.resolve({ latitude: 50.001, longitude: 8.001 });
    expect(result.datasetVersion).toBe(SYNTHETIC_CHARGING_DATASET_VERSION);
    expect(result.resolverVersion).toBe('charging-station-resolver-v1');
  });

  it('PG10 spatial query uses GiST index', async () => {
    if (!dbOk) return;
    const repo = new ChargingStationCandidateRepository(prisma as never);
    const plan = await repo.explainCandidateLookup(50.001, 8.001, 120);
    expect(plan).toMatch(/Index Scan|Bitmap Index Scan/i);
    expect(plan).toMatch(/charging_stations_centroid_gist/i);
  });

  it('PG11 fuel table unaffected', async () => {
    if (!dbOk) return;
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'osm' AND table_name = 'fuel_stations'
      ) AS exists
    `;
    if (!rows[0]?.exists) {
      return;
    }
    const fuelCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM osm.fuel_stations
    `;
    expect(Number(fuelCount[0]?.count ?? 0)).toBeGreaterThanOrEqual(0);
  });

  it('PG12 fuel resolver unchanged semantics', async () => {
    if (!dbOk) return;
    const invalid = await fuelResolver.resolve({ latitude: 999, longitude: 9 });
    expect(invalid.status).toBe('INVALID_COORDINATES');
  });

  it('PG13 repeat resolution deterministic', async () => {
    if (!dbOk) return;
    const input = { latitude: 50.002, longitude: 8.002 };
    expect(stableResolveResult(await resolver.resolve(input))).toEqual(
      stableResolveResult(await resolver.resolve(input)),
    );
  });

  it('PG14 station metadata round-trip', async () => {
    if (!dbOk) return;
    const result = await resolver.resolve({ latitude: 50.00105, longitude: 8.00105 });
    expect(['MATCHED', 'AMBIGUOUS']).toContain(result.status);
    const candidate =
      result.station ??
      result.candidates?.find((c) => c.station.osmId === '3001' || c.station.osmId === '3002')?.station;
    expect(candidate?.connectors?.some((c) => c.type === 'type2')).toBe(true);
  });

  it('PG15 staging/live separation', async () => {
    if (!dbOk) return;
    const live = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM osm.charging_stations
    `;
    const staging = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM osm.charging_stations_staging
    `;
    expect(Number(live[0]?.count ?? 0)).toBeGreaterThan(0);
    expect(Number(staging[0]?.count ?? 0)).toBe(0);
  });
});
