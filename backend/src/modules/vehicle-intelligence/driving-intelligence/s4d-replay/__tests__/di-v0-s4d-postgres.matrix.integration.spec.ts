import { randomUUID } from 'crypto';
import { gzipSync } from 'zlib';
import type { PrismaClient } from '@prisma/client';
import {
  advanceS4aClock,
  assertS4aPostgresCiEnv,
  changeTripBoundary,
  cleanupS4aTenant,
  newS4aClient,
  S4A_POSTGRES_LIVE,
  seedS4aSnapshot,
  seedS4aTenant,
  s4aConfigFor,
  currentFingerprint,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DiV0S4WorkItemRepository } from '../../s4a-foundation/di-v0-s4a-work-item.repository';
import { API_SYNTHETIC_IDENTITY, signalsBody } from '../../position-acquisition/__tests__/position-acquisition-test-helpers';
import { DiV0S4ExecutorRegistry } from '../../s4b-orchestration/di-v0-s4b-executor.port';
import { buildDiV0S4RuntimePipelineManifest } from '../../s4b-orchestration/di-v0-s4b-pipeline-manifest';
import { registerDiV0S4cExecutor } from '../../s4c-executor/di-v0-s4c-register';
import { DiV0S4cExecutor } from '../../s4c-executor/di-v0-s4c-executor';
import type { DiV0S4cExecutorDeps } from '../../s4c-executor/di-v0-s4c-types';
import { RUPTELA_DEVICE_IDENTITY } from '../../r1-obd-acquisition/__tests__/fixtures/s3b-r1-fixtures';
import { releaseS4dWorkItemsForRetry, setupS4dTenantRun } from './di-v0-s4d-postgres-helpers';
import {
  buildDiV0S4EvidenceSnapshotHash,
  type DiV0S4EvidenceChannelManifestEntry,
} from '../../s4a-foundation/di-v0-s4a-identity';
import { DI_V0_S4_EVIDENCE_CONTAINER_VERSION } from '../../s4a-foundation/di-v0-s4a-contract';

assertS4aPostgresCiEnv();

function r1Transport(rows: Record<string, unknown>[]) {
  return { async executeHistoricalR1ObdQuery() { return { data: { signalsHistorical: rows } }; } };
}

async function insertRawEvidenceSnapshot(
  db: PrismaClient,
  tenant: { organizationId: string; vehicleId: string; tripId: string; startTime: Date; endTime: Date },
  container: string,
  channelManifest: unknown,
  snapshotHash?: string,
): Promise<string> {
  const fp = await currentFingerprint(db, tenant.tripId);
  const hash = snapshotHash ?? buildDiV0S4EvidenceSnapshotHash(container);
  const gzip = gzipSync(Buffer.from(container, 'utf8'));
  await db.$executeRaw`
    INSERT INTO di_v0_s4_evidence_snapshots (id, organization_id, vehicle_id, trip_id, snapshot_hash, container_version,
      boundary_fingerprint, acquisition_window_start, acquisition_window_end, channel_manifest, payload_gzip,
      payload_bytes, uncompressed_bytes, retention_until)
    VALUES (${randomUUID()}, ${tenant.organizationId}, ${tenant.vehicleId}, ${tenant.tripId}, ${hash},
      ${DI_V0_S4_EVIDENCE_CONTAINER_VERSION}, ${fp}, ${tenant.startTime.toISOString()}::timestamptz,
      ${tenant.endTime.toISOString()}::timestamptz, ${JSON.stringify(channelManifest)}::jsonb, ${gzip},
      ${gzip.length}::int, ${Buffer.byteLength(container)}::int, now() + interval '90 days')`;
  return hash;
}

