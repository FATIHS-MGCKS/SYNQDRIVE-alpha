import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { gzipSync } from 'zlib';
import { PrismaClient } from '@prisma/client';
import { CALIBRATION_UNSET_V0_BUNDLE, computeDiV0TripIntervals, DEFAULT_DI_V0_VERSION_TUPLE } from '../../core';
import { presentObs } from '../../core/__tests__/test-helpers';
import { mapComputeOutputToPersistRows } from '../../shadow-persistence/di-v0-shadow-mapper';
import type { DiV0ShadowPersistedIntervalInput } from '../../shadow-persistence/di-v0-shadow-types';
import { DI_V0_S4_EVIDENCE_CONTAINER_VERSION, type DiV0S4PipelineManifest } from '../di-v0-s4a-contract';
import { parseDiV0S4ControlPlaneConfig, type DiV0S4ControlPlaneConfig } from '../di-v0-s4a-control-plane';
import { DiV0S4WorkItemRepository } from '../di-v0-s4a-work-item.repository';
import {
  buildDiV0S4BoundaryFingerprint,
  deriveDiV0S4ChannelEnablement,
  serializeDiV0S4EvidenceContainer,
  type DiV0S4EvidenceChannelInput,
} from '../di-v0-s4a-identity';

/**
 * Test-only harness for the S4A Postgres specs. Requires a disposable database with the S4A
 * migration applied (`bash backend/scripts/test/di-v0-s4a-postgres-bootstrap.sh`). Everything that
 * writes the control row, the registry status or canonical rows here is operator/test simulation;
 * production code has no such path.
 */
export const S4A_POSTGRES_LIVE = process.env.DI_V0_S4A_POSTGRES_INTEGRATION === '1';
export const S4A_POSTGRES_REQUIRED = process.env.DI_V0_S4A_POSTGRES_REQUIRED === '1';

/** Fail closed when CI sets DI_V0_S4A_POSTGRES_REQUIRED=1 but integration env is incomplete (no silent skip). */
export function assertS4aPostgresCiEnv(): void {
  if (!S4A_POSTGRES_REQUIRED) return;
  const missing: string[] = [];
  if (!S4A_POSTGRES_LIVE) missing.push('DI_V0_S4A_POSTGRES_INTEGRATION=1');
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!process.env.DI_V0_S4A_PG_ADMIN_URL) missing.push('DI_V0_S4A_PG_ADMIN_URL');
  if (!process.env.DI_V0_S4A_PG_TEMPLATE_DB) missing.push('DI_V0_S4A_PG_TEMPLATE_DB');
  if (missing.length > 0) {
    throw new Error(`DI_V0_S4A_POSTGRES_REQUIRED=1 but S4A Postgres CI env incomplete: ${missing.join(', ')}`);
  }
}

export const REPO_ROOT = path.join(__dirname, '../../../../../../..');
export const S4A_CONTRACT = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'architecture/drivingintelligence/design/s4a/s4a-contract.v2.json'), 'utf8'),
);

export function newS4aClient(): PrismaClient {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required for S4A Postgres tests');
  return new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
}

export interface S4aTenant {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  startTime: Date;
  endTime: Date;
}

