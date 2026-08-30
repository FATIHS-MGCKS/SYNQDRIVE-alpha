import { PrismaClient } from '@prisma/client';
import { FuelStationCandidateRepository } from '../fuel-station-candidate.repository';
import { FuelStationLocationResolverService } from '../fuel-station-location-resolver.service';
import { probeFuelStationPostgresDatabase } from './fuel-station-resolver-postgres.integration.harness';
import { FUEL_STATION_GROUND_TRUTH_CASES } from './fuel-station-ground-truth.fixtures';

const LIVE = process.env.FUEL_STATION_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)('FuelStationLocationResolver PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let resolver: FuelStationLocationResolverService;
  let dbOk = false;

  beforeAll(async () => {
    dbOk = await probeFuelStationPostgresDatabase();
    if (!dbOk) return;
    prisma = new PrismaClient();
    const repository = new FuelStationCandidateRepository(prisma as never);
    resolver = new FuelStationLocationResolverService(repository);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
  });

  it('reads current dataset version from metadata', async () => {
    if (!dbOk) return;
    const rows = await prisma.$queryRaw<Array<{ dataset_version: string }>>`
      SELECT dataset_version FROM osm.dataset_metadata WHERE is_current = true LIMIT 1
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].dataset_version).toMatch(/^geofabrik-germany-/);
  });

  it('uses GiST index for candidate lookup near Kassel', async () => {
    if (!dbOk) return;
    const repository = new FuelStationCandidateRepository(prisma as never);
    const plan = await repository.explainCandidateLookup(51.3127, 9.4797, 100);
    expect(plan).toMatch(/Index Scan|Bitmap Index Scan/i);
    expect(plan).toMatch(/fuel_stations_centroid_gist/i);
  });

  it.each(FUEL_STATION_GROUND_TRUTH_CASES)('resolves ground-truth case $id', async (testCase) => {
    if (!dbOk) return;
    const result = await resolver.resolve({
      latitude: testCase.latitude,
      longitude: testCase.longitude,
    });

    expect(result.resolverVersion).toBe('fuel-station-resolver-v1');
    expect(result.datasetVersion).toMatch(/^geofabrik-germany-/);

    if (testCase.expectedStatus) {
      expect(result.status).toBe(testCase.expectedStatus);
    }

    if (testCase.expectedBrandContains && result.station?.brand) {
      expect(result.station.brand.toLowerCase()).toContain(testCase.expectedBrandContains.toLowerCase());
    }
  });
});