async function runRecalibrationReplayOnce(
  db: PrismaClient,
  tenant: { organizationId: string; vehicleId: string; tripId: string; startTime: Date },
  config: ReturnType<typeof s4aConfigFor>,
  pipeline: ReturnType<typeof buildDiV0S4RuntimePipelineManifest>,
  snapshotHash: string,
  positionCalls: { n: number },
  pipelineOverride?: ReturnType<typeof buildDiV0S4RuntimePipelineManifest>,
): Promise<void> {
  const repo = new DiV0S4WorkItemRepository(db, config);
  await repo.createWorkItem({
    tripId: tenant.tripId,
    sourceFamily: 'API_SYNTHETIC',
    runPurpose: 'RECALIBRATION_REPLAY',
    replaySourceSnapshotHash: snapshotHash,
    pipelineManifest: pipeline.manifest,
    expectedOrganizationId: tenant.organizationId,
    expectedVehicleId: tenant.vehicleId,
  });
  const registry = new DiV0S4ExecutorRegistry();
  registerDiV0S4cExecutor(registry, apiSyntheticDeps(db, config, tenant, positionCalls));
  const activePipeline = pipelineOverride ?? pipeline;
  await new (await import('../../s4b-orchestration/di-v0-s4b-claim-loop')).DiV0S4ClaimLoop(
    repo,
    config,
    activePipeline,
    registry,
    { leaseOwner: `s4d-recal-${randomUUID().slice(0, 6)}` },
  ).runOnce();
}

async function linkDimo(admin: PrismaClient, vehicleId: string, rawJson: unknown) {
  const id = randomUUID();
  await admin.$executeRaw`
    INSERT INTO dimo_vehicles (id, external_id, token_id, raw_json, connection_status, created_at, updated_at)
    VALUES (${id}, ${`s4d-${id}`}, ${Math.floor(Math.random() * 1_000_000_000) + 1}, ${JSON.stringify(rawJson)}::jsonb, 'CONNECTED', now(), now())`;
  await admin.$executeRaw`UPDATE vehicles SET dimo_vehicle_id = ${id}, hardware_type = 'LTE_R1'::"HardwareType" WHERE id = ${vehicleId}`;
}

