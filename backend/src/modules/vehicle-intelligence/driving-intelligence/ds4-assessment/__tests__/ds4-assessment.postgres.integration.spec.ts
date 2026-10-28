import { randomUUID } from 'crypto';
import { gzipSync } from 'zlib';
import type { PrismaClient } from '@prisma/client';
import {
  S4A_POSTGRES_LIVE,
  seedS4aTenant,
  seedS4aTripDiBoundaryAdmission,
  seedS4aVerifiablePinnedEvidenceBundle,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DS4_ASSESSMENT_FLEET_VEHICLES_V1 } from '../ds4-assessment-fleet-admission.v1';
import { computeDs4DrivingImpactV2 } from '../ds4-driving-impact-v2.engine';
import { computeDs4TripAssessmentV1 } from '../ds4-trip-assessment-v1.engine';
import { Ds4TripAssessmentRepositoryV1 } from '../ds4-trip-assessment.repository.v1';
import { DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import { DiV0MotionCoreShadowRunRepository } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-run.repository';

const describePg =
  process.env.DI_V0_DS4_ASSESSMENT_POSTGRES_INTEGRATION === '1' && S4A_POSTGRES_LIVE ? describe : describe.skip;

describePg('ds4-assessment postgres integration', () => {
  let db: PrismaClient;
  let repo: Ds4TripAssessmentRepositoryV1;
  let motionRepo: DiV0MotionCoreShadowRunRepository;

  async function bindTenantToFleetVehicle(
    tenant: Awaited<ReturnType<typeof seedS4aTenant>>,
    fleet: (typeof DS4_ASSESSMENT_FLEET_VEHICLES_V1)[number],
  ) {
    const vinSuffix = fleet.vehicleId.replace(/-/g, '').slice(0, 13);
    const vin = `DS4${vinSuffix}`.padEnd(17, '0');
    await db.$executeRaw`
      INSERT INTO organizations (id, company_name, business_type, status, created_at, updated_at)
      VALUES (${fleet.organizationId}, 'DS4 Fleet Org', 'RENTAL', 'ACTIVE', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING`;
    await db.$executeRaw`
      INSERT INTO vehicles (id, organization_id, vin, license_plate, make, model, year, fuel_type, status, created_at, updated_at)
      VALUES (
        ${fleet.vehicleId}, ${fleet.organizationId}, ${vin}, ${`DS4-${fleet.role}`}, 'Test', 'DS4', 2024, 'GASOLINE', 'AVAILABLE', NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id`;
    await db.$executeRaw`UPDATE vehicle_trips SET vehicle_id = ${fleet.vehicleId} WHERE id = ${tenant.tripId}`;
    tenant.vehicleId = fleet.vehicleId;
    tenant.organizationId = fleet.organizationId;
    await seedS4aTripDiBoundaryAdmission(db, tenant);
    return tenant;
  }

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client');
    db = new PrismaClient();
    repo = new Ds4TripAssessmentRepositoryV1(db);
    motionRepo = new DiV0MotionCoreShadowRunRepository(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('persists assessment idempotently and preserves null impact score', async () => {
    const fleet = DS4_ASSESSMENT_FLEET_VEHICLES_V1[1]!;
    const tenant = await bindTenantToFleetVehicle(await seedS4aTenant(db), fleet);
    const bundle = await seedS4aVerifiablePinnedEvidenceBundle(db, tenant);
    const runId = randomUUID();
    const workItemId = randomUUID();
    const tripId = tenant.tripId;
    const payload = {
      contract: {
        algorithmVersions: {
          c4: 'c4',
          c5_1: null,
          c5_1ProductionSafety: null,
          c5_1AlgorithmFileSha256: null,
          fsm: 'fsm',
          gapBridgeV1: null,
          fsmAuxBinding: null,
          events: 'ev',
          bundle: 'b1',
        },
        speedAuthority: 'C4_ONLY',
        persistence: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2,
        timeSemantics: {
          processingMode: 'POST_TRIP_RETROSPECTIVE',
          c4ValueSupportForwardS: 1,
          c4FullFinalizationForwardS: 1,
          fsmMode: 'RETROSPECTIVE',
          eventFinalizationNote: 'test',
          computedAtUtc: '2026-01-01T00:00:00.000Z',
        },
        sparse: { channelOutcome: null, comparable: false, sampleCount: 0, samples: [], limitations: [] },
        comparisonHints: {
          artefactSuspectExcludedFromAcceptedManoeuvreCounts: true,
          inferredNeverPromotedToDirect: true,
          unknownNotCountedAsConfirmedStandstill: true,
        },
      },
      speeds: [],
      fsmLabels: [
        { bucketLabelUtc: '2026-01-01T10:00:00Z', state: 'MOVING', evidenceQuality: 'DIRECT', reason: 'r', flags: [] },
      ],
      stopEpisodes: [],
      events: [],
      summary: {
        labelCount: 1,
        speedNumericCount: 0,
        eventCount: 0,
        eventAcceptedCount: 0,
        eventArtefactSuspectCount: 0,
        stopEpisodeCount: 0,
        contentFingerprint: 'fp-test',
      },
    };
    const json = JSON.stringify(payload);
    const payloadGzip = gzipSync(json);
    await db.$executeRaw`DELETE FROM di_v0_ds4_trip_driving_impact_v2 WHERE trip_id = ${tripId}`;
    await db.$executeRaw`DELETE FROM di_v0_ds4_trip_assessment_v1 WHERE trip_id = ${tripId}`;
    await db.$executeRaw`DELETE FROM di_v0_motion_core_shadow_runs_v1 WHERE trip_id = ${tripId}`;

    await db.$executeRaw`
      INSERT INTO di_v0_motion_core_shadow_runs_v1 (
        id, organization_id, vehicle_id, trip_id, work_item_id, shadow_intent_key, shadow_bundle_version,
        pinned_snapshot_hash, combined_input_identity, content_fingerprint, shadow_status, summary_json, payload_gzip, uncompressed_bytes
      ) VALUES (
        ${runId}, ${fleet.organizationId}, ${fleet.vehicleId}, ${tripId}, ${workItemId}, 'test-intent', 'bundle-v1',
        ${bundle.snapshotHash}, ${bundle.combinedInputIdentity}, 'fp-test', 'SUCCEEDED',
        ${JSON.stringify({ contentFingerprint: 'fp-test', eventRowContract: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2.eventRowContract })}::jsonb,
        ${payloadGzip}, ${json.length}
      )`;

    const decoded = motionRepo.decodePayload(payloadGzip);
    const assessment = computeDs4TripAssessmentV1({
      scope: { organizationId: fleet.organizationId, vehicleId: fleet.vehicleId, tripId },
      motionRun: {
        id: runId,
        organizationId: fleet.organizationId,
        vehicleId: fleet.vehicleId,
        tripId,
        shadowStatus: 'SUCCEEDED',
        pinnedSnapshotHash: bundle.snapshotHash,
        combinedInputIdentity: bundle.combinedInputIdentity,
        contentFingerprint: 'fp-test',
        createdAt: new Date(),
        summaryContentFingerprint: 'fp-test',
      },
      payload: decoded,
    });
    const impact = computeDs4DrivingImpactV2({ assessment });
    const computedAt = new Date();

    const first = await repo.persistAssessmentAndImpact({
      scope: { organizationId: fleet.organizationId, vehicleId: fleet.vehicleId, tripId },
      assessment,
      impact,
      sourceMotionRunCreatedAt: new Date(),
      computedAt,
    });
    expect(first.outcome).toBe('inserted');

    const second = await repo.persistAssessmentAndImpact({
      scope: { organizationId: fleet.organizationId, vehicleId: fleet.vehicleId, tripId },
      assessment,
      impact,
      sourceMotionRunCreatedAt: new Date(),
      computedAt,
    });
    expect(second.outcome).toBe('idempotent_duplicate');

    const read = await repo.readLatestBundleForTrip({
      organizationId: fleet.organizationId,
      vehicleId: fleet.vehicleId,
      tripId,
    });
    expect(read?.assessment?.assessmentStatus).toBe('UNRATED_COUNTS_ONLY');
    expect(read?.impact?.operationalLoadIndex).toBeNull();
    expect(read?.impact?.scorePublicationStatus).toBe('DISABLED_MODEL_NOT_CALIBRATED');
  });

  it('persists nullable speed authority without C4_ONLY coercion', async () => {
    const fleet = DS4_ASSESSMENT_FLEET_VEHICLES_V1[2]!;
    const tenant = await bindTenantToFleetVehicle(await seedS4aTenant(db), fleet);
    const bundle = await seedS4aVerifiablePinnedEvidenceBundle(db, tenant);
    const runId = randomUUID();
    const tripId = tenant.tripId;
    const payload = {
      contract: {
        algorithmVersions: { c4: 'c4', c5_1: null, c5_1ProductionSafety: null, c5_1AlgorithmFileSha256: null, fsm: 'fsm', gapBridgeV1: null, fsmAuxBinding: null, events: 'ev', bundle: 'b1' },
        speedAuthority: null,
        persistence: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2,
        timeSemantics: { processingMode: 'POST_TRIP_RETROSPECTIVE', c4ValueSupportForwardS: 1, c4FullFinalizationForwardS: 1, fsmMode: 'RETROSPECTIVE', eventFinalizationNote: 'test', computedAtUtc: '2026-01-01T00:00:00.000Z' },
        sparse: { channelOutcome: null, comparable: false, sampleCount: 0, samples: [], limitations: [] },
        comparisonHints: { artefactSuspectExcludedFromAcceptedManoeuvreCounts: true, inferredNeverPromotedToDirect: true, unknownNotCountedAsConfirmedStandstill: true },
      },
      speeds: [],
      fsmLabels: [],
      stopEpisodes: [],
      events: [],
      summary: { labelCount: 0, speedNumericCount: 0, eventCount: 0, eventAcceptedCount: 0, eventArtefactSuspectCount: 0, stopEpisodeCount: 0, contentFingerprint: 'fp-null-auth' },
    };
    const json = JSON.stringify(payload);
    const payloadGzip = gzipSync(json);
    await db.$executeRaw`DELETE FROM di_v0_ds4_trip_driving_impact_v2 WHERE trip_id = ${tripId}`;
    await db.$executeRaw`DELETE FROM di_v0_ds4_trip_assessment_v1 WHERE trip_id = ${tripId}`;

    const assessment = computeDs4TripAssessmentV1({
      scope: { organizationId: fleet.organizationId, vehicleId: fleet.vehicleId, tripId },
      motionRun: {
        id: runId,
        organizationId: fleet.organizationId,
        vehicleId: fleet.vehicleId,
        tripId,
        shadowStatus: 'SUCCEEDED',
        pinnedSnapshotHash: bundle.snapshotHash,
        combinedInputIdentity: bundle.combinedInputIdentity,
        contentFingerprint: 'fp-null-auth',
        createdAt: new Date(),
        summaryContentFingerprint: 'fp-null-auth',
      },
      payload: payload as never,
    });
    expect(assessment.speedAuthority).toBeNull();
    const impact = computeDs4DrivingImpactV2({ assessment });
    const inserted = await repo.persistAssessmentAndImpact({
      scope: { organizationId: fleet.organizationId, vehicleId: fleet.vehicleId, tripId },
      assessment,
      impact,
      sourceMotionRunCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
      computedAt: new Date(),
    });
    expect(inserted.outcome).toBe('inserted');
    const row = await db.diV0Ds4TripAssessmentV1.findFirst({ where: { tripId } });
    expect(row?.speedAuthority).toBeNull();
    expect((row?.completenessJson as { speedAuthority?: string | null }).speedAuthority ?? null).toBeNull();
  });

  it('readLatestBundleForTrip prefers latest source_motion_run_created_at over later computed_at', async () => {
    const fleet = DS4_ASSESSMENT_FLEET_VEHICLES_V1[3]!;
    const tenant = await bindTenantToFleetVehicle(await seedS4aTenant(db), fleet);
    const tripId = tenant.tripId;
    await db.$executeRaw`DELETE FROM di_v0_ds4_trip_driving_impact_v2 WHERE trip_id = ${tripId}`;
    await db.$executeRaw`DELETE FROM di_v0_ds4_trip_assessment_v1 WHERE trip_id = ${tripId}`;

    const mkAssessment = (runId: string, fp: string) => {
      const assessment = computeDs4TripAssessmentV1({
        scope: { organizationId: fleet.organizationId, vehicleId: fleet.vehicleId, tripId },
        motionRun: {
          id: runId,
          organizationId: fleet.organizationId,
          vehicleId: fleet.vehicleId,
          tripId,
          shadowStatus: 'SUCCEEDED',
          pinnedSnapshotHash: 'pin',
          combinedInputIdentity: 'ident',
          contentFingerprint: fp,
          createdAt: new Date(),
          summaryContentFingerprint: fp,
        },
        payload: null,
      });
      return { assessment, impact: computeDs4DrivingImpactV2({ assessment }) };
    };

    const newerRun = mkAssessment(randomUUID(), 'fp-newer-source');
    await repo.persistAssessmentAndImpact({
      scope: { organizationId: fleet.organizationId, vehicleId: fleet.vehicleId, tripId },
      assessment: newerRun.assessment,
      impact: newerRun.impact,
      sourceMotionRunCreatedAt: new Date('2026-02-02T00:00:00.000Z'),
      computedAt: new Date('2026-02-02T01:00:00.000Z'),
    });

    const olderRun = mkAssessment(randomUUID(), 'fp-older-source');
    const lateCompute = await repo.persistAssessmentAndImpact({
      scope: { organizationId: fleet.organizationId, vehicleId: fleet.vehicleId, tripId },
      assessment: olderRun.assessment,
      impact: olderRun.impact,
      sourceMotionRunCreatedAt: new Date('2026-02-01T00:00:00.000Z'),
      computedAt: new Date('2026-03-01T00:00:00.000Z'),
    });
    expect(lateCompute.outcome).toBe('superseded_skipped');

    const read = await repo.readLatestBundleForTrip({
      organizationId: fleet.organizationId,
      vehicleId: fleet.vehicleId,
      tripId,
    });
    expect(read?.assessment?.sourceMotionRunCreatedAt.toISOString()).toBe('2026-02-02T00:00:00.000Z');
  });

  it('does not mutate legacy trip_driving_impact table shape', async () => {
    const rows = await db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'trip_driving_impact'`;
    expect(rows.length).toBe(1);
  });
});
