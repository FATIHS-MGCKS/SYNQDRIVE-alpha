import type { PrismaClient } from '@prisma/client';
import { DI_V0_S4_LIMITS } from '../../s4a-foundation/di-v0-s4a-contract';
import { parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { DiV0S4WorkItemRepository } from '../../s4a-foundation/di-v0-s4a-work-item.repository';
import { buildDiV0S4PipelineVersionKey } from '../../s4a-foundation/di-v0-s4a-identity';
import {
  advanceS4aClock,
  assertS4aPostgresCiEnv,
  changeTripBoundary,
  cleanupS4aTenant,
  newS4aClient,
  retireRegistry,
  S4A_POSTGRES_LIVE,
  s4aChannels,
  s4aConfigFor,
  s4aIntervals,
  s4aManifestFor,
  seedS4aTenant,
  setKillState,
  type S4aTenant,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DiV0S4DriftWatcherService } from '../di-v0-s4e-drift-watcher.service';
import { DiV0S4MaintenanceService } from '../di-v0-s4e-maintenance.service';
import { listDiV0S4RetiredPipelineVersionKeys } from '../di-v0-s4e-retired-pipeline-keys';

assertS4aPostgresCiEnv();

type ItemRow = {
  id: string;
  status: string;
  failure_class: string | null;
  failure_reason: string | null;
  lease_epoch: bigint;
  lease_owner: string | null;
  attempt_count: number;
  superseded_reason: string | null;
  pipeline_version_key: string;
};

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DI V0 S4E maintenance reapers (real PostgreSQL)', () => {
  let admin: PrismaClient;
  const tenants: S4aTenant[] = [];

  beforeAll(async () => {
    admin = newS4aClient();
    await admin.$queryRaw`SELECT 1`;
  }, 60_000);

  afterAll(async () => {
    await admin?.$disconnect().catch(() => undefined);
  });

  beforeEach(async () => {
    await setKillState(admin, 'NOT_KILLED');
    tenants.length = 0;
  });

  afterEach(async () => {
    await setKillState(admin, 'NOT_KILLED');
    for (const t of tenants) {
      await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE trip_id = ${t.tripId}`;
      await cleanupS4aTenant(admin, t);
    }
  });

  async function tenant(): Promise<S4aTenant> {
    const t = await seedS4aTenant(admin);
    tenants.push(t);
    return t;
  }

  function maintenance(config = s4aConfigFor(tenants)): DiV0S4MaintenanceService {
    const repo = new DiV0S4WorkItemRepository(admin, config);
    return new DiV0S4MaintenanceService(admin, repo, config);
  }

  function watcher(config = s4aConfigFor(tenants)): DiV0S4DriftWatcherService {
    const repo = new DiV0S4WorkItemRepository(admin, config);
    return new DiV0S4DriftWatcherService(admin, repo, config);
  }

  async function items(tripId: string): Promise<ItemRow[]> {
    return admin.$queryRaw<ItemRow[]>`
      SELECT id, status::text AS status, failure_class::text AS failure_class, failure_reason::text AS failure_reason,
        lease_epoch, lease_owner, attempt_count, superseded_reason::text AS superseded_reason, pipeline_version_key
      FROM di_v0_s4_work_items WHERE trip_id = ${tripId} ORDER BY id`;
  }

  async function primary(t: S4aTenant, config = s4aConfigFor(tenants)) {
    const manifest = s4aManifestFor(config);
    const repo = new DiV0S4WorkItemRepository(admin, config);
    const created = await repo.createWorkItem({
      tripId: t.tripId,
      sourceFamily: 'RUPTELA_R1',
      runPurpose: 'PRIMARY',
      pipelineManifest: manifest,
    });
    const pvk = buildDiV0S4PipelineVersionKey(manifest);
    return { repo, manifest, created, pvk };
  }

  async function seatExhaustedLeased(
    repo: DiV0S4WorkItemRepository,
    tripId: string,
    workItemId: string,
    manifest: ReturnType<typeof s4aManifestFor>,
  ): Promise<void> {
    for (let i = 0; i < DI_V0_S4_LIMITS.maxAttempts; i++) {
      await repo.claim({ leaseOwner: `ex-${i}`, pipelineManifest: manifest, workItemId });
      await advanceS4aClock(admin, tripId, DI_V0_S4_LIMITS.leaseDurationSeconds + 60);
    }
  }

  it('S4E2-M01 T10 normal exhaustion', async () => {
    const t = await tenant();
    const { repo, manifest, created } = await primary(t);
    await seatExhaustedLeased(repo, t.tripId, created.workItemId, manifest);
    const pass = await maintenance().runMaintenancePass();
    expect(pass.t10ReapedWorkItemIds).toContain(created.workItemId);
    const row = (await items(t.tripId))[0];
    expect(row.status).toBe('FAILED_TERMINAL');
    expect(row.failure_class).toBe('EXHAUSTED');
    expect(row.failure_reason).toBe('ATTEMPTS_EXHAUSTED');
  }, 60_000);

  it('S4E2-M02 active lease protected', async () => {
    const t = await tenant();
    const { repo, manifest, created } = await primary(t);
    await repo.claim({ leaseOwner: 'active', pipelineManifest: manifest, workItemId: created.workItemId });
    const before = await items(t.tripId);
    await maintenance().runMaintenancePass();
    expect(await items(t.tripId)).toEqual(before);
  }, 60_000);

  it('S4E2-M03 below max attempts protected', async () => {
    const t = await tenant();
    const { repo, manifest, created } = await primary(t);
    await repo.claim({ leaseOwner: 'a', pipelineManifest: manifest, workItemId: created.workItemId });
    await advanceS4aClock(admin, t.tripId, DI_V0_S4_LIMITS.leaseDurationSeconds + 60);
    await repo.claim({ leaseOwner: 'b', pipelineManifest: manifest, workItemId: created.workItemId });
    await advanceS4aClock(admin, t.tripId, DI_V0_S4_LIMITS.leaseDurationSeconds + 60);
    const before = await items(t.tripId);
    await maintenance().runMaintenancePass();
    expect(await items(t.tripId)).toEqual(before);
  }, 60_000);

  it('S4E2-M04 duplicate T10 reapers', async () => {
    const t = await tenant();
    const { repo, manifest, created } = await primary(t);
    await seatExhaustedLeased(repo, t.tripId, created.workItemId, manifest);
    const svc = maintenance();
    const [a, b] = await Promise.all([svc.runMaintenancePass(), svc.runMaintenancePass()]);
    expect(a.t10ReapedWorkItemIds.length + b.t10ReapedWorkItemIds.length).toBeGreaterThanOrEqual(1);
    expect((await items(t.tripId)).filter((r) => r.status === 'FAILED_TERMINAL')).toHaveLength(1);
  }, 60_000);

  it('S4E2-M05 stale holder after T10', async () => {
    const t = await tenant();
    const { repo, manifest, created } = await primary(t);
    const lease = await repo.claim({ leaseOwner: 'holder', pipelineManifest: manifest, workItemId: created.workItemId });
    for (let i = 1; i < DI_V0_S4_LIMITS.maxAttempts; i++) {
      await advanceS4aClock(admin, t.tripId, DI_V0_S4_LIMITS.leaseDurationSeconds + 60);
      await repo.claim({ leaseOwner: `h${i}`, pipelineManifest: manifest, workItemId: created.workItemId });
    }
    await advanceS4aClock(admin, t.tripId, DI_V0_S4_LIMITS.leaseDurationSeconds + 60);
    await maintenance().runMaintenancePass();
    await expect(
      repo.pinEvidence(lease, { windowStart: t.startTime, windowEnd: t.endTime, channels: s4aChannels('x') }),
    ).rejects.toThrow();
  }, 60_000);

  it('S4E2-M06 KILLED T10', async () => {
    const t = await tenant();
    const { repo, manifest, created } = await primary(t);
    await seatExhaustedLeased(repo, t.tripId, created.workItemId, manifest);
    await setKillState(admin, 'KILLED');
    const before = await items(t.tripId);
    await expect(maintenance().runMaintenancePass()).rejects.toThrow(/DB_KILL/);
    expect(await items(t.tripId)).toEqual(before);
  }, 60_000);

  it('S4E2-M07 T12 retired pending', async () => {
    const t = await tenant();
    const { created, pvk } = await primary(t);
    await retireRegistry(admin, pvk);
    const pass = await maintenance().runMaintenancePass();
    expect(pass.t12Results.some((r) => r.pipelineVersionKey === pvk && r.supersededWorkItemIds.includes(created.workItemId))).toBe(true);
    const row = (await items(t.tripId))[0];
    expect(row.status).toBe('SUPERSEDED');
    expect(row.superseded_reason).toBe('PIPELINE_RETIRED');
  }, 60_000);

  it('S4E2-M08 T12 retired retryable', async () => {
    const t = await tenant();
    const { repo, manifest, created, pvk } = await primary(t);
    const lease = await repo.claim({ leaseOwner: 'w', pipelineManifest: manifest, workItemId: created.workItemId });
    await repo.failRetryable(lease, 'POSITION_SOURCE_TIMEOUT');
    await retireRegistry(admin, pvk);
    await maintenance().runMaintenancePass();
    expect((await items(t.tripId))[0].status).toBe('SUPERSEDED');
  }, 60_000);

  it('S4E2-M09 T12 expired leased', async () => {
    const t = await tenant();
    const { repo, manifest, created, pvk } = await primary(t);
    await repo.claim({ leaseOwner: 'w', pipelineManifest: manifest, workItemId: created.workItemId });
    await advanceS4aClock(admin, t.tripId, DI_V0_S4_LIMITS.leaseDurationSeconds + 60);
    const epochBefore = (await items(t.tripId))[0].lease_epoch;
    await retireRegistry(admin, pvk);
    await maintenance().runMaintenancePass();
    const row = (await items(t.tripId))[0];
    expect(row.status).toBe('SUPERSEDED');
    expect(row.lease_epoch).toBeGreaterThan(epochBefore);
  }, 60_000);

  it('S4E2-M10 active leased protected on retired pipeline', async () => {
    const t = await tenant();
    const { repo, manifest, created, pvk } = await primary(t);
    await repo.claim({ leaseOwner: 'holder', pipelineManifest: manifest, workItemId: created.workItemId });
    await retireRegistry(admin, pvk);
    const before = await items(t.tripId);
    await maintenance().runMaintenancePass();
    expect(await items(t.tripId)).toEqual(before);
  }, 60_000);

  it('S4E2-M11 ACTIVE pipeline protected from T12', async () => {
    const t = await tenant();
    const { created, pvk } = await primary(t);
    const before = await items(t.tripId);
    await maintenance().runMaintenancePass();
    expect(await items(t.tripId)).toEqual(before);
    const keys = await listDiV0S4RetiredPipelineVersionKeys(admin, 50);
    expect(keys).not.toContain(pvk);
  }, 60_000);

  it('S4E2-M12 duplicate T12 reapers', async () => {
    const t = await tenant();
    const { pvk } = await primary(t);
    await retireRegistry(admin, pvk);
    const svc = maintenance();
    const [a, b] = await Promise.all([svc.runMaintenancePass(), svc.runMaintenancePass()]);
    const supers = a.t12Results.concat(b.t12Results).flatMap((r) => r.supersededWorkItemIds);
    expect(supers.length).toBeGreaterThanOrEqual(1);
    expect((await items(t.tripId)).filter((r) => r.status === 'SUPERSEDED')).toHaveLength(1);
  }, 60_000);

  it('S4E2-M13 stale holder after T12', async () => {
    const t = await tenant();
    const { repo, manifest, created, pvk } = await primary(t);
    const lease = await repo.claim({ leaseOwner: 'holder', pipelineManifest: manifest, workItemId: created.workItemId });
    await advanceS4aClock(admin, t.tripId, DI_V0_S4_LIMITS.leaseDurationSeconds + 60);
    await retireRegistry(admin, pvk);
    await maintenance().runMaintenancePass();
    await expect(
      repo.pinEvidence(lease, { windowStart: t.startTime, windowEnd: t.endTime, channels: s4aChannels('x') }),
    ).rejects.toThrow();
  }, 60_000);

  it('S4E2-M14 KILLED T12', async () => {
    const t = await tenant();
    const { pvk } = await primary(t);
    await retireRegistry(admin, pvk);
    await setKillState(admin, 'KILLED');
    const before = await items(t.tripId);
    await expect(maintenance().runMaintenancePass()).rejects.toThrow(/DB_KILL/);
    expect(await items(t.tripId)).toEqual(before);
  }, 60_000);

  it('S4E2-M15 mixed pipelines — only RETIRED processed', async () => {
    const t1 = await tenant();
    const t2 = await tenant();
    const config = s4aConfigFor(tenants);
    const activeManifest = s4aManifestFor(config, { calibrationBundleHash: 'sha256:S4E2_ACTIVE_PIPELINE_HASH' });
    const retiredManifest = s4aManifestFor(config, { calibrationBundleHash: 'sha256:S4E2_RETIRED_PIPELINE_HASH' });
    const activeRepo = new DiV0S4WorkItemRepository(admin, config);
    const retiredRepo = new DiV0S4WorkItemRepository(admin, config);
    await activeRepo.createWorkItem({
      tripId: t1.tripId,
      sourceFamily: 'RUPTELA_R1',
      runPurpose: 'PRIMARY',
      pipelineManifest: activeManifest,
    });
    const retiredCreated = await retiredRepo.createWorkItem({
      tripId: t2.tripId,
      sourceFamily: 'RUPTELA_R1',
      runPurpose: 'PRIMARY',
      pipelineManifest: retiredManifest,
    });
    const retiredPvk = buildDiV0S4PipelineVersionKey(retiredManifest);
    await retireRegistry(admin, retiredPvk);
    await maintenance(config).runMaintenancePass();
    expect((await items(t1.tripId))[0].status).toBe('PENDING');
    expect((await items(t2.tripId)).find((r) => r.id === retiredCreated.workItemId)?.status).toBe('SUPERSEDED');
  }, 60_000);

  it('S4E2-M16 bounded work batch per pipeline', async () => {
    const tripIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const t = await tenant();
      tripIds.push(t.tripId);
    }
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const pvk = buildDiV0S4PipelineVersionKey(manifest);
    const repo = new DiV0S4WorkItemRepository(admin, config);
    for (const tripId of tripIds) {
      await repo.createWorkItem({ tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest });
    }
    await retireRegistry(admin, pvk);
    const pass = await maintenance(config).runMaintenancePass({ t12PerPipelineLimit: 2 });
    const result = pass.t12Results.find((r) => r.pipelineVersionKey === pvk);
    expect(result?.supersededWorkItemIds.length).toBe(2);
    const all = await Promise.all(tripIds.map((id) => items(id)));
    const count = all.flat().filter((r) => r.status === 'SUPERSEDED').length;
    expect(count).toBe(2);
  }, 90_000);

  it('S4E2-M17 bounded retired pipeline enumeration', async () => {
    const config = s4aConfigFor(tenants);
    for (let i = 0; i < 5; i++) {
      const manifest = s4aManifestFor(config, { s4OrchestrationContractVersion: `V_TEST_${i}` });
      const pvk = buildDiV0S4PipelineVersionKey(manifest);
      await admin.$executeRaw`
        INSERT INTO di_v0_s4_pipeline_versions (pipeline_version_key, manifest, status, retired_at, retired_by, retired_reason)
        VALUES (${pvk}, '{}'::jsonb, 'RETIRED', now(), 'S4E2_TEST', 'S4E2_TEST')
        ON CONFLICT (pipeline_version_key) DO UPDATE SET status = 'RETIRED'`;
    }
    const keys = await listDiV0S4RetiredPipelineVersionKeys(admin, 3);
    expect(keys.length).toBe(3);
    const pass = await maintenance(config).runMaintenancePass({ t12PipelineLimit: 3 });
    expect(pass.retiredPipelinesConsidered).toBe(3);
  }, 60_000);

  it('S4E2-M18 empty work — clean no-op', async () => {
    const pass = await maintenance().runMaintenancePass();
    expect(pass.t10NoWork).toBe(true);
    expect(pass.t10ReapedWorkItemIds).toEqual([]);
  }, 60_000);

  it('S4E2-M19 T11/T12 race — no durable active PRIMARY under RETIRED pipeline', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const { repo, manifest, created, pvk } = await primary(t, config);
    await changeTripBoundary(admin, t.tripId);
    await retireRegistry(admin, pvk);
    const svc = maintenance(config);
    const drift = watcher(config);
    await Promise.all([
      repo.supersedeOnDrift({ workItemId: created.workItemId, reason: 'BOUNDARY_CHANGED' }),
      svc.runMaintenancePass(),
      drift.runDriftWatchPass(),
    ]);
    const rows = await admin.$queryRaw<Array<{ status: string; pipeline_version_key: string }>>`
      SELECT status::text AS status, pipeline_version_key FROM di_v0_s4_work_items
      WHERE trip_id = ${t.tripId} AND pipeline_version_key = ${pvk}
        AND status IN ('PENDING', 'LEASED', 'COMPLETED')`;
    expect(rows).toHaveLength(0);
  }, 60_000);

  it('S4E2-M20 T10/T11 race — single valid terminal/superseded outcome', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const { repo, manifest, created } = await primary(t, config);
    await seatExhaustedLeased(repo, t.tripId, created.workItemId, manifest);
    await changeTripBoundary(admin, t.tripId);
    const svc = maintenance(config);
    const drift = watcher(config);
    await Promise.all([svc.runMaintenancePass(), drift.runDriftWatchPass()]);
    const rows = await items(t.tripId);
    const terminal = rows.filter((r) => r.status === 'FAILED_TERMINAL' || r.status === 'SUPERSEDED');
    expect(terminal.length).toBeGreaterThanOrEqual(1);
    expect(rows.filter((r) => r.status === 'LEASED')).toHaveLength(0);
  }, 60_000);

  it('S4E2-M21 evidence preservation', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const { repo, manifest, created, pvk } = await primary(t, config);
    const lease = await repo.claim({ leaseOwner: 's4e2', pipelineManifest: manifest, workItemId: created.workItemId });
    await repo.pinEvidence(lease, { windowStart: t.startTime, windowEnd: t.endTime, channels: s4aChannels('ev') });
    await repo.completeWithS2(lease, { pipelineManifest: manifest, intervals: s4aIntervals() });
    const runsBefore = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM di_v0_shadow_runs WHERE trip_id = ${t.tripId}`;
    const snapBefore = await admin.$queryRaw<Array<{ snapshot_hash: string }>>`
      SELECT snapshot_hash FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${t.tripId}`;
    await retireRegistry(admin, pvk);
    await maintenance(config).runMaintenancePass();
    const runsAfter = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM di_v0_shadow_runs WHERE trip_id = ${t.tripId}`;
    const snapAfter = await admin.$queryRaw<Array<{ snapshot_hash: string }>>`
      SELECT snapshot_hash FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${t.tripId}`;
    expect(runsAfter.map((r) => r.id).sort()).toEqual(runsBefore.map((r) => r.id).sort());
    expect(snapAfter.map((r) => r.snapshot_hash).sort()).toEqual(snapBefore.map((r) => r.snapshot_hash).sort());
  }, 90_000);
});