export async function seedS4aTenant(prisma: PrismaClient, ageSeconds = 3 * 86_400): Promise<S4aTenant> {
  const suffix = randomUUID().slice(0, 8);
  const organizationId = randomUUID();
  const vehicleId = randomUUID();
  const tripId = randomUUID();
  const now = Date.now();
  const startTime = new Date(Math.floor((now - ageSeconds * 1000) / 1000) * 1000);
  const endTime = new Date(startTime.getTime() + 20 * 60_000);
  await prisma.$executeRawUnsafe(
    `INSERT INTO organizations (id, company_name, business_type, status, created_at, updated_at)
     VALUES ($1, $2, 'RENTAL', 'ACTIVE', $3, $3)`,
    organizationId,
    `S4A-${suffix}`,
    new Date(now),
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO vehicles (id, organization_id, vin, license_plate, make, model, year, fuel_type, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Test', 'S4A', 2024, 'GASOLINE', 'AVAILABLE', $5, $5)`,
    vehicleId,
    organizationId,
    `S4${suffix}`.padEnd(17, '0'),
    `S4-${suffix}`,
    new Date(now),
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO vehicle_trips (id, vehicle_id, trip_status, start_time, end_time, dimo_segment_id, created_at,
       start_latitude, start_longitude, distance_km, max_speed_kmh, avg_speed_kmh, harsh_brake_count, driving_score)
     VALUES ($1, $2, 'COMPLETED', ($3::timestamptz AT TIME ZONE 'UTC'), ($4::timestamptz AT TIME ZONE 'UTC'), $5,
       ($4::timestamptz AT TIME ZONE 'UTC'), 52, 9, 12, 77, 45, 2, 88)`,
    tripId,
    vehicleId,
    startTime.toISOString(),
    endTime.toISOString(),
    `seg-${randomUUID()}`,
  );
  return { organizationId, vehicleId, tripId, startTime, endTime };
}

export function s4aConfigFor(
  tenants: readonly S4aTenant[],
  env: Record<string, string | undefined> = {},
): DiV0S4ControlPlaneConfig {
  return parseDiV0S4ControlPlaneConfig({
    DI_V0_S4_MASTER_ENABLED: 'true',
    DI_V0_S4_DISCOVERY_ENABLED: 'true',
    DI_V0_S4_WORKER_ENABLED: 'true',
    DI_V0_S4_POSITION_ENABLED: 'true',
    DI_V0_S4_R1_ENABLED: 'true',
    DI_V0_S4_NATIVE_ENABLED: 'false',
    DI_V0_S4_ORGANIZATION_ALLOWLIST: tenants.map((t) => t.organizationId).join(','),
    DI_V0_S4_VEHICLE_ALLOWLIST: tenants.map((t) => t.vehicleId).join(','),
    ...env,
  });
}

export function s4aManifestFor(
  config: DiV0S4ControlPlaneConfig,
  overrides: Partial<DiV0S4PipelineManifest> = {},
): DiV0S4PipelineManifest {
  return {
    ...(S4A_CONTRACT.fixtures.pipelineVersionBase as DiV0S4PipelineManifest),
    channelEnablement: deriveDiV0S4ChannelEnablement(config),
    ...overrides,
  };
}

/** Evidence channels under the harness flags (R1 on, native off); `label` makes the payload unique. */
export function s4aChannels(label: string, positionOutcome: 'PRESENT' | 'SOURCE_FAILURE' = 'PRESENT'): DiV0S4EvidenceChannelInput[] {
  return [
    { channel: 'NATIVE_EVENT', outcome: 'DISABLED', reasonCode: 'FLAG_OFF', formatVersion: null, payload: null, attestationRef: null },
    positionOutcome === 'PRESENT'
      ? {
          channel: 'POSITION',
          outcome: 'PRESENT',
          reasonCode: null,
          formatVersion: 'DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1',
          payload: JSON.stringify({ fixture: label, positions: [[0, 52, 9]] }),
          attestationRef: null,
        }
      : { channel: 'POSITION', outcome: 'SOURCE_FAILURE', reasonCode: 'TIMEOUT', formatVersion: null, payload: null, attestationRef: null },
    {
      channel: 'R1_OBD',
      outcome: 'PRESENT',
      reasonCode: null,
      formatVersion: 'DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3',
      payload: JSON.stringify({ fixture: label, speed: [[0, 30]] }),
      attestationRef: null,
    },
  ];
}

export function s4aIntervals(): DiV0ShadowPersistedIntervalInput[] {
  const positions = [];
  for (let i = 0; i < 12; i++) {
    const label = new Date(Date.parse('2026-01-01T00:00:00Z') + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    positions.push(presentObs(label, 52 + i * 0.00001, 9));
  }
  const output = computeDiV0TripIntervals(
    { sourceFamily: 'API_SYNTHETIC', positions },
    { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE },
  );
  return mapComputeOutputToPersistRows(output, DEFAULT_DI_V0_VERSION_TUPLE);
}

export async function currentFingerprint(prisma: PrismaClient, tripId: string): Promise<string> {
  const rows = await prisma.$queryRaw<
    Array<{
      organization_id: string;
      vehicle_id: string;
      trip_status: string;
      start_time: Date;
      end_time: Date | null;
      dimo_segment_id: string | null;
      merge_parent_trip_id: string | null;
    }>
  >`SELECT v.organization_id, t.vehicle_id, t.trip_status::text AS trip_status,
      t.start_time AT TIME ZONE 'UTC' AS start_time, t.end_time AT TIME ZONE 'UTC' AS end_time,
      t.dimo_segment_id, t.merge_parent_trip_id
    FROM vehicle_trips t JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = ${tripId}`;
  const r = rows[0];
  return buildDiV0S4BoundaryFingerprint({
    organizationId: r.organization_id,
    vehicleId: r.vehicle_id,
    tripId,
    tripStatus: r.trip_status,
    startTime: r.start_time,
    endTime: r.end_time,
    dimoSegmentId: r.dimo_segment_id,
    mergeParentTripId: r.merge_parent_trip_id,
    boundaryRepairGeneration: null,
  });
}

/** Test-only snapshot seed (a previously pinned snapshot a RECALIBRATION_REPLAY item can point at). */
export async function seedS4aSnapshot(prisma: PrismaClient, tenant: S4aTenant, label: string): Promise<string> {
  const fp = await currentFingerprint(prisma, tenant.tripId);
  const serialized = serializeDiV0S4EvidenceContainer({
    organizationId: tenant.organizationId,
    vehicleId: tenant.vehicleId,
    tripId: tenant.tripId,
    boundaryFingerprint: fp,
    windowStart: tenant.startTime,
    windowEnd: tenant.endTime,
    channels: s4aChannels(label),
  });
  const raw = Buffer.from(serialized.container, 'utf8');
  const gzip = gzipSync(raw);
  await prisma.$executeRaw`
    INSERT INTO di_v0_s4_evidence_snapshots (id, organization_id, vehicle_id, trip_id, snapshot_hash, container_version,
      boundary_fingerprint, acquisition_window_start, acquisition_window_end, channel_manifest, payload_gzip,
      payload_bytes, uncompressed_bytes, retention_until)
    VALUES (${randomUUID()}, ${tenant.organizationId}, ${tenant.vehicleId}, ${tenant.tripId}, ${serialized.snapshotHash},
      ${DI_V0_S4_EVIDENCE_CONTAINER_VERSION}, ${fp}, ${tenant.startTime.toISOString()}::timestamptz,
      ${tenant.endTime.toISOString()}::timestamptz, ${JSON.stringify(serialized.channelManifest)}::jsonb, ${gzip},
      ${gzip.length}::int, ${raw.length}::int, now() + interval '90 days')
    ON CONFLICT (organization_id, snapshot_hash) DO NOTHING`;
  return serialized.snapshotHash;
}

// ── Operator / canonical simulation (test-only SQL) ────────────────────────

export async function setKillState(prisma: PrismaClient, state: 'KILLED' | 'NOT_KILLED'): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO di_v0_s4_control (id, kill_state, reason, actor) VALUES ('GLOBAL', ${state}, 'S4A_TEST', 'S4A_TEST')
    ON CONFLICT (id) DO UPDATE SET kill_state = EXCLUDED.kill_state, updated_at = now()`;
}

export async function deleteKillRow(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`DELETE FROM di_v0_s4_control`;
}

export async function setKillMalformed(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`ALTER TABLE di_v0_s4_control DROP CONSTRAINT di_v0_s4_control_kill_state_ck`);
  await prisma.$executeRawUnsafe(
    `INSERT INTO di_v0_s4_control (id, kill_state, reason, actor) VALUES ('GLOBAL', 'not_killed', 'S4A_TEST', 'S4A_TEST')
     ON CONFLICT (id) DO UPDATE SET kill_state = 'not_killed'`,
  );
}

export async function restoreKillCheck(prisma: PrismaClient): Promise<void> {
  await setKillStateUnchecked(prisma);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE di_v0_s4_control ADD CONSTRAINT di_v0_s4_control_kill_state_ck CHECK (kill_state IN ('KILLED', 'NOT_KILLED'))`,
  );
}

async function setKillStateUnchecked(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`UPDATE di_v0_s4_control SET kill_state = 'NOT_KILLED'`);
}

export async function breakControlTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`ALTER TABLE di_v0_s4_control RENAME TO di_v0_s4_control_unreadable`);
}

export async function restoreControlTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`ALTER TABLE di_v0_s4_control_unreadable RENAME TO di_v0_s4_control`);
}

export async function retireRegistry(
  prisma: PrismaClient,
  pipelineVersionKey: string,
  config?: DiV0S4ControlPlaneConfig,
): Promise<void> {
  const cfg =
    config ??
    parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
    });
  const repo = new DiV0S4WorkItemRepository(prisma, cfg);
  await repo.retirePipelineVersion({
    pipelineVersionKey,
    retiredBy: 'S4A_TEST',
    retiredReason: 'S4A_TEST',
  });
}

/** Registry-only RETIRED (no work-item supersession). For T12 bounded-reaper tests simulating pre-cleanup stragglers. */
export async function retireRegistryStatusOnly(prisma: PrismaClient, pipelineVersionKey: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE di_v0_s4_pipeline_versions
    SET status = 'RETIRED', retired_at = now(), retired_by = 'S4A_TEST', retired_reason = 'S4A_TEST'
    WHERE pipeline_version_key = ${pipelineVersionKey}`;
}

/** Simulated DB clock advance: shifts the mutable lease / retry timestamps of the trip's items backwards. */
export async function advanceS4aClock(prisma: PrismaClient, tripId: string, seconds: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE di_v0_s4_work_items
    SET lease_expires_at = lease_expires_at - make_interval(secs => ${seconds}::int),
        lease_acquired_at = lease_acquired_at - make_interval(secs => ${seconds}::int),
        last_heartbeat_at = last_heartbeat_at - make_interval(secs => ${seconds}::int),
        next_attempt_at = next_attempt_at - make_interval(secs => ${seconds}::int)
    WHERE trip_id = ${tripId} AND status <> 'SUPERSEDED'`;
}

/** Canonical boundary change (extends end_time by 5 min) — a test-DB write, never a production path. */
export async function changeTripBoundary(prisma: PrismaClient, tripId: string): Promise<void> {
  await prisma.$executeRaw`UPDATE vehicle_trips SET end_time = end_time + interval '5 minutes' WHERE id = ${tripId}`;
}

// ── Latches ────────────────────────────────────────────────────────────────

/** Latch: resolves once at least `count` backends of this database wait on a heavyweight lock. */
export async function waitForLockWaiters(observer: PrismaClient, count: number, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = await observer.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`;
    if (Number(rows[0].n) >= count) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${count} lock waiters (have ${rows[0].n})`);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Waits until a competitor backend blocks on the global S4 control row (kill proof lock). */
export async function waitForControlRowLockWaiter(observer: PrismaClient, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = await observer.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock'
        AND pid <> pg_backend_pid()
        AND query ILIKE ${'%di_v0_s4_control%'}`;
    if (Number(rows[0]?.n ?? 0) >= 1) return;
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for di_v0_s4_control lock waiter (have ${rows[0]?.n ?? 0})`);
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Waits until a competitor backend blocks on the S4 pipeline registry row (authoritative retirement / T11). */
export async function waitForPipelineRegistryLockWaiter(
  observer: PrismaClient,
  pipelineVersionKey: string,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = await observer.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock'
        AND pid <> pg_backend_pid()
        AND query ILIKE ${'%di_v0_s4_pipeline_versions%'}
        AND query ILIKE ${`%${pipelineVersionKey}%`}`;
    if (Number(rows[0]?.n ?? 0) >= 1) return;
    if (Date.now() > deadline) {
      throw new Error(
        `timed out waiting for pipeline registry lock waiter on ${pipelineVersionKey} (have ${rows[0]?.n ?? 0})`,
      );
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}

export interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

export function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

export function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  return p.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
}

/**
 * Barrier: a gate transaction holds the control row FOR UPDATE; competitor i is started only once
 * i earlier competitors are observed blocked on a lock (so the PostgreSQL lock queue order equals
 * the fixture order), then the gate commits and all competitors proceed through real locks.
 */
export async function raceThroughControlGate<T>(
  gate: PrismaClient,
  observer: PrismaClient,
  competitors: ReadonlyArray<() => Promise<T>>,
): Promise<Settled<T>[]> {
  const holding = deferred();
  const release = deferred();
  const gateTx = gate.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT kill_state FROM di_v0_s4_control WHERE id = 'GLOBAL' FOR UPDATE`;
      holding.resolve();
      await release.promise;
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
  await holding.promise;
  const running: Promise<Settled<T>>[] = [];
  try {
    for (const fn of competitors) {
      running.push(settle(fn()));
      await waitForLockWaiters(observer, running.length);
    }
  } finally {
    release.resolve();
    await gateTx;
  }
  return Promise.all(running);
}

export async function cleanupS4aTenant(prisma: PrismaClient, tenant: S4aTenant): Promise<void> {
  await prisma.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
  await prisma.$executeRaw`DELETE FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${tenant.tripId}`;
  await prisma.$executeRaw`DELETE FROM di_v0_shadow_intervals WHERE trip_id = ${tenant.tripId}`;
  await prisma.$executeRaw`DELETE FROM di_v0_shadow_runs WHERE trip_id = ${tenant.tripId}`;
  await prisma.$executeRaw`DELETE FROM vehicle_trips WHERE id = ${tenant.tripId}`;
  await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${tenant.vehicleId}`;
  await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${tenant.organizationId}`;
  await prisma.$executeRaw`
    DELETE FROM di_v0_s4_pipeline_versions p
    WHERE NOT EXISTS (SELECT 1 FROM di_v0_s4_work_items w WHERE w.pipeline_version_key = p.pipeline_version_key)`;
}
