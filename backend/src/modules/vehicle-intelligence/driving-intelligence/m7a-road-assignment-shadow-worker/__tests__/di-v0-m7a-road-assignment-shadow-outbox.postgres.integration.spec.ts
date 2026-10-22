import { createHash, randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { S4A_POSTGRES_LIVE } from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1 } from '../di-v0-m7a-road-assignment-shadow.bundle.version';
import {
  buildM7aRoadAssignmentShadowDiscoveryIntentKey,
  frozenM7aAlgorithmFingerprint,
  resolveM7aRoadAssignmentShadowOsmDataVersion,
} from '../di-v0-m7a-road-assignment-shadow-intent';
import { DiV0M7aRoadAssignmentShadowOutboxRepository } from '../di-v0-m7a-road-assignment-shadow-outbox.repository';
import {
  cleanupP2Tenant,
  seedP2CompletedPrimaryFixture,
  type P2CompletedPrimaryFixture,
} from '../../trip-speed-quality/__tests__/di-v0-trip-speed-quality-postgres-harness';

const OSM_V = 'DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_OSM_DATA_V1';

async function cleanupM7aForTenant(db: PrismaClient, tripId: string): Promise<void> {
  await db.$executeRaw`DELETE FROM di_v0_m7a_road_assignment_shadow_runs_v1 WHERE trip_id = ${tripId}`;
  await db.$executeRaw`DELETE FROM di_v0_m7a_road_assignment_shadow_outbox_v1 WHERE trip_id = ${tripId}`;
}

async function seedExtraCompletedPrimaryOnVehicle(
  db: PrismaClient,
  base: P2CompletedPrimaryFixture,
  input: { tripId: string; workItemId: string; completedAt: Date },
): Promise<void> {
  await db.$executeRaw`
    INSERT INTO vehicle_trips (
      id, vehicle_id, trip_status, start_time, end_time, dimo_segment_id, created_at,
      start_latitude, start_longitude, distance_km, max_speed_kmh, avg_speed_kmh, harsh_brake_count, driving_score
    ) VALUES (
      ${input.tripId}, ${base.tenant.vehicleId}, 'COMPLETED',
      ${input.completedAt}, ${input.completedAt}, ${randomUUID()},
      ${input.completedAt}, 52.0, 9.0, 12.0, 77.0, 45.0, 2, 88
    )`;
  const shadowRunId = randomUUID();
  await db.$executeRaw`
    INSERT INTO di_v0_shadow_runs (
      id, organization_id, vehicle_id, trip_id, source_family, structural_version, estimator_version,
      calibration_version, source_family_policy_version, input_evidence_version, idempotency_key, status, updated_at
    ) SELECT
      ${shadowRunId}, organization_id, vehicle_id, ${input.tripId}, source_family, structural_version, estimator_version,
      calibration_version, source_family_policy_version, input_evidence_version, ${randomUUID()}, 'COMPLETED', now()
    FROM di_v0_shadow_runs WHERE id = ${base.shadowRunId}`;
  await db.$executeRaw`
    INSERT INTO di_v0_s4_work_items (
      id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
      boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status,
      shadow_run_id, pinned_snapshot_hash, pinned_at, pinned_epoch, combined_input_identity, execution_identity,
      completed_at, next_attempt_at, settlement_anchor_at, eligible_at
    ) SELECT
      ${input.workItemId}, organization_id, vehicle_id, ${input.tripId}, source_family, run_purpose, purpose_discriminator,
      boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, 'COMPLETED',
      ${shadowRunId}, pinned_snapshot_hash, pinned_at, pinned_epoch, combined_input_identity, execution_identity,
      ${input.completedAt}, NULL, settlement_anchor_at, eligible_at
    FROM di_v0_s4_work_items WHERE id = ${base.workItemId}`;
}

