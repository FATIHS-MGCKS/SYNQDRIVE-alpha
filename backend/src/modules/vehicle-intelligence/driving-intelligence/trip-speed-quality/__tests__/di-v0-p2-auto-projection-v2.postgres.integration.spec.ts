import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { S4aTenant } from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { S4A_POSTGRES_LIVE } from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { PrismaService } from '@shared/database/prisma.service';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../../speed-qc/di-v0-speed-qc-policy.version';
import {
  DI_V0_P2_AUTO_PROJECTION_V2_QC_POLICY,
  DI_V0_P2_AUTO_PROJECTION_V2_TUNING,
  type DiV0P2AutoProjectionV2Config,
} from '../di-v0-p2-auto-projection-v2.config';
import { DiV0P2AutoProjectionOutboxRepository } from '../di-v0-p2-auto-projection-outbox.repository';
import { DiV0P2AutoProjectionV2Service } from '../di-v0-p2-auto-projection-v2.service';
import { DiV0TripSpeedQualityProjectionService } from '../di-v0-trip-speed-quality-projection.service';
import {
  cleanupP2Tenant,
  driftP2PinnedSnapshotBoundaryFingerprint,
  P2_DRIFTED_BOUNDARY_FINGERPRINT,
  seedP2CompletedPrimaryFixture,
  type P2CompletedPrimaryFixture,
} from './di-v0-trip-speed-quality-postgres-harness';

