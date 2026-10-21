import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { DI_V0_S4_LIMITS } from '../di-v0-s4a-contract';
import { parseDiV0S4ControlPlaneConfig } from '../di-v0-s4a-control-plane';
import { DiV0S4WorkItemRepository } from '../di-v0-s4a-work-item.repository';
import {
  classifyDiV0S4SettlementPolicySegment,
  quietSecondsBetweenEligibleAndAnchor,
} from '../di-v0-s4-settlement-policy-segment';
import { DiV0S4DiscoveryService } from '../../s4b-orchestration/di-v0-s4b-discovery.service';
import { DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS } from '../../s4b-orchestration/di-v0-s4b-discovery-containment';
import { buildDiV0S4RuntimePipelineManifest } from '../../s4b-orchestration/di-v0-s4b-pipeline-manifest';
import {
  assertS4aPostgresCiEnv,
  changeTripBoundary,
  cleanupS4aTenant,
  newS4aClient,
  s4aManifestFor,
  seedS4aTenant,
  setKillState,
  type S4aTenant,
} from './di-v0-s4a-postgres-harness';

assertS4aPostgresCiEnv();

const LIVE = process.env.DI_V0_S4A_POSTGRES_INTEGRATION === '1' && !!process.env.DATABASE_URL;
(LIVE ? describe : describe.skip)('DI V0 S4A near-realtime settlement (PostgreSQL)', () => {
  let admin: PrismaClient;
  const clients: PrismaClient[] = [];
  let tenants: S4aTenant[] = [];

  const client = (): PrismaClient => {
    const c = newS4aClient();
    clients.push(c);
    return c;
  };

  beforeAll(async () => {
    admin = newS4aClient();
    await admin.$queryRaw`SELECT 1`;
  }, 60_000);

  afterAll(async () => {
    for (const c of clients) await c.$disconnect().catch(() => undefined);
    await admin?.$disconnect().catch(() => undefined);
  });

  beforeEach(async () => {
    await setKillState(admin, 'NOT_KILLED');
    tenants = [];
  });

  afterEach(async () => {
    for (const t of tenants) {
      await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${t.vehicleId}`;
      await admin.$executeRaw`DELETE FROM trip_repairs WHERE vehicle_id = ${t.vehicleId}`;
      await cleanupS4aTenant(admin, t);
    }
  });

  async function tenant(ageSeconds = 3 * 86_400): Promise<S4aTenant> {
    const t = await seedS4aTenant(admin, ageSeconds);
    tenants.push(t);
    return t;
  }

  function configFor(allowed: readonly S4aTenant[]) {
    return parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_DISCOVERY_ENABLED: 'true',
      DI_V0_S4_WORKER_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
      DI_V0_S4_ORGANIZATION_ALLOWLIST: allowed.map((x) => x.organizationId).join(','),
      DI_V0_S4_VEHICLE_ALLOWLIST: allowed.map((x) => x.vehicleId).join(','),
    });
  }

  it('NR01 migration keeps legacy +86400s rows and accepts +600s inserts', async () => {
    const t = await tenant();
    const anchor = new Date(Date.now() - 2 * 86_400_000);
    const eligibleLegacy = new Date(anchor.getTime() + 86_400_000);
    const pvk = 'DI_V0_S4_PIPELINE_V1:sha256:' + 'f'.repeat(64);
    await admin.$executeRaw`
      INSERT INTO di_v0_s4_pipeline_versions (pipeline_version_key, manifest, status)
      VALUES (${pvk}, '{}'::jsonb, 'ACTIVE') ON CONFLICT DO NOTHING`;
    await admin.$executeRaw`
      INSERT INTO di_v0_s4_work_items (
        id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
        boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status,
        superseded_reason, superseded_at, next_attempt_at, settlement_anchor_at, eligible_at
      ) VALUES (
        ${randomUUID()}, ${t.organizationId}, ${t.vehicleId}, ${t.tripId}, 'UNKNOWN', 'PRIMARY', 'PRIMARY',
        'DI_V0_S4_BOUNDARY_FP_V1:sha256:' || repeat('a', 64), 0, ${pvk}, '{}'::jsonb, 'SUPERSEDED',
        'OPERATOR', clock_timestamp(), NULL, ${anchor}, ${eligibleLegacy}
      )`;
    const config = configFor([t]);
    const manifest = s4aManifestFor(config);
    const repo = new DiV0S4WorkItemRepository(admin, config);
    const created = await repo.createWorkItem({
      tripId: t.tripId,
      sourceFamily: 'UNKNOWN',
      runPurpose: 'PRIMARY',
      pipelineManifest: manifest,
    });
    const rows = await admin.$queryRaw<
      Array<{ id: string; status: string; settlement_anchor_at: Date; eligible_at: Date }>
    >`SELECT id, status, settlement_anchor_at, eligible_at FROM di_v0_s4_work_items WHERE trip_id = ${t.tripId} ORDER BY created_at`;
    expect(rows).toHaveLength(2);
    const legacy = rows.find((r) => r.status === 'SUPERSEDED')!;
    const modern = rows.find((r) => r.id === created.workItemId)!;
    expect(classifyDiV0S4SettlementPolicySegment(quietSecondsBetweenEligibleAndAnchor(legacy.eligible_at, legacy.settlement_anchor_at))).toBe(
      'LEGACY_86400',
    );
    expect(
      classifyDiV0S4SettlementPolicySegment(quietSecondsBetweenEligibleAndAnchor(modern.eligible_at, modern.settlement_anchor_at)),
    ).toBe('NEAR_REALTIME_600');
    expect(quietSecondsBetweenEligibleAndAnchor(modern.eligible_at, modern.settlement_anchor_at)).toBe(
      DI_V0_S4_LIMITS.settlementQuietPeriodSeconds,
    );
  }, 60_000);

  it('NR02 rollback schema: strict +24h CHECK rejects 600s rows (production code rollback risk documented)', async () => {
    const t = await tenant();
    const anchor = new Date();
    const eligible600 = new Date(anchor.getTime() + 600_000);
    const pvk = 'DI_V0_S4_PIPELINE_V1:sha256:' + 'e'.repeat(64);
    await admin.$executeRaw`INSERT INTO di_v0_s4_pipeline_versions (pipeline_version_key, manifest, status) VALUES (${pvk}, '{}'::jsonb, 'ACTIVE')`;
    try {
      await admin.$executeRaw`ALTER TABLE di_v0_s4_work_items DROP CONSTRAINT IF EXISTS di_v0_s4_wi_eligible_ck`;
      await admin.$executeRaw`ALTER TABLE di_v0_s4_work_items ADD CONSTRAINT di_v0_s4_wi_eligible_ck_sim_legacy
        CHECK (eligible_at = settlement_anchor_at + interval '24 hours')`;
      await expect(
        admin.$executeRaw`
          INSERT INTO di_v0_s4_work_items (
            id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
            boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status,
            next_attempt_at, settlement_anchor_at, eligible_at
          ) VALUES (
            ${randomUUID()}, ${t.organizationId}, ${t.vehicleId}, ${t.tripId}, 'UNKNOWN', 'PRIMARY', 'PRIMARY',
            'DI_V0_S4_BOUNDARY_FP_V1:sha256:' || repeat('b', 64), 0, ${pvk}, '{}'::jsonb, 'PENDING',
            ${eligible600}, ${anchor}, ${eligible600}
          )`,
      ).rejects.toThrow();
    } finally {
      await admin.$executeRaw`ALTER TABLE di_v0_s4_work_items DROP CONSTRAINT IF EXISTS di_v0_s4_wi_eligible_ck_sim_legacy`;
      await admin.$executeRaw`ALTER TABLE di_v0_s4_work_items DROP CONSTRAINT IF EXISTS di_v0_s4_wi_eligible_ck`;
      await admin.$executeRaw`ALTER TABLE di_v0_s4_work_items ADD CONSTRAINT di_v0_s4_wi_eligible_ck CHECK (
        eligible_at >= settlement_anchor_at AND eligible_at <= settlement_anchor_at + interval '24 hours')`;
    }
  }, 60_000);

  it('NR03 T01 CREATE schedules next_attempt_at at anchor + 600s', async () => {
    const t = await tenant();
    const config = configFor([t]);
    const manifest = s4aManifestFor(config);
    const repo = new DiV0S4WorkItemRepository(admin, config);
    await repo.createWorkItem({ tripId: t.tripId, sourceFamily: 'UNKNOWN', runPurpose: 'PRIMARY', pipelineManifest: manifest });
    const [row] = await admin.$queryRaw<Array<{ quiet_s: number; claimable: boolean }>>`
      SELECT extract(epoch FROM (eligible_at - settlement_anchor_at))::float8 AS quiet_s,
        (next_attempt_at <= clock_timestamp()) AS claimable
      FROM di_v0_s4_work_items WHERE trip_id = ${t.tripId}`;
    expect(row.quiet_s).toBeCloseTo(DI_V0_S4_LIMITS.settlementQuietPeriodSeconds, 0);
    expect(row.claimable).toBe(true);
  }, 60_000);

  it('NR04 T11 successor uses +600s eligibility', async () => {
    const t = await tenant();
    const config = configFor([t]);
    const manifest = s4aManifestFor(config);
    const repo = new DiV0S4WorkItemRepository(admin, config);
    const created = await repo.createWorkItem({
      tripId: t.tripId,
      sourceFamily: 'UNKNOWN',
      runPurpose: 'PRIMARY',
      pipelineManifest: manifest,
    });
    await changeTripBoundary(admin, t.tripId);
    const { successorWorkItemId } = await repo.supersedeOnDrift({ workItemId: created.workItemId, reason: 'BOUNDARY_CHANGED' });
    expect(successorWorkItemId).toBeTruthy();
    const [row] = await admin.$queryRaw<Array<{ quiet_s: number }>>`
      SELECT extract(epoch FROM (eligible_at - settlement_anchor_at))::float8 AS quiet_s
      FROM di_v0_s4_work_items WHERE id = ${successorWorkItemId}`;
    expect(row.quiet_s).toBeCloseTo(DI_V0_S4_LIMITS.settlementQuietPeriodSeconds, 0);
  }, 60_000);

  it('NR05 discovery excludes trip inside quiet period and NR06 includes settled trip', async () => {
    const fresh = await tenant(120);
    const settled = await tenant();
    const config = configFor([fresh, settled]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const discovery = new DiV0S4DiscoveryService(
      admin,
      new DiV0S4WorkItemRepository(client(), config),
      config,
      pipeline,
      DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS,
    );
    const pass = await discovery.runDiscoveryPass();
    expect(pass.created).toBe(1);
    expect(pass.candidates).toBe(1);
    const counts = await admin.$queryRaw<Array<{ vehicle_id: string; n: bigint }>>`
      SELECT vehicle_id, count(*)::bigint AS n FROM di_v0_s4_work_items
      WHERE vehicle_id = ANY(${[fresh.vehicleId, settled.vehicleId]}::text[]) GROUP BY vehicle_id`;
    const byVehicle = new Map(counts.map((c) => [c.vehicle_id, Number(c.n)]));
    expect(byVehicle.get(fresh.vehicleId) ?? 0).toBe(0);
    expect(byVehicle.get(settled.vehicleId) ?? 0).toBe(1);
  }, 60_000);

  it('NR07 claim succeeds when next_attempt_at is due', async () => {
    const t = await tenant();
    const config = configFor([t]);
    const manifest = s4aManifestFor(config);
    const repo = new DiV0S4WorkItemRepository(admin, config);
    const created = await repo.createWorkItem({
      tripId: t.tripId,
      sourceFamily: 'UNKNOWN',
      runPurpose: 'PRIMARY',
      pipelineManifest: manifest,
    });
    const claim = await repo.claim({ leaseOwner: 'nr07-claim', pipelineManifest: manifest, workItemId: created.workItemId });
    expect(claim.workItemId).toBe(created.workItemId);
  }, 60_000);

  it('NR08 APPLIED trip repair moves anchor and blocks discovery until new quiet elapses', async () => {
    const t = await tenant();
    await admin.$executeRaw`
      INSERT INTO trip_repairs (id, vehicle_id, trip_id, repair_type, status, reason, confidence, window_from, window_to, applied_at, created_at)
      VALUES (${randomUUID()}, ${t.vehicleId}, ${t.tripId}, 'MISSING_END', 'APPLIED', 'NR08', 'HIGH',
        (now() AT TIME ZONE 'UTC') - interval '4 days', (now() AT TIME ZONE 'UTC') - interval '3 days',
        (now() AT TIME ZONE 'UTC') - interval '2 minutes', (now() AT TIME ZONE 'UTC'))`;
    const config = configFor([t]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const discovery = new DiV0S4DiscoveryService(
      admin,
      new DiV0S4WorkItemRepository(client(), config),
      config,
      pipeline,
      DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS,
    );
    await expect(discovery.runDiscoveryPass()).resolves.toMatchObject({ created: 0, candidates: 0 });
  }, 60_000);

  it('NR09 duplicate discovery is idempotent (active PRIMARY unique)', async () => {
    const t = await tenant();
    const config = configFor([t]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const discovery = new DiV0S4DiscoveryService(
      admin,
      new DiV0S4WorkItemRepository(client(), config),
      config,
      pipeline,
      DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS,
    );
    await expect(discovery.runDiscoveryPass()).resolves.toMatchObject({ created: 1 });
    await expect(discovery.runDiscoveryPass()).resolves.toMatchObject({ created: 0, candidates: 0 });
    const [{ n }] = await admin.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM di_v0_s4_work_items
      WHERE trip_id = ${t.tripId} AND run_purpose = 'PRIMARY' AND status <> 'SUPERSEDED'`;
    expect(Number(n)).toBe(1);
  }, 60_000);
});
