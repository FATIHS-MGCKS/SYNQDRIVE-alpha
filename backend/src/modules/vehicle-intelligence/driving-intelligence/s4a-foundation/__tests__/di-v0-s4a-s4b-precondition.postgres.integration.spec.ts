import { PrismaClient } from '@prisma/client';
import { buildDiV0S4PipelineVersionKey } from '../di-v0-s4a-identity';
import { DiV0S4WorkItemRepository, type DiV0S4Lease } from '../di-v0-s4a-work-item.repository';
import {
  assertS4aPostgresCiEnv,
  changeTripBoundary,
  cleanupS4aTenant,
  currentFingerprint,
  newS4aClient,
  raceThroughControlGate,
  retireRegistry,
  S4A_POSTGRES_LIVE,
  s4aChannels,
  s4aConfigFor,
  s4aIntervals,
  s4aManifestFor,
  seedS4aTenant,
  setKillState,
  type S4aTenant,
} from './di-v0-s4a-postgres-harness';

assertS4aPostgresCiEnv();

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DI V0 S4B precondition Postgres (boundary occurrence + T13)', () => {
  const clients = new Map<string, PrismaClient>();
  let admin: PrismaClient;
  let observer: PrismaClient;
  let tenant: S4aTenant;
  const salt = () => `sha256:S4B_${tenant.tripId}`;

  const client = (actor: string): PrismaClient => {
    let c = clients.get(actor);
    if (!c) {
      c = newS4aClient();
      clients.set(actor, c);
    }
    return c;
  };

  beforeAll(async () => {
    admin = newS4aClient();
    observer = newS4aClient();
    await admin.$queryRaw`SELECT 1`;
  }, 60_000);

  afterAll(async () => {
    for (const c of clients.values()) await c.$disconnect().catch(() => undefined);
    await admin?.$disconnect().catch(() => undefined);
    await observer?.$disconnect().catch(() => undefined);
  });

  beforeEach(async () => {
    await setKillState(admin, 'NOT_KILLED');
    tenant = await seedS4aTenant(admin);
  });

  afterEach(async () => {
    await setKillState(admin, 'NOT_KILLED');
    await cleanupS4aTenant(admin, tenant);
  });

  async function primaryRepo(actor = 'd1') {
    const config = s4aConfigFor([tenant]);
    const manifest = s4aManifestFor(config, { calibrationBundleHash: salt() });
    const repo = new DiV0S4WorkItemRepository(client(actor), config);
    return { repo, manifest, config };
  }

  async function tripItems() {
    return admin.$queryRaw<
      Array<{
        id: string;
        status: string;
        boundary_fingerprint: string;
        boundary_occurrence: number;
        execution_identity: string | null;
        superseded_by_work_item_id: string | null;
      }>
    >`SELECT id, status, boundary_fingerprint, boundary_occurrence, execution_identity, superseded_by_work_item_id
      FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId} ORDER BY boundary_occurrence`;
  }

  async function createPrimary() {
    const { repo, manifest } = await primaryRepo();
    const created = await repo.createWorkItem({
      tripId: tenant.tripId,
      sourceFamily: 'RUPTELA_R1',
      runPurpose: 'PRIMARY',
      pipelineManifest: manifest,
    });
    return { repo, manifest, created };
  }

  async function driftToNext(repo: DiV0S4WorkItemRepository, workItemId: string) {
    await changeTripBoundary(admin, tenant.tripId);
    return repo.supersedeOnDrift({ workItemId, reason: 'BOUNDARY_CHANGED' });
  }

  async function leasedPinned(manifest: ReturnType<typeof s4aManifestFor>) {
    const { repo } = await primaryRepo();
    await repo.createWorkItem({ tripId: tenant.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest });
    const lease = await repo.claim({ leaseOwner: 'w-s4b', pipelineManifest: manifest });
    await repo.pinEvidence(lease, { windowStart: tenant.startTime, windowEnd: tenant.endTime, channels: s4aChannels('snap-s4b') });
    return { repo, lease };
  }

  it('BR01 F1→F2→F1 yields active PRIMARY at F1 occurrence 2', async () => {
    const fp1 = await currentFingerprint(admin, tenant.tripId);
    const { repo, manifest, created } = await createPrimary();
    const w1 = await driftToNext(repo, created.workItemId);
    await admin.$executeRaw`UPDATE vehicle_trips SET end_time = end_time - interval '2 minutes' WHERE id = ${tenant.tripId}`;
    const w2 = await driftToNext(repo, w1.successorWorkItemId!);
    const items = await tripItems();
    const active = items.filter((i) => i.status !== 'SUPERSEDED');
    expect(active).toHaveLength(1);
    expect(active[0].boundary_fingerprint).toBe(fp1);
    expect(active[0].boundary_occurrence).toBe(2);
    expect(w2.successorWorkItemId).toBe(active[0].id);
  }, 60_000);

  it('BR02 F1→F2→F3→F1 ends at occurrence 3 on restored F1', async () => {
    const fp1 = await currentFingerprint(admin, tenant.tripId);
    const { repo, created } = await createPrimary();
    let id = created.workItemId;
    for (let i = 0; i < 3; i++) {
      const next = await driftToNext(repo, id);
      expect(next.successorWorkItemId).not.toBeNull();
      id = next.successorWorkItemId!;
      if (i < 2) await admin.$executeRaw`UPDATE vehicle_trips SET end_time = end_time - interval '1 minute' WHERE id = ${tenant.tripId}`;
    }
    const items = await tripItems();
    expect(items.map((r) => r.boundary_occurrence)).toEqual([0, 1, 2, 3]);
    const active = items.find((i) => i.status !== 'SUPERSEDED');
    expect(active?.boundary_fingerprint).toBe(fp1);
    expect(active?.boundary_occurrence).toBe(3);
  }, 60_000);

  it('BR03 concurrent duplicate discovery after revert yields one active PRIMARY', async () => {
    const { repo, manifest, created } = await createPrimary();
    const first = await driftToNext(repo, created.workItemId);
    await admin.$executeRaw`UPDATE vehicle_trips SET end_time = end_time - interval '2 minutes' WHERE id = ${tenant.tripId}`;
    await driftToNext(repo, first.successorWorkItemId!);
    const config = s4aConfigFor([tenant]);
    const repoA = new DiV0S4WorkItemRepository(client('a'), config);
    const repoB = new DiV0S4WorkItemRepository(client('b'), config);
    const step = () =>
      repoA.createWorkItem({ tripId: tenant.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest });
    const outcomes = await raceThroughControlGate(client('gate'), observer, [step, () => repoB.createWorkItem({
      tripId: tenant.tripId,
      sourceFamily: 'RUPTELA_R1',
      runPurpose: 'PRIMARY',
      pipelineManifest: manifest,
    })]);
    const successes = outcomes.filter((o) => o.ok).length;
    expect(successes).toBeGreaterThanOrEqual(1);
    const active = (await tripItems()).filter((i) => i.status !== 'SUPERSEDED');
    expect(active.length).toBeLessThanOrEqual(1);
  }, 60_000);

  it('BR04 completion then drift supersede leaves a single successor generation', async () => {
    const config = s4aConfigFor([tenant]);
    const manifest = s4aManifestFor(config, { calibrationBundleHash: salt() });
    const { repo, lease } = await leasedPinned(manifest);
    await repo.completeWithS2(lease, { pipelineManifest: manifest, intervals: s4aIntervals() });
    const [completed] = await tripItems();
    const next = await driftToNext(repo, completed.id);
    expect(next.successorWorkItemId).not.toBeNull();
    const active = (await tripItems()).filter((i) => i.status !== 'SUPERSEDED');
    expect(active).toHaveLength(1);
    expect(active[0].boundary_occurrence).toBe(1);
  }, 60_000);

  it('BR05 takeover vs revert maintains monotonic occurrence', async () => {
    const config = s4aConfigFor([tenant]);
    const manifest = s4aManifestFor(config, { calibrationBundleHash: salt() });
    const repo = new DiV0S4WorkItemRepository(client('w1'), config);
    const created = await repo.createWorkItem({ tripId: tenant.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest });
    const lease1 = await repo.claim({ leaseOwner: 'w1', pipelineManifest: manifest });
    await admin.$executeRaw`UPDATE di_v0_s4_work_items SET lease_expires_at = clock_timestamp() - interval '1 second'
      WHERE id = ${lease1.workItemId}`;
    const lease2 = await repo.claim({ leaseOwner: 'w2', pipelineManifest: manifest });
    expect(lease2.leaseEpoch).toBeGreaterThan(lease1.leaseEpoch);
    const drifted = await driftToNext(repo, lease2.workItemId);
    expect(drifted.successorWorkItemId).not.toBeNull();
    const items = await tripItems();
    expect(items[items.length - 1].boundary_occurrence).toBe(1);
  }, 60_000);

  it('BR06 kill active blocks revert successor insert', async () => {
    const { repo, created } = await createPrimary();
    await setKillState(admin, 'KILLED');
    await changeTripBoundary(admin, tenant.tripId);
    await expect(repo.supersedeOnDrift({ workItemId: created.workItemId, reason: 'BOUNDARY_CHANGED' })).rejects.toThrow(/DB_KILL/);
    const items = await tripItems();
    expect(items.filter((i) => i.status !== 'SUPERSEDED')).toHaveLength(1);
  }, 60_000);

  it('BR07 pipeline retired blocks illegal successor on drift', async () => {
    const { repo, manifest, created } = await createPrimary();
    const pvk = buildDiV0S4PipelineVersionKey(manifest);
    await retireRegistry(admin, pvk);
    await changeTripBoundary(admin, tenant.tripId);
    const result = await repo.supersedeOnDrift({ workItemId: created.workItemId, reason: 'BOUNDARY_CHANGED' });
    expect(result.successorWorkItemId).toBeNull();
  }, 60_000);

  it('BR08 S2 persist then revert does not alias prior execution identity', async () => {
    const config = s4aConfigFor([tenant]);
    const manifest = s4aManifestFor(config, { calibrationBundleHash: salt() });
    const { repo, lease } = await leasedPinned(manifest);
    const done = await repo.completeWithS2(lease, { pipelineManifest: manifest, intervals: s4aIntervals() });
    const oldIdentity = done.executionIdentity;
    expect(oldIdentity).toMatch(/^DI_V0_S4_EXECUTION_IDENTITY_V2:/);
    const [completed] = await tripItems();
    const drift = await driftToNext(repo, completed.id);
    await admin.$executeRaw`UPDATE vehicle_trips SET end_time = end_time - interval '1 minute' WHERE id = ${tenant.tripId}`;
    const drift2 = await driftToNext(repo, drift.successorWorkItemId!);
    const active = (await tripItems()).find((i) => i.id === drift2.successorWorkItemId);
    expect(active?.boundary_occurrence).toBe(2);
    expect(active?.execution_identity).toBeNull();
    const [{ input_evidence_version }] = await admin.$queryRaw<Array<{ input_evidence_version: string }>>`
      SELECT input_evidence_version FROM di_v0_shadow_runs WHERE id = ${done.shadowRunId}`;
    expect(input_evidence_version).toBe(oldIdentity);
  }, 60_000);

  it('BR09 repeated F1↔F2 oscillation keeps monotonic occurrence', async () => {
    const { repo, created } = await createPrimary();
    let id = created.workItemId;
    for (let i = 0; i < 4; i++) {
      const next = await driftToNext(repo, id);
      expect(next.successorWorkItemId).not.toBeNull();
      id = next.successorWorkItemId!;
      await admin.$executeRaw`UPDATE vehicle_trips SET end_time = end_time - interval '30 seconds' WHERE id = ${tenant.tripId}`;
    }
    const occ = (await tripItems()).map((r) => r.boundary_occurrence);
    expect(occ).toEqual([0, 1, 2, 3, 4]);
    expect((await tripItems()).filter((i) => i.status !== 'SUPERSEDED')).toHaveLength(1);
  }, 60_000);

  it('BR10 cross-tenant revert successor attempt is rejected', async () => {
    const other = await seedS4aTenant(admin);
    try {
      const config = s4aConfigFor([tenant, other]);
      const manifest = s4aManifestFor(config, { calibrationBundleHash: salt() });
      const repo = new DiV0S4WorkItemRepository(client('x'), config);
      const created = await repo.createWorkItem({ tripId: tenant.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest });
      await changeTripBoundary(admin, tenant.tripId);
      await expect(
        repo.supersedeOnDrift({ workItemId: created.workItemId, reason: 'BOUNDARY_CHANGED' }),
      ).resolves.toBeDefined();
      await expect(
        admin.$executeRaw`UPDATE di_v0_s4_work_items SET trip_id = ${other.tripId} WHERE id = ${created.workItemId}`,
      ).rejects.toThrow(/identity columns/);
    } finally {
      await cleanupS4aTenant(admin, other);
    }
  }, 60_000);

  describe('T13 holder supersede', () => {
    async function holderReady(): Promise<{ repo: DiV0S4WorkItemRepository; lease: DiV0S4Lease; manifest: ReturnType<typeof s4aManifestFor> }> {
      const config = s4aConfigFor([tenant]);
      const manifest = s4aManifestFor(config, { calibrationBundleHash: salt() });
      const repo = new DiV0S4WorkItemRepository(client('t13'), config);
      await repo.createWorkItem({ tripId: tenant.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest });
      const lease = await repo.claim({ leaseOwner: 't13-h', pipelineManifest: manifest });
      return { repo, lease, manifest };
    }

    it('T13-01 canonical supersede-only path leaves no successor row', async () => {
      const { repo, lease } = await holderReady();
      const before = (await tripItems()).length;
      await changeTripBoundary(admin, tenant.tripId);
      await repo.holderSupersede(lease, 'BOUNDARY_CHANGED');
      const items = await tripItems();
      expect(items).toHaveLength(before);
      const superseded = items.find((i) => i.id === lease.workItemId);
      expect(superseded?.status).toBe('SUPERSEDED');
      expect(superseded?.superseded_by_work_item_id).toBeNull();
      expect(items.filter((i) => i.status !== 'SUPERSEDED')).toHaveLength(0);
    }, 60_000);

    it('T13-02 killed rejects holder supersede', async () => {
      const { repo, lease } = await holderReady();
      await setKillState(admin, 'KILLED');
      await changeTripBoundary(admin, tenant.tripId);
      await expect(repo.holderSupersede(lease, 'BOUNDARY_CHANGED')).rejects.toThrow(/DB_KILL/);
    }, 60_000);

    it('T13-03 stale epoch rejects holder supersede', async () => {
      const { repo, lease } = await holderReady();
      await changeTripBoundary(admin, tenant.tripId);
      await expect(
        repo.holderSupersede({ ...lease, leaseEpoch: lease.leaseEpoch + 1n }, 'BOUNDARY_CHANGED'),
      ).rejects.toThrow(/LEASE_NOT_HELD/);
    }, 60_000);

    it('T13-04 expired lease rejects holder supersede', async () => {
      const { repo, lease } = await holderReady();
      await admin.$executeRaw`UPDATE di_v0_s4_work_items SET lease_expires_at = clock_timestamp() - interval '5 seconds'
        WHERE id = ${lease.workItemId}`;
      await changeTripBoundary(admin, tenant.tripId);
      await expect(repo.holderSupersede(lease, 'BOUNDARY_CHANGED')).rejects.toThrow(/LEASE_EXPIRED/);
    }, 60_000);

    it('T13-05 wrong pipeline manifest on worker path rejects before holder write', async () => {
      const config = s4aConfigFor([tenant]);
      const manifest = s4aManifestFor(config, { calibrationBundleHash: salt() });
      const wrong = s4aManifestFor(config, { calibrationBundleHash: `${salt()}-wrong` });
      const repo = new DiV0S4WorkItemRepository(client('t13-5'), config);
      await repo.createWorkItem({ tripId: tenant.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest });
      await expect(repo.claim({ leaseOwner: 't13-5', pipelineManifest: wrong })).rejects.toThrow(/PIPELINE_VERSION_MISMATCH/);
      const items = await tripItems();
      expect(items.every((i) => i.status === 'PENDING')).toBe(true);
    }, 60_000);

    it('T13-06 cross tenant scope rejects create path used after holder supersede', async () => {
      const other = await seedS4aTenant(admin);
      try {
        const config = s4aConfigFor([tenant, other]);
        const manifest = s4aManifestFor(config, { calibrationBundleHash: salt() });
        const repo = new DiV0S4WorkItemRepository(client('t13x'), config);
        await expect(
          repo.createWorkItem({
            tripId: other.tripId,
            sourceFamily: 'RUPTELA_R1',
            runPurpose: 'PRIMARY',
            pipelineManifest: manifest,
            expectedOrganizationId: tenant.organizationId,
          }),
        ).rejects.toThrow(/TENANT_SCOPE_INVALID/);
      } finally {
        await cleanupS4aTenant(admin, other);
      }
    }, 60_000);

    it('T13-07 duplicate holder supersede is idempotent-safe (second call fails closed)', async () => {
      const { repo, lease } = await holderReady();
      await changeTripBoundary(admin, tenant.tripId);
      await repo.holderSupersede(lease, 'BOUNDARY_CHANGED');
      await expect(repo.holderSupersede(lease, 'BOUNDARY_CHANGED')).rejects.toThrow();
      expect((await tripItems()).filter((i) => i.status !== 'SUPERSEDED')).toHaveLength(0);
    }, 60_000);
  });
});