(S4A_POSTGRES_LIVE ? describe : describe.skip)('P2 auto projection V2 (postgres)', () => {
  let db: PrismaClient;
  let outbox: DiV0P2AutoProjectionOutboxRepository;
  const tenantsToCleanup: S4aTenant[] = [];

  const enabledConfig = (since = new Date(Date.now() - 60_000)): DiV0P2AutoProjectionV2Config => ({
    enabled: true,
    enabledSince: since,
    batchLimit: 10,
    schedulerIntervalMs: 60_000,
    qcPolicyVersion: DI_V0_P2_AUTO_PROJECTION_V2_QC_POLICY,
  });

  function trackFixture(fx: P2CompletedPrimaryFixture): P2CompletedPrimaryFixture {
    tenantsToCleanup.push(fx.tenant);
    return fx;
  }

  function mkSvc(
    config: DiV0P2AutoProjectionV2Config,
    projection?: DiV0TripSpeedQualityProjectionService,
  ): DiV0P2AutoProjectionV2Service {
    return new DiV0P2AutoProjectionV2Service(
      db as unknown as PrismaService,
      projection ?? new DiV0TripSpeedQualityProjectionService(db),
      config,
    );
  }

  function pausingProjection(
    pauseOnWorkItemId: string,
    hold: { release: () => void },
  ): DiV0TripSpeedQualityProjectionService {
    const inner = new DiV0TripSpeedQualityProjectionService(db);
    const gate = new Promise<void>((resolve) => {
      hold.release = resolve;
    });
    return {
      projectForWorkItem: async (organizationId, workItemId, options) => {
        if (workItemId === pauseOnWorkItemId) {
          await gate;
        }
        return inner.projectForWorkItem(organizationId, workItemId, options);
      },
      readCurrentOpsProjection: inner.readCurrentOpsProjection.bind(inner),
    } as DiV0TripSpeedQualityProjectionService;
  }

  beforeAll(async () => {
    const { PrismaClient: Client } = await import('@prisma/client');
    db = new Client();
    await db.$connect();
    outbox = new DiV0P2AutoProjectionOutboxRepository(db);
  });

  afterEach(async () => {
    while (tenantsToCleanup.length > 0) {
      const tenant = tenantsToCleanup.pop();
      if (tenant) await cleanupP2Tenant(db, tenant);
    }
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

  async function currentV2WorkItemId(tripId: string): Promise<string | null> {
    const rows = await db.$queryRaw<Array<{ work_item_id: string }>>`
      SELECT work_item_id FROM di_v0_trip_speed_quality_projections_v1
      WHERE trip_id = ${tripId}
        AND qc_policy_version = ${DI_V0_SPEED_QC_POLICY_V2}
        AND lifecycle_status = 'CURRENT'
      LIMIT 1`;
    return rows[0]?.work_item_id ?? null;
  }

  it('disabled config performs no discovery writes', async () => {
    const fx = trackFixture(await seedP2CompletedPrimaryFixture(db));
    const pass = await mkSvc({
      enabled: false,
      enabledSince: null,
      batchLimit: 10,
      schedulerIntervalMs: 60_000,
      qcPolicyVersion: DI_V0_P2_AUTO_PROJECTION_V2_QC_POLICY,
    }).runPass();
    expect(pass.configured).toBe(false);
    expect(await outboxStatus(fx.workItemId)).toBeNull();
  }, 120_000);

  it('eligible S4 completion → outbox → persisted V2 CURRENT projection', async () => {
    const fx = trackFixture(await seedP2CompletedPrimaryFixture(db));
    const pass1 = await mkSvc(enabledConfig()).runPass();
    expect(pass1.configured).toBe(true);
    expect(pass1.discovered).toBeGreaterThanOrEqual(1);
    expect(pass1.succeeded).toBe(1);
    expect(await outboxStatus(fx.workItemId)).toBe('SUCCEEDED');
    expect(await currentV2ProjectionCount(fx.tenant.tripId)).toBe(1);
    const pass2 = await mkSvc(enabledConfig()).runPass();
    expect(pass2.succeeded).toBe(0);
    expect(pass2.discovered).toBe(0);
  }, 120_000);

  it('duplicate parallel passes remain idempotent (single CURRENT V2)', async () => {
    const fx = trackFixture(await seedP2CompletedPrimaryFixture(db));
    await Promise.all([mkSvc(enabledConfig()).runPass(), mkSvc(enabledConfig()).runPass()]);
    expect(await currentV2ProjectionCount(fx.tenant.tripId)).toBe(1);
  }, 120_000);

  it('expired PROCESSING claim is reclaimed after crash before projection', async () => {
    const fx = trackFixture(await seedP2CompletedPrimaryFixture(db));
    const now = new Date();
    await outbox.discoverEligible({
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
      enabledSince: new Date(Date.now() - 120_000),
      limit: 10,
      now,
    });
    const expired = new Date(now.getTime() - 1_000);
    await db.$executeRaw`
      UPDATE di_v0_trip_speed_quality_auto_projection_outbox_v1
      SET status = 'PROCESSING',
        claim_token = ${randomUUID()},
        claim_expires_at = ${expired}
      WHERE work_item_id = ${fx.workItemId}`;
    const pass = await mkSvc(enabledConfig()).runPass(now);
    expect(pass.succeeded).toBe(1);
    expect(await outboxStatus(fx.workItemId)).toBe('SUCCEEDED');
  }, 120_000);

  it('expired PROCESSING after persist heals idempotently (re-project + ack)', async () => {
    const fx = trackFixture(await seedP2CompletedPrimaryFixture(db));
    const projection = new DiV0TripSpeedQualityProjectionService(db);
    await projection.projectForWorkItem(fx.tenant.organizationId, fx.workItemId, {
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });
    await db.$executeRaw`
      INSERT INTO di_v0_trip_speed_quality_auto_projection_outbox_v1 (
        work_item_id, organization_id, trip_id, qc_policy_version, status,
        claim_token, claim_expires_at, next_attempt_at
      ) VALUES (
        ${fx.workItemId}, ${fx.tenant.organizationId}, ${fx.tenant.tripId}, ${DI_V0_SPEED_QC_POLICY_V2},
        'PROCESSING', ${randomUUID()}, ${new Date(Date.now() - 1_000)}, ${new Date()}
      )`;
    const pass = await mkSvc(enabledConfig()).runPass();
    expect(pass.succeeded).toBe(1);
    expect(await currentV2ProjectionCount(fx.tenant.tripId)).toBe(1);
  }, 120_000);

  it('stale worker ack is fenced by claim token', async () => {
    const fx = trackFixture(await seedP2CompletedPrimaryFixture(db));
    await db.$executeRaw`
      INSERT INTO di_v0_trip_speed_quality_auto_projection_outbox_v1 (
        work_item_id, organization_id, trip_id, qc_policy_version, status,
        claim_token, claim_expires_at, next_attempt_at
      ) VALUES (
        ${fx.workItemId}, ${fx.tenant.organizationId}, ${fx.tenant.tripId}, ${DI_V0_SPEED_QC_POLICY_V2},
        'PROCESSING', 'stale-token', ${new Date(Date.now() + 60_000)}, ${new Date()}
      )`;
    const acked = await outbox.markSucceeded(fx.workItemId, 'wrong-token');
    expect(acked).toBe(false);
    expect(await outboxStatus(fx.workItemId)).toBe('PROCESSING');
  }, 120_000);

  it('discovery enqueues new trips despite many existing outbox retry rows', async () => {
    const fx = trackFixture(await seedP2CompletedPrimaryFixture(db));
    for (let i = 0; i < 25; i += 1) {
      await db.$executeRaw`
        INSERT INTO di_v0_trip_speed_quality_auto_projection_outbox_v1 (
          work_item_id, organization_id, trip_id, qc_policy_version, status,
          next_attempt_at, last_error_code
        ) VALUES (
          ${randomUUID()}, ${fx.tenant.organizationId}, ${randomUUID()}, ${DI_V0_SPEED_QC_POLICY_V2},
          'FAILED_RETRYABLE', now() + interval '1 hour', 'UNKNOWN'
        )`;
    }
    const discovered = await outbox.discoverEligible({
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
      enabledSince: new Date(Date.now() - 120_000),
      limit: 5,
      now: new Date(),
    });
    expect(discovered).toBe(1);
  }, 120_000);

  it('superseded work item in outbox is skipped without mutating S4 status', async () => {
    const fx = trackFixture(await seedP2CompletedPrimaryFixture(db));
    await db.$executeRaw`
      UPDATE di_v0_s4_work_items
      SET status = 'SUPERSEDED', superseded_reason = 'BOUNDARY_CHANGED', superseded_at = now()
      WHERE id = ${fx.workItemId}`;
    await db.$executeRaw`
      INSERT INTO di_v0_trip_speed_quality_auto_projection_outbox_v1 (
        work_item_id, organization_id, trip_id, qc_policy_version, status, next_attempt_at
      ) VALUES (
        ${fx.workItemId}, ${fx.tenant.organizationId}, ${fx.tenant.tripId},
        ${DI_V0_SPEED_QC_POLICY_V2}, 'PENDING', ${new Date()}
      )`;
    const pass = await mkSvc(enabledConfig()).runPass();
    expect(pass.skipped).toBe(1);
    expect(await outboxStatus(fx.workItemId)).toBe('SKIPPED_INELIGIBLE');
    const [{ status }] = await db.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM di_v0_s4_work_items WHERE id = ${fx.workItemId}`;
    expect(status).toBe('SUPERSEDED');
  }, 120_000);

  it('sequential batch renews lease so later rows stay claimed during slow first row', async () => {
    const fx1 = trackFixture(await seedP2CompletedPrimaryFixture(db));
    const fx2 = trackFixture(await seedP2CompletedPrimaryFixture(db));
    const now = new Date();
    await outbox.discoverEligible({
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
      enabledSince: new Date(Date.now() - 120_000),
      limit: 10,
      now,
    });
    await outbox.discoverEligible({
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
      enabledSince: new Date(Date.now() - 120_000),
      limit: 10,
      now,
    });
    const claimed = await outbox.claimBatch(2, now, 50);
    expect(claimed.length).toBe(2);
    const first = claimed[0];
    const second = claimed[1];
    const renewed = await outbox.renewClaimLease(first.workItemId, first.claimToken, now, 60_000);
    expect(renewed).toBe(true);
    const [{ exp }] = await db.$queryRaw<Array<{ exp: Date }>>`
      SELECT claim_expires_at AS exp FROM di_v0_trip_speed_quality_auto_projection_outbox_v1
      WHERE work_item_id = ${first.workItemId}`;
    expect(exp.getTime()).toBeGreaterThan(now.getTime() + 30_000);
    const secondStillProcessing = await outbox.renewClaimLease(second.workItemId, second.claimToken, now, 60_000);
    expect(secondStillProcessing).toBe(true);
  }, 120_000);

  it('overlapping processing: paused older worker cannot displace newer CURRENT V2', async () => {
    const fx = trackFixture(await seedP2CompletedPrimaryFixture(db));
    const olderId = fx.workItemId;
    const newerId = randomUUID();
    await db.$executeRaw`
      UPDATE di_v0_s4_work_items
      SET status = 'SUPERSEDED', superseded_reason = 'BOUNDARY_CHANGED', superseded_at = now(),
        boundary_occurrence = 0
      WHERE id = ${olderId}`;
    await db.$executeRaw`
      INSERT INTO di_v0_s4_work_items (
        id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
        boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status,
        shadow_run_id, pinned_snapshot_hash, pinned_at, pinned_epoch, combined_input_identity, execution_identity,
        completed_at, next_attempt_at, settlement_anchor_at, eligible_at
      ) SELECT
        ${newerId}, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
        boundary_fingerprint, 1, pipeline_version_key, pipeline_version_manifest, 'COMPLETED',
        shadow_run_id, pinned_snapshot_hash, pinned_at, pinned_epoch, combined_input_identity, execution_identity,
        now(), NULL, settlement_anchor_at, eligible_at
      FROM di_v0_s4_work_items WHERE id = ${olderId}`;
    const passNow = new Date();
    await outbox.discoverEligible({
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
      enabledSince: new Date(Date.now() - 120_000),
      limit: 10,
      now: passNow,
    });
    await db.$executeRaw`
      INSERT INTO di_v0_trip_speed_quality_auto_projection_outbox_v1 (
        work_item_id, organization_id, trip_id, qc_policy_version, status, next_attempt_at, created_at
      ) VALUES (
        ${olderId}, ${fx.tenant.organizationId}, ${fx.tenant.tripId}, ${DI_V0_SPEED_QC_POLICY_V2},
        'PENDING', ${passNow}, ${new Date(passNow.getTime() - 60_000)}
      )`;
    const hold: { release: () => void } = { release: () => {} };
    const svc = mkSvc(enabledConfig(), pausingProjection(olderId, hold));
    const passPromise = svc.runPass(passNow);
    await new Promise((r) => setTimeout(r, 100));
    const inner = new DiV0TripSpeedQualityProjectionService(db);
    await inner.projectForWorkItem(fx.tenant.organizationId, newerId, {
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });
    expect(await currentV2WorkItemId(fx.tenant.tripId)).toBe(newerId);
    hold.release();
    const pass = await passPromise;
    expect(pass.skipped).toBeGreaterThanOrEqual(1);
    expect(await currentV2WorkItemId(fx.tenant.tripId)).toBe(newerId);
    expect(await currentV2ProjectionCount(fx.tenant.tripId)).toBe(1);
  }, 180_000);

  it('newer active primary CURRENT is not displaced when older outbox row runs later', async () => {
    const fx = trackFixture(await seedP2CompletedPrimaryFixture(db));
    const olderId = fx.workItemId;
    const newerId = randomUUID();
    await db.$executeRaw`
      UPDATE di_v0_s4_work_items
      SET status = 'SUPERSEDED', superseded_reason = 'BOUNDARY_CHANGED', superseded_at = now(),
        boundary_occurrence = 0
      WHERE id = ${olderId}`;
    await db.$executeRaw`
      INSERT INTO di_v0_s4_work_items (
        id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
        boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status,
        shadow_run_id, pinned_snapshot_hash, pinned_at, pinned_epoch, combined_input_identity, execution_identity,
        completed_at, next_attempt_at, settlement_anchor_at, eligible_at
      ) SELECT
        ${newerId}, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
        boundary_fingerprint, 1, pipeline_version_key, pipeline_version_manifest, 'COMPLETED',
        shadow_run_id, pinned_snapshot_hash, pinned_at, pinned_epoch, combined_input_identity, execution_identity,
        now(), NULL, settlement_anchor_at, eligible_at
      FROM di_v0_s4_work_items WHERE id = ${olderId}`;
    const passNew = await mkSvc(enabledConfig()).runPass();
    expect(passNew.succeeded).toBe(1);
    expect(await currentV2ProjectionCount(fx.tenant.tripId)).toBe(1);
    await db.$executeRaw`
      INSERT INTO di_v0_trip_speed_quality_auto_projection_outbox_v1 (
        work_item_id, organization_id, trip_id, qc_policy_version, status, next_attempt_at
      ) VALUES (${olderId}, ${fx.tenant.organizationId}, ${fx.tenant.tripId}, ${DI_V0_SPEED_QC_POLICY_V2}, 'PENDING', ${new Date()})`;
    const passOld = await mkSvc(enabledConfig()).runPass();
    expect(passOld.skipped).toBe(1);
    const [{ n }] = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM di_v0_trip_speed_quality_projections_v1
      WHERE trip_id = ${fx.tenant.tripId}
        AND qc_policy_version = ${DI_V0_SPEED_QC_POLICY_V2}
        AND lifecycle_status = 'CURRENT'
        AND work_item_id = ${newerId}`;
    expect(Number(n)).toBe(1);
  }, 180_000);

  it('V1 CURRENT projection coexists with auto V2 CURRENT on same work item', async () => {
    const fx = trackFixture(await seedP2CompletedPrimaryFixture(db));
    const projection = new DiV0TripSpeedQualityProjectionService(db);
    await projection.projectForWorkItem(fx.tenant.organizationId, fx.workItemId, {});
    await mkSvc(enabledConfig()).runPass();
    const [{ v1n, v2n }] = await db.$queryRaw<Array<{ v1n: bigint; v2n: bigint }>>`
      SELECT
        count(*) FILTER (WHERE qc_policy_version = 'DI_V0_SPEED_QC_POLICY_V1' AND lifecycle_status = 'CURRENT')::bigint AS v1n,
        count(*) FILTER (WHERE qc_policy_version = ${DI_V0_SPEED_QC_POLICY_V2} AND lifecycle_status = 'CURRENT')::bigint AS v2n
      FROM di_v0_trip_speed_quality_projections_v1
      WHERE work_item_id = ${fx.workItemId}`;
    expect(Number(v1n)).toBe(1);
    expect(Number(v2n)).toBe(1);
  }, 120_000);

  it('(synthetic) FAILED_RETRYABLE outbox row recovers on next pass without manual reset', async () => {
    const fx = trackFixture(await seedP2CompletedPrimaryFixture(db));
    const due = new Date(Date.now() - 60_000);
    await db.$executeRaw`
      INSERT INTO di_v0_trip_speed_quality_auto_projection_outbox_v1 (
        work_item_id, organization_id, trip_id, qc_policy_version, status,
        attempt_count, next_attempt_at, last_error_code, last_error_at
      ) VALUES (
        ${fx.workItemId}, ${fx.tenant.organizationId}, ${fx.tenant.tripId}, ${DI_V0_SPEED_QC_POLICY_V2},
        'FAILED_RETRYABLE', 4, ${due}, 'UNKNOWN', ${due}
      )`;
    const pass = await mkSvc(enabledConfig()).runPass();
    expect(pass.succeeded).toBe(1);
    expect(await outboxStatus(fx.workItemId)).toBe('SUCCEEDED');
    expect(await currentV2ProjectionCount(fx.tenant.tripId)).toBe(1);
  }, 120_000);

  it('snapshot scope drift → FAILED_RETRYABLE without mutating S4 COMPLETED', async () => {
    const fx = trackFixture(await seedP2CompletedPrimaryFixture(db));
    await driftP2PinnedSnapshotBoundaryFingerprint(db, fx.tenant, fx.snapshotHash, P2_DRIFTED_BOUNDARY_FINGERPRINT);
    const pass = await mkSvc(enabledConfig()).runPass();
    expect(pass.failedRetryable).toBe(1);
    expect(await outboxStatus(fx.workItemId)).toBe('FAILED_RETRYABLE');
    const [{ status }] = await db.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM di_v0_s4_work_items WHERE id = ${fx.workItemId}`;
    expect(status).toBe('COMPLETED');
  }, 120_000);

  it('claim lease duration is bounded by tuning constant', () => {
    expect(DI_V0_P2_AUTO_PROJECTION_V2_TUNING.claimLeaseMs).toBeGreaterThan(0);
    expect(DI_V0_P2_AUTO_PROJECTION_V2_TUNING.claimLeaseMs).toBeLessThanOrEqual(15 * 60_000);
  });
});
