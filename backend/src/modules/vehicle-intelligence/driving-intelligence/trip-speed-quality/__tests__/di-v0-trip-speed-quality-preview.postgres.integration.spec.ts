import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  assertS4aPostgresCiEnv,
  changeTripBoundary,
  currentFingerprint,
  newS4aClient,
  S4A_POSTGRES_LIVE,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { previewDiV0TripSpeedQualityForWorkItem } from '../di-v0-trip-speed-quality-preview';
import {
  cleanupP2Tenant,
  driftP2PinnedSnapshotBoundaryFingerprint,
  P2_DRIFTED_BOUNDARY_FINGERPRINT,
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
      expect(report.outcome).toBe('ASSESSED');
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
        UPDATE di_v0_s4_work_items
        SET status = 'SUPERSEDED', superseded_reason = 'BOUNDARY_CHANGED', superseded_at = now()
        WHERE id = ${fx.workItemId}`;
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

  it('P21-6 snapshot verification fails → NOT_ASSESSABLE', async () => {
    await withFixture(async (fx) => {
      await driftP2PinnedSnapshotBoundaryFingerprint(
        db,
        fx.tenant,
        fx.snapshotHash,
        P2_DRIFTED_BOUNDARY_FINGERPRINT,
      );
      const report = await previewDiV0TripSpeedQualityForWorkItem(db, {
        organizationId: fx.tenant.organizationId,
        tripId: fx.tenant.tripId,
        workItemId: fx.workItemId,
      });
      expect(report.outcome).toBe('NOT_ASSESSABLE');
      expect(report.notAssessableReasonCode).toBe('SNAPSHOT_VERIFICATION_FAILED');
    });
  }, 120_000);

  it('P21-7 non-active primary (pending successor) → NOT_ASSESSABLE', async () => {
    await withFixture(async (fx) => {
      await changeTripBoundary(db, fx.tenant.tripId);
      const successorBoundary = await currentFingerprint(db, fx.tenant.tripId);
      expect(successorBoundary).not.toBe(fx.boundaryFingerprint);
      const successorId = randomUUID();
      const successorPipelineKey = `DI_V0_S4_PIPELINE_V1:sha256:${'b'.repeat(64)}`;
      await db.$executeRaw`
        INSERT INTO di_v0_s4_pipeline_versions (pipeline_version_key, manifest, status)
        VALUES (${successorPipelineKey}, '{}'::jsonb, 'ACTIVE')
        ON CONFLICT DO NOTHING`;
      await db.$executeRaw`
        INSERT INTO di_v0_s4_work_items (
          id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
          boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status,
          next_attempt_at, settlement_anchor_at, eligible_at
        ) VALUES (
          ${successorId}, ${fx.tenant.organizationId}, ${fx.tenant.vehicleId}, ${fx.tenant.tripId}, 'API_SYNTHETIC',
          'PRIMARY', 'PRIMARY', ${successorBoundary}, 1, ${successorPipelineKey}, '{}'::jsonb, 'PENDING',
          now(), now(), now() + interval '600 seconds'
        )`;
      const report = await previewDiV0TripSpeedQualityForWorkItem(db, {
        organizationId: fx.tenant.organizationId,
        tripId: fx.tenant.tripId,
        workItemId: fx.workItemId,
      });
      expect(report.outcome).toBe('NOT_ASSESSABLE');
      expect(report.notAssessableReasonCode).toBe('NOT_ACTIVE_PRIMARY');
      const successorPreview = await previewDiV0TripSpeedQualityForWorkItem(db, {
        organizationId: fx.tenant.organizationId,
        tripId: fx.tenant.tripId,
        workItemId: successorId,
      });
      expect(successorPreview.outcome).toBe('NOT_ASSESSABLE');
      expect(successorPreview.notAssessableReasonCode).toBe('WORK_ITEM_NOT_ELIGIBLE');
    });
  }, 120_000);
});
