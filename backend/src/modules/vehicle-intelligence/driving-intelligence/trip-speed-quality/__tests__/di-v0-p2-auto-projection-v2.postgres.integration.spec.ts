import type { PrismaClient } from '@prisma/client';
import { S4A_POSTGRES_LIVE } from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../../speed-qc/di-v0-speed-qc-policy.version';
import { DI_V0_P2_AUTO_PROJECTION_V2_QC_POLICY } from '../di-v0-p2-auto-projection-v2.config';
import { DiV0P2AutoProjectionV2Service } from '../di-v0-p2-auto-projection-v2.service';
import { DiV0TripSpeedQualityProjectionService } from '../di-v0-trip-speed-quality-projection.service';
import {
  cleanupP2Tenant,
  seedP2CompletedPrimaryFixture,
} from './di-v0-trip-speed-quality-postgres-harness';

(S4A_POSTGRES_LIVE ? describe : describe.skip)('P2 auto projection V2 (postgres)', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const { PrismaClient: Client } = await import('@prisma/client');
    db = new Client();
    await db.$connect();
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  async function outboxStatus(workItemId: string): Promise<string | null> {
    const rows = await db.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM di_v0_trip_speed_quality_auto_projection_outbox_v1
      WHERE work_item_id = ${workItemId}`;
    return rows[0]?.status ?? null;
  }

  async function currentV2ProjectionCount(tripId: string): Promise<number> {
    const [{ n }] = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM di_v0_trip_speed_quality_projections_v1
      WHERE trip_id = ${tripId}
        AND qc_policy_version = ${DI_V0_SPEED_QC_POLICY_V2}
        AND lifecycle_status = 'CURRENT'`;
    return Number(n);
  }

  it(
    'disabled config performs no discovery writes',
    async () => {
      const fx = await seedP2CompletedPrimaryFixture(db);
      const svc = new DiV0P2AutoProjectionV2Service(
        db as unknown as import('@shared/database/prisma.service').PrismaService,
        new DiV0TripSpeedQualityProjectionService(db),
        {
          enabled: false,
          enabledSince: null,
          batchLimit: 10,
          schedulerIntervalMs: 60_000,
          qcPolicyVersion: DI_V0_P2_AUTO_PROJECTION_V2_QC_POLICY,
        },
      );
      const pass = await svc.runPass();
      expect(pass.configured).toBe(false);
      expect(await outboxStatus(fx.workItemId)).toBeNull();
      await cleanupP2Tenant(db, fx.tenant);
    },
    120_000,
  );

  it(
    'eligible S4 completion → outbox → persisted V2 CURRENT projection',
    async () => {
      const fx = await seedP2CompletedPrimaryFixture(db);
      const enabledSince = new Date(Date.now() - 60_000);
      const svc = new DiV0P2AutoProjectionV2Service(
        db as unknown as import('@shared/database/prisma.service').PrismaService,
        new DiV0TripSpeedQualityProjectionService(db),
        {
          enabled: true,
          enabledSince,
          batchLimit: 10,
          schedulerIntervalMs: 60_000,
          qcPolicyVersion: DI_V0_P2_AUTO_PROJECTION_V2_QC_POLICY,
        },
      );
      const pass1 = await svc.runPass();
      expect(pass1.configured).toBe(true);
      expect(pass1.discovered).toBeGreaterThanOrEqual(1);
      expect(pass1.succeeded).toBe(1);
      expect(await outboxStatus(fx.workItemId)).toBe('SUCCEEDED');
      expect(await currentV2ProjectionCount(fx.tenant.tripId)).toBe(1);

      const pass2 = await svc.runPass();
      expect(pass2.succeeded).toBe(0);
      expect(pass2.discovered).toBe(0);
      await cleanupP2Tenant(db, fx.tenant);
    },
    120_000,
  );

  it(
    'duplicate parallel passes remain idempotent (single CURRENT V2)',
    async () => {
      const fx = await seedP2CompletedPrimaryFixture(db);
      const enabledSince = new Date(Date.now() - 60_000);
      const mk = () =>
        new DiV0P2AutoProjectionV2Service(
          db as unknown as import('@shared/database/prisma.service').PrismaService,
          new DiV0TripSpeedQualityProjectionService(db),
          {
            enabled: true,
            enabledSince,
            batchLimit: 10,
            schedulerIntervalMs: 60_000,
            qcPolicyVersion: DI_V0_P2_AUTO_PROJECTION_V2_QC_POLICY,
          },
        );
      await Promise.all([mk().runPass(), mk().runPass()]);
      expect(await currentV2ProjectionCount(fx.tenant.tripId)).toBe(1);
      await cleanupP2Tenant(db, fx.tenant);
    },
    120_000,
  );

  it(
    'superseded work item in outbox is skipped without mutating S4 status',
    async () => {
      const fx = await seedP2CompletedPrimaryFixture(db);
      await db.$executeRaw`
        UPDATE di_v0_s4_work_items
        SET status = 'SUPERSEDED', superseded_reason = 'BOUNDARY_CHANGED', superseded_at = now()
        WHERE id = ${fx.workItemId}`;
      await db.$executeRaw`
        INSERT INTO di_v0_trip_speed_quality_auto_projection_outbox_v1 (
          work_item_id, organization_id, trip_id, qc_policy_version, status, next_attempt_at
        ) VALUES (
          ${fx.workItemId}, ${fx.tenant.organizationId}, ${fx.tenant.tripId},
          ${DI_V0_SPEED_QC_POLICY_V2}, 'PENDING', now()
        )`;
      const svc = new DiV0P2AutoProjectionV2Service(
        db as unknown as import('@shared/database/prisma.service').PrismaService,
        new DiV0TripSpeedQualityProjectionService(db),
        {
          enabled: true,
          enabledSince: new Date(Date.now() - 60_000),
          batchLimit: 10,
          schedulerIntervalMs: 60_000,
          qcPolicyVersion: DI_V0_P2_AUTO_PROJECTION_V2_QC_POLICY,
        },
      );
      const pass = await svc.runPass();
      expect(pass.skipped).toBe(1);
      expect(await outboxStatus(fx.workItemId)).toBe('SKIPPED_INELIGIBLE');
      const [{ status }] = await db.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM di_v0_s4_work_items WHERE id = ${fx.workItemId}`;
      expect(status).toBe('SUPERSEDED');
      await cleanupP2Tenant(db, fx.tenant);
    },
    120_000,
  );

  it(
    'V1 CURRENT projection coexists with auto V2 CURRENT on same work item',
    async () => {
      const fx = await seedP2CompletedPrimaryFixture(db);
      const projection = new DiV0TripSpeedQualityProjectionService(db);
      await projection.projectForWorkItem(fx.tenant.organizationId, fx.workItemId, {});
      const enabledSince = new Date(Date.now() - 60_000);
      const svc = new DiV0P2AutoProjectionV2Service(
        db as unknown as import('@shared/database/prisma.service').PrismaService,
        projection,
        {
          enabled: true,
          enabledSince,
          batchLimit: 10,
          schedulerIntervalMs: 60_000,
          qcPolicyVersion: DI_V0_P2_AUTO_PROJECTION_V2_QC_POLICY,
        },
      );
      await svc.runPass();
      const [{ v1n, v2n }] = await db.$queryRaw<Array<{ v1n: bigint; v2n: bigint }>>`
        SELECT
          count(*) FILTER (WHERE qc_policy_version = 'DI_V0_SPEED_QC_POLICY_V1' AND lifecycle_status = 'CURRENT')::bigint AS v1n,
          count(*) FILTER (WHERE qc_policy_version = ${DI_V0_SPEED_QC_POLICY_V2} AND lifecycle_status = 'CURRENT')::bigint AS v2n
        FROM di_v0_trip_speed_quality_projections_v1
        WHERE work_item_id = ${fx.workItemId}`;
      expect(Number(v1n)).toBe(1);
      expect(Number(v2n)).toBe(1);
      await cleanupP2Tenant(db, fx.tenant);
    },
    120_000,
  );
});