function apiSyntheticDeps(db: PrismaClient, config: ReturnType<typeof s4aConfigFor>, tenant: { startTime: Date }, positionCalls: { n: number }): DiV0S4cExecutorDeps {
  const ts = new Date(tenant.startTime.getTime() + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return {
    prisma: db,
    controlPlane: config,
    ports: {
      runDimo: async (_m, fn) => fn(),
      positionTransport: {
        async executeHistoricalPositionQuery() {
          positionCalls.n += 1;
          return signalsBody([{ timestamp: ts, currentLocationCoordinates: { latitude: 52, longitude: 9 } }]);
        },
      },
      r1Transport: r1Transport([]),
    },
  };
}

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DI V0 S4D postgres matrix', () => {
  let admin: PrismaClient;
  const clients: PrismaClient[] = [];

  beforeAll(async () => {
    admin = newS4aClient();
    await admin.$queryRaw`SELECT 1`;
  }, 60_000);

  afterAll(async () => {
    for (const c of clients) await c.$disconnect().catch(() => undefined);
    await admin.$disconnect().catch(() => undefined);
  });

  async function trackClient(): Promise<PrismaClient> {
    const db = newS4aClient();
    clients.push(db);
    return db;
  }

  it('D-01 PRIMARY crash-after-pin → retry completes from pin', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const positionCalls = { n: 0 };
    const { loop } = await setupS4dTenantRun(admin, tenant, config, pipeline, apiSyntheticDeps(db, config, tenant, positionCalls));
    const first = await loop.runOnce();
    expect(first.status).toMatch(/SETTLED|RELEASE/);
    const afterFirst = positionCalls.n;
    expect(afterFirst).toBeGreaterThanOrEqual(1);
    await releaseS4dWorkItemsForRetry(db, tenant.tripId);
    const second = await loop.runOnce();
    expect(second.status).toBe('SETTLED');
    expect(positionCalls.n).toBe(afterFirst);
    const wi = await db.$queryRaw<Array<{ status: string }>>`SELECT status FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
    expect(wi[0]?.status).toBe('COMPLETED');
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });

  it('D-02 REACQUISITION crash-after-pin → retry from pin', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const repo = new DiV0S4WorkItemRepository(db, config);
    await repo.createWorkItem({
      tripId: tenant.tripId,
      sourceFamily: 'API_SYNTHETIC',
      runPurpose: 'REACQUISITION',
      reacquisitionRequestId: `req-${randomUUID().slice(0, 8)}`,
      pipelineManifest: pipeline.manifest,
      expectedOrganizationId: tenant.organizationId,
      expectedVehicleId: tenant.vehicleId,
    });
    const positionCalls = { n: 0 };
    const { loop } = await setupS4dTenantRun(admin, tenant, config, pipeline, apiSyntheticDeps(db, config, tenant, positionCalls), false);
    await loop.runOnce();
    const mid = positionCalls.n;
    expect(mid).toBeGreaterThanOrEqual(1);
    await releaseS4dWorkItemsForRetry(db, tenant.tripId);
    await loop.runOnce();
    expect(positionCalls.n).toBe(mid);
    const wi = await db.$queryRaw<Array<{ status: string; run_purpose: string }>>`
      SELECT status, run_purpose::text FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId} AND run_purpose = 'REACQUISITION'`;
    expect(wi[0]?.status).toBe('COMPLETED');
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });

  it('D-03 RECALIBRATION_REPLAY completes with zero provider calls', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const positionCalls = { n: 0 };
    const deps = apiSyntheticDeps(db, config, tenant, positionCalls);
    const seedRepo = new DiV0S4WorkItemRepository(db, config);
    await new (await import('../../s4b-orchestration/di-v0-s4b-discovery.service')).DiV0S4DiscoveryService(db, seedRepo, config, pipeline).runDiscoveryPass();
    const seedRegistry = new DiV0S4ExecutorRegistry();
    registerDiV0S4cExecutor(seedRegistry, deps);
    await new (await import('../../s4b-orchestration/di-v0-s4b-claim-loop')).DiV0S4ClaimLoop(
      seedRepo,
      config,
      pipeline,
      seedRegistry,
      { leaseOwner: `s4d-d03-seed-${randomUUID().slice(0, 6)}` },
    ).runOnce();
    const [completed] = await db.$queryRaw<Array<{ pinned_snapshot_hash: string }>>`
      SELECT pinned_snapshot_hash FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId} AND status = 'COMPLETED'`;
    expect(completed?.pinned_snapshot_hash).toBeTruthy();
    positionCalls.n = 0;
    const repo = seedRepo;
    await repo.createWorkItem({
      tripId: tenant.tripId,
      sourceFamily: 'API_SYNTHETIC',
      runPurpose: 'RECALIBRATION_REPLAY',
      replaySourceSnapshotHash: completed!.pinned_snapshot_hash!,
      pipelineManifest: pipeline.manifest,
      expectedOrganizationId: tenant.organizationId,
      expectedVehicleId: tenant.vehicleId,
    });
    const replayRegistry = new DiV0S4ExecutorRegistry();
    registerDiV0S4cExecutor(replayRegistry, deps);
    const replayLoop = new (await import('../../s4b-orchestration/di-v0-s4b-claim-loop')).DiV0S4ClaimLoop(
      seedRepo,
      config,
      pipeline,
      replayRegistry,
      { leaseOwner: `s4d-d03-${randomUUID().slice(0, 6)}` },
    );
    const result = await replayLoop.runOnce();
    expect(result.status).toBe('SETTLED');
    expect(positionCalls.n).toBe(0);
    const rec = await db.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId} AND run_purpose = 'RECALIBRATION_REPLAY'`;
    expect(rec[0]?.status).toBe('COMPLETED');
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });

  it('D-04 API_SYNTHETIC replay path (pinned retry)', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const positionCalls = { n: 0 };
    const { loop } = await setupS4dTenantRun(admin, tenant, config, pipeline, apiSyntheticDeps(db, config, tenant, positionCalls));
    await loop.runOnce();
    await releaseS4dWorkItemsForRetry(db, tenant.tripId);
    positionCalls.n = 0;
    await loop.runOnce();
    expect(positionCalls.n).toBe(0);
    const [snap] = await db.$queryRaw<Array<{ channel_manifest: unknown }>>`
      SELECT channel_manifest FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${tenant.tripId}`;
    const manifest = snap.channel_manifest as Array<{ channel: string; outcome: string }>;
    expect(manifest.find((c) => c.channel === 'R1_OBD')?.outcome).toBe('NOT_APPLICABLE');
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });

  it('D-05 RUPTELA_R1 replay from pin', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, RUPTELA_DEVICE_IDENTITY);
    const config = s4aConfigFor([tenant], { DI_V0_S4_R1_ENABLED: 'true' });
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const ts = new Date(tenant.startTime.getTime() + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const positionCalls = { n: 0 };
    const deps: DiV0S4cExecutorDeps = {
      prisma: db,
      controlPlane: config,
      ports: {
        runDimo: async (_m, fn) => fn(),
        positionTransport: {
          async executeHistoricalPositionQuery() {
            positionCalls.n += 1;
            return signalsBody([{ timestamp: ts, currentLocationCoordinates: { latitude: 52.1, longitude: 9.1 } }]);
          },
        },
        r1Transport: r1Transport([{ timestamp: ts, speed: 50, powertrainCombustionEngineSpeed: 2000 }]),
      },
    };
    const { loop } = await setupS4dTenantRun(admin, tenant, config, pipeline, deps);
    await loop.runOnce();
    const n1 = positionCalls.n;
    expect(n1).toBeGreaterThanOrEqual(1);
    await releaseS4dWorkItemsForRetry(db, tenant.tripId);
    positionCalls.n = 0;
    await loop.runOnce();
    expect(positionCalls.n).toBe(0);
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });

  it('D-06 corrupt snapshot hash → T08 SNAPSHOT_HASH_MISMATCH', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const fp = await (await import('../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness')).currentFingerprint(db, tenant.tripId);
    const container = `${DI_V0_S4_EVIDENCE_CONTAINER_VERSION}\n${JSON.stringify([
      tenant.organizationId,
      tenant.vehicleId,
      tenant.tripId,
      fp,
      tenant.startTime.toISOString(),
      tenant.endTime.toISOString(),
    ])}\n${JSON.stringify(['NATIVE_EVENT', 'DISABLED', 'FLAG_OFF', null, null, null])}\n${JSON.stringify(['POSITION', 'SOURCE_FAILURE', 'TIMEOUT', null, null, null])}\n${JSON.stringify(['R1_OBD', 'NOT_APPLICABLE', 'SOURCE_FAMILY', null, null, null])}`;
    const gzip = gzipSync(Buffer.from(container, 'utf8'));
    const contentHash = buildDiV0S4EvidenceSnapshotHash(container);
    const last = contentHash.slice(-1);
    const wrongHash = `${contentHash.slice(0, -1)}${last === 'a' ? 'b' : 'a'}`;
    expect(wrongHash).not.toBe(contentHash);
    await db.$executeRaw`
      INSERT INTO di_v0_s4_evidence_snapshots (id, organization_id, vehicle_id, trip_id, snapshot_hash, container_version,
        boundary_fingerprint, acquisition_window_start, acquisition_window_end, channel_manifest, payload_gzip,
        payload_bytes, uncompressed_bytes, retention_until)
      VALUES (${randomUUID()}, ${tenant.organizationId}, ${tenant.vehicleId}, ${tenant.tripId}, ${wrongHash},
        ${DI_V0_S4_EVIDENCE_CONTAINER_VERSION}, ${fp}, ${tenant.startTime.toISOString()}::timestamptz,
        ${tenant.endTime.toISOString()}::timestamptz, '[]'::jsonb, ${gzip}, ${gzip.length}::int, ${Buffer.byteLength(container)}::int,
        now() + interval '90 days')`;
    const positionCalls = { n: 0 };
    await runRecalibrationReplayOnce(db, tenant, config, pipeline, wrongHash, positionCalls);
    const [row] = await db.$queryRaw<Array<{ status: string; failure_reason: string }>>`
      SELECT status, failure_reason FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId} AND run_purpose = 'RECALIBRATION_REPLAY'`;
    expect(row?.status).toBe('FAILED_TERMINAL');
    expect(row?.failure_reason).toBe('SNAPSHOT_HASH_MISMATCH');
    const runs = await db.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM di_v0_shadow_runs WHERE trip_id = ${tenant.tripId}`;
    expect(runs[0]?.n).toBe(0);
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });

  it('D-07 malformed container → T08 REPLAY_INELIGIBLE', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const container = `${DI_V0_S4_EVIDENCE_CONTAINER_VERSION}\n{"not":"a valid header tuple"}\n[]`;
    const hash = await insertRawEvidenceSnapshot(db, tenant, container, []);
    const positionCalls = { n: 0 };
    await runRecalibrationReplayOnce(db, tenant, config, pipeline, hash, positionCalls);
    const [row] = await db.$queryRaw<Array<{ status: string; failure_reason: string }>>`
      SELECT status, failure_reason FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
    expect(row?.status).toBe('FAILED_TERMINAL');
    expect(row?.failure_reason).toBe('REPLAY_INELIGIBLE');
    expect(positionCalls.n).toBe(0);
    const runs = await db.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM di_v0_shadow_runs WHERE trip_id = ${tenant.tripId}`;
    expect(runs[0]?.n).toBe(0);
    await cleanupS4aTenant(admin, tenant);
  });

  it('D-08 unsupported container version → T08 REPLAY_INELIGIBLE', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const fp = await currentFingerprint(db, tenant.tripId);
    const container = `DI_V0_S4_EVIDENCE_CONTAINER_V99\n${JSON.stringify([
      tenant.organizationId,
      tenant.vehicleId,
      tenant.tripId,
      fp,
      tenant.startTime.toISOString(),
      tenant.endTime.toISOString(),
    ])}\n${JSON.stringify(['NATIVE_EVENT', 'DISABLED', 'FLAG_OFF', null, null, null])}`;
    const hash = await insertRawEvidenceSnapshot(db, tenant, container, []);
    const positionCalls = { n: 0 };
    await runRecalibrationReplayOnce(db, tenant, config, pipeline, hash, positionCalls);
    const [row] = await db.$queryRaw<Array<{ status: string; failure_reason: string }>>`
      SELECT status, failure_reason FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
    expect(row?.status).toBe('FAILED_TERMINAL');
    expect(row?.failure_reason).toBe('REPLAY_INELIGIBLE');
    await cleanupS4aTenant(admin, tenant);
  });

  it('D-09 channel payload hash mismatch → T08 REPLAY_INELIGIBLE', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const hash = await seedS4aSnapshot(db, tenant, 'd09');
    const [snap] = await db.$queryRaw<
      Array<{ channel_manifest: DiV0S4EvidenceChannelManifestEntry[]; payload_gzip: Buffer; uncompressed_bytes: number }>
    >`SELECT channel_manifest, payload_gzip, uncompressed_bytes FROM di_v0_s4_evidence_snapshots WHERE snapshot_hash = ${hash}`;
    const badManifest = snap!.channel_manifest.map((e) =>
      e.channel === 'POSITION' ? { ...e, payloadSha256: '0'.repeat(64), channelEvidenceHash: `${e.formatVersion}:sha256:${'0'.repeat(64)}` } : e,
    );
    await admin.$executeRaw`DELETE FROM di_v0_s4_evidence_snapshots WHERE snapshot_hash = ${hash}`;
    const fp = await currentFingerprint(db, tenant.tripId);
    const gzip = snap!.payload_gzip;
    await db.$executeRaw`
      INSERT INTO di_v0_s4_evidence_snapshots (id, organization_id, vehicle_id, trip_id, snapshot_hash, container_version,
        boundary_fingerprint, acquisition_window_start, acquisition_window_end, channel_manifest, payload_gzip,
        payload_bytes, uncompressed_bytes, retention_until)
      VALUES (${randomUUID()}, ${tenant.organizationId}, ${tenant.vehicleId}, ${tenant.tripId}, ${hash},
        ${DI_V0_S4_EVIDENCE_CONTAINER_VERSION}, ${fp}, ${tenant.startTime.toISOString()}::timestamptz,
        ${tenant.endTime.toISOString()}::timestamptz, ${JSON.stringify(badManifest)}::jsonb, ${gzip},
        ${gzip.length}::int, ${snap!.uncompressed_bytes}::int, now() + interval '90 days')`;
    const positionCalls = { n: 0 };
    await runRecalibrationReplayOnce(db, tenant, config, pipeline, hash, positionCalls);
    const [wi] = await db.$queryRaw<Array<{ status: string; failure_reason: string }>>`
      SELECT status, failure_reason FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
    expect(wi?.status).toBe('FAILED_TERMINAL');
    expect(wi?.failure_reason).toBe('REPLAY_INELIGIBLE');
    await cleanupS4aTenant(admin, tenant);
  });

  it('D-13 cross-tenant snapshot hash → rejected', async () => {
    const tenantA = await seedS4aTenant(admin);
    const tenantB = await seedS4aTenant(admin);
    const config = s4aConfigFor([tenantA, tenantB]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const repo = new DiV0S4WorkItemRepository(db, config);
    const hash = await seedS4aSnapshot(db, tenantA, 'd13');
    await expect(
      repo.createWorkItem({
        tripId: tenantB.tripId,
        sourceFamily: 'API_SYNTHETIC',
        runPurpose: 'RECALIBRATION_REPLAY',
        replaySourceSnapshotHash: hash,
        pipelineManifest: pipeline.manifest,
        expectedOrganizationId: tenantB.organizationId,
        expectedVehicleId: tenantB.vehicleId,
      }),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_SCOPE_INVALID' });
    await cleanupS4aTenant(admin, tenantA);
    await cleanupS4aTenant(admin, tenantB);
  });

  it('D-14 cross-trip snapshot hash → rejected', async () => {
    const tenantA = await seedS4aTenant(admin);
    const tenantB = await seedS4aTenant(admin);
    const config = s4aConfigFor([tenantA, tenantB]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const repo = new DiV0S4WorkItemRepository(db, config);
    const hash = await seedS4aSnapshot(db, tenantA, 'd14');
    await expect(
      repo.createWorkItem({
        tripId: tenantB.tripId,
        sourceFamily: 'API_SYNTHETIC',
        runPurpose: 'RECALIBRATION_REPLAY',
        replaySourceSnapshotHash: hash,
        pipelineManifest: pipeline.manifest,
        expectedOrganizationId: tenantB.organizationId,
        expectedVehicleId: tenantB.vehicleId,
      }),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_SCOPE_INVALID' });
    await cleanupS4aTenant(admin, tenantA);
    await cleanupS4aTenant(admin, tenantB);
  });

  it('D-15 incompatible target manifest → no provider requery', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const hash = await seedS4aSnapshot(db, tenant, 'd15');
    const repo = new DiV0S4WorkItemRepository(db, config);
    await repo.createWorkItem({
      tripId: tenant.tripId,
      sourceFamily: 'API_SYNTHETIC',
      runPurpose: 'RECALIBRATION_REPLAY',
      replaySourceSnapshotHash: hash,
      pipelineManifest: pipeline.manifest,
      expectedOrganizationId: tenant.organizationId,
      expectedVehicleId: tenant.vehicleId,
    });
    const positionCalls = { n: 0 };
    const lease = await repo.claim({ leaseOwner: `s4d-d15-${randomUUID().slice(0, 6)}`, pipelineManifest: pipeline.manifest });
    expect(lease).toBeTruthy();
    const badManifest = {
      ...pipeline.manifest,
      calibrationBundleHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    };
    const outcome = await new DiV0S4cExecutor(apiSyntheticDeps(db, config, tenant, positionCalls)).execute({
      lease,
      pipelineManifest: badManifest,
      repository: repo,
      signal: new AbortController().signal,
    });
    expect(outcome.kind).toBe('SETTLED');
    const [row] = await db.$queryRaw<Array<{ status: string; failure_reason: string }>>`
      SELECT status, failure_reason FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
    expect(row?.status).toBe('FAILED_TERMINAL');
    expect(row?.failure_reason).toBe('PIPELINE_MANIFEST_INCOMPATIBLE');
    expect(positionCalls.n).toBe(0);
    await cleanupS4aTenant(admin, tenant);
  });

  it('D-10 stale lease during replay → no completion', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const repo = new DiV0S4WorkItemRepository(db, config);
    await new (await import('../../s4b-orchestration/di-v0-s4b-discovery.service')).DiV0S4DiscoveryService(db, repo, config, pipeline).runDiscoveryPass();
    const lease = await repo.claim({ leaseOwner: 'stale-s4d', pipelineManifest: pipeline.manifest });
    await advanceS4aClock(admin, tenant.tripId, 400);
    const executor = new DiV0S4cExecutor(apiSyntheticDeps(db, config, tenant, { n: 0 }));
    const outcome = await executor.execute({ lease, pipelineManifest: pipeline.manifest, repository: repo, signal: new AbortController().signal });
    expect(outcome.kind).toBe('RELEASE');
    const wi = await db.$queryRaw<Array<{ status: string }>>`SELECT status FROM di_v0_s4_work_items WHERE id = ${lease.workItemId}`;
    expect(wi[0]?.status).not.toBe('COMPLETED');
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });

  it('D-11 boundary drift before replay compute → no S2', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const { loop } = await setupS4dTenantRun(admin, tenant, config, pipeline, apiSyntheticDeps(db, config, tenant, { n: 0 }));
    await loop.runOnce();
    const [pinned] = await db.$queryRaw<Array<{ pinned_snapshot_hash: string | null }>>`
      SELECT pinned_snapshot_hash FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
    expect(pinned?.pinned_snapshot_hash).toBeTruthy();
    await changeTripBoundary(admin, tenant.tripId);
    await loop.runOnce();
    const runs = await db.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM di_v0_shadow_runs WHERE trip_id = ${tenant.tripId}`;
    expect(runs[0]?.n).toBe(0);
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });

  it('D-12 duplicate replay → single S2 run', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const { loop } = await setupS4dTenantRun(admin, tenant, config, pipeline, apiSyntheticDeps(db, config, tenant, { n: 0 }));
    await loop.runOnce();
    await releaseS4dWorkItemsForRetry(db, tenant.tripId);
    await loop.runOnce();
    await loop.runOnce();
    const runs = await db.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM di_v0_shadow_runs WHERE trip_id = ${tenant.tripId}`;
    expect(runs[0]?.n).toBe(1);
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });

  it('D-17 provider link removed after pin → replay still succeeds', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const positionCalls = { n: 0 };
    const { loop } = await setupS4dTenantRun(admin, tenant, config, pipeline, apiSyntheticDeps(db, config, tenant, positionCalls));
    await loop.runOnce();
    const mid = positionCalls.n;
    expect(mid).toBeGreaterThanOrEqual(1);
    await admin.$executeRaw`UPDATE vehicles SET dimo_vehicle_id = NULL WHERE id = ${tenant.vehicleId}`;
    await releaseS4dWorkItemsForRetry(db, tenant.tripId);
    await loop.runOnce();
    expect(positionCalls.n).toBe(mid);
    const wi = await db.$queryRaw<Array<{ status: string }>>`SELECT status FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
    expect(wi[0]?.status).toBe('COMPLETED');
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });

  it('D-18 current raw_json family changed after pin → replay stays API_SYNTHETIC', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const positionCalls = { n: 0 };
    const { loop } = await setupS4dTenantRun(admin, tenant, config, pipeline, apiSyntheticDeps(db, config, tenant, positionCalls));
    await loop.runOnce();
    const mid = positionCalls.n;
    const [veh] = await db.$queryRaw<Array<{ dimo_vehicle_id: string }>>`SELECT dimo_vehicle_id FROM vehicles WHERE id = ${tenant.vehicleId}`;
    if (veh?.dimo_vehicle_id) {
      await admin.$executeRaw`UPDATE dimo_vehicles SET raw_json = ${JSON.stringify(RUPTELA_DEVICE_IDENTITY)}::jsonb WHERE id = ${veh.dimo_vehicle_id}`;
    }
    await releaseS4dWorkItemsForRetry(db, tenant.tripId);
    await loop.runOnce();
    expect(positionCalls.n).toBe(mid);
    const wi = await db.$queryRaw<Array<{ status: string; source_family: string }>>`
      SELECT status, source_family::text FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
    expect(wi[0]?.status).toBe('COMPLETED');
    expect(wi[0]?.source_family).toBe('API_SYNTHETIC');
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });

  it('D-19 token relink after pin → replay unchanged', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const positionCalls = { n: 0 };
    const { loop } = await setupS4dTenantRun(admin, tenant, config, pipeline, apiSyntheticDeps(db, config, tenant, positionCalls));
    await loop.runOnce();
    const mid = positionCalls.n;
    const [veh] = await db.$queryRaw<Array<{ dimo_vehicle_id: string }>>`SELECT dimo_vehicle_id FROM vehicles WHERE id = ${tenant.vehicleId}`;
    if (veh?.dimo_vehicle_id) {
      await admin.$executeRaw`UPDATE dimo_vehicles SET token_id = ${Math.floor(Math.random() * 1_000_000_000) + 2} WHERE id = ${veh.dimo_vehicle_id}`;
    }
    await releaseS4dWorkItemsForRetry(db, tenant.tripId);
    await loop.runOnce();
    expect(positionCalls.n).toBe(mid);
    expect((await db.$queryRaw<Array<{ status: string }>>`SELECT status FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`)[0]?.status).toBe('COMPLETED');
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });

  it('D-16 replay preserves snapshot hash and combined input identity', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(admin, tenant.vehicleId, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = await trackClient();
    const { loop } = await setupS4dTenantRun(admin, tenant, config, pipeline, apiSyntheticDeps(db, config, tenant, { n: 0 }));
    await loop.runOnce();
    const [before] = await db.$queryRaw<Array<{ pinned_snapshot_hash: string; combined_input_identity: string | null }>>`
      SELECT pinned_snapshot_hash, combined_input_identity FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
    await releaseS4dWorkItemsForRetry(db, tenant.tripId);
    await loop.runOnce();
    const [after] = await db.$queryRaw<Array<{ pinned_snapshot_hash: string; combined_input_identity: string; status: string }>>`
      SELECT pinned_snapshot_hash, combined_input_identity, status FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
    expect(after?.status).toBe('COMPLETED');
    expect(after?.pinned_snapshot_hash).toBe(before?.pinned_snapshot_hash);
    expect(after?.combined_input_identity).toBeTruthy();
    const snaps = await db.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${tenant.tripId}`;
    expect(snaps[0]?.n).toBe(1);
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });
});
