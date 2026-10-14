import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  assertS4aPostgresCiEnv,
  newS4aClient,
  S4A_POSTGRES_LIVE,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { previewDiV0TripSpeedQualityForWorkItem } from '../di-v0-trip-speed-quality-preview';
import {
  cleanupP2Tenant,
  seedP2CompletedPrimaryFixture,
  type P2CompletedPrimaryFixture,
} from './di-v0-trip-speed-quality-postgres-harness';

assertS4aPostgresCiEnv();

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DI V0 trip speed quality P2.1 preview (PostgreSQL)', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = newS4aClient();
    await db.$queryRaw`SELECT 1`;
  }, 60_000);

  afterAll(async () => {
    await db.$disconnect();
  });

  async function withFixture(
    fn: (fx: P2CompletedPrimaryFixture) => Promise<void>,
  ): Promise<void> {
    const fx = await seedP2CompletedPrimaryFixture(db);
    try {
      await fn(fx);
    } finally {
      await cleanupP2Tenant(db, fx.tenant);
    }
  }

  async function projectionRowCount(tripId: string): Promise<number> {
    const rows = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM di_v0_trip_speed_quality_projections_v1 WHERE trip_id = ${tripId}`;
    return Number(rows[0]?.n ?? 0);
  }

  it('P21-1 preview returns ASSESSED metrics without persisting', async () => {
    await withFixture(async (fx) => {
      const before = await projectionRowCount(fx.tenant.tripId);
      const report = await previewDiV0TripSpeedQualityForWorkItem(db, {
        organizationId: fx.tenant.organizationId,
        tripId: fx.tenant.tripId,
        workItemId: fx.workItemId,
      });
      const after = await projectionRowCount(fx.tenant.tripId);
      expect(after).toBe(before);
      expect(report.mode).toBe('READ_ONLY_PREVIEW');
      expect(report.snapshotVerified).toBe(true);
      expect(report.projection).not.toBeNull();
      expect(report.projection!.speed.qcTrustedMaxKmh).toBeGreaterThan(0);
      expect(JSON.stringify(report)).not.toMatch(/latitude|longitude/i);
    });
  }, 120_000);

  it('P21-2 repeated preview is deterministic', async () => {
    await withFixture(async (fx) => {
      const a = await previewDiV0TripSpeedQualityForWorkItem(db, {
        organizationId: fx.tenant.organizationId,
        tripId: fx.tenant.tripId,
        workItemId: fx.workItemId,
      });
      const b = await previewDiV0TripSpeedQualityForWorkItem(db, {
        organizationId: fx.tenant.organizationId,
        tripId: fx.tenant.tripId,
        workItemId: fx.workItemId,
      });
      expect(a).toEqual(b);
    });
  }, 120_000);

  it('P21-3 superseded work item → NOT_ASSESSABLE', async () => {
    await withFixture(async (fx) => {
      await db.$executeRaw`
        UPDATE di_v0_s4_work_items SET status = 'SUPERSEDED' WHERE id = ${fx.workItemId}`;
      const report = await previewDiV0TripSpeedQualityForWorkItem(db, {
        organizationId: fx.tenant.organizationId,
        tripId: fx.tenant.tripId,
        workItemId: fx.workItemId,
      });
      expect(report.outcome).toBe('NOT_ASSESSABLE');
      expect(report.notAssessableReasonCode).toBe('WORK_ITEM_SUPERSEDED');
    });
  }, 120_000);

  it('P21-4 tenant mismatch → NOT_ASSESSABLE', async () => {
    await withFixture(async (fx) => {
      const report = await previewDiV0TripSpeedQualityForWorkItem(db, {
        organizationId: randomUUID(),
        tripId: fx.tenant.tripId,
        workItemId: fx.workItemId,
      });
      expect(report.outcome).toBe('NOT_ASSESSABLE');
      expect(report.notAssessableReasonCode).toBe('TENANT_SCOPE_MISMATCH');
    });
  }, 120_000);

  it('P21-5 trip mismatch → NOT_ASSESSABLE', async () => {
    await withFixture(async (fx) => {
      const report = await previewDiV0TripSpeedQualityForWorkItem(db, {
        organizationId: fx.tenant.organizationId,
        tripId: randomUUID(),
        workItemId: fx.workItemId,
      });
      expect(report.outcome).toBe('NOT_ASSESSABLE');
      expect(report.notAssessableReasonCode).toBe('TENANT_SCOPE_MISMATCH');
    });
  }, 120_000);

  it('P21-6 missing snapshot row → NOT_ASSESSABLE', async () => {
    await withFixture(async (fx) => {
      await db.$executeRaw`
        DELETE FROM di_v0_s4_evidence_snapshots
        WHERE trip_id = ${fx.tenant.tripId} AND snapshot_hash = ${fx.snapshotHash}`;
      const report = await previewDiV0TripSpeedQualityForWorkItem(db, {
        organizationId: fx.tenant.organizationId,
        tripId: fx.tenant.tripId,
        workItemId: fx.workItemId,
      });
      expect(report.outcome).toBe('NOT_ASSESSABLE');
      expect(report.notAssessableReasonCode).toBe('SNAPSHOT_VERIFICATION_FAILED');
    });
  }, 120_000);

  it('P21-7 non-active primary (successor exists) → NOT_ASSESSABLE', async () => {
    await withFixture(async (fx) => {
      const successorId = randomUUID();
      await db.$executeRaw`
        UPDATE di_v0_s4_work_items SET status = 'SUPERSEDED', boundary_occurrence = 0 WHERE id = ${fx.workItemId}`;
      await db.$executeRaw`
        INSERT INTO di_v0_s4_work_items (
          id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
          boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status,
          shadow_run_id, pinned_snapshot_hash, combined_input_identity, execution_identity,
          completed_at, next_attempt_at, settlement_anchor_at, eligible_at
        ) VALUES (
          ${successorId}, ${fx.tenant.organizationId}, ${fx.tenant.vehicleId}, ${fx.tenant.tripId}, 'API_SYNTHETIC',
          'PRIMARY', 'PRIMARY', ${fx.boundaryFingerprint}, 1, ${fx.pipelineVersionKey}, '{}'::jsonb, 'PENDING',
          ${fx.shadowRunId}, ${fx.snapshotHash}, 'ci-2', 'ex-2',
          NULL, now(), now(), now() + interval '600 seconds'
        )`;
      const report = await previewDiV0TripSpeedQualityForWorkItem(db, {
        organizationId: fx.tenant.organizationId,
        tripId: fx.tenant.tripId,
        workItemId: fx.workItemId,
      });
      expect(report.outcome).toBe('NOT_ASSESSABLE');
      expect(report.notAssessableReasonCode).toBe('WORK_ITEM_SUPERSEDED');
    });
  }, 120_000);
});
