import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { CALIBRATION_UNSET_V0_BUNDLE, DEFAULT_DI_V0_VERSION_TUPLE } from '../../core';
import {
  assertS4aPostgresCiEnv,
  changeTripBoundary,
  newS4aClient,
  S4A_POSTGRES_LIVE,
  settle,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { buildDiV0TripSpeedQualityContentFingerprint } from '../di-v0-trip-speed-quality-idempotency';
import { DiV0TripSpeedQualityProjectionPersistenceError } from '../di-v0-trip-speed-quality-projection.errors';
import { DiV0TripSpeedQualityProjectionRepository } from '../di-v0-trip-speed-quality-projection.repository';
import { DiV0TripSpeedQualityProjectionService } from '../di-v0-trip-speed-quality-projection.service';
import {
  buildSyntheticTripSpeedProjection,
  cleanupP2Tenant,
  seedP2CompletedPrimaryFixture,
  type P2CompletedPrimaryFixture,
} from './di-v0-trip-speed-quality-postgres-harness';

assertS4aPostgresCiEnv();

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DI V0 trip speed quality P2 hardening (PostgreSQL PG1–PG14)', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = newS4aClient();
    await db.$queryRaw`SELECT 1`;
  }, 60_000);

  afterAll(async () => {
    await db.$disconnect();
  });

  async function withFixture(
    fn: (fx: P2CompletedPrimaryFixture, repo: DiV0TripSpeedQualityProjectionRepository) => Promise<void>,
  ): Promise<void> {
    const fx = await seedP2CompletedPrimaryFixture(db);
    const repo = new DiV0TripSpeedQualityProjectionRepository(db);
    try {
      await fn(fx, repo);
    } finally {
      await cleanupP2Tenant(db, fx.tenant);
    }
  }

  it('PG1 identical idempotency key sequential', async () => {
    await withFixture(async (fx, repo) => {
      const projection = buildSyntheticTripSpeedProjection(fx.tenant, {
        workItemId: fx.workItemId,
        shadowRunId: fx.shadowRunId,
        snapshotHash: fx.snapshotHash,
        boundaryFingerprint: fx.boundaryFingerprint,
      });
      const first = await repo.persistCurrentProjection(projection);
      const second = await repo.persistCurrentProjection(projection);
      expect(second.id).toBe(first.id);
    });
  }, 120_000);

  it('PG2 identical idempotency key parallel', async () => {
    await withFixture(async (fx, repo) => {
      const projection = buildSyntheticTripSpeedProjection(fx.tenant, {
        workItemId: fx.workItemId,
        shadowRunId: fx.shadowRunId,
        snapshotHash: fx.snapshotHash,
        boundaryFingerprint: fx.boundaryFingerprint,
      });
      const [a, b] = await Promise.all([
        settle(repo.persistCurrentProjection(projection)),
        settle(repo.persistCurrentProjection(projection)),
      ]);
      expect(a.ok && b.ok).toBe(true);
      if (a.ok && b.ok) {
        expect(a.value.id).toBe(b.value.id);
      }
      const count = await db.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*)::bigint AS n FROM di_v0_trip_speed_quality_projections_v1
        WHERE idempotency_key = ${a.ok ? a.value.idempotencyKey : ''}`;
      expect(Number(count[0].n)).toBe(1);
    });
  }, 120_000);

  it('PG3 different keys parallel same scope — one CURRENT', async () => {
    await withFixture(async (fx, repo) => {
      const wi2 = randomUUID();
      const run2 = randomUUID();
      const p1 = buildSyntheticTripSpeedProjection(fx.tenant, {
        workItemId: fx.workItemId,
        shadowRunId: fx.shadowRunId,
        snapshotHash: fx.snapshotHash,
        boundaryFingerprint: fx.boundaryFingerprint,
      });
      const p2 = buildSyntheticTripSpeedProjection(fx.tenant, {
        workItemId: wi2,
        shadowRunId: run2,
        snapshotHash: fx.snapshotHash,
        boundaryFingerprint: fx.boundaryFingerprint,
      });
      const [r1, r2] = await Promise.all([
        settle(repo.persistCurrentProjection(p1)),
        settle(repo.persistCurrentProjection(p2)),
      ]);
      expect(r1.ok && r2.ok).toBe(true);
      const current = await db.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*)::bigint AS n FROM di_v0_trip_speed_quality_projections_v1
        WHERE organization_id = ${fx.tenant.organizationId} AND trip_id = ${fx.tenant.tripId}
          AND lifecycle_status = 'CURRENT'`;
      expect(Number(current[0].n)).toBe(1);
    });
  }, 120_000);

  it('PG4 newer successor displaces old CURRENT', async () => {
    await withFixture(async (fx, repo) => {
      const wiOld = fx.workItemId;
      const wiNew = randomUUID();
      const pOld = buildSyntheticTripSpeedProjection(fx.tenant, {
        workItemId: wiOld,
        shadowRunId: fx.shadowRunId,
        snapshotHash: fx.snapshotHash,
        boundaryFingerprint: fx.boundaryFingerprint,
      });
      const pNew = buildSyntheticTripSpeedProjection(fx.tenant, {
        workItemId: wiNew,
        shadowRunId: randomUUID(),
        snapshotHash: fx.snapshotHash,
        boundaryFingerprint: fx.boundaryFingerprint,
      });
      const oldRow = await repo.persistCurrentProjection(pOld);
      const newRow = await repo.persistCurrentProjection(pNew);
      expect(newRow.lifecycleStatus).toBe('CURRENT');
      const superseded = await db.$queryRaw<Array<{ lifecycle_status: string }>>`
        SELECT lifecycle_status FROM di_v0_trip_speed_quality_projections_v1 WHERE id = ${oldRow.id}`;
      expect(superseded[0].lifecycle_status).toBe('SUPERSEDED');
      expect(newRow.id).not.toBe(oldRow.id);
    });
  }, 120_000);

  it('PG5 stale projector cannot reset CURRENT after successor write', async () => {
    await withFixture(async (fx, repo) => {
      const wiNew = randomUUID();
      const runNew = randomUUID();
      await db.$executeRaw`
        UPDATE di_v0_s4_work_items
        SET status = 'SUPERSEDED', superseded_reason = 'BOUNDARY_CHANGED', superseded_at = now()
        WHERE id = ${fx.workItemId}`;
      const v = DEFAULT_DI_V0_VERSION_TUPLE;
      await db.$executeRaw`
        INSERT INTO di_v0_shadow_runs (
          id, organization_id, vehicle_id, trip_id, source_family, structural_version, estimator_version,
          calibration_version, source_family_policy_version, input_evidence_version, idempotency_key, status, updated_at
        ) VALUES (
          ${runNew}, ${fx.tenant.organizationId}, ${fx.tenant.vehicleId}, ${fx.tenant.tripId}, 'API_SYNTHETIC',
          ${v.structuralVersion}, ${v.estimatorVersion}, ${CALIBRATION_UNSET_V0_BUNDLE.calibrationVersion},
          ${v.sourceFamilyPolicyVersion}, 'p2-new', ${randomUUID()}, 'COMPLETED', now()
        )`;
      const combinedInputIdentity = `DI_V0_COMBINED_INPUT_IDENTITY_V0_3:sha256:${'f'.repeat(64)}`;
      const executionIdentity = `DI_V0_S4_EXECUTION_IDENTITY_V1:sha256:${'a'.repeat(64)}`;
      await db.$executeRaw`
        INSERT INTO di_v0_s4_work_items (
          id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
          boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status,
          shadow_run_id, pinned_snapshot_hash, pinned_at, pinned_epoch, combined_input_identity, execution_identity,
          completed_at, next_attempt_at, settlement_anchor_at, eligible_at
        ) VALUES (
          ${wiNew}, ${fx.tenant.organizationId}, ${fx.tenant.vehicleId}, ${fx.tenant.tripId}, 'API_SYNTHETIC',
          'PRIMARY', 'PRIMARY', ${fx.boundaryFingerprint}, 1, ${fx.pipelineVersionKey}, '{}'::jsonb, 'COMPLETED',
          ${runNew}, ${fx.snapshotHash}, now(), 1, ${combinedInputIdentity}, ${executionIdentity},
          now(), NULL, now() - interval '1 hour', now() - interval '30 minutes'
        )`;
      const pOld = buildSyntheticTripSpeedProjection(fx.tenant, {
        workItemId: fx.workItemId,
        shadowRunId: fx.shadowRunId,
        snapshotHash: fx.snapshotHash,
        boundaryFingerprint: fx.boundaryFingerprint,
      });
      const pNew = buildSyntheticTripSpeedProjection(fx.tenant, {
        workItemId: wiNew,
        shadowRunId: runNew,
        snapshotHash: fx.snapshotHash,
        boundaryFingerprint: fx.boundaryFingerprint,
      });
      await repo.persistCurrentProjection(pNew, {
        organizationId: fx.tenant.organizationId,
        tripId: fx.tenant.tripId,
        workItemId: wiNew,
        boundaryFingerprint: fx.boundaryFingerprint,
        pinnedSnapshotHash: fx.snapshotHash,
        shadowRunId: runNew,
      });
      await expect(
        repo.persistCurrentProjection(pOld, {
          organizationId: fx.tenant.organizationId,
          tripId: fx.tenant.tripId,
          workItemId: fx.workItemId,
          boundaryFingerprint: fx.boundaryFingerprint,
          pinnedSnapshotHash: fx.snapshotHash,
          shadowRunId: fx.shadowRunId,
        }),
      ).rejects.toThrow(/PERSIST_AUTHORITY|NOT_ACTIVE_PRIMARY|SUPERSEDED/);
      const current = await repo.readCurrentForTrip(
        fx.tenant.organizationId,
        fx.tenant.tripId,
        pNew.identity.qcPolicyVersion,
        pNew.identity.projectionVersion,
      );
      expect(current?.workItemId).toBe(wiNew);
    });
  }, 120_000);

  it('PG15 idempotent retry after work item superseded rejects (no stale success)', async () => {
    await withFixture(async (fx, repo) => {
      const projection = buildSyntheticTripSpeedProjection(fx.tenant, {
        workItemId: fx.workItemId,
        shadowRunId: fx.shadowRunId,
        snapshotHash: fx.snapshotHash,
        boundaryFingerprint: fx.boundaryFingerprint,
      });
      const gate = {
        organizationId: fx.tenant.organizationId,
        tripId: fx.tenant.tripId,
        workItemId: fx.workItemId,
        boundaryFingerprint: fx.boundaryFingerprint,
        pinnedSnapshotHash: fx.snapshotHash,
        shadowRunId: fx.shadowRunId,
      };
      const first = await repo.persistCurrentProjection(projection, gate);
      expect(first.lifecycleStatus).toBe('CURRENT');
      await db.$executeRaw`
        UPDATE di_v0_s4_work_items
        SET status = 'SUPERSEDED', superseded_reason = 'OPERATOR', superseded_at = now()
        WHERE id = ${fx.workItemId}`;
      await expect(repo.persistCurrentProjection(projection, gate)).rejects.toMatchObject({
        code: 'PERSIST_AUTHORITY_REJECTED',
      });
    });
  }, 120_000);

  it('PG6 superseded work item rejected at persist gate', async () => {
    await withFixture(async (fx, repo) => {
      await db.$executeRaw`
        UPDATE di_v0_s4_work_items SET status = 'SUPERSEDED', superseded_reason = 'OPERATOR', superseded_at = now()
        WHERE id = ${fx.workItemId}`;
      const projection = buildSyntheticTripSpeedProjection(fx.tenant, {
        workItemId: fx.workItemId,
        shadowRunId: fx.shadowRunId,
        snapshotHash: fx.snapshotHash,
        boundaryFingerprint: fx.boundaryFingerprint,
      });
      await expect(
        repo.persistCurrentProjection(projection, {
          organizationId: fx.tenant.organizationId,
          tripId: fx.tenant.tripId,
          workItemId: fx.workItemId,
          boundaryFingerprint: fx.boundaryFingerprint,
          pinnedSnapshotHash: fx.snapshotHash,
          shadowRunId: fx.shadowRunId,
        }),
      ).rejects.toBeInstanceOf(DiV0TripSpeedQualityProjectionPersistenceError);
    });
  }, 120_000);

  it('PG7 boundary repair during persist — authority sees successor active', async () => {
    await withFixture(async (fx, repo) => {
      const successorId = randomUUID();
      const newFp = `DI_V0_S4_BOUNDARY_FP_V1:sha256:${'e'.repeat(64)}`;
      await db.$executeRaw`
        UPDATE di_v0_s4_work_items
        SET status = 'SUPERSEDED', superseded_reason = 'BOUNDARY_CHANGED', superseded_at = now()
        WHERE id = ${fx.workItemId}`;
      await db.$executeRaw`
        INSERT INTO di_v0_s4_work_items (
          id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
          boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status,
          next_attempt_at, settlement_anchor_at, eligible_at
        ) VALUES (
          ${successorId}, ${fx.tenant.organizationId}, ${fx.tenant.vehicleId}, ${fx.tenant.tripId}, 'API_SYNTHETIC',
          'PRIMARY', 'PRIMARY', ${newFp}, 1, ${fx.pipelineVersionKey}, '{}'::jsonb, 'PENDING',
          now(), now(), now() + interval '600 seconds'
        )`;
      const projection = buildSyntheticTripSpeedProjection(fx.tenant, {
        workItemId: fx.workItemId,
        shadowRunId: fx.shadowRunId,
        snapshotHash: fx.snapshotHash,
        boundaryFingerprint: fx.boundaryFingerprint,
      });
      await expect(
        repo.persistCurrentProjection(projection, {
          organizationId: fx.tenant.organizationId,
          tripId: fx.tenant.tripId,
          workItemId: fx.workItemId,
          boundaryFingerprint: fx.boundaryFingerprint,
          pinnedSnapshotHash: fx.snapshotHash,
          shadowRunId: fx.shadowRunId,
        }),
      ).rejects.toThrow(/NOT_ACTIVE_PRIMARY|SUPERSEDED/);
    });
  }, 120_000);

  it('PG8 tenant isolation on read CURRENT', async () => {
    await withFixture(async (fx, repo) => {
      const projection = buildSyntheticTripSpeedProjection(fx.tenant, {
        workItemId: fx.workItemId,
        shadowRunId: fx.shadowRunId,
        snapshotHash: fx.snapshotHash,
        boundaryFingerprint: fx.boundaryFingerprint,
      });
      await repo.persistCurrentProjection(projection);
      const otherOrg = randomUUID();
      const row = await repo.readCurrentForTrip(
        otherOrg,
        fx.tenant.tripId,
        projection.identity.qcPolicyVersion,
        projection.identity.projectionVersion,
      );
      expect(row).toBeNull();
    });
  }, 120_000);

  it('PG9 content fingerprint mismatch on idempotency key reuse', async () => {
    await withFixture(async (fx, repo) => {
      const projection = buildSyntheticTripSpeedProjection(fx.tenant, {
        workItemId: fx.workItemId,
        shadowRunId: fx.shadowRunId,
        snapshotHash: fx.snapshotHash,
        boundaryFingerprint: fx.boundaryFingerprint,
      });
      await repo.persistCurrentProjection(projection);
      const tampered = {
        ...projection,
        quality: { ...projection.quality, untrustedCount: projection.quality.untrustedCount + 1 },
      };
      await expect(repo.persistCurrentProjection(tampered)).rejects.toMatchObject({
        code: 'IDEMPOTENCY_CONTENT_MISMATCH',
      });
    });
  }, 120_000);

  it('PG10 snapshot missing fails closed in service', async () => {
    await withFixture(async (fx) => {
      await changeTripBoundary(db, fx.tenant.tripId);
      const svc = new DiV0TripSpeedQualityProjectionService(db);
      await expect(svc.projectForWorkItem(fx.tenant.organizationId, fx.workItemId)).rejects.toMatchObject({
        code: 'SNAPSHOT_VERIFICATION_FAILED',
      });
    });
  }, 120_000);

  it('PG11 projection failure leaves S4 work item COMPLETED', async () => {
    await withFixture(async (fx) => {
      await db.$executeRaw`DELETE FROM di_v0_shadow_intervals WHERE shadow_run_id = ${fx.shadowRunId}`;
      const svc = new DiV0TripSpeedQualityProjectionService(db);
      await expect(svc.projectForWorkItem(fx.tenant.organizationId, fx.workItemId)).rejects.toThrow(
        /DI_V0_TRIP_SPEED_QUALITY/,
      );
      const [wi] = await db.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM di_v0_s4_work_items WHERE id = ${fx.workItemId}`;
      expect(wi.status).toBe('COMPLETED');
    });
  }, 120_000);

  it('PG12 migration constraints and Prisma model parity', async () => {
    const indexes = await db.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'di_v0_trip_speed_quality_projections_v1'
      ORDER BY indexname`;
    const names = indexes.map((i) => i.indexname);
    expect(names).toContain('di_v0_tsqp_v1_idempotency_uq');
    expect(names).toContain('di_v0_tsqp_v1_current_scope_uq');
    const [{ n }] = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'di_v0_trip_speed_quality_projections_v1'`;
    expect(Number(n)).toBe(1);
  }, 60_000);

  it('PG13 read CURRENT hidden when pending successor is active primary', async () => {
    await withFixture(async (fx, repo) => {
      const projection = buildSyntheticTripSpeedProjection(fx.tenant, {
        workItemId: fx.workItemId,
        shadowRunId: fx.shadowRunId,
        snapshotHash: fx.snapshotHash,
        boundaryFingerprint: fx.boundaryFingerprint,
      });
      await repo.persistCurrentProjection(projection, {
        organizationId: fx.tenant.organizationId,
        tripId: fx.tenant.tripId,
        workItemId: fx.workItemId,
        boundaryFingerprint: fx.boundaryFingerprint,
        pinnedSnapshotHash: fx.snapshotHash,
        shadowRunId: fx.shadowRunId,
      });
      const successorId = randomUUID();
      await db.$executeRaw`
        UPDATE di_v0_s4_work_items
        SET status = 'SUPERSEDED', superseded_reason = 'BOUNDARY_CHANGED', superseded_at = now()
        WHERE id = ${fx.workItemId}`;
      await db.$executeRaw`
        INSERT INTO di_v0_s4_work_items (
          id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
          boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status,
          next_attempt_at, settlement_anchor_at, eligible_at
        ) VALUES (
          ${successorId}, ${fx.tenant.organizationId}, ${fx.tenant.vehicleId}, ${fx.tenant.tripId}, 'API_SYNTHETIC',
          'PRIMARY', 'PRIMARY', ${fx.boundaryFingerprint}, 1, ${fx.pipelineVersionKey}, '{}'::jsonb, 'PENDING',
          now(), now(), now() + interval '600 seconds'
        )`;
      const svc = new DiV0TripSpeedQualityProjectionService(db);
      const read = await svc.readCurrentOpsProjection(fx.tenant.organizationId, fx.tenant.tripId);
      expect(read).toBeNull();
    });
  }, 120_000);

  it('PG14 repeated read and project paths are deterministic', async () => {
    await withFixture(async (fx, repo) => {
      const projection = buildSyntheticTripSpeedProjection(fx.tenant, {
        workItemId: fx.workItemId,
        shadowRunId: fx.shadowRunId,
        snapshotHash: fx.snapshotHash,
        boundaryFingerprint: fx.boundaryFingerprint,
      });
      const json = JSON.stringify(projection);
      const fp1 = buildDiV0TripSpeedQualityContentFingerprint(json);
      const fp2 = buildDiV0TripSpeedQualityContentFingerprint(json);
      expect(fp1).toBe(fp2);
      const a = await repo.persistCurrentProjection(projection);
      const b = await repo.persistCurrentProjection(projection);
      expect(a.contentFingerprint).toBe(b.contentFingerprint);
      expect(a.projection).toEqual(b.projection);
    });
  }, 120_000);
});
