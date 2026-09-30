import { randomUUID } from 'crypto';
import { gzipSync } from 'zlib';
import type { PrismaClient } from '@prisma/client';
import { DI_V0_S4_EVIDENCE_CONTAINER_VERSION } from '../../s4a-foundation/di-v0-s4a-contract';
import { serializeDiV0S4EvidenceContainer } from '../../s4a-foundation/di-v0-s4a-identity';
import { DiV0S4WorkItemRepository } from '../../s4a-foundation/di-v0-s4a-work-item.repository';
import { buildDiV0S4PipelineVersionKey } from '../../s4a-foundation/di-v0-s4a-identity';
import {
  assertS4aPostgresCiEnv,
  changeTripBoundary,
  cleanupS4aTenant,
  newS4aClient,
  retireRegistry,
  retireRegistryStatusOnly,
  S4A_POSTGRES_LIVE,
  s4aConfigFor,
  s4aManifestFor,
  currentFingerprint,
  s4aChannels,
  seedS4aSnapshot,
  seedS4aTenant,
  setKillState,
  type S4aTenant,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { reconcileDiV0S4BeyondDriftHorizonBatch } from '../di-v0-s4f-beyond-horizon';
import { DiV0S4fReconciliationService } from '../di-v0-s4f-reconciliation.service';
assertS4aPostgresCiEnv();

/** Trip age so settlement_anchor_at is beyond the frozen drift horizon at create time. */
const BEYOND_HORIZON_AGE_SECONDS = 11 * 86_400;

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DI V0 S4F observability (real PostgreSQL)', () => {
  let admin: PrismaClient;
  const tenants: S4aTenant[] = [];
  let svc: DiV0S4fReconciliationService;

  beforeAll(async () => {
    admin = newS4aClient();
    await admin.$queryRaw`SELECT 1`;
    svc = new DiV0S4fReconciliationService(admin);
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

  async function tenant(ageSeconds = 3 * 86_400): Promise<S4aTenant> {
    const t = await seedS4aTenant(admin, ageSeconds);
    tenants.push(t);
    return t;
  }

  function repo(config = s4aConfigFor(tenants)): DiV0S4WorkItemRepository {
    return new DiV0S4WorkItemRepository(admin, config);
  }

  it('F01 empty database slice → valid zero snapshot for tenant scope', async () => {
    const t = await tenant();
    const snap = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(snap.contractVersion).toBe('DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1');
    expect(snap.operational.workLifecycle.PENDING).toBe(0);
    expect(snap.operational.evidenceStorage.snapshotCount).toBe(0);
  });

  it('F02 mixed work states → exact counts', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const r = repo(config);
    await r.createWorkItem({ tripId: t.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest });
    const snap = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(snap.operational.workLifecycle.PENDING).toBe(1);
  });

  it('F03 expired vs active LEASED separated', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const r = repo(config);
    const created = await r.createWorkItem({
      tripId: t.tripId,
      sourceFamily: 'RUPTELA_R1',
      runPurpose: 'PRIMARY',
      pipelineManifest: manifest,
    });
    const claim = await r.claim({ workItemId: created.workItemId, leaseOwner: 'S4F_TEST', pipelineManifest: manifest });
    await admin.$executeRaw`
      UPDATE di_v0_s4_work_items SET lease_expires_at = clock_timestamp() - interval '1 minute'
      WHERE id = ${claim.workItemId}`;
    const snap = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(snap.operational.leaseHealth.expiredLeasedCount).toBe(1);
    expect(snap.operational.leaseHealth.activeLeasedCount).toBe(0);
  });

  it('F04 retryable due vs future separated', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const r = repo(config);
    const created = await r.createWorkItem({
      tripId: t.tripId,
      sourceFamily: 'RUPTELA_R1',
      runPurpose: 'PRIMARY',
      pipelineManifest: manifest,
    });
    const claim = await r.claim({ workItemId: created.workItemId, leaseOwner: 'S4F_TEST', pipelineManifest: manifest });
    await r.failRetryable(claim, 'RATE_LIMITED');
    await admin.$executeRaw`
      UPDATE di_v0_s4_work_items SET next_attempt_at = clock_timestamp() + interval '1 hour' WHERE id = ${created.workItemId}`;
    const snap1 = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(snap1.operational.leaseHealth.retryableFutureCount).toBe(1);
    expect(snap1.operational.leaseHealth.retryableDueCount).toBe(0);
    await admin.$executeRaw`
      UPDATE di_v0_s4_work_items SET next_attempt_at = clock_timestamp() - interval '1 minute' WHERE id = ${created.workItemId}`;
    const snap2 = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(snap2.operational.leaseHealth.retryableDueCount).toBe(1);
  });

  it('F05 CLASS-A retirement → zero retired/PENDING PRIMARY anomaly', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const r = repo(config);
    await r.createWorkItem({ tripId: t.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest });
    const pvk = buildDiV0S4PipelineVersionKey(manifest);
    await retireRegistry(admin, pvk, config);
    const snap = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(snap.operational.pipelineHealth.retiredPendingPrimaryCount).toBe(0);
  });

  it('F06 legacy status-only retired straggler classified', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const r = repo(config);
    await r.createWorkItem({ tripId: t.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest });
    const pvk = buildDiV0S4PipelineVersionKey(manifest);
    await retireRegistryStatusOnly(admin, pvk);
    const snap = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(snap.operational.pipelineHealth.retiredPendingPrimaryCount).toBe(1);
    expect(snap.anomalySamples.RETIRED_PENDING_PRIMARY?.length).toBeGreaterThan(0);
  });

  it('F07 evidence byte/count metrics accurate', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    await seedS4aSnapshot(admin, t, 'f07');
    const bytesRow = await admin.$queryRaw<Array<{ u: number }>>`
      SELECT uncompressed_bytes::int AS u FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${t.tripId} LIMIT 1`;
    const snap = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(snap.operational.evidenceStorage.snapshotCount).toBe(1);
    expect(snap.operational.evidenceStorage.totalCompressedBytes).toBeGreaterThan(0);
    expect(snap.operational.evidenceStorage.totalUncompressedBytes).toBe(bytesRow[0]?.u ?? 0);
  });

  it('F08 retention-due uses DB clock', async () => {
    const t = await tenant();
    const fp = await currentFingerprint(admin, t.tripId);
    const serialized = serializeDiV0S4EvidenceContainer({
      organizationId: t.organizationId,
      vehicleId: t.vehicleId,
      tripId: t.tripId,
      boundaryFingerprint: fp,
      windowStart: t.startTime,
      windowEnd: t.endTime,
      channels: s4aChannels('f08'),
    });
    const raw = Buffer.from(serialized.container, 'utf8');
    const gzip = gzipSync(raw);
    await admin.$executeRaw`
      INSERT INTO di_v0_s4_evidence_snapshots (id, organization_id, vehicle_id, trip_id, snapshot_hash, container_version,
        boundary_fingerprint, acquisition_window_start, acquisition_window_end, channel_manifest, payload_gzip,
        payload_bytes, uncompressed_bytes, retention_until)
      VALUES (${randomUUID()}, ${t.organizationId}, ${t.vehicleId}, ${t.tripId}, ${serialized.snapshotHash},
        ${DI_V0_S4_EVIDENCE_CONTAINER_VERSION}, ${fp}, ${t.startTime.toISOString()}::timestamptz,
        ${t.endTime.toISOString()}::timestamptz, ${JSON.stringify(serialized.channelManifest)}::jsonb, ${gzip},
        ${gzip.length}::int, ${raw.length}::int, clock_timestamp() - interval '1 day')`;
    const snap = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(snap.operational.evidenceStorage.retentionDueCount).toBe(1);
  });

  it('F09 10d boundary mismatch reported beyond horizon', async () => {
    const t = await seedS4aTenant(admin, BEYOND_HORIZON_AGE_SECONDS);
    tenants.push(t);
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const r = repo(config);
    await r.createWorkItem({ tripId: t.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest });
    await changeTripBoundary(admin, t.tripId);
    const batch = await reconcileDiV0S4BeyondDriftHorizonBatch(admin, 50, { settlementAnchorAt: null, workItemId: null }, t.organizationId);
    expect(batch.mismatchCount).toBe(1);
  });

  it('F10 beyond-horizon mismatch causes ZERO mutation and ZERO T11', async () => {
    const t = await seedS4aTenant(admin, BEYOND_HORIZON_AGE_SECONDS);
    tenants.push(t);
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const r = repo(config);
    const created = await r.createWorkItem({
      tripId: t.tripId,
      sourceFamily: 'RUPTELA_R1',
      runPurpose: 'PRIMARY',
      pipelineManifest: manifest,
    });
    const before = await admin.$queryRaw<Array<{ status: string; fp: string }>>`
      SELECT status::text AS status, boundary_fingerprint AS fp FROM di_v0_s4_work_items WHERE id = ${created.workItemId}`;
    await changeTripBoundary(admin, t.tripId);
    await reconcileDiV0S4BeyondDriftHorizonBatch(admin, 50, { settlementAnchorAt: null, workItemId: null }, t.organizationId);
    const after = await admin.$queryRaw<Array<{ status: string; fp: string }>>`
      SELECT status::text AS status, boundary_fingerprint AS fp FROM di_v0_s4_work_items WHERE id = ${created.workItemId}`;
    expect(after).toEqual(before);
    const superseded = await admin.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM di_v0_s4_work_items WHERE trip_id = ${t.tripId} AND status = 'SUPERSEDED'`;
    expect(Number(superseded[0]?.n ?? 0)).toBe(0);
  });

  it('F11 in-horizon drift not counted in beyond-horizon reconciliation', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const r = repo(config);
    await r.createWorkItem({ tripId: t.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest });
    await changeTripBoundary(admin, t.tripId);
    const batch = await reconcileDiV0S4BeyondDriftHorizonBatch(admin, 50, { settlementAnchorAt: null, workItemId: null }, t.organizationId);
    expect(batch.scannedCount).toBe(0);
    expect(batch.mismatchCount).toBe(0);
  });

  it('F12 cross-tenant isolation', async () => {
    const t1 = await tenant();
    const t2 = await tenant();
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const r = repo(config);
    await r.createWorkItem({ tripId: t1.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest });
    const snap1 = await svc.buildObservabilitySnapshot({ organizationId: t1.organizationId });
    const snap2 = await svc.buildObservabilitySnapshot({ organizationId: t2.organizationId });
    expect(snap1.operational.workLifecycle.PENDING).toBe(1);
    expect(snap2.operational.workLifecycle.PENDING).toBe(0);
  });

  it('F13 bounded pagination no duplicate or skipped rows', async () => {
    for (let i = 0; i < 5; i++) {
      tenants.push(await seedS4aTenant(admin));
    }
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const r = repo(config);
    for (const trip of tenants.slice(-5)) {
      await r.createWorkItem({ tripId: trip.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest });
    }
    const seen = new Set<string>();
    let cursor = { settlementAnchorAt: null as Date | null, workItemId: null as string | null };
    for (let page = 0; page < 10; page++) {
      const ids = await svc.listWorkItemIdsPage(2, cursor);
      if (ids.length === 0) break;
      for (const id of ids) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
      const lastRow = await admin.$queryRaw<Array<{ anchor: Date; id: string }>>`
        SELECT settlement_anchor_at AS anchor, id FROM di_v0_s4_work_items WHERE id = ${ids[ids.length - 1]}`;
      cursor = { settlementAnchorAt: lastRow[0].anchor, workItemId: lastRow[0].id };
    }
    expect(seen.size).toBe(5);
  });

  it('F14 read-only transaction accepts reconciliation', async () => {
    const t = await tenant();
    await admin.$executeRaw`BEGIN READ ONLY`;
    const snap = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    await admin.$executeRaw`COMMIT`;
    expect(snap.reconciliation.readOnly).toBe(true);
  });
});
