import type { PrismaClient } from '@prisma/client';
import { S4A_POSTGRES_LIVE } from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DiV0S4ResearchCachedOsmProvider } from '../../s4-research-worker/di-v0-s4-research-cached-osm.provider';
import { gzipOverpassBody } from '../../s4-research-worker/di-v0-s4-research-osm-context';
import { DiV0S4ResearchOsmCacheRepository } from '../../s4-research-worker/di-v0-s4-research-osm-cache.repository';
import { DI_V0_S4_RESEARCH_OSM_ENV } from '../../s4-research-worker/di-v0-s4-research-osm.config';
import { DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_OSM_DATA_VERSION_ENV } from '../di-v0-m7a-road-assignment-shadow-intent';
import { PrismaService } from '@shared/database/prisma.service';

const BBOX = { south: 52.48, west: 13.35, north: 52.5, east: 13.37 };
const MARGIN_M = 25;

(S4A_POSTGRES_LIVE ? describe : describe.skip)('M7A OSM activation readiness (postgres)', () => {
  let db: PrismaClient;
  let cache: DiV0S4ResearchOsmCacheRepository;
  let seededContextKey = '';
  const backupEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    const { PrismaClient: Client } = await import('@prisma/client');
    db = new Client();
    await db.$connect();
    cache = new DiV0S4ResearchOsmCacheRepository(db);
    for (const key of [
      DI_V0_S4_RESEARCH_OSM_ENV.overpassEnabled,
      DI_V0_S4_RESEARCH_OSM_ENV.overpassEndpoint,
      DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_OSM_DATA_VERSION_ENV,
    ]) {
      backupEnv[key] = process.env[key];
    }
    delete process.env[DI_V0_S4_RESEARCH_OSM_ENV.overpassEnabled];
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(backupEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (seededContextKey) {
      await db.$executeRaw`DELETE FROM di_v0_s4_research_osm_cache_v1 WHERE osm_context_key = ${seededContextKey}`;
    }
    await db.$disconnect();
  });

  it('documents required OSM env keys for M7A (shared S4 research provider)', () => {
    expect(DI_V0_S4_RESEARCH_OSM_ENV.overpassEnabled).toBe('DI_V0_S4_RESEARCH_OSM_OVERPASS_ENABLED');
    expect(DI_V0_S4_RESEARCH_OSM_ENV.overpassEndpoint).toBe('DI_V0_S4_RESEARCH_OSM_OVERPASS_ENDPOINT');
    expect(DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_OSM_DATA_VERSION_ENV).toBe(
      'DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_OSM_DATA_VERSION',
    );
  });

  it('bounded Overpass provider: cache miss + overpass off fails closed; seeded cache yields HIT', async () => {
    const provider = new DiV0S4ResearchCachedOsmProvider(db as unknown as PrismaService);
    const resolveInput = {
      organizationId: 'org-m7a-test',
      vehicleId: 'veh-m7a-test',
      tripId: 'trip-m7a-test',
      bbox: BBOX,
      corridorMarginM: MARGIN_M,
    };
    const miss = await provider.resolve(resolveInput);
    expect(miss.status).toBe('MISS');
    if (miss.status !== 'MISS') {
      throw new Error('expected MISS');
    }
    expect(miss.reason).toBe('OVERPASS_DISABLED');
    seededContextKey = miss.osmContextKey;

    const body = { elements: [{ type: 'way', id: 1, tags: { highway: 'residential' } }] };
    const packed = gzipOverpassBody(body);
    await cache.upsert({
      osmContextKey: miss.osmContextKey,
      osmSnapshotSha256: packed.sha256,
      bboxJson: BBOX,
      corridorMarginM: MARGIN_M,
      overpassGzip: packed.gzip,
      uncompressedBytes: packed.uncompressedBytes,
      providerKind: 'OVERPASS_BOUNDED',
    });

    const hit = await provider.resolve(resolveInput);
    expect(hit.status).toBe('HIT');
    if (hit.status === 'HIT') {
      expect(hit.osmSnapshotSha256).toBe(packed.sha256);
      expect(hit.overpassBody.elements?.length).toBe(1);
    }
  }, 60_000);
});
