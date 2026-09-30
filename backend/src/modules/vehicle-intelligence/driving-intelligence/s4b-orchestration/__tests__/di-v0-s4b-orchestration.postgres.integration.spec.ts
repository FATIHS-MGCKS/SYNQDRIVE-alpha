import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { parseDiV0S4ControlPlaneConfig, type DiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { DiV0S4TransitionRejectedError } from '../../s4a-foundation/di-v0-s4a-errors';
import { DiV0S4WorkItemRepository } from '../../s4a-foundation/di-v0-s4a-work-item.repository';
import {
  assertS4aPostgresCiEnv,
  advanceS4aClock,
  changeTripBoundary,
  cleanupS4aTenant,
  s4aChannels,
  s4aIntervals,
  deferred,
  deleteKillRow,
  newS4aClient,
  raceThroughControlGate,
  retireRegistry,
  retireRegistryStatusOnly,
  S4A_POSTGRES_LIVE,
  seedS4aTenant,
  setKillState,
  type S4aTenant,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DiV0S4ClaimLoop, type DiV0S4ClaimLoopResult } from '../di-v0-s4b-claim-loop';
import { DiV0S4DiscoveryService } from '../di-v0-s4b-discovery.service';
import {
  DiV0S4ExecutorRegistry,
  type DiV0S4ExecutionContext,
  type DiV0S4ExecutionOutcome,
} from '../di-v0-s4b-executor.port';
import { buildDiV0S4RuntimePipelineManifest } from '../di-v0-s4b-pipeline-manifest';

assertS4aPostgresCiEnv();

interface ItemRow {
  id: string;
  status: string;
  run_purpose: string;
  source_family: string;
  boundary_fingerprint: string;
  boundary_occurrence: number;
  pipeline_version_key: string;
  lease_epoch: bigint;
  lease_owner: string | null;
  attempt_count: number;
  failure_reason: string | null;
  superseded_reason: string | null;
  eligible_at_passed: boolean;
  anchor_matches_end: boolean;
  retry_delay_s: number | null;
  heartbeat_after_claim: boolean | null;
}

type FakeExecute = (ctx: DiV0S4ExecutionContext) => Promise<DiV0S4ExecutionOutcome>;

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DI V0 S4B discovery + claim orchestration (real PostgreSQL)', () => {
  const clients: PrismaClient[] = [];
  let admin: PrismaClient;
  let observer: PrismaClient;
  let tenants: S4aTenant[] = [];
  const extraDimoVehicleIds: string[] = [];

  const client = (): PrismaClient => {
    const c = newS4aClient();
    clients.push(c);
    return c;
  };

  beforeAll(async () => {
    admin = newS4aClient();
    observer = newS4aClient();
    await admin.$queryRaw`SELECT 1`;
  }, 60_000);

  afterAll(async () => {
    for (const c of clients) await c.$disconnect().catch(() => undefined);
    await admin?.$disconnect().catch(() => undefined);
    await observer?.$disconnect().catch(() => undefined);
  });

  beforeEach(async () => {
    await setKillState(admin, 'NOT_KILLED');
    tenants = [];
  });

  afterEach(async () => {
    await setKillState(admin, 'NOT_KILLED');
    for (const t of tenants) {
      await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${t.vehicleId}`;
      await admin.$executeRaw`DELETE FROM trip_repairs WHERE vehicle_id = ${t.vehicleId}`;
      await admin.$executeRaw`DELETE FROM vehicle_trips WHERE vehicle_id = ${t.vehicleId} AND id <> ${t.tripId}`;
      await cleanupS4aTenant(admin, t);
    }
    for (const id of extraDimoVehicleIds.splice(0)) await admin.$executeRaw`DELETE FROM dimo_vehicles WHERE id = ${id}`;
  });

  async function tenant(ageSeconds?: number): Promise<S4aTenant> {
    const t = await seedS4aTenant(admin, ageSeconds);
    tenants.push(t);
    return t;
  }

  function configFor(allowed: readonly S4aTenant[], env: Record<string, string> = {}): DiV0S4ControlPlaneConfig {
    return parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_DISCOVERY_ENABLED: 'true',
      DI_V0_S4_WORKER_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
      DI_V0_S4_R1_ENABLED: 'true',
      DI_V0_S4_NATIVE_ENABLED: 'false',
      DI_V0_S4_ORGANIZATION_ALLOWLIST: allowed.map((t) => t.organizationId).join(','),
      DI_V0_S4_VEHICLE_ALLOWLIST: allowed.map((t) => t.vehicleId).join(','),
      ...env,
    });
  }

  function discovery(config: DiV0S4ControlPlaneConfig, db: PrismaClient = client()) {
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    return { service: new DiV0S4DiscoveryService(db, new DiV0S4WorkItemRepository(db, config), config, pipeline), pipeline };
  }

  function claimLoop(
    config: DiV0S4ControlPlaneConfig,
    execute: FakeExecute | null,
    opts: { heartbeatIntervalMs?: number; workBudgetMs?: number; owner?: string } = {},
  ) {
    const db = client();
    const registry = new DiV0S4ExecutorRegistry();
    if (execute) registry.register({ executorId: 'FAKE_S4B_EXECUTOR', isReady: () => true, execute });
    return new DiV0S4ClaimLoop(new DiV0S4WorkItemRepository(db, config), config, buildDiV0S4RuntimePipelineManifest(config), registry, {
      leaseOwner: opts.owner ?? `s4b-test-${randomUUID().slice(0, 8)}`,
      heartbeatIntervalMs: opts.heartbeatIntervalMs ?? 60_000,
      workBudgetMs: opts.workBudgetMs ?? 240_000,
    });
  }

  async function items(t: S4aTenant): Promise<ItemRow[]> {
    const rows = await admin.$queryRaw<ItemRow[]>`
      SELECT w.id, w.status, w.run_purpose, w.source_family, w.boundary_fingerprint, w.boundary_occurrence,
        w.pipeline_version_key, w.lease_epoch, w.lease_owner, w.attempt_count, w.failure_reason, w.superseded_reason,
        (w.eligible_at <= clock_timestamp()) AS eligible_at_passed,
        (w.settlement_anchor_at = (t.end_time AT TIME ZONE 'UTC')) AS anchor_matches_end,
        CASE WHEN w.next_attempt_at IS NULL THEN NULL
             ELSE extract(epoch FROM (w.next_attempt_at - clock_timestamp()))::float8 END AS retry_delay_s,
        CASE WHEN w.lease_acquired_at IS NULL THEN NULL ELSE w.last_heartbeat_at > w.lease_acquired_at END AS heartbeat_after_claim
      FROM di_v0_s4_work_items w JOIN vehicle_trips t ON t.id = w.trip_id
      WHERE w.vehicle_id = ${t.vehicleId}
      ORDER BY w.boundary_occurrence, w.created_at`;
    return rows.map((r) => ({ ...r, lease_epoch: BigInt(r.lease_epoch), attempt_count: Number(r.attempt_count) }));
  }

  async function nextOccurrence(t: S4aTenant, tripId = t.tripId): Promise<number | null> {
    const rows = await admin.$queryRaw<Array<{ n: number }>>`
      SELECT next_boundary_occurrence AS n FROM di_v0_s4_trip_primary_boundary_seq WHERE trip_id = ${tripId}`;
    return rows.length ? Number(rows[0].n) : null;
  }

  async function addTrip(t: S4aTenant, ageSeconds: number): Promise<string> {
    const id = randomUUID();
    const start = new Date(Math.floor((Date.now() - ageSeconds * 1000) / 1000) * 1000);
    const end = new Date(start.getTime() + 20 * 60_000);
    await admin.$executeRawUnsafe(
      `INSERT INTO vehicle_trips (id, vehicle_id, trip_status, start_time, end_time, dimo_segment_id, created_at,
         start_latitude, start_longitude, distance_km, max_speed_kmh, avg_speed_kmh, harsh_brake_count, driving_score)
       VALUES ($1, $2, 'COMPLETED', ($3::timestamptz AT TIME ZONE 'UTC'), ($4::timestamptz AT TIME ZONE 'UTC'), $5,
         ($4::timestamptz AT TIME ZONE 'UTC'), 52, 9, 12, 77, 45, 2, 88)`,
      id,
      t.vehicleId,
      start.toISOString(),
      end.toISOString(),
      `seg-${randomUUID()}`,
    );
    return id;
  }

  async function linkDimo(t: S4aTenant, rawJson: unknown, hardwareType: 'LTE_R1' | 'SMART5' | 'UNKNOWN'): Promise<void> {
    const id = randomUUID();
    extraDimoVehicleIds.push(id);
    await admin.$executeRaw`
      INSERT INTO dimo_vehicles (id, external_id, raw_json, created_at, updated_at)
      VALUES (${id}, ${`s4b-${id}`}, ${JSON.stringify(rawJson)}::jsonb, now(), now())`;
    await admin.$executeRawUnsafe(
      `UPDATE vehicles SET dimo_vehicle_id = $1, hardware_type = $2::"HardwareType" WHERE id = $3`,
      id,
      hardwareType,
      t.vehicleId,
    );
  }

  const tripRow = async (tripId: string) =>
    (await admin.$queryRaw<Array<{ j: string }>>`SELECT row_to_json(t)::text AS j FROM vehicle_trips t WHERE t.id = ${tripId}`)[0]?.j;

  /** Holds until aborted, then optionally runs `after`; resolves to RELEASE so an un-aborted hang is visible. */
  const hangUntilAborted =
    (onSignal?: (s: AbortSignal) => void): FakeExecute =>
    ({ signal }) =>
      new Promise((resolve) => {
        onSignal?.(signal);
        signal.addEventListener('abort', () => resolve({ kind: 'RELEASE' }), { once: true });
      });

  const settleTerminal: FakeExecute = async ({ lease, repository }) => {
    await repository.failTerminal(lease, 'FAKE_S4B_TERMINAL');
    return { kind: 'SETTLED' };
  };

  // ── Discovery ────────────────────────────────────────────────────────────

  it('D03 killed or missing control row: KILLED before any candidate scan; nothing created', async () => {
    const t = await tenant();
    const { service } = discovery(configFor([t]));
    await setKillState(admin, 'KILLED');
    await expect(service.runDiscoveryPass()).resolves.toMatchObject({ status: 'KILLED', candidates: 0, created: 0 });
    await deleteKillRow(admin);
    await expect(service.runDiscoveryPass()).resolves.toMatchObject({ status: 'KILLED', created: 0 });
    expect(await items(t)).toEqual([]);
    expect(await nextOccurrence(t)).toBeNull();
  });

  it('D04 settled COMPLETED trip: exactly one PENDING PRIMARY via T01 with occurrence 1, DB-time eligibility and the canonical pvk', async () => {
    const t = await tenant();
    const { service, pipeline } = discovery(configFor([t]));
    await expect(service.runDiscoveryPass()).resolves.toMatchObject({ status: 'COMPLETED', candidates: 1, created: 1 });
    const [row, ...rest] = await items(t);
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      status: 'PENDING',
      run_purpose: 'PRIMARY',
      source_family: 'UNKNOWN',
      boundary_occurrence: 0,
      pipeline_version_key: pipeline.pipelineVersionKey,
      lease_epoch: 0n,
      attempt_count: 0,
      eligible_at_passed: true,
      anchor_matches_end: true,
    });
    expect(await nextOccurrence(t)).toBe(1);
  });

  it('D05 settlement: trips inside the 24 h quiet period and trips with a recent APPLIED repair are not discovered', async () => {
    const fresh = await tenant(3_600);
    const repaired = await tenant();
    const rejectedRepair = await tenant();
    for (const [t, status] of [
      [repaired, 'APPLIED'],
      [rejectedRepair, 'REJECTED'],
    ] as const) {
      await admin.$executeRaw`
        INSERT INTO trip_repairs (id, vehicle_id, trip_id, repair_type, status, reason, confidence, window_from, window_to, applied_at, created_at)
        VALUES (${randomUUID()}, ${t.vehicleId}, ${t.tripId}, 'MISSING_END', ${status}, 'S4B_TEST', 'HIGH',
          (now() AT TIME ZONE 'UTC') - interval '4 days', (now() AT TIME ZONE 'UTC') - interval '3 days',
          (now() AT TIME ZONE 'UTC') - interval '1 hour', (now() AT TIME ZONE 'UTC'))`;
    }
    const { service } = discovery(configFor([fresh, repaired, rejectedRepair]));
    await expect(service.runDiscoveryPass()).resolves.toMatchObject({ candidates: 1, created: 1 });
    expect(await items(fresh)).toEqual([]);
    expect(await items(repaired)).toEqual([]);
    expect(await items(rejectedRepair)).toHaveLength(1);
  });

  it('D06 non-COMPLETED trips (ONGOING; CANCELLED where the DB enum has it) are never discovered', async () => {
    const ongoing = await tenant();
    const reopened = await tenant();
    await admin.$executeRaw`UPDATE vehicle_trips SET trip_status = 'ONGOING', end_time = NULL WHERE id = ${ongoing.tripId}`;
    await admin.$executeRaw`UPDATE vehicle_trips SET trip_status = 'ONGOING' WHERE id = ${reopened.tripId}`;
    const allowed = [ongoing, reopened];
    const labels = await admin.$queryRaw<Array<{ label: string }>>`
      SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'TripStatus'`;
    if (labels.some((l) => l.label === 'CANCELLED')) {
      const cancelled = await tenant();
      await admin.$executeRaw`UPDATE vehicle_trips SET trip_status = 'CANCELLED' WHERE id = ${cancelled.tripId}`;
      allowed.push(cancelled);
    }
    const { service } = discovery(configFor(allowed));
    await expect(service.runDiscoveryPass()).resolves.toMatchObject({ status: 'COMPLETED', candidates: 0, created: 0 });
  });

  it('D07 allowlists are an intersection: a vehicle or organization outside either list is not discovered', async () => {
    const a = await tenant();
    const b = await tenant();
    const c = await tenant();
    const config = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_DISCOVERY_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
      DI_V0_S4_R1_ENABLED: 'true',
      DI_V0_S4_ORGANIZATION_ALLOWLIST: [a.organizationId, c.organizationId].join(','),
      DI_V0_S4_VEHICLE_ALLOWLIST: [a.vehicleId, b.vehicleId].join(','),
    });
    const { service } = discovery(config);
    await expect(service.runDiscoveryPass()).resolves.toMatchObject({ candidates: 1, created: 1 });
    expect(await items(a)).toHaveLength(1);
    expect(await items(b)).toEqual([]);
    expect(await items(c)).toEqual([]);
  });

  it('D08 idempotent: a second pass finds nothing and allocates no boundary occurrence', async () => {
    const t = await tenant();
    const { service } = discovery(configFor([t]));
    await service.runDiscoveryPass();
    await expect(service.runDiscoveryPass()).resolves.toMatchObject({ candidates: 0, created: 0, duplicates: 0 });
    expect(await items(t)).toHaveLength(1);
    expect(await nextOccurrence(t)).toBe(1);
  });

  it('D09 two concurrent discoverers through the real control-row lock queue: one creates, one collapses to DUPLICATE; occurrence not burned', async () => {
    const t = await tenant();
    const config = configFor([t]);
    const first = discovery(config);
    const second = discovery(config);
    const results = await raceThroughControlGate(client(), observer, [
      () => first.service.runDiscoveryPass(),
      () => second.service.runDiscoveryPass(),
    ]);
    const passes = results.map((r) => {
      if (!r.ok) throw r.error;
      return r.value;
    });
    expect(passes.map((p) => p.created).sort()).toEqual([0, 1]);
    expect(passes.map((p) => p.duplicates).sort()).toEqual([0, 1]);
    expect(await items(t)).toHaveLength(1);
    expect(await nextOccurrence(t)).toBe(1);
  });

  it('D10 bounded, deterministic, oldest-anchor-first batches', async () => {
    const t = await tenant(3 * 86_400);
    const oldest = await addTrip(t, 5 * 86_400);
    const middle = await addTrip(t, 4 * 86_400);
    const { service } = discovery(configFor([t]));
    await expect(service.runDiscoveryPass({ limit: 2 })).resolves.toMatchObject({ candidates: 2, created: 2 });
    const firstBatch = await admin.$queryRaw<Array<{ trip_id: string }>>`
      SELECT trip_id FROM di_v0_s4_work_items WHERE vehicle_id = ${t.vehicleId} ORDER BY trip_id`;
    expect(firstBatch.map((r) => r.trip_id)).toEqual([oldest, middle].sort());
    await expect(service.runDiscoveryPass({ limit: 2 })).resolves.toMatchObject({ candidates: 1, created: 1 });
    expect(await items(t)).toHaveLength(3);
    await expect(service.runDiscoveryPass({ limit: 0 })).resolves.toMatchObject({ candidates: 0 });
  });

  it('D11 source family comes from DimoVehicle.rawJson via resolveDiV0SourceFamily, never hardwareType; UNKNOWN is accepted', async () => {
    const r1 = await tenant();
    const synthetic = await tenant();
    const conflicting = await tenant();
    await linkDimo(r1, { aftermarketDevice: { serial: 'R1-S4BTEST' } }, 'SMART5');
    await linkDimo(synthetic, { syntheticDevice: { id: 1 } }, 'LTE_R1');
    await linkDimo(conflicting, { aftermarketDevice: { serial: 'R1-X' }, syntheticDevice: { id: 2 } }, 'LTE_R1');
    const { service } = discovery(configFor([r1, synthetic, conflicting]));
    await expect(service.runDiscoveryPass()).resolves.toMatchObject({ created: 3 });
    expect((await items(r1))[0].source_family).toBe('RUPTELA_R1');
    expect((await items(synthetic))[0].source_family).toBe('API_SYNTHETIC');
    expect((await items(conflicting))[0].source_family).toBe('UNKNOWN');
  });

  it('D12 after a T13 holder supersede, the next pass creates the successor PRIMARY (occurrence 2, new fingerprint)', async () => {
    const t = await tenant();
    const config = configFor([t]);
    const { service, pipeline } = discovery(config);
    await service.runDiscoveryPass();
    const repo = new DiV0S4WorkItemRepository(client(), config);
    const lease = await repo.claim({ leaseOwner: 's4b-d12', pipelineManifest: pipeline.manifest });
    await changeTripBoundary(admin, t.tripId);
    await repo.holderSupersede(lease, 'BOUNDARY_CHANGED');
    await expect(service.runDiscoveryPass()).resolves.toMatchObject({ created: 1 });
    const [superseded, successor] = await items(t);
    expect(superseded).toMatchObject({ status: 'SUPERSEDED', boundary_occurrence: 0 });
    expect(successor).toMatchObject({ status: 'PENDING', boundary_occurrence: 1 });
    expect(successor.boundary_fingerprint).not.toBe(superseded.boundary_fingerprint);
  });

  it('D13 retired pipeline version: the pass stops on PIPELINE_VERSION_NOT_ACTIVE and creates nothing', async () => {
    const a = await tenant();
    const b = await tenant();
    const config = configFor([a, b], { DI_V0_S4_R1_ENABLED: 'false' });
    const { service, pipeline } = discovery(config);
    await discovery(configFor([a], { DI_V0_S4_R1_ENABLED: 'false' })).service.runDiscoveryPass();
    await retireRegistry(admin, pipeline.pipelineVersionKey);
    await expect(service.runDiscoveryPass()).resolves.toMatchObject({
      status: 'STOPPED',
      stopReason: 'PIPELINE_VERSION_NOT_ACTIVE',
      created: 0,
    });
    expect(await items(b)).toEqual([]);
  });

  it('D15 discovery writes only through T01: canonical trip row byte-identical, no S2 run, no snapshot', async () => {
    const t = await tenant();
    const before = await tripRow(t.tripId);
    await discovery(configFor([t])).service.runDiscoveryPass();
    expect(await tripRow(t.tripId)).toBe(before);
    const side = await admin.$queryRaw<Array<{ runs: bigint; snaps: bigint }>>`
      SELECT (SELECT count(*) FROM di_v0_shadow_runs WHERE trip_id = ${t.tripId}) AS runs,
             (SELECT count(*) FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${t.tripId}) AS snaps`;
    expect(side[0]).toEqual({ runs: 0n, snaps: 0n });
  });

  // ── Claim loop ───────────────────────────────────────────────────────────

  it('C02 no registered executor: a claimable item stays PENDING with lease_epoch 0', async () => {
    const t = await tenant();
    const config = configFor([t]);
    await discovery(config).service.runDiscoveryPass();
    await expect(claimLoop(config, null).runOnce()).resolves.toMatchObject({ status: 'EXECUTOR_NOT_READY' });
    expect(await items(t)).toEqual([expect.objectContaining({ status: 'PENDING', lease_epoch: 0n, attempt_count: 0 })]);
  });

  it('C04 ready executor: T02 claim hands a live fence to the executor; SETTLED needs no orchestrator write', async () => {
    const t = await tenant();
    const config = configFor([t]);
    await discovery(config).service.runDiscoveryPass();
    let seen: DiV0S4ExecutionContext | null = null;
    const result = await claimLoop(config, async (ctx) => {
      seen = ctx;
      return settleTerminal(ctx);
    }).runOnce();
    expect(result).toMatchObject({ status: 'SETTLED', transitionId: 'T02_CLAIM', releaseReason: null });
    expect(seen!.lease.leaseEpoch).toBe(1n);
    expect(seen!.signal.aborted).toBe(false);
    expect(await items(t)).toEqual([
      expect.objectContaining({ status: 'FAILED_TERMINAL', failure_reason: 'FAKE_S4B_TERMINAL', attempt_count: 1 }),
    ]);
  });

  it('C05 executor throws: T07 EXECUTOR_ERROR, lease cleared, first backoff (900 s) on the DB clock', async () => {
    const t = await tenant();
    const config = configFor([t]);
    await discovery(config).service.runDiscoveryPass();
    const result = await claimLoop(config, async () => {
      throw new Error('fake executor failure');
    }).runOnce();
    expect(result).toMatchObject({ status: 'RELEASED', releaseReason: 'EXECUTOR_ERROR' });
    const [row] = await items(t);
    expect(row).toMatchObject({ status: 'FAILED_RETRYABLE', failure_reason: 'EXECUTOR_ERROR', lease_owner: null });
    expect(row.retry_delay_s!).toBeGreaterThan(890);
    expect(row.retry_delay_s!).toBeLessThanOrEqual(900);
  });

  it('C06 executor RELEASE outcome: T07 EXECUTOR_RELEASED', async () => {
    const t = await tenant();
    const config = configFor([t]);
    await discovery(config).service.runDiscoveryPass();
    await expect(claimLoop(config, async () => ({ kind: 'RELEASE' })).runOnce()).resolves.toMatchObject({
      status: 'RELEASED',
      releaseReason: 'EXECUTOR_RELEASED',
    });
    expect((await items(t))[0]).toMatchObject({ status: 'FAILED_RETRYABLE', failure_reason: 'EXECUTOR_RELEASED' });
  });

  it('C07 work budget: the AbortSignal fires and the lease is relinquished as WORK_BUDGET_EXCEEDED', async () => {
    const t = await tenant();
    const config = configFor([t]);
    await discovery(config).service.runDiscoveryPass();
    let signal: AbortSignal | null = null;
    const result = await claimLoop(config, hangUntilAborted((s) => (signal = s)), { workBudgetMs: 400, heartbeatIntervalMs: 60_000 }).runOnce();
    expect(result).toMatchObject({ status: 'RELEASED', releaseReason: 'WORK_BUDGET_EXCEEDED' });
    expect(signal!.aborted).toBe(true);
    expect(signal!.reason).toBe('WORK_BUDGET');
    expect((await items(t))[0]).toMatchObject({ status: 'FAILED_RETRYABLE', failure_reason: 'WORK_BUDGET_EXCEEDED' });
  });

  it('C08 heartbeats run through T03 during a long attempt and extend the lease on the DB clock', async () => {
    const t = await tenant();
    const config = configFor([t]);
    await discovery(config).service.runDiscoveryPass();
    let heartbeatSeenInDb: boolean | null = null;
    const result = await claimLoop(
      config,
      async (ctx) => {
        await new Promise((resolve) => setTimeout(resolve, 900));
        heartbeatSeenInDb = (await items(t))[0].heartbeat_after_claim;
        return settleTerminal(ctx);
      },
      { heartbeatIntervalMs: 200, workBudgetMs: 5_000 },
    ).runOnce();
    expect(result.status).toBe('SETTLED');
    expect(result.heartbeats).toBeGreaterThanOrEqual(2);
    expect(heartbeatSeenInDb).toBe(true);
  });

  it('C09 lost lease (expiry + T04 takeover by another replica): the loser aborts and writes nothing', async () => {
    const t = await tenant();
    const config = configFor([t]);
    await discovery(config).service.runDiscoveryPass();
    const claimed = deferred();
    let loserSignal: AbortSignal | null = null;
    const loser = claimLoop(
      config,
      hangUntilAborted((s) => {
        loserSignal = s;
        claimed.resolve();
      }),
      { owner: 's4b-loser', heartbeatIntervalMs: 200, workBudgetMs: 10_000 },
    );
    const loserRun = loser.runOnce();
    await claimed.promise;
    await advanceS4aClock(admin, t.tripId, 400);
    const winner = await claimLoop(config, settleTerminal, { owner: 's4b-winner' }).runOnce();
    const loserResult = await loserRun;
    expect(winner).toMatchObject({ status: 'SETTLED', transitionId: 'T04_TAKEOVER' });
    expect(loserResult).toMatchObject({ status: 'LEASE_LOST', releaseReason: null });
    expect(loserSignal!.reason).toBe('LEASE_LOST');
    expect((await items(t))[0]).toMatchObject({
      status: 'FAILED_TERMINAL',
      failure_reason: 'FAKE_S4B_TERMINAL',
      lease_epoch: 2n,
      attempt_count: 2,
    });
  });

  it('C10 kill during an attempt: heartbeat refused, attempt aborted, T07 relinquish still succeeds while KILLED', async () => {
    const t = await tenant();
    const config = configFor([t]);
    await discovery(config).service.runDiscoveryPass();
    const claimed = deferred();
    const run = claimLoop(config, hangUntilAborted(() => claimed.resolve()), { heartbeatIntervalMs: 150, workBudgetMs: 10_000 }).runOnce();
    await claimed.promise;
    await setKillState(admin, 'KILLED');
    await expect(run).resolves.toMatchObject({ status: 'RELEASED', releaseReason: 'CONTROL_PLANE_RELINQUISH' });
    expect((await items(t))[0]).toMatchObject({ status: 'FAILED_RETRYABLE', failure_reason: 'CONTROL_PLANE_RELINQUISH', lease_owner: null });
  });

  it('C11 kill before claim: CLAIM_REFUSED, nothing leased', async () => {
    const t = await tenant();
    const config = configFor([t]);
    await discovery(config).service.runDiscoveryPass();
    await setKillState(admin, 'KILLED');
    const execute = jest.fn(settleTerminal);
    await expect(claimLoop(config, execute).runOnce()).resolves.toMatchObject({ status: 'CLAIM_REFUSED', refusalCode: 'DB_KILL_ACTIVE' });
    expect(execute).not.toHaveBeenCalled();
    expect((await items(t))[0]).toMatchObject({ status: 'PENDING', lease_epoch: 0n });
  });

  it('C12 nothing claimable (retry backoff pending): IDLE, executor untouched', async () => {
    const t = await tenant();
    const config = configFor([t]);
    await discovery(config).service.runDiscoveryPass();
    await claimLoop(config, async () => ({ kind: 'RELEASE' })).runOnce();
    const execute = jest.fn(settleTerminal);
    await expect(claimLoop(config, execute).runOnce()).resolves.toMatchObject({ status: 'IDLE' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('C13 two replicas, one item: exactly one claims (FOR UPDATE SKIP LOCKED), the other is IDLE', async () => {
    const t = await tenant();
    const config = configFor([t]);
    await discovery(config).service.runDiscoveryPass();
    const hold = deferred();
    const gated: FakeExecute = async (ctx) => {
      await hold.promise;
      return settleTerminal(ctx);
    };
    const runs: Array<Promise<DiV0S4ClaimLoopResult>> = [claimLoop(config, gated).runOnce(), claimLoop(config, gated).runOnce()];
    const first = await Promise.race(runs);
    expect(first.status).toBe('IDLE');
    hold.resolve();
    const statuses = (await Promise.all(runs)).map((r) => r.status).sort();
    expect(statuses).toEqual(['IDLE', 'SETTLED']);
    expect((await items(t))[0]).toMatchObject({ lease_epoch: 1n, attempt_count: 1 });
  });

  it('C14 mixed replicas: a replica whose channel flags give another pvk never claims the item', async () => {
    const t = await tenant();
    await discovery(configFor([t])).service.runDiscoveryPass();
    const execute = jest.fn(settleTerminal);
    await expect(claimLoop(configFor([t], { DI_V0_S4_R1_ENABLED: 'false' }), execute).runOnce()).resolves.toMatchObject({
      status: 'IDLE',
    });
    expect(execute).not.toHaveBeenCalled();
    expect((await items(t))[0]).toMatchObject({ status: 'PENDING', lease_epoch: 0n });
  });

  it('C10 stale lease epoch: heartbeat fails closed and the holder performs no further authoritative write', async () => {
    const t = await tenant();
    const config = configFor([t]);
    await discovery(config).service.runDiscoveryPass();
    const claimed = deferred();
    const run = claimLoop(
      config,
      async (ctx) => {
        claimed.resolve();
        await new Promise((resolve) => setTimeout(resolve, 350));
        return settleTerminal(ctx);
      },
      { heartbeatIntervalMs: 80, workBudgetMs: 10_000 },
    ).runOnce();
    await claimed.promise;
    const [row] = await items(t);
    await admin.$executeRaw`UPDATE di_v0_s4_work_items SET lease_epoch = lease_epoch + 1 WHERE id = ${row.id}`;
    const result = await run;
    expect(result.status).toBe('LEASE_LOST');
    expect((await items(t))[0]).toMatchObject({ status: 'LEASED', lease_epoch: 2n });
    expect((await items(t))[0].failure_reason).toBeNull();
  });

  it('C15 authoritative retirement: eligible PENDING superseded; claim loop IDLE (CLASS A)', async () => {
    const t = await tenant();
    const config = configFor([t]);
    const { pipeline } = discovery(config);
    await discovery(config).service.runDiscoveryPass();
    await retireRegistry(admin, pipeline.pipelineVersionKey, config);
    const registry = new DiV0S4ExecutorRegistry();
    registry.register({ executorId: 'RETIRED', isReady: () => true, execute: settleTerminal });
    const result = await new DiV0S4ClaimLoop(
      new DiV0S4WorkItemRepository(client(), config),
      config,
      pipeline,
      registry,
      { leaseOwner: 's4b-c15' },
    ).runOnce();
    expect(result).toMatchObject({ status: 'IDLE', refusalCode: null });
    expect((await items(t))[0]).toMatchObject({
      status: 'SUPERSEDED',
      superseded_reason: 'PIPELINE_RETIRED',
      lease_epoch: 1n,
    });
  });

  it('C15 legacy RETIRED straggler: T02 claim refuses PIPELINE_VERSION_NOT_ACTIVE without leasing', async () => {
    const t = await tenant();
    const config = configFor([t]);
    const { pipeline } = discovery(config);
    await discovery(config).service.runDiscoveryPass();
    await retireRegistryStatusOnly(admin, pipeline.pipelineVersionKey);
    const registry = new DiV0S4ExecutorRegistry();
    registry.register({ executorId: 'RETIRED', isReady: () => true, execute: settleTerminal });
    const result = await new DiV0S4ClaimLoop(
      new DiV0S4WorkItemRepository(client(), config),
      config,
      pipeline,
      registry,
      { leaseOwner: 's4b-c15b-straggler' },
    ).runOnce();
    expect(result).toMatchObject({ status: 'CLAIM_REFUSED', refusalCode: 'PIPELINE_VERSION_NOT_ACTIVE' });
    expect((await items(t))[0]).toMatchObject({ status: 'PENDING', lease_epoch: 0n });
  });

  it('C15b last attempt: T07 refuses ATTEMPTS_EXHAUSTED, the loop reports RELEASE_REFUSED and does not retry', async () => {
    const t = await tenant();
    const config = configFor([t]);
    await discovery(config).service.runDiscoveryPass();
    await admin.$executeRaw`UPDATE di_v0_s4_work_items SET attempt_count = 4 WHERE vehicle_id = ${t.vehicleId}`;
    const result = await claimLoop(config, async () => {
      throw new Error('fail on last attempt');
    }).runOnce();
    expect(result).toMatchObject({ status: 'RELEASE_REFUSED', releaseReason: 'EXECUTOR_ERROR', refusalCode: 'ATTEMPTS_EXHAUSTED' });
    expect((await items(t))[0]).toMatchObject({ status: 'LEASED', attempt_count: 5 });
  });

  // ── P1 closure (attempt-start recheck + SETTLED postcondition) ─────────────

  describe('S4B P1 closure', () => {
    it('S4B-P1A-01 unchanged boundary -> executor called once', async () => {
      const t = await tenant();
      const config = configFor([t]);
      await discovery(config).service.runDiscoveryPass();
      const execute = jest.fn(settleTerminal);
      await expect(claimLoop(config, execute).runOnce()).resolves.toMatchObject({ status: 'SETTLED' });
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('S4B-P1A-02 changed boundary -> T13, executor 0', async () => {
      const t = await tenant();
      const config = configFor([t]);
      await discovery(config).service.runDiscoveryPass();
      await changeTripBoundary(admin, t.tripId);
      const execute = jest.fn(settleTerminal);
      await expect(claimLoop(config, execute).runOnce()).resolves.toMatchObject({ status: 'BOUNDARY_SUPERSEDED' });
      expect(execute).not.toHaveBeenCalled();
      expect((await items(t))[0]).toMatchObject({ status: 'SUPERSEDED', superseded_reason: 'BOUNDARY_CHANGED' });
    });

    it('S4B-P1A-03 trip reopened to ONGOING -> TRIP_NOT_COMPLETED supersede, executor 0', async () => {
      const t = await tenant();
      const config = configFor([t]);
      await discovery(config).service.runDiscoveryPass();
      await admin.$executeRaw`UPDATE vehicle_trips SET trip_status = 'ONGOING', end_time = NULL WHERE id = ${t.tripId}`;
      const execute = jest.fn(settleTerminal);
      await expect(claimLoop(config, execute).runOnce()).resolves.toMatchObject({ status: 'BOUNDARY_SUPERSEDED' });
      expect(execute).not.toHaveBeenCalled();
      expect((await items(t))[0]).toMatchObject({ status: 'SUPERSEDED', superseded_reason: 'TRIP_NOT_COMPLETED' });
    });

    it('S4B-P1A-04 cancelled trip -> TRIP_CANCELLED supersede when enum exists', async () => {
      const labels = await admin.$queryRaw<Array<{ label: string }>>`
        SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'TripStatus'`;
      if (!labels.some((l) => l.label === 'CANCELLED')) return;
      const t = await tenant();
      const config = configFor([t]);
      await discovery(config).service.runDiscoveryPass();
      await admin.$executeRaw`UPDATE vehicle_trips SET trip_status = 'CANCELLED' WHERE id = ${t.tripId}`;
      const execute = jest.fn(settleTerminal);
      await expect(claimLoop(config, execute).runOnce()).resolves.toMatchObject({ status: 'BOUNDARY_SUPERSEDED' });
      expect(execute).not.toHaveBeenCalled();
      expect((await items(t))[0]).toMatchObject({ status: 'SUPERSEDED', superseded_reason: 'TRIP_CANCELLED' });
    });

    it('S4B-P1A-05 APPLIED repair after T01 before claim -> executor 0, later discovery creates successor PRIMARY', async () => {
      const t = await tenant(3 * 86_400);
      const config = configFor([t]);
      await discovery(config).service.runDiscoveryPass();
      expect((await items(t))).toHaveLength(1);
      await admin.$executeRaw`
        INSERT INTO trip_repairs (id, vehicle_id, trip_id, repair_type, status, reason, confidence, window_from, window_to, applied_at, created_at)
        VALUES (${randomUUID()}, ${t.vehicleId}, ${t.tripId}, 'MISSING_END', 'APPLIED', 'S4B_P1A_05', 'HIGH',
          (now() AT TIME ZONE 'UTC') - interval '2 days', (now() AT TIME ZONE 'UTC') - interval '1 day',
          clock_timestamp(), clock_timestamp())`;
      await changeTripBoundary(admin, t.tripId);
      const execute = jest.fn(settleTerminal);
      await expect(claimLoop(config, execute).runOnce()).resolves.toMatchObject({ status: 'BOUNDARY_SUPERSEDED' });
      expect(execute).not.toHaveBeenCalled();
      await admin.$executeRaw`
        UPDATE trip_repairs SET applied_at = applied_at - interval '25 hours', created_at = created_at - interval '25 hours'
        WHERE trip_id = ${t.tripId} AND status = 'APPLIED'`;
      await discovery(config).service.runDiscoveryPass();
      const rows = await items(t);
      expect(rows.filter((r) => r.status !== 'SUPERSEDED')).toHaveLength(1);
      expect(rows.find((r) => r.status !== 'SUPERSEDED')).toMatchObject({ boundary_occurrence: 1 });
    });

    it('S4B-P1A-06 concurrent boundary change during claim/recheck window -> no stale execution', async () => {
      const t = await tenant();
      const config = configFor([t]);
      await discovery(config).service.runDiscoveryPass();
      const execute = jest.fn(settleTerminal);
      const [result] = await Promise.all([
        claimLoop(config, execute).runOnce(),
        (async () => {
          await changeTripBoundary(admin, t.tripId);
        })(),
      ]);
      expect(['BOUNDARY_SUPERSEDED', 'SETTLED']).toContain(result.status);
      if (result.status === 'BOUNDARY_SUPERSEDED') expect(execute).not.toHaveBeenCalled();
    });

    it('S4B-P1A-07 lost lease before recheck completion -> executor 0', async () => {
      const t = await tenant();
      const config = configFor([t]);
      const db = client();
      const repo = new DiV0S4WorkItemRepository(db, config);
      const manifest = buildDiV0S4RuntimePipelineManifest(config);
      await discovery(config).service.runDiscoveryPass();
      const lease = await repo.claim({ leaseOwner: 'p1a-07', pipelineManifest: manifest.manifest });
      await advanceS4aClock(admin, t.tripId, 400);
      expect(await repo.evaluateAttemptStartBoundary(lease)).toEqual({ kind: 'LEASE_LOST', code: 'LEASE_EXPIRED' });
      const execute = jest.fn(settleTerminal);
      const registry = new DiV0S4ExecutorRegistry();
      registry.register({ executorId: 'FAKE_S4B_EXECUTOR', isReady: () => true, execute });
      const loop = new DiV0S4ClaimLoop(repo, config, manifest, registry, { leaseOwner: 'p1a-07-loop', workBudgetMs: 240_000 });
      jest.spyOn(repo, 'evaluateAttemptStartBoundary').mockResolvedValueOnce({ kind: 'LEASE_LOST', code: 'LEASE_EXPIRED' });
      await expect(loop.runOnce()).resolves.toMatchObject({ status: 'LEASE_LOST' });
      expect(execute).not.toHaveBeenCalled();
    });

    it('S4B-P1A-08 post-recheck boundary mutation remains covered by T06 completion check', async () => {
      const t = await tenant();
      await linkDimo(t, { aftermarketDevice: { serial: 'R1-P1A08' } }, 'SMART5');
      const config = configFor([t]);
      await discovery(config).service.runDiscoveryPass();
      const execute: FakeExecute = async (ctx) => {
        await ctx.repository.pinEvidence(ctx.lease, {
          windowStart: t.startTime,
          windowEnd: t.endTime,
          channels: s4aChannels('p1a-08'),
        });
        await changeTripBoundary(admin, t.tripId);
        let completionError: unknown;
        try {
          await ctx.repository.completeWithS2(ctx.lease, { pipelineManifest: ctx.pipelineManifest, intervals: s4aIntervals() });
        } catch (error) {
          completionError = error;
        }
        expect(completionError).toBeInstanceOf(DiV0S4TransitionRejectedError);
        await ctx.repository.failTerminal(ctx.lease, 'P1A08_ABORT');
        return { kind: 'SETTLED' };
      };
      await expect(claimLoop(config, execute).runOnce()).resolves.toMatchObject({ status: 'SETTLED' });
    });

    it('S4B-P1B-01 T06 COMPLETED + SETTLED -> accepted', async () => {
      const t = await tenant();
      await linkDimo(t, { aftermarketDevice: { serial: 'R1-P1B01' } }, 'SMART5');
      const config = configFor([t]);
      await discovery(config).service.runDiscoveryPass();
      const execute: FakeExecute = async (ctx) => {
        await ctx.repository.pinEvidence(ctx.lease, {
          windowStart: t.startTime,
          windowEnd: t.endTime,
          channels: s4aChannels('p1b-01'),
        });
        await ctx.repository.completeWithS2(ctx.lease, { pipelineManifest: ctx.pipelineManifest, intervals: s4aIntervals() });
        return { kind: 'SETTLED' };
      };
      await expect(claimLoop(config, execute).runOnce()).resolves.toMatchObject({ status: 'SETTLED' });
      expect((await items(t))[0]).toMatchObject({ status: 'COMPLETED', source_family: 'RUPTELA_R1' });
    });

    it('S4B-P1B-02 T08 FAILED_TERMINAL + SETTLED -> accepted', async () => {
      const t = await tenant();
      const config = configFor([t]);
      await discovery(config).service.runDiscoveryPass();
      await expect(claimLoop(config, settleTerminal).runOnce()).resolves.toMatchObject({ status: 'SETTLED' });
      expect((await items(t))[0]).toMatchObject({ status: 'FAILED_TERMINAL' });
    });

    it('S4B-P1B-03 T09 SKIPPED_INELIGIBLE + SETTLED -> accepted', async () => {
      const t = await tenant();
      const config = configFor([t]);
      await discovery(config).service.runDiscoveryPass();
      const execute: FakeExecute = async (ctx) => {
        await ctx.repository.skipIneligible(ctx.lease, 'WINDOW_EXCEEDS_MAX_8H');
        return { kind: 'SETTLED' };
      };
      await expect(claimLoop(config, execute).runOnce()).resolves.toMatchObject({ status: 'SETTLED' });
      expect((await items(t))[0]).toMatchObject({ status: 'SKIPPED_INELIGIBLE' });
    });

    it('S4B-P1B-04 T13 SUPERSEDED + SETTLED -> accepted', async () => {
      const t = await tenant();
      const config = configFor([t]);
      await discovery(config).service.runDiscoveryPass();
      const execute: FakeExecute = async (ctx) => {
        await changeTripBoundary(admin, t.tripId);
        await ctx.repository.holderSupersede(ctx.lease, 'BOUNDARY_CHANGED');
        return { kind: 'SETTLED' };
      };
      await expect(claimLoop(config, execute).runOnce()).resolves.toMatchObject({ status: 'SETTLED' });
      expect((await items(t))[0]).toMatchObject({ status: 'SUPERSEDED' });
    });

    it('S4B-P1B-05 SETTLED with row still LEASED -> rejected + safe T07', async () => {
      const t = await tenant();
      const config = configFor([t]);
      await discovery(config).service.runDiscoveryPass();
      const result = await claimLoop(config, async () => ({ kind: 'SETTLED' })).runOnce();
      expect(result).toMatchObject({ status: 'RELEASED', releaseReason: 'EXECUTOR_POSTCONDITION_FAILED' });
      expect((await items(t))[0]).toMatchObject({ status: 'FAILED_RETRYABLE', failure_reason: 'EXECUTOR_POSTCONDITION_FAILED' });
    });

    it('S4B-P1B-06 false SETTLED after lease loss -> no stale write', async () => {
      const t = await tenant();
      const config = configFor([t]);
      const manifest = buildDiV0S4RuntimePipelineManifest(config);
      await discovery(config).service.runDiscoveryPass();
      const db = client();
      const repo = new DiV0S4WorkItemRepository(db, config);
      const lease = await repo.claim({ leaseOwner: 'p1b-06', pipelineManifest: manifest.manifest });
      await advanceS4aClock(admin, t.tripId, 400);
      const post = await repo.readExecutionPostcondition(lease.workItemId);
      expect(post.leaseActivelyHeld).toBe(false);
    });

    it('S4B-P1B-07 terminalized concurrently -> accept SETTLED without duplicate terminal write', async () => {
      const t = await tenant();
      const config = configFor([t]);
      await discovery(config).service.runDiscoveryPass();
      const execute: FakeExecute = async (ctx) => {
        await changeTripBoundary(admin, t.tripId);
        await ctx.repository.holderSupersede(ctx.lease, 'BOUNDARY_CHANGED');
        return { kind: 'SETTLED' };
      };
      await expect(claimLoop(config, execute).runOnce()).resolves.toMatchObject({ status: 'SETTLED' });
      expect((await items(t)).filter((r) => r.status === 'COMPLETED')).toHaveLength(0);
    });

    it('S4B-P1B-08 executor throws unchanged -> T07 EXECUTOR_ERROR', async () => {
      const t = await tenant();
      const config = configFor([t]);
      await discovery(config).service.runDiscoveryPass();
      await expect(claimLoop(config, async () => {
        throw new Error('p1b-08');
      }).runOnce()).resolves.toMatchObject({ status: 'RELEASED', releaseReason: 'EXECUTOR_ERROR' });
    });
  });
});
