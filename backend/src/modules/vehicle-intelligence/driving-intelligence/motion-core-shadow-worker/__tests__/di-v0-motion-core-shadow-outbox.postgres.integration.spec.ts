import { gzipSync } from 'zlib';
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  S4A_POSTGRES_LIVE,
  seedS4aTripDiBoundaryAdmission,
  seedS4aVerifiablePinnedEvidenceBundle,
  type S4aTenant,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { CALIBRATION_UNSET_V0_BUNDLE, DEFAULT_DI_V0_VERSION_TUPLE } from '../../core';
import {
  DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1,
  DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V4_C5_1_AND_FSM_GAP_BRIDGE,
} from '../di-v0-motion-core-shadow.bundle.version';
import type { DiV0MotionCoreShadowControlPlaneConfig } from '../di-v0-motion-core-shadow-control-plane';
import { buildMotionCoreShadowIntentKey } from '../di-v0-motion-core-shadow-intent';
import { DiV0MotionCoreShadowOutboxRepository } from '../di-v0-motion-core-shadow-outbox.repository';
import {
  cleanupP2Tenant,
  seedP2CompletedPrimaryFixture,
  type P2CompletedPrimaryFixture,
} from '../../trip-speed-quality/__tests__/di-v0-trip-speed-quality-postgres-harness';

const FIXTURE_ENABLED_SINCE = new Date('2026-09-01T00:00:00.000Z');
const FIXTURE_TRIP_T0 = new Date('2026-10-01T00:00:00.000Z');
const FIXTURE_PASS_NOW = new Date('2026-10-26T12:00:00.000Z');

function controlPlaneV1Only(): DiV0MotionCoreShadowControlPlaneConfig {
  return {
    shadowEnabled: true,
    workerEnabled: true,
    c5_1PreferredSpeedEnabled: false,
    c5_1ActivationSince: null,
    fsmGapBridgeV1Enabled: false,
    fsmGapBridgeV1ActivationSince: null,
    organizationAllowlist: new Set(),
    vehicleAllowlist: new Set(),
  };
}

function controlPlaneV4Tiguan(): DiV0MotionCoreShadowControlPlaneConfig {
  return {
    shadowEnabled: true,
    workerEnabled: true,
    c5_1PreferredSpeedEnabled: true,
    c5_1ActivationSince: new Date('2026-09-01T00:00:00.000Z'),
    fsmGapBridgeV1Enabled: true,
    fsmGapBridgeV1ActivationSince: new Date('2026-09-01T00:00:00.000Z'),
    organizationAllowlist: new Set(),
    vehicleAllowlist: new Set(),
  };
}

async function cleanupMotionForTrip(db: PrismaClient, tripId: string): Promise<void> {
  await db.$executeRaw`DELETE FROM di_v0_motion_core_shadow_runs_v1 WHERE trip_id = ${tripId}`;
  await db.$executeRaw`DELETE FROM di_v0_motion_core_shadow_outbox_v1 WHERE trip_id = ${tripId}`;
}

async function setWorkItemCompletedAt(db: PrismaClient, workItemId: string, completedAt: Date): Promise<void> {
  await db.$executeRaw`
    UPDATE di_v0_s4_work_items SET completed_at = ${completedAt} WHERE id = ${workItemId}`;
}

async function setVehicleMakeModel(
  db: PrismaClient,
  vehicleId: string,
  make: string,
  model: string,
): Promise<void> {
  await db.$executeRaw`UPDATE vehicles SET make = ${make}, model = ${model} WHERE id = ${vehicleId}`;
}

