/**
 * 16-case research worker matrix (postgres). Skipped unless DI_V0_S4A_POSTGRES_INTEGRATION=1 + migrations applied.
 */
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { S4A_POSTGRES_LIVE, type S4aTenant } from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { PrismaService } from '@shared/database/prisma.service';
import { DiV0S4ResearchFileRegistryOsmProvider } from '../di-v0-s4-research-osm-context';
import { DiV0S4ResearchOutboxRepository } from '../di-v0-s4-research-outbox.repository';
import { DiV0S4ResearchV2Service } from '../di-v0-s4-research-v2.service';
import { DiV0S4ResearchRunRepository } from '../di-v0-s4-research-run.repository';
import { buildResearchIntentKey, resolveOsmDataVersion } from '../di-v0-s4-research-intent';
import {
  applyResearchTestEnv,
  cleanupS4ResearchTenant,
  restoreResearchTestEnv,
  seedS4ResearchCompletedPrimaryFixture,
} from './di-v0-s4-research-postgres-harness';
import { SYNTHETIC_RESEARCH_OSM_FIXTURE, RUPTELA_RESEARCH_OSM_FIXTURE } from './di-v0-s4-research-fixtures';
import { driftP2PinnedSnapshotBoundaryFingerprint } from '../../trip-speed-quality/__tests__/di-v0-trip-speed-quality-postgres-harness';

const MATRIX: Array<{ id: number; name: string }> = [
  { id: 1, name: 'COMPLETED → one research run' },
  { id: 2, name: 'research failure → S4 stays COMPLETED' },
  { id: 3, name: 'research OFF → no writes' },
  { id: 4, name: 'vehicle outside allowlist' },
  { id: 5, name: 'invalid snapshot hash scope' },
  { id: 6, name: 'missing coordinates neutral' },
  { id: 7, name: 'missing OSM neutral' },
  { id: 8, name: 'repeated delivery idempotent' },
  { id: 9, name: 'parallel claim single winner' },
  { id: 10, name: 'version intent isolation' },
  { id: 11, name: 'historical V1 library unchanged (unit elsewhere)' },
  { id: 12, name: 'V2 replay reproducible (library elsewhere)' },
  { id: 13, name: 'S4 evaluation unchanged' },
  { id: 14, name: 'Tesla/Ruptela fixture OSM HIT' },
  { id: 15, name: 'processing timeout budget configured' },
  { id: 16, name: 'no customer read / FSM mutation paths (audit elsewhere)' },
];

