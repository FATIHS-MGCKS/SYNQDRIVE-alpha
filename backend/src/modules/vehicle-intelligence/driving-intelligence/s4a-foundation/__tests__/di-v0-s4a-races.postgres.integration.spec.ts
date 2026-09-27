import { PrismaClient } from '@prisma/client';
import { buildDiV0ShadowRunIdempotencyKey } from '../../shadow-persistence/di-v0-shadow-idempotency';
import type { DiV0VersionTuple } from '../../core/versions';
import { DI_V0_S4_CONTROL_PLANE_ALL_OFF, type DiV0S4ControlPlaneConfig } from '../di-v0-s4a-control-plane';
import { DiV0S4TransitionRejectedError, isDiV0S4Rejection } from '../di-v0-s4a-errors';
import {
  buildDiV0CombinedInputIdentityV03,
  buildDiV0S4ExecutionIdentity,
  buildDiV0S4PipelineVersionKey,
  pinsFromDiV0S4ChannelManifest,
} from '../di-v0-s4a-identity';
import type { DiV0S4PipelineManifest, DiV0S4RunPurpose } from '../di-v0-s4a-contract';
import { DiV0S4WorkItemRepository, type DiV0S4Lease } from '../di-v0-s4a-work-item.repository';
import {
  advanceS4aClock,
  breakControlTable,
  changeTripBoundary,
  cleanupS4aTenant,
  currentFingerprint,
  deferred,
  deleteKillRow,
  newS4aClient,
  raceThroughControlGate,
  restoreControlTable,
  restoreKillCheck,
  retireRegistry,
  S4A_CONTRACT,
  S4A_POSTGRES_LIVE,
  s4aChannels,
  s4aConfigFor,
  s4aIntervals,
  s4aManifestFor,
  seedS4aSnapshot,
  seedS4aTenant,
  setKillMalformed,
  setKillState,
  settle,
  waitForLockWaiters,
  type S4aTenant,
} from './di-v0-s4a-postgres-harness';

type Step = [string, ...(string | number | null)[]];
interface Fixture {
  id: string;
  steps: Step[];
  expect: Record<string, unknown>;
}

const RACES: Fixture[] = S4A_CONTRACT.fixtures.races;
const KILL_RACES: Fixture[] = S4A_CONTRACT.fixtures.killRaces;

/** Fixture step groups executed concurrently through the control-row barrier. */
const CONCURRENT_GROUPS: Record<string, number[]> = {
  R01_TWO_DISCOVERERS: [0, 1],
  R02_TWO_REPLICAS_CLAIM: [1, 2],
  R10_CONCURRENT_SUPERSESSION: [1, 2],
  R12_CONCURRENT_REACQUISITION: [2, 3],
  R13_REPLAY_WHILE_PRIMARY_EXISTS: [1, 2],
};

/**
 * R24 expects itemCount 2 / activePrimaryCount 1 after T13. The registry binds the successor insert
 * to T11 only, so the successor comes from the next discovery pass
 * (DI-CONTRA-S4A-T13-SUCCESSOR-WRITE-BINDING-001); the harness appends that T01 step.
 */
const APPENDED_STEPS: Record<string, Step[]> = {
  R24_HOLDER_SUPERSEDE_ON_BOUNDARY_CHANGE: [['create', 'd-next', 'PRIMARY']],
};

