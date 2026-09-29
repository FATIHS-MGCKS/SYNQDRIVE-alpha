import type { PrismaClient } from '@prisma/client';
import { parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { DiV0S4WorkItemRepository } from '../../s4a-foundation/di-v0-s4a-work-item.repository';
import { buildDiV0S4PipelineVersionKey } from '../../s4a-foundation/di-v0-s4a-identity';
import {
  assertS4aPostgresCiEnv,
  changeTripBoundary,
  cleanupS4aTenant,
  currentFingerprint,
  newS4aClient,
  retireRegistry,
  S4A_POSTGRES_LIVE,
  s4aChannels,
  s4aConfigFor,
  s4aIntervals,
  s4aManifestFor,
  seedS4aSnapshot,
  seedS4aTenant,
  setKillState,
  type S4aTenant,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { countDiV0S4DriftWatchCandidatesInHorizon as countHorizon } from '../di-v0-s4e-drift-candidates';
import { DiV0S4DriftWatcherService } from '../di-v0-s4e-drift-watcher.service';

assertS4aPostgresCiEnv();

type ItemRow = {
  id: string;
  status: string;
  boundary_fingerprint: string;
  boundary_occurrence: number;
  lease_epoch: bigint;
  superseded_reason: string | null;
  superseded_by_work_item_id: string | null;
  run_purpose: string;
};

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DI V0 S4E drift watcher (real PostgreSQL)', () => {
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

  function watcher(config = s4aConfigFor(tenants)): DiV0S4DriftWatcherService {
    const repo = new DiV0S4WorkItemRepository(admin, config);
    return new DiV0S4DriftWatcherService(admin, repo, config);
  }

  async function items(tripId: string): Promise<ItemRow[]> {
    return admin.$queryRaw<ItemRow[]>`
      SELECT id, status, boundary_fingerprint, boundary_occurrence, lease_epoch, superseded_reason,
        superseded_by_work_item_id, run_purpose::text AS run_purpose
      FROM di_v0_s4_work_items WHERE trip_id = ${tripId} ORDER BY boundary_occurrence, id`;
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
    return { repo, manifest, created };
  }

  it('S4E-D01 unchanged boundary — no T11', async () => {
    const t = await tenant();
    const { created } = await primary(t);
    const before = await items(t.tripId);
    const pass = await watcher().runDriftWatchPass();
    expect(pass.superseded).toBe(0);
    const after = await items(t.tripId);
    expect(after).toEqual(before);
    expect(after[0].lease_epoch).toBe(before[0].lease_epoch);
  }, 60_000);

  it('S4E-D02 completed boundary changed — supersede + successor PRIMARY', async () => {
    const t = await tenant();
    const { created } = await primary(t);
    await changeTripBoundary(admin, t.tripId);
    const pass = await watcher().runDriftWatchPass();
    expect(pass.superseded).toBe(1);
    const rows = await items(t.tripId);
    expect(rows.filter((r) => r.status === 'SUPERSEDED')).toHaveLength(1);
    expect(rows.filter((r) => r.status === 'PENDING')).toHaveLength(1);
    const active = rows.find((r) => r.status === 'PENDING')!;
    expect(active.boundary_occurrence).toBe(1);
    expect(active.superseded_by_work_item_id).toBeNull();
    const fp = await currentFingerprint(admin, t.tripId);
    expect(active.boundary_fingerprint).toBe(fp);
    expect(rows[0].superseded_reason).toBe('BOUNDARY_CHANGED');
  }, 60_000);

  it('S4E-D03 boundary revert — fresh occurrence, one active PRIMARY', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const { created } = await primary(t, config);
    const fp1 = created.boundaryFingerprint;
    await changeTripBoundary(admin, t.tripId);
    await watcher(config).runDriftWatchPass();
    await admin.$executeRaw`UPDATE vehicle_trips SET end_time = end_time - interval '5 minutes' WHERE id = ${t.tripId}`;
    await watcher(config).runDriftWatchPass();
    const rows = await items(t.tripId);
    const active = rows.filter((r) => r.status !== 'SUPERSEDED');
    expect(active).toHaveLength(1);
    expect(active[0].boundary_fingerprint).toBe(fp1);
    expect(active[0].boundary_occurrence).toBe(2);
  }, 60_000);

  it('S4E-D04 active lease race — T11 fences stale holder', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const { repo, manifest } = await primary(t, config);
    const lease = await repo.claim({ leaseOwner: 's4e-lease', pipelineManifest: manifest });
    await changeTripBoundary(admin, t.tripId);
    await watcher(config).runDriftWatchPass();
    const rows = await items(t.tripId);
    const superseded = rows.find((r) => r.status === 'SUPERSEDED')!;
    expect(superseded.lease_epoch).toBeGreaterThan(lease.leaseEpoch);
    await expect(repo.pinEvidence(lease, { windowStart: t.startTime, windowEnd: t.endTime, channels: s4aChannels('x') })).rejects.toThrow();
  }, 60_000);

  it('S4E-D05 two drift watchers race — at most one successor PRIMARY', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    await primary(t, config);
    await changeTripBoundary(admin, t.tripId);
    const w = watcher(config);
    const [a, b] = await Promise.all([w.runDriftWatchPass(), w.runDriftWatchPass()]);
    expect(a.superseded + b.superseded).toBeGreaterThanOrEqual(1);
    const rows = await items(t.tripId);
    expect(rows.filter((r) => r.status === 'PENDING' || r.status === 'LEASED')).toHaveLength(1);
  }, 60_000);

  it('S4E-D06 DB KILLED — zero mutation', async () => {
    const t = await tenant();
    const { created } = await primary(t);
    await changeTripBoundary(admin, t.tripId);
    await setKillState(admin, 'KILLED');
    const before = await items(t.tripId);
    await watcher().runDriftWatchPass();
    expect(await items(t.tripId)).toEqual(before);
  }, 60_000);

  it('S4E-D07 maintenance disabled (master off) — zero mutation', async () => {
    const t = await tenant();
    const config = parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'false' });
    await primary(t, s4aConfigFor(tenants));
    await changeTripBoundary(admin, t.tripId);
    const before = await items(t.tripId);
    const pass = await watcher(config).runDriftWatchPass();
    expect(pass.configured).toBe(false);
    expect(await items(t.tripId)).toEqual(before);
  }, 60_000);

  it('S4E-D08 outside 10-day horizon — excluded from scan', async () => {
    const t = await seedS4aTenant(admin, 12 * 86_400);
    tenants.push(t);
    await primary(t);
    await changeTripBoundary(admin, t.tripId);
    expect(await countHorizon(admin)).toBe(0);
    const pass = await watcher().runDriftWatchPass();
    expect(pass.superseded).toBe(0);
    expect((await items(t.tripId))[0].status).not.toBe('SUPERSEDED');
  }, 60_000);

  it('S4E-D09 cancelled trip — supersede without successor', async () => {
    const t = await tenant();
    const { created } = await primary(t);
    await admin.$executeRaw`UPDATE vehicle_trips SET trip_status = 'CANCELLED'::"TripStatus" WHERE id = ${t.tripId}`;
    await changeTripBoundary(admin, t.tripId);
    await watcher().runDriftWatchPass();
    const rows = await items(t.tripId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('SUPERSEDED');
    expect(rows[0].superseded_reason).toBe('TRIP_CANCELLED');
  }, 60_000);

  it('S4E-D10 reverted to ongoing — TRIP_NOT_COMPLETED, no successor', async () => {
    const t = await tenant();
    await primary(t);
    await admin.$executeRaw`UPDATE vehicle_trips SET trip_status = 'ONGOING', end_time = NULL WHERE id = ${t.tripId}`;
    const pass = await watcher().runDriftWatchPass();
    expect(pass.superseded).toBe(1);
    const rows = await items(t.tripId);
    expect(rows).toHaveLength(1);
    expect(rows[0].superseded_reason).toBe('TRIP_NOT_COMPLETED');
  }, 60_000);

  it('S4E-D11 non-PRIMARY replay — no successor PRIMARY', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const snap = await seedS4aSnapshot(admin, t, 'replay-pin');
    const repo = new DiV0S4WorkItemRepository(admin, config);
    const created = await repo.createWorkItem({
      tripId: t.tripId,
      sourceFamily: 'RUPTELA_R1',
      runPurpose: 'RECALIBRATION_REPLAY',
      replaySourceSnapshotHash: snap,
      pipelineManifest: manifest,
    });
    await changeTripBoundary(admin, t.tripId);
    await watcher(config).runDriftWatchPass();
    const rows = await items(t.tripId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('SUPERSEDED');
    expect(rows[0].run_purpose).toBe('RECALIBRATION_REPLAY');
  }, 60_000);

  it('S4E-D12 pipeline retired — supersede without successor', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const { manifest, created } = await primary(t, config);
    const pvk = buildDiV0S4PipelineVersionKey(manifest);
    await retireRegistry(admin, pvk);
    await changeTripBoundary(admin, t.tripId);
    await watcher(config).runDriftWatchPass();
    const rows = await items(t.tripId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('SUPERSEDED');
    expect(rows[0].superseded_by_work_item_id).toBeNull();
  }, 60_000);

  it('S4E-D14 duplicate tick — idempotent when unchanged', async () => {
    const t = await tenant();
    await primary(t);
    const a = await watcher().runDriftWatchPass();
    const b = await watcher().runDriftWatchPass();
    expect(a.superseded).toBe(0);
    expect(b.superseded).toBe(0);
  }, 60_000);

  it('S4E-D15 S2/history preserved on COMPLETED supersession', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const { repo, manifest } = await primary(t, config);
    const lease = await repo.claim({ leaseOwner: 's4e-complete', pipelineManifest: manifest });
    await repo.pinEvidence(lease, { windowStart: t.startTime, windowEnd: t.endTime, channels: s4aChannels('done') });
    await repo.completeWithS2(lease, { pipelineManifest: manifest, intervals: s4aIntervals() });
    const runsBefore = await admin.$queryRaw<Array<{ id: string }>>`SELECT id FROM di_v0_shadow_runs WHERE trip_id = ${t.tripId}`;
    const pinBefore = await admin.$queryRaw<Array<{ pinned_snapshot_hash: string | null }>>`
      SELECT pinned_snapshot_hash FROM di_v0_s4_work_items WHERE trip_id = ${t.tripId} AND status = 'COMPLETED'`;
    await changeTripBoundary(admin, t.tripId);
    await watcher(config).runDriftWatchPass();
    const runsAfter = await admin.$queryRaw<Array<{ id: string }>>`SELECT id FROM di_v0_shadow_runs WHERE trip_id = ${t.tripId}`;
    expect(runsAfter.map((r) => r.id).sort()).toEqual(runsBefore.map((r) => r.id).sort());
    const superseded = await admin.$queryRaw<Array<{ pinned_snapshot_hash: string | null }>>`
      SELECT pinned_snapshot_hash FROM di_v0_s4_work_items WHERE trip_id = ${t.tripId} AND status = 'SUPERSEDED'`;
    expect(superseded[0]?.pinned_snapshot_hash).toBe(pinBefore[0]?.pinned_snapshot_hash);
  }, 90_000);
});