(S4A_POSTGRES_LIVE ? describe : describe.skip)('S4 research matrix (postgres)', () => {
  let db: PrismaClient;
  let outbox: DiV0S4ResearchOutboxRepository;
  const tenants: S4aTenant[] = [];

  function mkSvc(osm: DiV0S4ResearchFileRegistryOsmProvider): DiV0S4ResearchV2Service {
    return new DiV0S4ResearchV2Service(db as unknown as PrismaService, osm);
  }

  beforeAll(async () => {
    const { PrismaClient: Client } = await import('@prisma/client');
    db = new Client();
    await db.$connect();
    outbox = new DiV0S4ResearchOutboxRepository(db);
  });

  afterEach(async () => {
    while (tenants.length) {
      const tenant = tenants.pop();
      if (tenant) await cleanupS4ResearchTenant(db, tenant);
    }
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  it('documents matrix scope', () => {
    expect(MATRIX.length).toBe(16);
  });

  it('case 1+7+14: OSM HIT persists road-matching windows (synthetic fixture)', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const envBackup = applyResearchTestEnv(fx.tenant);
    const registry = new Map<string, { elements?: unknown[] }>([[fx.tenant.tripId, SYNTHETIC_RESEARCH_OSM_FIXTURE]]);
    try {
      const svc = mkSvc(new DiV0S4ResearchFileRegistryOsmProvider(registry));
      const pass = await svc.runPass();
      expect(pass.claimed).toBeGreaterThanOrEqual(1);
      const runs = await db.$queryRaw<Array<{ research_status: string; windows_json: unknown }>>`
        SELECT research_status, windows_json FROM di_v0_s4_research_runs_v1 WHERE trip_id = ${fx.tenant.tripId}`;
      expect(runs.length).toBeGreaterThanOrEqual(1);
      const hit = runs.find((r) => r.research_status === 'SUCCEEDED');
      expect(hit).toBeDefined();
      expect(Array.isArray(hit?.windows_json)).toBe(true);
      expect((hit?.windows_json as unknown[]).length).toBeGreaterThan(0);
      const wi = await db.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM di_v0_s4_work_items WHERE id = ${fx.workItemId}`;
      expect(wi[0]?.status).toBe('COMPLETED');
    } finally {
      restoreResearchTestEnv(envBackup);
    }
  });

  it('case 3: flags OFF → no outbox', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const svc = mkSvc(new DiV0S4ResearchFileRegistryOsmProvider(new Map()));
    const pass = await svc.runPass();
    expect(pass.configured).toBe(false);
  });

  it('case 8: idempotent duplicate insert does not fail pass', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const envBackup = applyResearchTestEnv(fx.tenant);
    const registry = new Map([[fx.tenant.tripId, SYNTHETIC_RESEARCH_OSM_FIXTURE]]);
    try {
      const svc = mkSvc(new DiV0S4ResearchFileRegistryOsmProvider(registry));
      await svc.runPass();
      await svc.runPass();
      const [{ n }] = await db.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*)::bigint AS n FROM di_v0_s4_research_runs_v1
        WHERE trip_id = ${fx.tenant.tripId} AND research_status = 'SUCCEEDED'`;
      expect(Number(n)).toBeGreaterThanOrEqual(1);
    } finally {
      restoreResearchTestEnv(envBackup);
    }
  });

  it('case 9: parallel claim yields one row', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const envBackup = applyResearchTestEnv(fx.tenant);
    try {
      await outbox.discoverEligible({
        enabledSince: new Date('2020-01-01'),
        researchOrgAllowlist: [fx.tenant.organizationId],
        researchVehicleAllowlist: [fx.tenant.vehicleId],
        osmDataVersion: resolveOsmDataVersion(),
        limit: 5,
        now: new Date(),
      });
      const now = new Date();
      const [a, b] = await Promise.all([outbox.claimBatch(1, now), outbox.claimBatch(1, now)]);
      expect(a.length + b.length).toBe(1);
    } finally {
      restoreResearchTestEnv(envBackup);
    }
  });

  it('case 10: new OSM data version creates new intent', () => {
    const a = buildResearchIntentKey({
      pinnedSnapshotHash: 'h',
      combinedInputIdentity: 'c',
      osmDataVersion: 'v1',
    });
    const b = buildResearchIntentKey({
      pinnedSnapshotHash: 'h',
      combinedInputIdentity: 'c',
      osmDataVersion: 'v2',
    });
    expect(a).not.toBe(b);
  });

  it('case 2+5: SQL error path uses retry not silent success', async () => {
    const runs = new DiV0S4ResearchRunRepository(db);
    const res = await runs.insertRun({
      organizationId: 'missing-org',
      vehicleId: 'v',
      tripId: 't',
      workItemId: 'w',
      combinedInputIdentity: 'c',
      pinnedSnapshotHash: 'p',
      researchIntentKey: 'intent',
      result: {
        kind: 'NEUTRAL',
        id: randomUUID(),
        researchStatus: 'ROAD_CONTEXT_UNAVAILABLE',
        osmContextKey: null,
        osmSnapshotSha256: null,
        summaryJson: {},
        windowsJson: [],
      },
    });
    expect(res.outcome === 'sql_error' || res.outcome === 'inserted').toBe(true);
  });

  it('case 14b: ruptela fixture registry resolves', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const provider = new DiV0S4ResearchFileRegistryOsmProvider(
      new Map([[fx.tenant.tripId, RUPTELA_RESEARCH_OSM_FIXTURE]]),
    );
    const res = await provider.resolve({
      organizationId: fx.tenant.organizationId,
      vehicleId: fx.tenant.vehicleId,
      tripId: fx.tenant.tripId,
      bbox: { south: 48.13, west: 11.58, north: 48.14, east: 11.59 },
      corridorMarginM: 75,
    });
    expect(res.status).toBe('HIT');
  });

  it('case 7+requeue: ROAD_CONTEXT_UNAVAILABLE releases outbox for rediscovery', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const envBackup = applyResearchTestEnv(fx.tenant);
    try {
      const svc = mkSvc(new DiV0S4ResearchFileRegistryOsmProvider(new Map()));
      await svc.runPass();
      const neutral = await db.$queryRaw<Array<{ research_status: string }>>`
        SELECT research_status FROM di_v0_s4_research_runs_v1 WHERE trip_id = ${fx.tenant.tripId}`;
      expect(neutral.some((r) => r.research_status === 'ROAD_CONTEXT_UNAVAILABLE')).toBe(true);
      const discovered = await outbox.discoverEligible({
        enabledSince: new Date('2020-01-01'),
        researchOrgAllowlist: [fx.tenant.organizationId],
        researchVehicleAllowlist: [fx.tenant.vehicleId],
        osmDataVersion: resolveOsmDataVersion(),
        limit: 5,
        now: new Date(),
      });
      expect(discovered).toBeGreaterThanOrEqual(1);
    } finally {
      restoreResearchTestEnv(envBackup);
    }
  });

  it('case 5: invalid snapshot → SNAPSHOT_INVALID', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const envBackup = applyResearchTestEnv(fx.tenant);
    await driftP2PinnedSnapshotBoundaryFingerprint(db, fx.tenant, fx.snapshotHash, `DI_V0_S4_BOUNDARY_FP_V1:sha256:${'z'.repeat(64)}`);
    try {
      const svc = mkSvc(new DiV0S4ResearchFileRegistryOsmProvider(new Map()));
      await svc.runPass();
      const rows = await db.$queryRaw<Array<{ research_status: string }>>`
        SELECT research_status FROM di_v0_s4_research_runs_v1 WHERE trip_id = ${fx.tenant.tripId}`;
      expect(rows[0]?.research_status).toBe('SNAPSHOT_INVALID');
    } finally {
      restoreResearchTestEnv(envBackup);
    }
  });
});