interface ScenarioResult {
  rejections: Array<{ label: string; code: string }>;
  runIds: Map<string, string>;
  runOwners: Map<string, string>;
  pins: Map<string, string>;
  pvk: string;
  firstItemId: string | null;
}

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DI V0 S4A Postgres races (DI_V0_S4A_POSTGRES_INTEGRATION=1)', () => {
  const clients = new Map<string, PrismaClient>();
  let admin: PrismaClient;
  let observer: PrismaClient;

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
    await setKillState(admin, 'NOT_KILLED').catch(() => undefined);
    for (const c of clients.values()) await c.$disconnect().catch(() => undefined);
    await admin?.$disconnect().catch(() => undefined);
    await observer?.$disconnect().catch(() => undefined);
  });

  let tenant: S4aTenant;
  /** Registry rows are global and RETIRED is permanent, so every scenario owns its pipeline version. */
  const salt = () => `sha256:S4A_TEST_${tenant.tripId}`;
  beforeEach(async () => {
    await setKillState(admin, 'NOT_KILLED');
    tenant = await seedS4aTenant(admin);
  });
  afterEach(async () => {
    await setKillState(admin, 'NOT_KILLED');
    await cleanupS4aTenant(admin, tenant);
  });

  async function itemsOfTrip() {
    return admin.$queryRaw<
      Array<{
        id: string;
        status: string;
        run_purpose: string;
        lease_owner: string | null;
        lease_epoch: bigint;
        attempt_count: number;
        pinned_snapshot_hash: string | null;
        shadow_run_id: string | null;
        failure_reason: string | null;
        superseded_reason: string | null;
        superseded_by_work_item_id: string | null;
        created_at: Date;
      }>
    >`SELECT id, status, run_purpose, lease_owner, lease_epoch, attempt_count, pinned_snapshot_hash, shadow_run_id,
        failure_reason, superseded_reason, superseded_by_work_item_id, created_at
      FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId} ORDER BY created_at, id`;
  }

  async function s2RunIds(): Promise<string[]> {
    const rows = await admin.$queryRaw<Array<{ id: string }>>`SELECT id FROM di_v0_shadow_runs WHERE trip_id = ${tenant.tripId}`;
    return rows.map((r) => r.id);
  }

  async function runScenario(fixture: Fixture, config: DiV0S4ControlPlaneConfig = s4aConfigFor([tenant])): Promise<ScenarioResult> {
    const manifest = s4aManifestFor(config, { calibrationBundleHash: salt() });
    const oldManifest = s4aManifestFor(config, { calibrationVersion: 'CALIBRATION_S4A_TEST_OLD', calibrationBundleHash: salt() });
    const pvk = buildDiV0S4PipelineVersionKey(manifest);
    const leases = new Map<string, DiV0S4Lease>();
    const result: ScenarioResult = {
      rejections: [],
      runIds: new Map(),
      runOwners: new Map(),
      pins: new Map(),
      pvk,
      firstItemId: null,
    };
    const repo = (actor: string) => new DiV0S4WorkItemRepository(client(actor), config);
    let boundaryChanged = false;
    const ensureBoundaryChanged = async () => {
      if (!boundaryChanged) {
        await changeTripBoundary(admin, tenant.tripId);
        boundaryChanged = true;
      }
    };
    const leaseOf = (actor: string): DiV0S4Lease =>
      leases.get(actor) ?? { workItemId: result.firstItemId ?? 'none', leaseEpoch: -1n, leaseOwner: actor };
    const snapshotFor = async (label: string) => {
      const existing = result.pins.get(label);
      if (existing) return existing;
      const hash = await seedS4aSnapshot(admin, tenant, label);
      result.pins.set(label, hash);
      return hash;
    };

    const prepare = async (step: Step): Promise<void> => {
      const [op, , arg] = step;
      if ((op === 'supersede' || op === 'holderSupersede') && arg === 'fp-2') await ensureBoundaryChanged();
      if (op === 'create' && step[2] === 'RECALIBRATION_REPLAY') await snapshotFor(String(step[3]));
    };

    const execute = async (step: Step): Promise<unknown> => {
      const [op, actorRaw, a2, a3] = step;
      const actor = String(actorRaw ?? op);
      switch (op) {
        case 'create': {
          const purpose = a2 as DiV0S4RunPurpose;
          const created = await repo(actor).createWorkItem({
            tripId: tenant.tripId,
            sourceFamily: 'API_SYNTHETIC',
            runPurpose: purpose,
            replaySourceSnapshotHash: purpose === 'RECALIBRATION_REPLAY' ? await snapshotFor(String(a3)) : null,
            reacquisitionRequestId: purpose === 'REACQUISITION' ? String(a3) : null,
            pipelineManifest: manifest,
          });
          result.firstItemId ??= created.workItemId;
          return created;
        }
        case 'claim': {
          const claimed = await repo(actor).claim({
            leaseOwner: actor,
            pipelineManifest: a3 === 'pvk-0' ? oldManifest : manifest,
          });
          leases.set(actor, claimed);
          return claimed;
        }
        case 'heartbeat':
          return repo(actor).heartbeat(leaseOf(actor));
        case 'pin': {
          const pinned = await repo(actor).pinEvidence(leaseOf(actor), {
            windowStart: tenant.startTime,
            windowEnd: tenant.endTime,
            channels: s4aChannels(String(a2)),
          });
          result.pins.set(String(a2), pinned.snapshotHash);
          return pinned;
        }
        case 'complete': {
          const completed = await repo(actor).completeWithS2(leaseOf(actor), {
            pipelineManifest: a3 === 'pvk-0' ? oldManifest : manifest,
            intervals: s4aIntervals(),
          });
          result.runIds.set(String(a2), completed.shadowRunId);
          result.runOwners.set(completed.shadowRunId, actor);
          return completed;
        }
        case 'completeRollback': {
          const marker = new Error('S4A_TEST_ROLLBACK');
          await client(actor)
            .$transaction(async (tx) => {
              await repo(actor).completeWithS2(leaseOf(actor), { pipelineManifest: manifest, intervals: s4aIntervals() }, tx);
              expect((await s2RunIds()).length).toBe(0);
              throw marker;
            })
            .catch((error) => {
              if (error !== marker) throw error;
            });
          expect((await s2RunIds()).length).toBe(0);
          return null;
        }
        case 'failRetryable':
          return repo(actor).failRetryable(leaseOf(actor), 'POSITION_SOURCE_TIMEOUT');
        case 'failTerminal':
          return repo(actor).failTerminal(leaseOf(actor), a2 == null ? 'POSITION_AUTHORIZATION_FAILURE' : String(a2));
        case 'skip':
          return repo(actor).skipIneligible(leaseOf(actor), 'WINDOW_EXCEEDS_MAX_8H');
        case 'holderSupersede':
          return repo(actor).holderSupersede(leaseOf(actor), 'BOUNDARY_CHANGED');
        case 'supersede':
          return repo(actor).supersedeOnDrift({ workItemId: result.firstItemId!, reason: 'BOUNDARY_CHANGED' });
        case 'reap':
          return repo(actor).reapExhausted({ workItemId: result.firstItemId! });
        case 'retire':
          return repo(actor).retirePipelineItems({ pipelineVersionKey: pvk });
        case 'retireRegistry':
          return retireRegistry(admin, pvk);
        case 'advance':
          return advanceS4aClock(admin, tenant.tripId, Number(actorRaw));
        case 'tripChange':
          return ensureBoundaryChanged();
        case 'kill':
          return setKillState(admin, 'KILLED');
        case 'setKillMissing':
          return deleteKillRow(admin);
        case 'setKillMalformed':
          return setKillMalformed(admin);
        case 'setKillReadError':
          return breakControlTable(admin);
        case 's2Preexisting':
          return insertCollidingS2Run(manifest);
        default:
          throw new Error(`unknown fixture op ${op}`);
      }
    };

    const labelOf = (step: Step) => `${String(step[1] ?? step[0])}:${String(step[0])}`;
    const record = (step: Step, outcome: { ok: true } | { ok: false; error: unknown }) => {
      if (outcome.ok) return;
      if (!(outcome.error instanceof DiV0S4TransitionRejectedError)) throw outcome.error;
      result.rejections.push({ label: labelOf(step), code: outcome.error.code });
    };

    const steps = [...fixture.steps, ...(APPENDED_STEPS[fixture.id] ?? [])];
    const group = CONCURRENT_GROUPS[fixture.id];
    try {
      for (let i = 0; i < steps.length; i++) {
        if (group && i === group[0]) {
          const members = group.map((index) => steps[index]);
          for (const step of members) await prepare(step);
          const outcomes = await raceThroughControlGate(client('gate'), observer, members.map((step) => () => execute(step)));
          outcomes.forEach((outcome, k) => record(members[k], outcome));
          i = group[group.length - 1];
          continue;
        }
        await prepare(steps[i]);
        record(steps[i], await settle(execute(steps[i])));
      }
    } finally {
      if (steps.some((s) => s[0] === 'setKillReadError')) await restoreControlTable(admin);
      if (steps.some((s) => s[0] === 'setKillMalformed')) await restoreKillCheck(admin);
    }
    return result;
  }

  async function insertCollidingS2Run(manifest: DiV0S4PipelineManifest): Promise<void> {
    const [item] = await admin.$queryRaw<
      Array<{ id: string; boundary_fingerprint: string; pinned_snapshot_hash: string; run_purpose: DiV0S4RunPurpose; purpose_discriminator: string }>
    >`SELECT id, boundary_fingerprint, pinned_snapshot_hash, run_purpose, purpose_discriminator
      FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId} ORDER BY created_at LIMIT 1`;
    const [snapshot] = await admin.$queryRaw<Array<{ channel_manifest: unknown }>>`
      SELECT channel_manifest FROM di_v0_s4_evidence_snapshots
      WHERE trip_id = ${tenant.tripId} AND snapshot_hash = ${item.pinned_snapshot_hash}`;
    const combinedInputIdentity = buildDiV0CombinedInputIdentityV03(pinsFromDiV0S4ChannelManifest(snapshot.channel_manifest));
    const executionIdentity = buildDiV0S4ExecutionIdentity({
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: tenant.tripId,
      boundaryFingerprint: item.boundary_fingerprint,
      pipelineVersionKey: buildDiV0S4PipelineVersionKey(manifest),
      calibrationBundleHash: manifest.calibrationBundleHash,
      s4OrchestrationContractVersion: manifest.s4OrchestrationContractVersion,
      runPurpose: item.run_purpose,
      purposeDiscriminator: item.purpose_discriminator,
      pinnedEvidenceSnapshotHash: item.pinned_snapshot_hash,
      combinedInputIdentity,
    });
    const versions = {
      structuralVersion: manifest.structuralVersion,
      estimatorVersion: manifest.estimatorVersion,
      calibrationVersion: manifest.calibrationVersion,
      sourceFamilyPolicyVersion: manifest.sourceFamilyPolicyVersion,
    } as DiV0VersionTuple;
    const key = buildDiV0ShadowRunIdempotencyKey({
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: tenant.tripId,
      sourceFamily: 'API_SYNTHETIC',
      versions,
      inputEvidenceVersion: executionIdentity,
    });
    await admin.$executeRaw`
      INSERT INTO di_v0_shadow_runs (id, organization_id, vehicle_id, trip_id, source_family, structural_version,
        estimator_version, calibration_version, source_family_policy_version, input_evidence_version, idempotency_key,
        status, created_at, updated_at)
      VALUES (gen_random_uuid()::text, ${tenant.organizationId}, ${tenant.vehicleId}, ${tenant.tripId}, 'API_SYNTHETIC',
        ${versions.structuralVersion}, ${versions.estimatorVersion}, ${versions.calibrationVersion},
        ${versions.sourceFamilyPolicyVersion}, 'OTHER_IDENTITY', ${key}, 'COMPLETED', now(), now())`;
  }

  async function assertExpectations(fixture: Fixture, result: ScenarioResult): Promise<void> {
    const expected = fixture.expect;
    const rejectedExpected = (expected.rejected as string[] | undefined) ?? [];
    const matches = (label: string, e: string) => label === e || label.startsWith(`${e}:`);
    const unexpected = result.rejections.filter((r) => !rejectedExpected.some((e) => matches(r.label, e)));
    const missing = rejectedExpected.filter((e) => !result.rejections.some((r) => matches(r.label, e)));
    expect({ fixture: fixture.id, unexpected, missing }).toEqual({ fixture: fixture.id, unexpected: [], missing: [] });

    const items = await itemsOfTrip();
    const first = items.find((i) => i.id === result.firstItemId) ?? null;
    if ('itemCount' in expected) expect(items.length).toBe(expected.itemCount);
    if ('activePrimaryCount' in expected) {
      expect(items.filter((i) => i.run_purpose === 'PRIMARY' && i.status !== 'SUPERSEDED').length).toBe(expected.activePrimaryCount);
    }
    if ('status' in expected) expect(first?.status).toBe(expected.status);
    if ('oldStatus' in expected) expect(first?.status).toBe(expected.oldStatus);
    if ('leaseOwner' in expected) expect(first?.lease_owner ?? null).toBe(expected.leaseOwner);
    if ('leaseEpoch' in expected) expect(Number(first?.lease_epoch)).toBe(expected.leaseEpoch);
    if ('attemptCount' in expected) expect(first?.attempt_count).toBe(expected.attemptCount);
    if ('failureReason' in expected) expect(first?.failure_reason).toBe(expected.failureReason);
    if ('supersededReason' in expected) expect(first?.superseded_reason).toBe(expected.supersededReason);
    if ('pinned' in expected) expect(first?.pinned_snapshot_hash).toBe(result.pins.get(String(expected.pinned)));
    if ('shadowRunId' in expected) {
      const runId = result.runIds.get(String(expected.shadowRunId));
      expect(runId).toBeDefined();
      expect(first?.shadow_run_id).toBe(runId);
    }
    const runs = await s2RunIds();
    if ('s2WritesCommitted' in expected) {
      const owners = expected.s2WritesCommitted as string[];
      expect(runs.length).toBe(owners.length);
      expect(runs.map((id) => result.runOwners.get(id)).sort()).toEqual([...owners].sort());
    }
    const completed = items.filter((i) => i.status === 'COMPLETED');
    for (const c of completed) expect(runs).toContain(c.shadow_run_id);
    const activePrimaries = items.filter((i) => i.run_purpose === 'PRIMARY' && i.status !== 'SUPERSEDED');
    expect(activePrimaries.length).toBeLessThanOrEqual(1);
  }

  it('fixture coverage: requiredRaceIds and requiredKillRaceIds are all exercised', () => {
    expect(RACES.map((r) => r.id).sort()).toEqual([...S4A_CONTRACT.fixtures.requiredRaceIds].sort());
    expect(KILL_RACES.map((r) => r.id).sort()).toEqual([...S4A_CONTRACT.fixtures.requiredKillRaceIds].sort());
    expect(RACES.length).toBeGreaterThanOrEqual(24);
    expect(KILL_RACES.length).toBe(18);
  });

  describe.each(RACES.map((r) => [r.id, r] as const))('%s', (_id, fixture) => {
    it('matches the contract fixture expectation', async () => {
      const result = await runScenario(fixture);
      await assertExpectations(fixture, result);
    }, 60_000);
  });

  describe.each(KILL_RACES.map((r) => [r.id, r] as const))('%s', (_id, fixture) => {
    it('fails closed under the DB kill row and never writes S2', async () => {
      const result = await runScenario(fixture);
      await assertExpectations(fixture, result);
      for (const r of result.rejections) expect(r.code).toMatch(/^DB_KILL_/);
      const preexisting = fixture.steps.some((s) => s[0] === 's2Preexisting') ? 1 : 0;
      expect((await s2RunIds()).length).toBe(preexisting);
    }, 60_000);
  });

  // ── Kill serialization proofs (both lock orders) ─────────────────────────

  async function leasedAndPinned(config: DiV0S4ControlPlaneConfig) {
    const manifest = s4aManifestFor(config, { calibrationBundleHash: salt() });
    const repo = new DiV0S4WorkItemRepository(client('w1'), config);
    await repo.createWorkItem({ tripId: tenant.tripId, sourceFamily: 'API_SYNTHETIC', runPurpose: 'PRIMARY', pipelineManifest: manifest });
    const lease = await repo.claim({ leaseOwner: 'w1', pipelineManifest: manifest });
    await repo.pinEvidence(lease, { windowStart: tenant.startTime, windowEnd: tenant.endTime, channels: s4aChannels('snap-A') });
    return { repo, lease, manifest };
  }

  it('KS1: holder holds the control lock first — the operator kill waits, the completion commits whole', async () => {
    const config = s4aConfigFor([tenant]);
    const { repo, lease, manifest } = await leasedAndPinned(config);
    const inside = deferred();
    const finish = deferred();
    const holder = client('w1').$transaction(
      async (tx) => {
        const done = await repo.completeWithS2(lease, { pipelineManifest: manifest, intervals: s4aIntervals() }, tx);
        inside.resolve();
        await finish.promise;
        return done;
      },
      { timeout: 60_000 },
    );
    await inside.promise;
    const operator = settle(
      client('op').$executeRaw`UPDATE di_v0_s4_control SET kill_state = 'KILLED', updated_at = now() WHERE id = 'GLOBAL'`,
    );
    await waitForLockWaiters(observer, 1);
    const [before] = await admin.$queryRaw<Array<{ kill_state: string }>>`SELECT kill_state FROM di_v0_s4_control`;
    expect(before.kill_state).toBe('NOT_KILLED');
    finish.resolve();
    await holder;
    expect((await operator).ok).toBe(true);
    const [item] = await itemsOfTrip();
    expect(item.status).toBe('COMPLETED');
    expect((await s2RunIds()).length).toBe(1);
    await expect(repo.claim({ leaseOwner: 'w2', pipelineManifest: manifest })).rejects.toThrow(/DB_KILL_ACTIVE/);
  }, 60_000);

  it('KS2: operator kill holds the control lock first — the in-flight completion blocks, then fails closed', async () => {
    const config = s4aConfigFor([tenant]);
    const { repo, lease, manifest } = await leasedAndPinned(config);
    const locked = deferred();
    const commit = deferred();
    const operator = client('op').$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT kill_state FROM di_v0_s4_control WHERE id = 'GLOBAL' FOR UPDATE`;
        await tx.$executeRaw`UPDATE di_v0_s4_control SET kill_state = 'KILLED', updated_at = now() WHERE id = 'GLOBAL'`;
        locked.resolve();
        await commit.promise;
      },
      { timeout: 60_000 },
    );
    await locked.promise;
    const completion = settle(repo.completeWithS2(lease, { pipelineManifest: manifest, intervals: s4aIntervals() }));
    await waitForLockWaiters(observer, 1);
    commit.resolve();
    await operator;
    const outcome = await completion;
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && isDiV0S4Rejection(outcome.error, 'DB_KILL_ACTIVE')).toBe(true);
    const [item] = await itemsOfTrip();
    expect(item.status).toBe('LEASED');
    expect((await s2RunIds()).length).toBe(0);
    await repo.failRetryable(lease, 'KILLED_RELINQUISH');
    const [released] = await itemsOfTrip();
    expect(released.status).toBe('FAILED_RETRYABLE');
    expect(released.lease_owner).toBeNull();
  }, 60_000);

  it('KS3: concurrent stale completion and takeover — exactly one epoch wins, stale S2 never commits', async () => {
    const config = s4aConfigFor([tenant]);
    const { lease, manifest } = await leasedAndPinned(config);
    await advanceS4aClock(admin, tenant.tripId, 301);
    const w1 = new DiV0S4WorkItemRepository(client('w1'), config);
    const w2 = new DiV0S4WorkItemRepository(client('w2'), config);
    const outcomes = await raceThroughControlGate<unknown>(client('gate'), observer, [
      () => w2.claim({ leaseOwner: 'w2', pipelineManifest: manifest }),
      () => w1.completeWithS2(lease, { pipelineManifest: manifest, intervals: s4aIntervals() }),
    ]);
    expect(outcomes[0].ok).toBe(true);
    expect(outcomes[1].ok).toBe(false);
    expect(!outcomes[1].ok && isDiV0S4Rejection(outcomes[1].error, 'LEASE_NOT_HELD')).toBe(true);
    expect((await s2RunIds()).length).toBe(0);
    const [item] = await itemsOfTrip();
    expect(item.lease_owner).toBe('w2');
    expect(Number(item.lease_epoch)).toBe(2);
  }, 60_000);

  // ── Dormant default and DB-level guards ───────────────────────────────────

  it('all-off control plane (the S4A default): every gated actor is refused before any write', async () => {
    const on = s4aConfigFor([tenant]);
    const manifestOn = s4aManifestFor(on, { calibrationBundleHash: salt() });
    const created = await new DiV0S4WorkItemRepository(client('d1'), on).createWorkItem({
      tripId: tenant.tripId,
      sourceFamily: 'API_SYNTHETIC',
      runPurpose: 'PRIMARY',
      pipelineManifest: manifestOn,
    });
    const off = new DiV0S4WorkItemRepository(client('w1'), DI_V0_S4_CONTROL_PLANE_ALL_OFF);
    const manifestOff = s4aManifestFor(DI_V0_S4_CONTROL_PLANE_ALL_OFF, { calibrationBundleHash: salt() });
    const fake: DiV0S4Lease = { workItemId: created.workItemId, leaseEpoch: 0n, leaseOwner: 'w1' };
    const attempts: Array<() => Promise<unknown>> = [
      () =>
        off.createWorkItem({
          tripId: tenant.tripId,
          sourceFamily: 'API_SYNTHETIC',
          runPurpose: 'REACQUISITION',
          reacquisitionRequestId: 'r1',
          pipelineManifest: manifestOff,
        }),
      () => off.claim({ leaseOwner: 'w1', pipelineManifest: manifestOff }),
      () => off.heartbeat(fake),
      () => off.failTerminal(fake, 'X'),
      () => off.reapExhausted(),
      () => off.supersedeOnDrift({ workItemId: created.workItemId, reason: 'OPERATOR' }),
      () => off.retirePipelineItems({ pipelineVersionKey: created.pipelineVersionKey }),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toThrow(/CONTROL_PLANE_DISABLED/);
    }
    const items = await itemsOfTrip();
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('PENDING');
    expect(Number(items[0].lease_epoch)).toBe(0);
  }, 60_000);

  it('tenancy fixture cases: caller-supplied scope is compared, never trusted', async () => {
    const other = await seedS4aTenant(admin);
    try {
      const config = s4aConfigFor([tenant, other]);
      const manifest = s4aManifestFor(config, { calibrationBundleHash: salt() });
      const repo = new DiV0S4WorkItemRepository(client('d1'), config);
      const base = { sourceFamily: 'API_SYNTHETIC' as const, runPurpose: 'REACQUISITION' as const, pipelineManifest: manifest };
      await expect(
        repo.createWorkItem({ ...base, reacquisitionRequestId: 'x1', tripId: other.tripId, expectedOrganizationId: tenant.organizationId }),
      ).rejects.toThrow(/TENANT_SCOPE_INVALID/);
      await expect(
        repo.createWorkItem({ ...base, reacquisitionRequestId: 'x2', tripId: other.tripId, expectedVehicleId: tenant.vehicleId }),
      ).rejects.toThrow(/TENANT_SCOPE_INVALID/);
      await expect(
        repo.createWorkItem({ ...base, reacquisitionRequestId: 'x3', tripId: tenant.tripId, expectedOrganizationId: other.organizationId }),
      ).rejects.toThrow(/TENANT_SCOPE_INVALID/);
      await expect(repo.createWorkItem({ ...base, reacquisitionRequestId: 'x4', tripId: 'trip-missing' })).rejects.toThrow(
        /TENANT_SCOPE_INVALID/,
      );
      const ok = await repo.createWorkItem({
        ...base,
        reacquisitionRequestId: 'x5',
        tripId: tenant.tripId,
        expectedOrganizationId: tenant.organizationId,
        expectedVehicleId: tenant.vehicleId,
      });
      expect(ok.organizationId).toBe(tenant.organizationId);

      const otherSnapshot = await seedS4aSnapshot(admin, other, 'snap-B');
      await expect(
        admin.$executeRaw`UPDATE di_v0_s4_work_items SET pinned_snapshot_hash = ${otherSnapshot}, pinned_at = now(), pinned_epoch = 0
          WHERE id = ${ok.workItemId}`,
      ).rejects.toThrow(/di_v0_s4_wi_pinned_snapshot_scope_fkey/);
      await expect(
        admin.$executeRaw`INSERT INTO di_v0_s4_work_items (id, organization_id, vehicle_id, trip_id, source_family, run_purpose,
            purpose_discriminator, boundary_fingerprint, pipeline_version_key, pipeline_version_manifest, status,
            next_attempt_at, settlement_anchor_at, eligible_at)
          SELECT gen_random_uuid()::text, ${other.organizationId}, vehicle_id, trip_id, source_family, 'REACQUISITION', 'x9',
            boundary_fingerprint, pipeline_version_key, pipeline_version_manifest, 'PENDING', now(), settlement_anchor_at, eligible_at
          FROM di_v0_s4_work_items WHERE id = ${ok.workItemId}`,
      ).rejects.toThrow(/scope mismatch/);
      await expect(
        admin.$executeRaw`INSERT INTO di_v0_shadow_runs (id, organization_id, vehicle_id, trip_id, source_family, structural_version,
            estimator_version, calibration_version, source_family_policy_version, input_evidence_version, idempotency_key, status,
            created_at, updated_at)
          VALUES (gen_random_uuid()::text, ${other.organizationId}, ${tenant.vehicleId}, ${tenant.tripId}, 'API_SYNTHETIC', 'a', 'b', 'c',
            'd', 'e', 'f', 'PENDING', now(), now())`,
      ).rejects.toThrow(/di_v0_shadow_runs: trip .* scope mismatch/);
      await expect(
        admin.$executeRaw`INSERT INTO di_v0_s4_evidence_snapshots (id, organization_id, vehicle_id, trip_id, snapshot_hash,
            container_version, boundary_fingerprint, acquisition_window_start, acquisition_window_end, channel_manifest, payload_gzip,
            payload_bytes, uncompressed_bytes, retention_until)
          SELECT gen_random_uuid()::text, ${tenant.organizationId}, vehicle_id, trip_id,
            'DI_V0_S4_EVIDENCE_V1:sha256:' || repeat('e', 64), container_version, boundary_fingerprint, acquisition_window_start,
            acquisition_window_end, channel_manifest, payload_gzip, payload_bytes, uncompressed_bytes, retention_until
          FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${other.tripId} LIMIT 1`,
      ).rejects.toThrow(/scope mismatch/);
    } finally {
      await cleanupS4aTenant(admin, other);
    }
  }, 60_000);

  it('immutability triggers: SUPERSEDED rows, pins, epochs, snapshots and retired registry rows cannot be rewritten', async () => {
    const config = s4aConfigFor([tenant]);
    const { repo, lease, manifest } = await leasedAndPinned(config);
    const pvk = buildDiV0S4PipelineVersionKey(manifest);
    const [item] = await itemsOfTrip();
    await expect(admin.$executeRaw`UPDATE di_v0_s4_work_items SET pinned_snapshot_hash = NULL, pinned_at = NULL, pinned_epoch = NULL
      WHERE id = ${item.id}`).rejects.toThrow(/evidence pin .* is immutable/);
    await expect(admin.$executeRaw`UPDATE di_v0_s4_work_items SET lease_epoch = 0 WHERE id = ${item.id}`).rejects.toThrow(
      /must not decrease/,
    );
    await expect(admin.$executeRaw`UPDATE di_v0_s4_work_items SET boundary_fingerprint = 'DI_V0_S4_BOUNDARY_FP_V1:sha256:' || repeat('0', 64)
      WHERE id = ${item.id}`).rejects.toThrow(/identity columns/);
    await expect(admin.$executeRaw`UPDATE di_v0_s4_evidence_snapshots SET retention_until = now() WHERE trip_id = ${tenant.tripId}`).rejects.toThrow(
      /immutable/,
    );
    await expect(admin.$executeRaw`UPDATE di_v0_s4_work_items SET status = 'COMPLETED' WHERE id = ${item.id}`).rejects.toThrow(/check constraint/);

    await changeTripBoundary(admin, tenant.tripId);
    await repo.holderSupersede(lease, 'BOUNDARY_CHANGED');
    await expect(admin.$executeRaw`UPDATE di_v0_s4_work_items SET superseded_reason = 'OPERATOR' WHERE id = ${item.id}`).rejects.toThrow(
      /SUPERSEDED work item .* is immutable/,
    );
    await retireRegistry(admin, pvk);
    await expect(admin.$executeRaw`UPDATE di_v0_s4_pipeline_versions SET status = 'ACTIVE', retired_at = NULL, retired_by = NULL,
      retired_reason = NULL WHERE pipeline_version_key = ${pvk}`).rejects.toThrow(/RETIRED->ACTIVE forbidden/);
    await expect(admin.$executeRaw`INSERT INTO di_v0_s4_control (id, kill_state, reason, actor) VALUES ('OTHER', 'KILLED', 'x', 'x')`).rejects.toThrow(
      /di_v0_s4_control_id_ck/,
    );
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE pipeline_version_key = ${pvk}`;
    await admin.$executeRaw`DELETE FROM di_v0_s4_pipeline_versions WHERE pipeline_version_key = ${pvk}`;
  }, 60_000);

  it('boundary fingerprint is recomputed from canonical rows and a revert gets no duplicate successor', async () => {
    const config = s4aConfigFor([tenant]);
    const manifest = s4aManifestFor(config, { calibrationBundleHash: salt() });
    const repo = new DiV0S4WorkItemRepository(client('s1'), config);
    const fp1 = await currentFingerprint(admin, tenant.tripId);
    const created = await repo.createWorkItem({ tripId: tenant.tripId, sourceFamily: 'API_SYNTHETIC', runPurpose: 'PRIMARY', pipelineManifest: manifest });
    expect(created.boundaryFingerprint).toBe(fp1);
    await expect(repo.supersedeOnDrift({ workItemId: created.workItemId, reason: 'BOUNDARY_CHANGED' })).rejects.toThrow(
      /BOUNDARY_FINGERPRINT_UNCHANGED/,
    );
    await changeTripBoundary(admin, tenant.tripId);
    const first = await repo.supersedeOnDrift({ workItemId: created.workItemId, reason: 'BOUNDARY_CHANGED' });
    expect(first.successorWorkItemId).not.toBeNull();
    await admin.$executeRaw`UPDATE vehicle_trips SET end_time = end_time - interval '5 minutes' WHERE id = ${tenant.tripId}`;
    const second = await repo.supersedeOnDrift({ workItemId: first.successorWorkItemId!, reason: 'BOUNDARY_CHANGED' });
    expect(second.successorWorkItemId).toBeNull();
    const items = await itemsOfTrip();
    expect(items.filter((i) => i.status !== 'SUPERSEDED')).toHaveLength(0);
    expect(items.find((i) => i.id === created.workItemId)?.superseded_by_work_item_id).toBe(first.successorWorkItemId);
  }, 60_000);
});
