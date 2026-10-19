/**
 * EXP021 — LIVE_FSM mid-gap split parent admission (PostgreSQL).
 * Extends finalization-admission authority (533b2bf8 / PR #2046).
 */
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  assertS4aPostgresCiEnv,
  cleanupS4aTenant,
  newS4aClient,
  S4A_POSTGRES_LIVE,
  seedS4aTenant,
  setKillState,
  s4aConfigFor,
  type S4aTenant,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DiV0S4WorkItemRepository } from '../../s4a-foundation/di-v0-s4a-work-item.repository';
import { TripDiBoundaryAdmissionService } from '../../../trips/di-boundary-admission/trip-di-boundary-admission.service';
import { readTripDiBoundaryAdmissionV1 } from '../../../trips/di-boundary-admission/trip-di-boundary-admission';
import { DiV0S4DiscoveryService } from '../di-v0-s4b-discovery.service';
import { DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS } from '../di-v0-s4b-discovery-containment';
import { buildDiV0S4RuntimePipelineManifest } from '../di-v0-s4b-pipeline-manifest';

assertS4aPostgresCiEnv();

interface LiveFsmSplitFixture extends S4aTenant {
  parentTripId: string;
  childTripId: string;
}

(S4A_POSTGRES_LIVE ? describe : describe.skip)('EXP021 LIVE_FSM split parent admission (PostgreSQL)', () => {
  let admin: PrismaClient;
  let admission: TripDiBoundaryAdmissionService;
  const tenants: LiveFsmSplitFixture[] = [];

  beforeAll(async () => {
    admin = newS4aClient();
    admission = new TripDiBoundaryAdmissionService(admin as never);
    await setKillState(admin, 'NOT_KILLED').catch(() => undefined);
  });

  afterAll(async () => {
    for (const t of tenants.splice(0)) {
      await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${t.vehicleId}`;
      await cleanupS4aTenant(admin, t);
    }
    await admin.$disconnect();
  });

  async function seedLiveFsmSplitPair(detection: { state: 'RESTING' | 'ACTIVE_TRIP' }): Promise<LiveFsmSplitFixture> {
    const base = await seedS4aTenant(admin, 3 * 86_400);
    const parentTripId = base.tripId;
    const childTripId = randomUUID();
    const childStart = new Date(base.endTime.getTime() + 7 * 60_000);
    const childEnd = new Date(childStart.getTime() + 3 * 60_000);

    await admin.$executeRawUnsafe(
      `UPDATE vehicle_trips
       SET end_detection_mode = $1,
           raw_detection_meta = (COALESCE(raw_detection_meta, '{}'::jsonb) - 'diV0BoundaryAdmissionV1') || $2::jsonb
       WHERE id = $3`,
      'MID_TRIP_GAP_SPLIT',
      JSON.stringify({
        splitTriggeredBy: 'LIVE_FSM',
        splitReason: 'live_mid_trip_gap_split',
        splitGapMs: 420_000,
        splitFirstEndAt: base.endTime.toISOString(),
        splitSecondStartAt: childStart.toISOString(),
      }),
      parentTripId,
    );

    await admin.$executeRawUnsafe(
      `INSERT INTO vehicle_trips (id, vehicle_id, trip_status, start_time, end_time, dimo_segment_id, created_at,
         start_latitude, start_longitude, distance_km, max_speed_kmh, avg_speed_kmh, harsh_brake_count, driving_score,
         end_detection_mode)
       VALUES ($1, $2, 'COMPLETED', ($3::timestamptz AT TIME ZONE 'UTC'), ($4::timestamptz AT TIME ZONE 'UTC'), $5,
         ($4::timestamptz AT TIME ZONE 'UTC'), 52, 9, 3, 40, 30, 0, 90, $6)`,
      childTripId,
      base.vehicleId,
      childStart.toISOString(),
      childEnd.toISOString(),
      `seg-${randomUUID()}`,
      'COMPOSITE_INACTIVITY',
    );
    await admin.$executeRawUnsafe(
      `UPDATE vehicle_trips SET raw_detection_meta = $1::jsonb WHERE id = $2`,
      JSON.stringify({
        splitFrom: parentTripId,
        splitTriggeredBy: 'LIVE_FSM',
        splitReason: 'live_mid_trip_gap_split',
        splitGapMs: 420_000,
      }),
      childTripId,
    );

    const activeTripId = detection.state === 'ACTIVE_TRIP' ? childTripId : null;
    await admin.$executeRawUnsafe(
      `UPDATE vehicle_trip_detection_states
       SET state = $1::"TripDetectionState", active_trip_id = $2, updated_at = now()
       WHERE vehicle_id = $3`,
      detection.state,
      activeTripId,
      base.vehicleId,
    );

    await admin.$executeRawUnsafe(
      `UPDATE vehicles SET registry_lifecycle = 'ACTIVE'::"VehicleRegistryLifecycle" WHERE id = $1`,
      base.vehicleId,
    );

    const fixture: LiveFsmSplitFixture = { ...base, parentTripId, childTripId };
    tenants.push(fixture);
    return fixture;
  }

  function discoveryFor(t: LiveFsmSplitFixture) {
    const config = s4aConfigFor([t]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const repo = new DiV0S4WorkItemRepository(admin, config);
    const service = new DiV0S4DiscoveryService(
      admin,
      repo,
      config,
      pipeline,
      DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS,
    );
    return { service, config, pipeline, repo };
  }

  it('1 — unstable ACTIVE_TRIP on parent blocks settlement release', async () => {
    const f = await seedLiveFsmSplitPair({ state: 'ACTIVE_TRIP' });
    const result = await admission.releaseEligibleLiveFsmSplitSegmentsAfterVehicleSettlement(f.vehicleId);
    expect(result.released).toBe(0);
    const parentMeta = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
      SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${f.parentTripId}`;
    expect(readTripDiBoundaryAdmissionV1(parentMeta[0]?.raw_detection_meta)).toBeNull();
  });

  it('2 — RESTING stable vehicle releases parent and continuation admission', async () => {
    const f = await seedLiveFsmSplitPair({ state: 'RESTING' });
    const result = await admission.releaseEligibleLiveFsmSplitSegmentsAfterVehicleSettlement(f.vehicleId);
    expect(result.released).toBeGreaterThanOrEqual(1);
    const parentMeta = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
      SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${f.parentTripId}`;
    const parentAdmission = readTripDiBoundaryAdmissionV1(parentMeta[0]?.raw_detection_meta);
    expect(parentAdmission?.releasedBy).toBe('LIVE_FSM_SETTLEMENT');
    expect(parentAdmission?.revisionKey).toMatch(/^DI_V0_S4_BOUNDARY_FP_V1:/);
  });

  it('3 — child admitted separately; parent/child get distinct revision keys', async () => {
    const f = await seedLiveFsmSplitPair({ state: 'RESTING' });
    await admission.releaseEligibleLiveFsmSplitSegmentsAfterVehicleSettlement(f.vehicleId);
    const rows = await admin.$queryRaw<Array<{ id: string; raw_detection_meta: unknown }>>`
      SELECT id, raw_detection_meta FROM vehicle_trips
      WHERE id::text = ANY(ARRAY[${f.parentTripId}, ${f.childTripId}]::text[])`;
    const keys = rows.map((r) => readTripDiBoundaryAdmissionV1(r.raw_detection_meta)?.revisionKey);
    expect(keys.filter(Boolean)).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it('4 — concurrent settlement release is idempotent', async () => {
    const f = await seedLiveFsmSplitPair({ state: 'RESTING' });
    const [a, b] = await Promise.all([
      admission.releaseEligibleLiveFsmSplitSegmentsAfterVehicleSettlement(f.vehicleId),
      admission.releaseEligibleLiveFsmSplitSegmentsAfterVehicleSettlement(f.vehicleId),
    ]);
    expect(a.released + b.released).toBeGreaterThanOrEqual(1);
    const parentMeta = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
      SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${f.parentTripId}`;
    expect(readTripDiBoundaryAdmissionV1(parentMeta[0]?.raw_detection_meta)).not.toBeNull();
  });

  it('5 — proposed boundary repair blocks release (fail closed)', async () => {
    const f = await seedLiveFsmSplitPair({ state: 'RESTING' });
    await admin.$executeRawUnsafe(
      `INSERT INTO trip_repairs (id, vehicle_id, trip_id, repair_type, status, reason, confidence, window_from, window_to, created_at)
       VALUES ($1, $2, $3, 'MISSING_END', 'PROPOSED', 'exp021-test', 'HIGH', now(), now(), now())`,
      randomUUID(),
      f.vehicleId,
      f.parentTripId,
    );
    await admission.releaseEligibleLiveFsmSplitSegmentsAfterVehicleSettlement(f.vehicleId);
    const parentMeta = await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
      SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${f.parentTripId}`;
    expect(readTripDiBoundaryAdmissionV1(parentMeta[0]?.raw_detection_meta)).toBeNull();
    expect(await admission.tryReleaseForTripTransactional(f.parentTripId, 'LIVE_FSM_SETTLEMENT')).toBe(false);
  });

  it('6 — discovery creates at most one PRIMARY per admitted trip on repeated passes', async () => {
    const f = await seedLiveFsmSplitPair({ state: 'RESTING' });
    await admission.releaseEligibleLiveFsmSplitSegmentsAfterVehicleSettlement(f.vehicleId);
    const { service, config, pipeline, repo } = discoveryFor(f);
    const pass1 = await service.runDiscoveryPass({ limit: 50 });
    expect(pass1.created).toBeGreaterThanOrEqual(1);
    const pass2 = await service.runDiscoveryPass({ limit: 50 });
    expect(pass2).toMatchObject({ candidates: 0, created: 0, duplicates: 0 });
    const items = await admin.$queryRaw<Array<{ trip_id: string; status: string }>>`
      SELECT trip_id::text, status FROM di_v0_s4_work_items
      WHERE vehicle_id = ${f.vehicleId} AND run_purpose = 'PRIMARY' AND status <> 'SUPERSEDED'`;
    const byTrip = new Map<string, number>();
    for (const row of items) byTrip.set(row.trip_id, (byTrip.get(row.trip_id) ?? 0) + 1);
    for (const [, count] of byTrip) expect(count).toBe(1);
    expect(repo).toBeTruthy();
    expect(config.masterEnabled).toBe(true);
    expect(pipeline.pipelineVersionKey).toBeTruthy();
  });

  it('7 — reconciliation boundaryScannedTripIds release unchanged for normal trips', async () => {
    const t = await seedS4aTenant(admin);
    tenants.push({ ...t, parentTripId: t.tripId, childTripId: randomUUID() });
    const result = await admission.releaseForBoundaryScannedTripIds([t.tripId]);
    expect(result.released).toBe(1);
  });

  it('scoped recovery refuses vehicle mismatch and only releases the requested trip', async () => {
    const f = await seedLiveFsmSplitPair({ state: 'RESTING' });
    const wrong = await admission.evaluateLiveFsmSplitAdmissionEligibility(f.parentTripId, randomUUID());
    expect(wrong.eligible).toBe(false);
    expect(wrong).toMatchObject({ reason: 'VEHICLE_MISMATCH' });

    const scoped = await admission.tryReleaseLiveFsmSplitTripScoped(f.parentTripId, f.vehicleId);
    expect(scoped.ok).toBe(true);
    const childScoped = await admission.tryReleaseLiveFsmSplitTripScoped(f.childTripId, f.vehicleId);
    expect(childScoped.ok).toBe(true);
  });

  it('8 — boundary repair generation bump updates revision on next successful release', async () => {
    const f = await seedLiveFsmSplitPair({ state: 'RESTING' });
    await admission.releaseEligibleLiveFsmSplitSegmentsAfterVehicleSettlement(f.vehicleId);
    const before = readTripDiBoundaryAdmissionV1(
      (
        await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
          SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${f.parentTripId}`
      )[0]?.raw_detection_meta,
    )?.revisionKey;
    await admin.$executeRawUnsafe(
      `UPDATE vehicle_trips SET raw_detection_meta = COALESCE(raw_detection_meta, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
      JSON.stringify({
        boundaryRepair: {
          auditId: randomUUID(),
          providerSegmentId: f.dimoSegmentId,
          newStartTime: f.startTime.toISOString(),
          newEndTime: new Date(f.endTime.getTime() + 120_000).toISOString(),
        },
      }),
      f.parentTripId,
    );
    await admission.tryReleaseForTripTransactional(f.parentTripId, 'LIVE_FSM_SETTLEMENT');
    const after = readTripDiBoundaryAdmissionV1(
      (
        await admin.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
          SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${f.parentTripId}`
      )[0]?.raw_detection_meta,
    )?.revisionKey;
    expect(before).toBeTruthy();
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });
});
