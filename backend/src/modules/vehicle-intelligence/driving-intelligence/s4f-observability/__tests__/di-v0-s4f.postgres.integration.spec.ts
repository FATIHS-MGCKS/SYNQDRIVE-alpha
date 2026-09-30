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
import { DI_V0_S4_LIMITS } from '../../s4a-foundation/di-v0-s4a-contract';
import { DiV0S4MaintenanceService } from '../../s4e-drift-watcher/di-v0-s4e-maintenance.service';
import {
  advanceS4aClock,
  deleteKillRow,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { reconcileDiV0S4BeyondDriftHorizonBatch } from '../di-v0-s4f-beyond-horizon';
import { emptyDiV0S4fKeysetScanCursor } from '../di-v0-s4f-keyset-cursor';
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
    expect(snap1.operational.leaseHealth.retryableDueClaimableCount).toBe(0);
    await admin.$executeRaw`
      UPDATE di_v0_s4_work_items SET next_attempt_at = clock_timestamp() - interval '1 minute' WHERE id = ${created.workItemId}`;
    const snap2 = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(snap2.operational.leaseHealth.retryableDueClaimableCount).toBe(1);
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
    expect(snap.operational.pipelineHealth.retiredPendingPrimaryClassAViolationCount).toBe(0);
  });

  it('F06/F35 status-only retirement straggler — severe invariant, provenance not inferable', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const r = repo(config);
    await r.createWorkItem({ tripId: t.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest });
    const pvk = buildDiV0S4PipelineVersionKey(manifest);
    await retireRegistryStatusOnly(admin, pvk);
    const snap = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(snap.operational.pipelineHealth.retiredPendingPrimaryClassAViolationCount).toBe(1);
    expect(snap.anomalySamples.RETIRED_PENDING_PRIMARY_CLASS_A_VIOLATION?.length).toBeGreaterThan(0);
    expect(snap.operational.pipelineHealth.retiredNonterminalProvenanceUnknownCount).toBe(0);
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
    const batch = await reconcileDiV0S4BeyondDriftHorizonBatch(admin, 50, emptyDiV0S4fKeysetScanCursor(), t.organizationId);
    expect(batch.boundaryMismatchCount).toBe(1);
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
    await reconcileDiV0S4BeyondDriftHorizonBatch(admin, 50, emptyDiV0S4fKeysetScanCursor(), t.organizationId);
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
    const batch = await reconcileDiV0S4BeyondDriftHorizonBatch(admin, 50, emptyDiV0S4fKeysetScanCursor(), t.organizationId);
    expect(batch.scannedCount).toBe(0);
    expect(batch.boundaryMismatchCount).toBe(0);
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
    let cursor = emptyDiV0S4fKeysetScanCursor();
    for (let page = 0; page < 10; page++) {
      const pageResult = await svc.listWorkItemIdsPage(2, cursor);
      if (pageResult.ids.length === 0) break;
      for (const id of pageResult.ids) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
      cursor = pageResult.nextCursor;
    }
    expect(seen.size).toBe(5);
  });

  async function createWorkItemForTenant(t: S4aTenant): Promise<string> {
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const created = await repo(config).createWorkItem({
      tripId: t.tripId,
      sourceFamily: 'RUPTELA_R1',
      runPurpose: 'PRIMARY',
      pipelineManifest: manifest,
    });
    return created.workItemId;
  }

  async function tenantWithSharedEnd(endIso: string): Promise<S4aTenant> {
    const t = await seedS4aTenant(admin);
    tenants.push(t);
    await admin.$executeRaw`
      UPDATE vehicle_trips
      SET end_time = (${endIso}::timestamptz AT TIME ZONE 'UTC')
      WHERE id = ${t.tripId}`;
    return t;
  }

  it('H2-A late insert behind cursor but after scan watermark excluded until next traversal', async () => {
    const t1 = await tenant();
    const t2 = await tenant();
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const r = repo(config);
    const w1 = (await r.createWorkItem({ tripId: t1.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest })).workItemId;
    const w2 = (await r.createWorkItem({ tripId: t2.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest })).workItemId;

    let cursor = emptyDiV0S4fKeysetScanCursor();
    const page1 = await svc.listWorkItemIdsPage(1, cursor);
    expect(page1.ids.length).toBe(1);
    cursor = page1.nextCursor;
    expect(cursor.scanWatermarkCreatedAt).not.toBeNull();

    const tLate = await seedS4aTenant(admin, BEYOND_HORIZON_AGE_SECONDS);
    tenants.push(tLate);
    const wLate = await createWorkItemForTenant(tLate);

    const seen = new Set<string>(page1.ids);
    cursor = page1.nextCursor;
    for (let page = 0; page < 10; page++) {
      const pageResult = await svc.listWorkItemIdsPage(5, cursor);
      for (const id of pageResult.ids) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
      if (pageResult.ids.length === 0) break;
      cursor = pageResult.nextCursor;
    }
    expect(seen.has(wLate)).toBe(false);
    expect(seen.has(w1)).toBe(true);
    expect(seen.has(w2)).toBe(true);

    const fresh = await svc.listWorkItemIdsPage(20, emptyDiV0S4fKeysetScanCursor());
    expect(fresh.ids).toContain(wLate);
  });

  it('H2-B late insert after cursor anchor but after watermark excluded until next traversal', async () => {
    const t1 = await tenant();
    const w1 = await createWorkItemForTenant(t1);
    let cursor = emptyDiV0S4fKeysetScanCursor();
    const page1 = await svc.listWorkItemIdsPage(1, cursor);
    cursor = page1.nextCursor;

    const tLate = await tenant();
    const wLate = await createWorkItemForTenant(tLate);

    const page2 = await svc.listWorkItemIdsPage(10, cursor);
    expect(page2.ids).not.toContain(wLate);
    expect(page2.ids).not.toContain(w1);

    const fresh = await svc.listWorkItemIdsPage(10, emptyDiV0S4fKeysetScanCursor());
    expect(fresh.ids).toContain(wLate);
    expect(fresh.ids).toContain(w1);
  });

  it('H2-C identical settlement anchors deterministic id tie-break under watermark', async () => {
    const sharedEnd = '2019-06-01T12:00:00.000Z';
    const tA = await tenantWithSharedEnd(sharedEnd);
    const tB = await tenantWithSharedEnd(sharedEnd);
    const tC = await tenantWithSharedEnd(sharedEnd);
    const wA = await createWorkItemForTenant(tA);
    const wB = await createWorkItemForTenant(tB);
    const wC = await createWorkItemForTenant(tC);

    const seen = new Set<string>();
    let cursor = emptyDiV0S4fKeysetScanCursor();
    const ordered: string[] = [];
    for (let page = 0; page < 10; page++) {
      const pageResult = await svc.listWorkItemIdsPage(1, cursor);
      if (pageResult.ids.length === 0) break;
      for (const id of pageResult.ids) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
        ordered.push(id);
      }
      cursor = pageResult.nextCursor;
    }
    expect(seen.size).toBe(3);
    expect(new Set([wA, wB, wC])).toEqual(seen);
    const expectedOrder = [wA, wB, wC].sort();
    expect(ordered).toEqual(expectedOrder);
    const anchorA = await admin.$queryRaw<Array<{ anchor: Date }>>`
      SELECT settlement_anchor_at AS anchor FROM di_v0_s4_work_items WHERE id = ${wA}`;
    const anchorB = await admin.$queryRaw<Array<{ anchor: Date }>>`
      SELECT settlement_anchor_at AS anchor FROM di_v0_s4_work_items WHERE id = ${wB}`;
    const anchorC = await admin.$queryRaw<Array<{ anchor: Date }>>`
      SELECT settlement_anchor_at AS anchor FROM di_v0_s4_work_items WHERE id = ${wC}`;
    expect(anchorA[0]?.anchor.getTime()).toBe(anchorB[0]?.anchor.getTime());
    expect(anchorB[0]?.anchor.getTime()).toBe(anchorC[0]?.anchor.getTime());
  });

  it('F32 real single-connection READ ONLY transaction proof', async () => {
    const t = await tenant();
    const snap = await admin.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return await svc.buildObservabilitySnapshotOnDb(tx, { organizationId: t.organizationId });
    });
    expect(snap.reconciliation.readOnly).toBe(true);
    expect(snap.reconciliation.diagnosticReconciliation.bounded).toBe(true);
    expect(snap.reconciliation.operationalAggregates.bounded).toBe(false);
  });

  async function seatExhaustedLeased(
    r: DiV0S4WorkItemRepository,
    tripId: string,
    workItemId: string,
    manifest: ReturnType<typeof s4aManifestFor>,
  ): Promise<void> {
    for (let i = 0; i < DI_V0_S4_LIMITS.maxAttempts; i++) {
      await r.claim({ leaseOwner: `ex-${i}`, pipelineManifest: manifest, workItemId });
      await advanceS4aClock(admin, tripId, DI_V0_S4_LIMITS.leaseDurationSeconds + 60);
    }
  }

  it('F28/F29 authoritative T10 exhausted predicate parity and retryable separation', async () => {
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
    await seatExhaustedLeased(r, t.tripId, created.workItemId, manifest);
    const before = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(before.operational.leaseHealth.t10ExhaustedCandidateCount).toBe(1);
    expect(before.operational.leaseHealth.retryableDueClaimableCount).toBe(0);
    const maintenance = new DiV0S4MaintenanceService(admin, r, config);
    await maintenance.runMaintenancePass();
    const after = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(after.operational.leaseHealth.t10ExhaustedCandidateCount).toBe(0);
    expect(after.operational.workLifecycle.FAILED_TERMINAL).toBe(1);
  }, 60_000);

  it('F30 >10d same-org vehicle reassignment detected as scope corruption', async () => {
    const t = await seedS4aTenant(admin, BEYOND_HORIZON_AGE_SECONDS);
    tenants.push(t);
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const r = repo(config);
    await r.createWorkItem({ tripId: t.tripId, sourceFamily: 'RUPTELA_R1', runPurpose: 'PRIMARY', pipelineManifest: manifest });
    const newVehicleId = randomUUID();
    await admin.$executeRawUnsafe(
      `INSERT INTO vehicles (id, organization_id, vin, license_plate, make, model, year, fuel_type, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'Test', 'S4F', 2024, 'GASOLINE', 'AVAILABLE', now(), now())`,
      newVehicleId,
      t.organizationId,
      `V${randomUUID().slice(0, 15)}`.padEnd(17, '0'),
      `PL-${randomUUID().slice(0, 6)}`,
    );
    await admin.$executeRaw`UPDATE vehicle_trips SET vehicle_id = ${newVehicleId} WHERE id = ${t.tripId}`;
    const batch = await reconcileDiV0S4BeyondDriftHorizonBatch(
      admin,
      50,
      emptyDiV0S4fKeysetScanCursor(),
      t.organizationId,
    );
    expect(batch.scopeCorruptionCount).toBe(1);
    expect(batch.scopeCorruptionWorkItemIds[0]?.code).toBe('VEHICLE_MISMATCH');
    expect(batch.boundaryMismatchCount).toBe(0);
    await admin.$executeRaw`DELETE FROM vehicles WHERE id = ${newVehicleId}`;
  });

  it('F31 >10d organization scope corruption detected', async () => {
    const t = await seedS4aTenant(admin, BEYOND_HORIZON_AGE_SECONDS);
    tenants.push(t);
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const r = repo(config);
    await r.createWorkItem({
      tripId: t.tripId,
      sourceFamily: 'RUPTELA_R1',
      runPurpose: 'PRIMARY',
      pipelineManifest: manifest,
    });
    const otherOrg = randomUUID();
    await admin.$executeRawUnsafe(
      `INSERT INTO organizations (id, company_name, business_type, status, created_at, updated_at)
       VALUES ($1, 'S4F-ORG', 'RENTAL', 'ACTIVE', now(), now())`,
      otherOrg,
    );
    await admin.$executeRaw`UPDATE vehicles SET organization_id = ${otherOrg} WHERE id = ${t.vehicleId}`;
    const batch = await reconcileDiV0S4BeyondDriftHorizonBatch(
      admin,
      50,
      emptyDiV0S4fKeysetScanCursor(),
      t.organizationId,
    );
    expect(batch.scopeCorruptionCount).toBe(1);
    expect(batch.scopeCorruptionWorkItemIds[0]?.code).toBe('ORGANIZATION_MISMATCH');
    await admin.$executeRaw`UPDATE vehicles SET organization_id = ${t.organizationId} WHERE id = ${t.vehicleId}`;
    await admin.$executeRaw`DELETE FROM organizations WHERE id = ${otherOrg}`;
  });

  it('F33 retired valid unexpired lease classification', async () => {
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
    await r.claim({ leaseOwner: 'S4F_LEASE', pipelineManifest: manifest, workItemId: created.workItemId });
    const pvk = buildDiV0S4PipelineVersionKey(manifest);
    await retireRegistryStatusOnly(admin, pvk);
    const snap = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(snap.operational.pipelineHealth.retiredValidUnexpiredLeasedCount).toBe(1);
  });

  it('F34 retired expired lease T12-eligible classification', async () => {
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
    await r.claim({ leaseOwner: 'S4F_LEASE', pipelineManifest: manifest, workItemId: created.workItemId });
    await admin.$executeRaw`
      UPDATE di_v0_s4_work_items SET lease_expires_at = clock_timestamp() - interval '1 minute'
      WHERE id = ${created.workItemId}`;
    const pvk = buildDiV0S4PipelineVersionKey(manifest);
    await retireRegistryStatusOnly(admin, pvk);
    const snap = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(snap.operational.pipelineHealth.retiredExpiredLeasedT12EligibleCount).toBe(1);
  });

  it('F36 snapshot exposes truthful operational aggregate boundedness', async () => {
    const t = await tenant();
    const snap = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(snap.reconciliation.diagnosticReconciliation.bounded).toBe(true);
    expect(snap.reconciliation.operationalAggregates.bounded).toBe(false);
    expect(snap.reconciliation.operationalAggregates.scanKind).toBe('FULL_TABLE_AGGREGATE');
  });

  it('control plane missing is fail-closed in observability', async () => {
    const t = await tenant();
    await deleteKillRow(admin);
    const snap = await svc.buildObservabilitySnapshot({ organizationId: t.organizationId });
    expect(snap.operational.controlPlane.readability).toBe('MISSING');
    expect(snap.operational.controlPlane.killState).toBe('KILLED');
    expect(snap.anomalySamples.CONTROL_PLANE_MISSING).toContain('di_v0_s4_control');
    await setKillState(admin, 'NOT_KILLED');
  });
});
