import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { S4A_POSTGRES_LIVE, type S4aTenant } from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { PrismaService } from '@shared/database/prisma.service';
import { DiV0S4ResearchFileRegistryOsmProvider } from '../di-v0-s4-research-osm-context';
import { DiV0S4ResearchOutboxRepository } from '../di-v0-s4-research-outbox.repository';
import { DiV0S4ResearchRunRepository } from '../di-v0-s4-research-run.repository';
import { DiV0S4ResearchV2Service } from '../di-v0-s4-research-v2.service';
import { DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2 } from '../di-v0-s4-research-bundle.version';
import { buildResearchIntentKey, resolveOsmDataVersion } from '../di-v0-s4-research-intent';
import {
  applyResearchTestEnv,
  cleanupS4ResearchTenant,
  restoreResearchTestEnv,
  seedS4ResearchCompletedPrimaryFixture,
} from './di-v0-s4-research-postgres-harness';
import { SYNTHETIC_RESEARCH_OSM_FIXTURE } from './di-v0-s4-research-fixtures';
import { driftP2PinnedSnapshotBoundaryFingerprint } from '../../trip-speed-quality/__tests__/di-v0-trip-speed-quality-postgres-harness';

(S4A_POSTGRES_LIVE ? describe : describe.skip)('S4 research V2 worker (postgres)', () => {
  let db: PrismaClient;
  let outbox: DiV0S4ResearchOutboxRepository;
  let runs: DiV0S4ResearchRunRepository;
  const tenants: S4aTenant[] = [];

  function mkSvc(osm = new DiV0S4ResearchFileRegistryOsmProvider(new Map())): DiV0S4ResearchV2Service {
    return new DiV0S4ResearchV2Service(db as unknown as PrismaService, osm);
  }

  beforeAll(async () => {
    const { PrismaClient: Client } = await import('@prisma/client');
    db = new Client();
    await db.$connect();
    outbox = new DiV0S4ResearchOutboxRepository(db);
    runs = new DiV0S4ResearchRunRepository(db);
  });

  afterEach(async () => {
    while (tenants.length > 0) {
      const tenant = tenants.pop();
      if (tenant) await cleanupS4ResearchTenant(db, tenant);
    }
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  async function wiStatus(workItemId: string): Promise<string | null> {
    const rows = await db.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM di_v0_s4_work_items WHERE id = ${workItemId}`;
    return rows[0]?.status ?? null;
  }

  async function runCount(tripId: string): Promise<number> {
    const [{ n }] = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM di_v0_s4_research_runs_v1 WHERE trip_id = ${tripId}`;
    return Number(n);
  }

  async function succeededCount(workItemId: string, intentKey: string): Promise<number> {
    return runs.countSucceededForIntent(workItemId, intentKey);
  }

  it('COMPLETED S4 → neutral without OSM, outbox re-discoverable (neutral recovery)', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const envBackup = applyResearchTestEnv(fx.tenant);
    try {
      const svc = mkSvc();
      const pass1 = await svc.runPass();
      expect(pass1.configured).toBe(true);
      expect(pass1.discovered).toBe(1);
      expect(pass1.claimed).toBe(1);
      expect(pass1.neutral).toBe(1);
      expect(await wiStatus(fx.workItemId)).toBe('COMPLETED');
      expect(await runCount(fx.tenant.tripId)).toBe(1);
      const pass2 = await svc.runPass();
      expect(pass2.discovered).toBeGreaterThanOrEqual(1);
      expect(await runCount(fx.tenant.tripId)).toBe(1);
    } finally {
      restoreResearchTestEnv(envBackup);
    }
  });

  it('neutral → OSM HIT SUCCEEDED → third pass does not double SUCCEEDED', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const envBackup = applyResearchTestEnv(fx.tenant);
    const emptyOsm = new DiV0S4ResearchFileRegistryOsmProvider(new Map());
    try {
      const wi = await db.diV0S4WorkItem.findFirst({ where: { id: fx.workItemId } });
      const intentKey = buildResearchIntentKey({
        pinnedSnapshotHash: wi!.pinnedSnapshotHash!,
        combinedInputIdentity: wi!.combinedInputIdentity ?? '',
        osmDataVersion: resolveOsmDataVersion(),
      });

      const svcNeutral = mkSvc(emptyOsm);
      const pass1 = await svcNeutral.runPass();
      expect(pass1.neutral).toBe(1);
      const neutralRows = await db.$queryRaw<Array<{ research_status: string }>>`
        SELECT research_status FROM di_v0_s4_research_runs_v1 WHERE work_item_id = ${fx.workItemId}`;
      expect(neutralRows.some((r) => r.research_status === 'ROAD_CONTEXT_UNAVAILABLE')).toBe(true);
      expect(await succeededCount(fx.workItemId, intentKey)).toBe(0);

      const registry = new Map([[fx.tenant.tripId, SYNTHETIC_RESEARCH_OSM_FIXTURE]]);
      const svcHit = mkSvc(new DiV0S4ResearchFileRegistryOsmProvider(registry));
      const pass2 = await svcHit.runPass();
      expect(pass2.succeeded).toBe(1);
      expect(await succeededCount(fx.workItemId, intentKey)).toBe(1);
      const hit = await db.$queryRaw<Array<{ research_status: string; windows_json: unknown }>>`
        SELECT research_status, windows_json FROM di_v0_s4_research_runs_v1
        WHERE work_item_id = ${fx.workItemId} AND research_status = 'SUCCEEDED'`;
      expect(hit.length).toBe(1);
      expect(Array.isArray(hit[0]?.windows_json)).toBe(true);
      expect((hit[0]?.windows_json as unknown[]).length).toBeGreaterThan(0);

      const pass3 = await svcHit.runPass();
      expect(pass3.discovered).toBe(0);
      expect(await succeededCount(fx.workItemId, intentKey)).toBe(1);
      expect(await runCount(fx.tenant.tripId)).toBe(2);
    } finally {
      restoreResearchTestEnv(envBackup);
    }
  });

  it('research flags OFF → no outbox writes', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const svc = mkSvc();
    const pass = await svc.runPass();
    expect(pass.configured).toBe(false);
    const rows = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM di_v0_s4_research_outbox_v1 WHERE work_item_id = ${fx.workItemId}`;
    expect(Number(rows[0]?.n ?? 0)).toBe(0);
  });

  it('vehicle outside research allowlist → skipped ineligible', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const envBackup = applyResearchTestEnv(fx.tenant);
    process.env.DI_V0_S4_RESEARCH_VEHICLE_ALLOWLIST = 'other-vehicle';
    try {
      const svc = mkSvc();
      const pass = await svc.runPass();
      expect(pass.discovered).toBe(0);
      expect(await runCount(fx.tenant.tripId)).toBe(0);
    } finally {
      restoreResearchTestEnv(envBackup);
    }
  });

  it('invalid snapshot scope → neutral SNAPSHOT_INVALID without mutating S4', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const envBackup = applyResearchTestEnv(fx.tenant);
    await driftP2PinnedSnapshotBoundaryFingerprint(db, fx.tenant, fx.snapshotHash, `DI_V0_S4_BOUNDARY_FP_V1:sha256:${'x'.repeat(64)}`);
    try {
      const svc = mkSvc();
      await svc.runPass();
      expect(await wiStatus(fx.workItemId)).toBe('COMPLETED');
      const statusRows = await db.$queryRaw<Array<{ research_status: string }>>`
        SELECT research_status FROM di_v0_s4_research_runs_v1 WHERE trip_id = ${fx.tenant.tripId}`;
      expect(statusRows[0]?.research_status).toBe('SNAPSHOT_INVALID');
    } finally {
      restoreResearchTestEnv(envBackup);
    }
  });

  it('parallel claim does not double-process one outbox row', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    const envBackup = applyResearchTestEnv(fx.tenant);
    const since = new Date('2020-01-01T00:00:00.000Z');
    try {
      await outbox.discoverEligible({
        enabledSince: since,
        researchOrgAllowlist: [fx.tenant.organizationId],
        researchVehicleAllowlist: [fx.tenant.vehicleId],
        osmDataVersion: resolveOsmDataVersion(),
        limit: 10,
        now: new Date(),
      });
      const now = new Date();
      const [a, b] = await Promise.all([outbox.claimBatch(1, now), outbox.claimBatch(1, now)]);
      expect(a.length + b.length).toBe(1);
    } finally {
      restoreResearchTestEnv(envBackup);
    }
  });

  it('different bundle version key allows separate discover (version isolation contract)', async () => {
    const fx = await seedS4ResearchCompletedPrimaryFixture(db);
    tenants.push(fx.tenant);
    await db.$executeRaw`
      INSERT INTO di_v0_s4_research_runs_v1 (
        id, organization_id, vehicle_id, trip_id, work_item_id,
        research_bundle_version, geometry_projection_id,
        pinned_snapshot_hash, combined_input_identity,
        osm_context_key, osm_snapshot_sha256,
        research_status, independent_road_id_accuracy,
        summary_json, windows_json
      ) VALUES (
        ${randomUUID()}, ${fx.tenant.organizationId}, ${fx.tenant.vehicleId}, ${fx.tenant.tripId}, ${fx.workItemId},
        'DI_V0_S4_RESEARCH_BUNDLE_VERSION_FUTURE', 'S4_RESEARCH_LOCAL_EQUIRECTANGULAR_V2',
        ${fx.snapshotHash}, 'ci', NULL, NULL,
        'ROAD_CONTEXT_UNAVAILABLE', 'NOT_ASSESSABLE',
        '{}'::jsonb, '[]'::jsonb
      )`;
    const envBackup = applyResearchTestEnv(fx.tenant);
    try {
      const svc = mkSvc();
      const pass = await svc.runPass();
      expect(pass.discovered).toBe(1);
      const rows = await db.$queryRaw<Array<{ research_bundle_version: string }>>`
        SELECT research_bundle_version FROM di_v0_s4_research_runs_v1 WHERE trip_id = ${fx.tenant.tripId}`;
      expect(rows.some((r) => r.research_bundle_version === DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2)).toBe(true);
      expect(rows.some((r) => r.research_bundle_version === 'DI_V0_S4_RESEARCH_BUNDLE_VERSION_FUTURE')).toBe(true);
    } finally {
      restoreResearchTestEnv(envBackup);
    }
  });
});