(S4A_POSTGRES_LIVE ? describe : describe.skip)('M7A road-assignment shadow outbox discovery (postgres)', () => {
  let db: PrismaClient;
  let outbox: DiV0M7aRoadAssignmentShadowOutboxRepository;
  const fixtures: P2CompletedPrimaryFixture[] = [];
  const extraTripIds: string[] = [];

  const discoverInput = (scope: P2CompletedPrimaryFixture, limit: number, now = new Date()) => ({
    enabledSince: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    organizationAllowlist: [scope.tenant.organizationId],
    vehicleAllowlist: [scope.tenant.vehicleId],
    osmDataVersion: OSM_V,
    limit,
    now,
  });

  beforeAll(async () => {
    const { PrismaClient: Client } = await import('@prisma/client');
    db = new Client();
    await db.$connect();
    outbox = new DiV0M7aRoadAssignmentShadowOutboxRepository(db);
  });

  afterEach(async () => {
    while (extraTripIds.length > 0) {
      const tripId = extraTripIds.pop();
      if (!tripId) break;
      await cleanupM7aForTenant(db, tripId);
      await db.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE trip_id = ${tripId}`;
      await db.$executeRaw`DELETE FROM di_v0_shadow_runs WHERE trip_id = ${tripId}`;
      await db.$executeRaw`DELETE FROM vehicle_trips WHERE id = ${tripId}`;
    }
    while (fixtures.length > 0) {
      const fx = fixtures.pop();
      if (!fx) break;
      await cleanupM7aForTenant(db, fx.tenant.tripId);
      await cleanupP2Tenant(db, fx.tenant);
    }
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('SQL discovery intent digest matches TypeScript intent key builder', async () => {
    const pinned = `DI_V0_S4_SNAPSHOT:sha256:${'a'.repeat(64)}`;
    const combined = 'ci-m7a-discovery';
    const bundleVersion = DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1;
    const algorithmFingerprint = frozenM7aAlgorithmFingerprint();
    const tsKey = buildM7aRoadAssignmentShadowDiscoveryIntentKey({
      pinnedSnapshotHash: pinned,
      combinedInputIdentity: combined,
      osmDataVersion: OSM_V,
    });
    const [{ sql_key }] = await db.$queryRaw<Array<{ sql_key: string }>>`
      SELECT (
        'DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_INTENT_V1:sha256:' || encode(
          digest(
            json_build_object(
              'b', ${bundleVersion},
              'a', ${algorithmFingerprint},
              'c', ${combined},
              'o', ${OSM_V},
              'p', ${pinned}
            )::text,
            'sha256'
          ),
          'hex'
        )
      ) AS sql_key`;
    expect(sql_key).toBe(tsKey);
  });

  it('discovers trips beyond the first discovery window when earlier rows already have outbox entries', async () => {
    const base = await seedP2CompletedPrimaryFixture(db);
    fixtures.push(base);
    const workItems: Array<{ workItemId: string; tripId: string; completedAt: Date }> = [
      {
        workItemId: base.workItemId,
        tripId: base.tenant.tripId,
        completedAt: new Date('2026-10-01T00:00:00.000Z'),
      },
    ];
    for (let i = 1; i < 55; i += 1) {
      const tripId = randomUUID();
      const workItemId = randomUUID();
      const completedAt = new Date(Date.parse('2026-10-01T00:00:00.000Z') + i * 60_000);
      await seedExtraCompletedPrimaryOnVehicle(db, base, { tripId, workItemId, completedAt });
      extraTripIds.push(tripId);
      workItems.push({ workItemId, tripId, completedAt });
      await cleanupM7aForTenant(db, tripId);
    }
    workItems.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
    const [{ combined_input_identity: combinedInputIdentity }] = await db.$queryRaw<
      Array<{ combined_input_identity: string }>
    >`SELECT combined_input_identity FROM di_v0_s4_work_items WHERE id = ${base.workItemId}`;

    const now = new Date();
    for (const row of workItems.slice(0, 50)) {
      const intentKey = buildM7aRoadAssignmentShadowDiscoveryIntentKey({
        pinnedSnapshotHash: base.snapshotHash,
        combinedInputIdentity,
        osmDataVersion: OSM_V,
      });
      await db.$executeRaw`
        INSERT INTO di_v0_m7a_road_assignment_shadow_outbox_v1 (
          work_item_id, shadow_intent_key, organization_id, trip_id, vehicle_id,
          shadow_bundle_version, status, next_attempt_at
        ) VALUES (
          ${row.workItemId}, ${intentKey}, ${base.tenant.organizationId}, ${row.tripId}, ${base.tenant.vehicleId},
          ${DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1}, 'SUCCEEDED', ${now}
        )`;
    }

    const discovered = await outbox.discoverEligible(discoverInput(base, 50, now));
    expect(discovered).toBe(5);

    const [{ count }] = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM di_v0_m7a_road_assignment_shadow_outbox_v1
      WHERE organization_id = ${base.tenant.organizationId}
        AND vehicle_id = ${base.tenant.vehicleId}
        AND status = 'PENDING'`;
    expect(Number(count)).toBe(5);
  }, 180_000);

  it('repeated discovery does not create duplicate outbox rows', async () => {
    const fx = await seedP2CompletedPrimaryFixture(db);
    fixtures.push(fx);
    const now = new Date();
    const first = await outbox.discoverEligible(discoverInput(fx, 10, now));
    expect(first).toBe(1);
    const second = await outbox.discoverEligible(discoverInput(fx, 10, now));
    expect(second).toBe(0);
    const [{ count }] = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM di_v0_m7a_road_assignment_shadow_outbox_v1 WHERE work_item_id = ${fx.workItemId}`;
    expect(Number(count)).toBe(1);
  }, 120_000);

  it('FAILED_RETRYABLE outbox rows remain claimable and block rediscovery for same intent', async () => {
    const fx = await seedP2CompletedPrimaryFixture(db);
    fixtures.push(fx);
    const now = new Date();
    const [{ combined_input_identity: combinedInputIdentity }] = await db.$queryRaw<
      Array<{ combined_input_identity: string }>
    >`SELECT combined_input_identity FROM di_v0_s4_work_items WHERE id = ${fx.workItemId}`;
    const intentKey = buildM7aRoadAssignmentShadowDiscoveryIntentKey({
      pinnedSnapshotHash: fx.snapshotHash,
      combinedInputIdentity,
      osmDataVersion: OSM_V,
    });
    await db.$executeRaw`
      INSERT INTO di_v0_m7a_road_assignment_shadow_outbox_v1 (
        work_item_id, shadow_intent_key, organization_id, trip_id, vehicle_id,
        shadow_bundle_version, status, next_attempt_at, last_error_code
      ) VALUES (
        ${fx.workItemId}, ${intentKey}, ${fx.tenant.organizationId}, ${fx.tenant.tripId}, ${fx.tenant.vehicleId},
        ${DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1}, 'FAILED_RETRYABLE', ${now}, 'TEST'
      )`;
    expect(await outbox.discoverEligible(discoverInput(fx, 10, now))).toBe(0);
    const claimed = await outbox.claimBatch(1, now);
    expect(claimed.length).toBe(1);
    expect(claimed[0]?.workItemId).toBe(fx.workItemId);
  }, 120_000);

  it('new OSM data version yields a distinct discovery intent for the same work item', async () => {
    const fx = await seedP2CompletedPrimaryFixture(db);
    fixtures.push(fx);
    const now = new Date();
    const osmV2 = 'DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_OSM_DATA_V2_TEST';
    expect(await outbox.discoverEligible(discoverInput(fx, 5, now))).toBe(1);
    const discoveredV2 = await outbox.discoverEligible({
      ...discoverInput(fx, 5, now),
      osmDataVersion: osmV2,
    });
    expect(discoveredV2).toBe(1);
    const [{ count }] = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM di_v0_m7a_road_assignment_shadow_outbox_v1 WHERE work_item_id = ${fx.workItemId}`;
    expect(Number(count)).toBe(2);
    const [{ combined_input_identity: combinedInputIdentity }] = await db.$queryRaw<
      Array<{ combined_input_identity: string }>
    >`SELECT combined_input_identity FROM di_v0_s4_work_items WHERE id = ${fx.workItemId}`;
    const keyV1 = buildM7aRoadAssignmentShadowDiscoveryIntentKey({
      pinnedSnapshotHash: fx.snapshotHash,
      combinedInputIdentity,
      osmDataVersion: resolveM7aRoadAssignmentShadowOsmDataVersion({}),
    });
    const keyV2 = buildM7aRoadAssignmentShadowDiscoveryIntentKey({
      pinnedSnapshotHash: fx.snapshotHash,
      combinedInputIdentity,
      osmDataVersion: osmV2,
    });
    expect(keyV1).not.toBe(keyV2);
    expect(createHash('sha256').update(keyV1).digest('hex')).not.toBe(createHash('sha256').update(keyV2).digest('hex'));
  }, 120_000);
});