async function seedExtraCompletedPrimaryOnVehicle(
  db: PrismaClient,
  base: P2CompletedPrimaryFixture,
  input: { tripId: string; workItemId: string; completedAt: Date },
): Promise<void> {
  const startTime = new Date(input.completedAt.getTime() - 30 * 60_000);
  const endTime = input.completedAt;
  await db.$executeRaw`
    INSERT INTO vehicle_trips (
      id, vehicle_id, trip_status, start_time, end_time, dimo_segment_id, created_at,
      start_latitude, start_longitude, distance_km, max_speed_kmh, avg_speed_kmh, harsh_brake_count, driving_score
    ) VALUES (
      ${input.tripId}, ${base.tenant.vehicleId}, 'COMPLETED',
      ${startTime}, ${endTime}, ${randomUUID()},
      ${endTime}, 52.0, 9.0, 12.0, 77.0, 45.0, 2, 88
    )`;
  const tenant: S4aTenant = {
    organizationId: base.tenant.organizationId,
    vehicleId: base.tenant.vehicleId,
    tripId: input.tripId,
    startTime,
    endTime,
    dimoSegmentId: randomUUID(),
  };
  await seedS4aTripDiBoundaryAdmission(db, tenant);
  const evidence = await seedS4aVerifiablePinnedEvidenceBundle(db, tenant);
  const shadowRunId = randomUUID();
  const v = DEFAULT_DI_V0_VERSION_TUPLE;
  await db.$executeRaw`
    INSERT INTO di_v0_shadow_runs (
      id, organization_id, vehicle_id, trip_id, source_family, structural_version, estimator_version,
      calibration_version, source_family_policy_version, input_evidence_version, idempotency_key, status, updated_at
    ) VALUES (
      ${shadowRunId}, ${tenant.organizationId}, ${tenant.vehicleId}, ${tenant.tripId}, 'API_SYNTHETIC',
      ${v.structuralVersion}, ${v.estimatorVersion}, ${CALIBRATION_UNSET_V0_BUNDLE.calibrationVersion},
      ${v.sourceFamilyPolicyVersion}, 'motion-extra-iev', ${randomUUID()}, 'COMPLETED', now()
    )`;
  const executionIdentity = `DI_V0_S4_EXECUTION_IDENTITY_V1:sha256:${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
  await db.$executeRaw`
    INSERT INTO di_v0_s4_work_items (
      id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
      boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status,
      shadow_run_id, pinned_snapshot_hash, pinned_at, pinned_epoch, combined_input_identity, execution_identity,
      completed_at, next_attempt_at, settlement_anchor_at, eligible_at
    ) VALUES (
      ${input.workItemId}, ${tenant.organizationId}, ${tenant.vehicleId}, ${tenant.tripId}, 'API_SYNTHETIC',
      'PRIMARY', 'PRIMARY', ${evidence.boundaryFingerprint}, 0, ${base.pipelineVersionKey}, '{}'::jsonb, 'COMPLETED',
      ${shadowRunId}, ${evidence.snapshotHash}, now(), 1, ${evidence.combinedInputIdentity}, ${executionIdentity},
      ${input.completedAt}, NULL, ${startTime}, ${startTime}
    )`;
}

(S4A_POSTGRES_LIVE ? describe : describe.skip)(
  'DI V0 motion-core shadow outbox discovery (postgres)',
  () => {
    let db: PrismaClient;
    let outbox: DiV0MotionCoreShadowOutboxRepository;
    const fixtures: P2CompletedPrimaryFixture[] = [];
    const extraTripIds: string[] = [];

    const discoverInput = (
      scope: P2CompletedPrimaryFixture,
      limit: number,
      controlPlane: DiV0MotionCoreShadowControlPlaneConfig,
      now = FIXTURE_PASS_NOW,
    ) => ({
      enabledSince: FIXTURE_ENABLED_SINCE,
      organizationAllowlist: [scope.tenant.organizationId],
      vehicleAllowlist: [scope.tenant.vehicleId],
      controlPlane,
      limit,
      now,
    });

    beforeAll(async () => {
      const { PrismaClient: Client } = await import('@prisma/client');
      db = new Client();
      await db.$connect();
      outbox = new DiV0MotionCoreShadowOutboxRepository(db);
    });

    afterEach(async () => {
      while (extraTripIds.length > 0) {
        const tripId = extraTripIds.pop();
        if (!tripId) break;
        await cleanupMotionForTrip(db, tripId);
        await db.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE trip_id = ${tripId}`;
        await db.$executeRaw`DELETE FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${tripId}`;
        await db.$executeRaw`DELETE FROM di_v0_shadow_runs WHERE trip_id = ${tripId}`;
        await db.$executeRaw`DELETE FROM vehicle_trips WHERE id = ${tripId}`;
      }
      while (fixtures.length > 0) {
        const fx = fixtures.pop();
        if (!fx) break;
        await cleanupMotionForTrip(db, fx.tenant.tripId);
        await cleanupP2Tenant(db, fx.tenant);
      }
    });

    afterAll(async () => {
      await db.$disconnect();
    });

    it('does not starve when the first 50 eligible rows already have outbox (68 total, 18 missing)', async () => {
      const base = await seedP2CompletedPrimaryFixture(db);
      fixtures.push(base);
      await setWorkItemCompletedAt(db, base.workItemId, FIXTURE_TRIP_T0);
      const cp = controlPlaneV1Only();

      const workItems: Array<{ workItemId: string; tripId: string; completedAt: Date }> = [
        {
          workItemId: base.workItemId,
          tripId: base.tenant.tripId,
          completedAt: FIXTURE_TRIP_T0,
        },
      ];
      for (let i = 1; i < 68; i += 1) {
        const tripId = randomUUID();
        const workItemId = randomUUID();
        const completedAt = new Date(FIXTURE_TRIP_T0.getTime() + i * 60_000);
        await seedExtraCompletedPrimaryOnVehicle(db, base, { tripId, workItemId, completedAt });
        extraTripIds.push(tripId);
        workItems.push({ workItemId, tripId, completedAt });
        await cleanupMotionForTrip(db, tripId);
      }
      workItems.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

      for (const row of workItems.slice(0, 50)) {
        const [{ pinned_snapshot_hash: pinnedSnapshotHash, combined_input_identity: combinedInputIdentity }] =
          await db.$queryRaw<
            Array<{ pinned_snapshot_hash: string; combined_input_identity: string }>
          >`SELECT pinned_snapshot_hash, combined_input_identity FROM di_v0_s4_work_items WHERE id = ${row.workItemId}`;
        const intentKey = buildMotionCoreShadowIntentKey({
          pinnedSnapshotHash,
          combinedInputIdentity,
          bundleVersion: DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1,
        });
        await db.$executeRaw`
          INSERT INTO di_v0_motion_core_shadow_outbox_v1 (
            work_item_id, shadow_intent_key, organization_id, trip_id, vehicle_id,
            shadow_bundle_version, status, next_attempt_at
          ) VALUES (
            ${row.workItemId}, ${intentKey}, ${base.tenant.organizationId}, ${row.tripId}, ${base.tenant.vehicleId},
            ${DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1}, 'SUCCEEDED', ${FIXTURE_PASS_NOW}
          )`;
      }

      const discovered = await outbox.discoverEligible(discoverInput(base, 50, cp));
      expect(discovered).toBe(18);
      const rediscover = await outbox.discoverEligible(discoverInput(base, 50, cp));
      expect(rediscover).toBe(0);

      const [{ count }] = await db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM di_v0_motion_core_shadow_outbox_v1
        WHERE organization_id = ${base.tenant.organizationId}
          AND vehicle_id = ${base.tenant.vehicleId}
          AND status = 'PENDING'`;
      expect(Number(count)).toBe(18);
    }, 180_000);

    it('repeated discovery does not create duplicate outbox rows', async () => {
      const fx = await seedP2CompletedPrimaryFixture(db);
      fixtures.push(fx);
      await setWorkItemCompletedAt(db, fx.workItemId, FIXTURE_TRIP_T0);
      const cp = controlPlaneV1Only();
      const first = await outbox.discoverEligible(discoverInput(fx, 10, cp));
      expect(first).toBe(1);
      const second = await outbox.discoverEligible(discoverInput(fx, 10, cp));
      expect(second).toBe(0);
      const [{ count }] = await db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM di_v0_motion_core_shadow_outbox_v1 WHERE work_item_id = ${fx.workItemId}`;
      expect(Number(count)).toBe(1);
    }, 120_000);

    it('allows a new V4 intent when a V1 intent already succeeded for the same work item', async () => {
      const fx = await seedP2CompletedPrimaryFixture(db);
      fixtures.push(fx);
      await setVehicleMakeModel(db, fx.tenant.vehicleId, 'Volkswagen', 'Tiguan');
      await setWorkItemCompletedAt(db, fx.workItemId, FIXTURE_TRIP_T0);
      const [{ combined_input_identity: combinedInputIdentity }] = await db.$queryRaw<
        Array<{ combined_input_identity: string }>
      >`SELECT combined_input_identity FROM di_v0_s4_work_items WHERE id = ${fx.workItemId}`;
      const v1Key = buildMotionCoreShadowIntentKey({
        pinnedSnapshotHash: fx.snapshotHash,
        combinedInputIdentity,
        bundleVersion: DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1,
      });
      const runId = randomUUID();
      const payloadGzip = gzipSync('{}');
      await db.$executeRaw`
        INSERT INTO di_v0_motion_core_shadow_runs_v1 (
          id, organization_id, vehicle_id, trip_id, work_item_id,
          shadow_intent_key, shadow_bundle_version, pinned_snapshot_hash, combined_input_identity,
          content_fingerprint, shadow_status, summary_json, payload_gzip, uncompressed_bytes
        ) VALUES (
          ${runId}, ${fx.tenant.organizationId}, ${fx.tenant.vehicleId}, ${fx.tenant.tripId}, ${fx.workItemId},
          ${v1Key}, ${DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1}, ${fx.snapshotHash}, ${combinedInputIdentity},
          'fp-test', 'SUCCEEDED', '{}'::jsonb, ${payloadGzip}, 2
        )`;

      const cp = controlPlaneV4Tiguan();
      const discovered = await outbox.discoverEligible(discoverInput(fx, 5, cp));
      expect(discovered).toBe(1);

      const v4Key = buildMotionCoreShadowIntentKey({
        pinnedSnapshotHash: fx.snapshotHash,
        combinedInputIdentity,
        bundleVersion: DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V4_C5_1_AND_FSM_GAP_BRIDGE,
      });
      expect(v1Key).not.toBe(v4Key);

      const [{ count }] = await db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM di_v0_motion_core_shadow_outbox_v1 WHERE work_item_id = ${fx.workItemId}`;
      expect(Number(count)).toBe(1);
    }, 120_000);

    it('does not enqueue when an identical intent already has a SUCCEEDED run', async () => {
      const fx = await seedP2CompletedPrimaryFixture(db);
      fixtures.push(fx);
      await setWorkItemCompletedAt(db, fx.workItemId, FIXTURE_TRIP_T0);
      const [{ combined_input_identity: combinedInputIdentity }] = await db.$queryRaw<
        Array<{ combined_input_identity: string }>
      >`SELECT combined_input_identity FROM di_v0_s4_work_items WHERE id = ${fx.workItemId}`;
      const intentKey = buildMotionCoreShadowIntentKey({
        pinnedSnapshotHash: fx.snapshotHash,
        combinedInputIdentity,
        bundleVersion: DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1,
      });
      const runId = randomUUID();
      const payloadGzip = gzipSync('{}');
      await db.$executeRaw`
        INSERT INTO di_v0_motion_core_shadow_runs_v1 (
          id, organization_id, vehicle_id, trip_id, work_item_id,
          shadow_intent_key, shadow_bundle_version, pinned_snapshot_hash, combined_input_identity,
          content_fingerprint, shadow_status, summary_json, payload_gzip, uncompressed_bytes
        ) VALUES (
          ${runId}, ${fx.tenant.organizationId}, ${fx.tenant.vehicleId}, ${fx.tenant.tripId}, ${fx.workItemId},
          ${intentKey}, ${DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1}, ${fx.snapshotHash}, ${combinedInputIdentity},
          'fp-test', 'SUCCEEDED', '{}'::jsonb, ${payloadGzip}, 2
        )`;
      const cp = controlPlaneV1Only();
      expect(await outbox.discoverEligible(discoverInput(fx, 5, cp))).toBe(0);
    }, 120_000);

    it('concurrent discovery calls remain idempotent for the same intent', async () => {
      const fx = await seedP2CompletedPrimaryFixture(db);
      fixtures.push(fx);
      await setWorkItemCompletedAt(db, fx.workItemId, FIXTURE_TRIP_T0);
      const cp = controlPlaneV1Only();
      const input = discoverInput(fx, 10, cp);
      const [a, b] = await Promise.all([
        outbox.discoverEligible(input),
        outbox.discoverEligible(input),
      ]);
      expect(a + b).toBeLessThanOrEqual(1);
      const [{ count }] = await db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM di_v0_motion_core_shadow_outbox_v1 WHERE work_item_id = ${fx.workItemId}`;
      expect(Number(count)).toBe(1);
    }, 120_000);
  },
);
