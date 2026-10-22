import { createHash, randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  S4A_POSTGRES_LIVE,
  seedS4aTripDiBoundaryAdmission,
  seedS4aVerifiablePinnedEvidenceBundle,
  type S4aTenant,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { CALIBRATION_UNSET_V0_BUNDLE, DEFAULT_DI_V0_VERSION_TUPLE } from '../../core';
import { DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1 } from '../di-v0-m7a-road-assignment-shadow.bundle.version';
import {
  buildM7aRoadAssignmentShadowDiscoveryIntentKey,
  frozenM7aAlgorithmFingerprint,
  m7aDiscoveryIntentDigestPayloadSqlFragment,
  m7aDiscoveryIntentKeyPrefixFromDigestSql,
  m7aRoadAssignmentShadowDiscoveryIntentDigestPayload,
  resolveM7aRoadAssignmentShadowOsmDataVersion,
} from '../di-v0-m7a-road-assignment-shadow-intent';
import { DiV0M7aRoadAssignmentShadowOutboxRepository } from '../di-v0-m7a-road-assignment-shadow-outbox.repository';
import {
  cleanupP2Tenant,
  seedP2CompletedPrimaryFixture,
  type P2CompletedPrimaryFixture,
} from '../../trip-speed-quality/__tests__/di-v0-trip-speed-quality-postgres-harness';

const OSM_V = 'DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_OSM_DATA_V1';
const FIXTURE_ENABLED_SINCE = new Date('2026-09-01T00:00:00.000Z');
const FIXTURE_TRIP_T0 = new Date('2026-10-01T00:00:00.000Z');
const FIXTURE_PASS_NOW = new Date('2026-10-02T12:00:00.000Z');

async function sqlDiscoveryIntentKeyFromLiterals(
  db: PrismaClient,
  input: {
    bundleVersion: string;
    algorithmFingerprint: string;
    osmDataVersion: string;
    combinedInputIdentity: string;
    pinnedSnapshotHash: string;
  },
): Promise<string> {
  const digestPayloadSql = m7aDiscoveryIntentDigestPayloadSqlFragment({
    bundleVersionParam: '$1',
    algorithmFingerprintParam: '$2',
    osmDataVersionParam: '$3',
    combinedInputIdentitySql: '$4',
    pinnedSnapshotHashSql: '$5',
  });
  const keySql = m7aDiscoveryIntentKeyPrefixFromDigestSql(digestPayloadSql);
  const rows = await db.$queryRawUnsafe<Array<{ key: string }>>(
    `SELECT (${keySql}) AS key`,
    input.bundleVersion,
    input.algorithmFingerprint,
    input.osmDataVersion,
    input.combinedInputIdentity,
    input.pinnedSnapshotHash,
  );
  return rows[0]?.key ?? '';
}

async function cleanupM7aForTenant(db: PrismaClient, tripId: string): Promise<void> {
  await db.$executeRaw`DELETE FROM di_v0_m7a_road_assignment_shadow_runs_v1 WHERE trip_id = ${tripId}`;
  await db.$executeRaw`DELETE FROM di_v0_m7a_road_assignment_shadow_outbox_v1 WHERE trip_id = ${tripId}`;
}

async function setWorkItemCompletedAt(db: PrismaClient, workItemId: string, completedAt: Date): Promise<void> {
  await db.$executeRaw`
    UPDATE di_v0_s4_work_items SET completed_at = ${completedAt} WHERE id = ${workItemId}`;
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
      ${v.sourceFamilyPolicyVersion}, 'p2-iev-extra', ${randomUUID()}, 'COMPLETED', now()
    )`;
  for (const interval of evidence.shadowIntervals) {
    await db.$executeRaw`
      INSERT INTO di_v0_shadow_intervals (
        id, shadow_run_id, organization_id, vehicle_id, trip_id, interval_start, interval_end, reference_time,
        motion_state, position_state, causal_position_state, temporal_confidence, value_confidence, source_relation,
        claim_level, derivation_method, derivation_version, structural_version, estimator_version, calibration_version,
        source_family_policy_version, provenance, estimated_speed_kmh, speed_evidence_state
      ) VALUES (
        ${randomUUID()}, ${shadowRunId}, ${tenant.organizationId}, ${tenant.vehicleId}, ${tenant.tripId},
        ${interval.intervalStart}, ${interval.intervalEnd}, ${interval.referenceTime},
        ${interval.motionState}, ${interval.positionState}, ${interval.causalPositionState},
        ${interval.temporalConfidence}, ${interval.valueConfidence}, ${interval.sourceRelation},
        ${interval.claimLevel}, ${interval.derivationMethod}, ${interval.derivationVersion},
        ${v.structuralVersion}, ${v.estimatorVersion}, ${CALIBRATION_UNSET_V0_BUNDLE.calibrationVersion},
        ${v.sourceFamilyPolicyVersion}, ${JSON.stringify(interval.provenance)}::jsonb,
        ${interval.estimatedSpeedKmh}, ${interval.speedEvidenceState}
      )`;
  }
  const executionIdentity = `DI_V0_S4_EXECUTION_IDENTITY_V1:sha256:${'f'.repeat(64)}`;
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

(S4A_POSTGRES_LIVE ? describe : describe.skip)('M7A road-assignment shadow outbox discovery (postgres)', () => {
  let db: PrismaClient;
  let outbox: DiV0M7aRoadAssignmentShadowOutboxRepository;
  const fixtures: P2CompletedPrimaryFixture[] = [];
  const extraTripIds: string[] = [];

  const discoverInput = (scope: P2CompletedPrimaryFixture, limit: number, now = FIXTURE_PASS_NOW) => ({
    enabledSince: FIXTURE_ENABLED_SINCE,
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
      await db.$executeRaw`DELETE FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${tripId}`;
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

  it('SQL discovery intent digest matches TypeScript (concat/to_json parity cases)', async () => {
    const bundleVersion = DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1;
    const algorithmFingerprint = frozenM7aAlgorithmFingerprint();
    const cases = [
      {
        pinned: `DI_V0_S4_SNAPSHOT:sha256:${'a'.repeat(64)}`,
        combined: 'ci-m7a-discovery',
      },
      {
        pinned: `DI_V0_S4_SNAPSHOT:sha256:${'b'.repeat(64)}`,
        combined: 'quotes"and\\backslash',
      },
      {
        pinned: 'snap/with/slashes',
        combined: 'unicode-äöü-ß',
      },
      {
        pinned: 'p',
        combined: '',
      },
    ];
    for (const c of cases) {
      const tsPayload = m7aRoadAssignmentShadowDiscoveryIntentDigestPayload({
        pinnedSnapshotHash: c.pinned,
        combinedInputIdentity: c.combined,
        osmDataVersion: OSM_V,
        bundleVersion,
        algorithmFingerprint,
      });
      const tsKey = buildM7aRoadAssignmentShadowDiscoveryIntentKey({
        pinnedSnapshotHash: c.pinned,
        combinedInputIdentity: c.combined,
        osmDataVersion: OSM_V,
      });
      const sqlKey = await sqlDiscoveryIntentKeyFromLiterals(db, {
        bundleVersion,
        algorithmFingerprint,
        osmDataVersion: OSM_V,
        combinedInputIdentity: c.combined,
        pinnedSnapshotHash: c.pinned,
      });
      const [{ sql_payload }] = await db.$queryRawUnsafe<Array<{ sql_payload: string }>>(
        `SELECT (${m7aDiscoveryIntentDigestPayloadSqlFragment({
          bundleVersionParam: '$1',
          algorithmFingerprintParam: '$2',
          osmDataVersionParam: '$3',
          combinedInputIdentitySql: '$4',
          pinnedSnapshotHashSql: '$5',
        })}) AS sql_payload`,
        bundleVersion,
        algorithmFingerprint,
        OSM_V,
        c.combined,
        c.pinned,
      );
      expect(sql_payload).toBe(tsPayload);
      expect(sqlKey).toBe(tsKey);
    }
  });

  it('discovers trips beyond the first discovery window when earlier rows already have outbox entries', async () => {
    const base = await seedP2CompletedPrimaryFixture(db);
    fixtures.push(base);
    await setWorkItemCompletedAt(db, base.workItemId, FIXTURE_TRIP_T0);
    const workItems: Array<{ workItemId: string; tripId: string; completedAt: Date }> = [
      {
        workItemId: base.workItemId,
        tripId: base.tenant.tripId,
        completedAt: FIXTURE_TRIP_T0,
      },
    ];
    for (let i = 1; i < 55; i += 1) {
      const tripId = randomUUID();
      const workItemId = randomUUID();
      const completedAt = new Date(FIXTURE_TRIP_T0.getTime() + i * 60_000);
      await seedExtraCompletedPrimaryOnVehicle(db, base, { tripId, workItemId, completedAt });
      extraTripIds.push(tripId);
      workItems.push({ workItemId, tripId, completedAt });
      await cleanupM7aForTenant(db, tripId);
    }
    workItems.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

    for (const row of workItems.slice(0, 50)) {
      const [{ pinned_snapshot_hash: pinnedSnapshotHash, combined_input_identity: combinedInputIdentity }] =
        await db.$queryRaw<
          Array<{ pinned_snapshot_hash: string; combined_input_identity: string }>
        >`SELECT pinned_snapshot_hash, combined_input_identity FROM di_v0_s4_work_items WHERE id = ${row.workItemId}`;
      const intentKey = buildM7aRoadAssignmentShadowDiscoveryIntentKey({
        pinnedSnapshotHash,
        combinedInputIdentity,
        osmDataVersion: OSM_V,
      });
      await db.$executeRaw`
        INSERT INTO di_v0_m7a_road_assignment_shadow_outbox_v1 (
          work_item_id, shadow_intent_key, organization_id, trip_id, vehicle_id,
          shadow_bundle_version, status, next_attempt_at
        ) VALUES (
          ${row.workItemId}, ${intentKey}, ${base.tenant.organizationId}, ${row.tripId}, ${base.tenant.vehicleId},
          ${DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1}, 'SUCCEEDED', ${FIXTURE_PASS_NOW}
        )`;
    }

    const discovered = await outbox.discoverEligible(discoverInput(base, 50));
    expect(discovered).toBe(5);
    const rediscover = await outbox.discoverEligible(discoverInput(base, 50));
    expect(rediscover).toBe(0);

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
    await setWorkItemCompletedAt(db, fx.workItemId, FIXTURE_TRIP_T0);
    const first = await outbox.discoverEligible(discoverInput(fx, 10));
    expect(first).toBe(1);
    const second = await outbox.discoverEligible(discoverInput(fx, 10));
    expect(second).toBe(0);
    const [{ count }] = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM di_v0_m7a_road_assignment_shadow_outbox_v1 WHERE work_item_id = ${fx.workItemId}`;
    expect(Number(count)).toBe(1);
  }, 120_000);

  it('FAILED_RETRYABLE outbox rows remain claimable and block rediscovery for same intent', async () => {
    const fx = await seedP2CompletedPrimaryFixture(db);
    fixtures.push(fx);
    await setWorkItemCompletedAt(db, fx.workItemId, FIXTURE_TRIP_T0);
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
        ${DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1}, 'FAILED_RETRYABLE', ${FIXTURE_PASS_NOW}, 'TEST'
      )`;
    expect(await outbox.discoverEligible(discoverInput(fx, 10))).toBe(0);
    const claimed = await outbox.claimBatch(1, FIXTURE_PASS_NOW);
    expect(claimed.length).toBe(1);
    expect(claimed[0]?.workItemId).toBe(fx.workItemId);
  }, 120_000);

  it('new OSM data version yields a distinct discovery intent for the same work item', async () => {
    const fx = await seedP2CompletedPrimaryFixture(db);
    fixtures.push(fx);
    await setWorkItemCompletedAt(db, fx.workItemId, FIXTURE_TRIP_T0);
    const osmV2 = 'DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_OSM_DATA_V2_TEST';
    expect(await outbox.discoverEligible(discoverInput(fx, 5))).toBe(1);
    const discoveredV2 = await outbox.discoverEligible({
      ...discoverInput(fx, 5),
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
