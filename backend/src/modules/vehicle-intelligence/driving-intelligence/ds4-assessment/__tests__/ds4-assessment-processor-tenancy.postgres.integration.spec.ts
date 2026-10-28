import { randomUUID } from 'crypto';
import { gzipSync } from 'zlib';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripDiBoundaryAdmissionService } from '../../../trips/di-boundary-admission/trip-di-boundary-admission.service';
import { DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import { Ds4AssessmentProcessorServiceV1 } from '../ds4-assessment-processor.service.v1';
import {
  ds4PinnedEvidenceStub,
  DS4_POSTGRES_LIVE,
  seedDs4PostgresTenant,
} from './ds4-assessment-postgres-harness';

const describePg =
  process.env.DI_V0_DS4_ASSESSMENT_POSTGRES_INTEGRATION === '1' && DS4_POSTGRES_LIVE ? describe : describe.skip;

describePg('ds4-assessment processor tenancy + boundary postgres integration', () => {
  let db: PrismaClient;
  let processor: Ds4AssessmentProcessorServiceV1;

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client');
    db = new PrismaClient();
    processor = new Ds4AssessmentProcessorServiceV1(
      db as unknown as PrismaService,
      new TripDiBoundaryAdmissionService(db as unknown as PrismaService),
    );
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  function buildPayload(contentFingerprint: string) {
    return {
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
        {
          bucketLabelUtc: '2026-01-01T10:00:00Z',
          state: 'MOVING',
          evidenceQuality: 'DIRECT',
          reason: 'r',
          flags: [],
        },
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
        contentFingerprint,
      },
    };
  }

  async function insertMotionRun(input: {
    runId: string;
    organizationId: string;
    vehicleId: string;
    tripId: string;
    contentFingerprint: string;
  }) {
    const payload = buildPayload(input.contentFingerprint);
    const json = JSON.stringify(payload);
    const payloadGzip = gzipSync(json);
    await db.$executeRaw`
      INSERT INTO di_v0_motion_core_shadow_runs_v1 (
        id, organization_id, vehicle_id, trip_id, work_item_id, shadow_intent_key, shadow_bundle_version,
        pinned_snapshot_hash, combined_input_identity, content_fingerprint, shadow_status, summary_json, payload_gzip, uncompressed_bytes, created_at
      ) VALUES (
        ${input.runId}, ${input.organizationId}, ${input.vehicleId}, ${input.tripId}, ${randomUUID()}, 'test-intent', 'bundle-v1',
        ${`pin-${input.contentFingerprint}`}, ${`ident-${input.contentFingerprint}`}, ${input.contentFingerprint}, 'SUCCEEDED',
        ${JSON.stringify({
          contentFingerprint: input.contentFingerprint,
          eventRowContract: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2.eventRowContract,
        })}::jsonb,
        ${payloadGzip}, ${json.length}, NOW()
      )`;
  }

  it('processMotionRun succeeds for valid same-tenant scope with boundary admission', async () => {
    const tenant = await seedDs4PostgresTenant(db);
    const runId = randomUUID();
    const fp = 'tenancy-ok';
    await db.$executeRaw`DELETE FROM di_v0_ds4_trip_assessment_v1 WHERE trip_id = ${tenant.tripId}`;
    await insertMotionRun({
      runId,
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: tenant.tripId,
      contentFingerprint: fp,
    });

    const result = await processor.processMotionRun({
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: tenant.tripId,
      sourceMotionRunId: runId,
    });
    expect(result.status).toBe('ok');
  });

  it('rejects cross-tenant organization scope before persistence', async () => {
    const tenant = await seedDs4PostgresTenant(db);
    const runId = randomUUID();
    await insertMotionRun({
      runId,
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: tenant.tripId,
      contentFingerprint: 'cross-org',
    });
    const result = await processor.processMotionRun({
      organizationId: randomUUID(),
      vehicleId: tenant.vehicleId,
      tripId: tenant.tripId,
      sourceMotionRunId: runId,
    });
    expect(result.status).toBe('error');
    expect(result.code).toBe('SCOPE_MISMATCH');
  });

  it('rejects database vehicle organization tenancy mismatch', async () => {
    const tenant = await seedDs4PostgresTenant(db);
    const otherOrg = randomUUID();
    await db.$executeRawUnsafe(
      `INSERT INTO organizations (id, company_name, business_type, status, created_at, updated_at)
       VALUES ($1, 'Other', 'RENTAL', 'ACTIVE', NOW(), NOW())`,
      otherOrg,
    );
    await db.$executeRaw`UPDATE vehicles SET organization_id = ${otherOrg} WHERE id = ${tenant.vehicleId}`;
    const runId = randomUUID();
    await insertMotionRun({
      runId,
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: tenant.tripId,
      contentFingerprint: 'veh-org-mismatch',
    });
    const result = await processor.processMotionRun({
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: tenant.tripId,
      sourceMotionRunId: runId,
    });
    expect(result.status).toBe('error');
    expect(result.code).toBe('ORGANIZATION_TENANCY_MISMATCH');
  });

  it('rejects trip/vehicle mismatch in scope against motion run', async () => {
    const tenant = await seedDs4PostgresTenant(db);
    const other = await seedDs4PostgresTenant(db);
    const runId = randomUUID();
    await insertMotionRun({
      runId,
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: tenant.tripId,
      contentFingerprint: 'trip-veh-mismatch',
    });
    const result = await processor.processMotionRun({
      organizationId: tenant.organizationId,
      vehicleId: other.vehicleId,
      tripId: tenant.tripId,
      sourceMotionRunId: runId,
    });
    expect(result.status).toBe('error');
    expect(result.code).toBe('SCOPE_MISMATCH');
  });

  it('rejects trip/vehicle mismatch in database trip row', async () => {
    const tenant = await seedDs4PostgresTenant(db);
    const other = await seedDs4PostgresTenant(db);
    await db.$executeRaw`UPDATE vehicle_trips SET vehicle_id = ${other.vehicleId} WHERE id = ${tenant.tripId}`;
    const runId = randomUUID();
    await insertMotionRun({
      runId,
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: tenant.tripId,
      contentFingerprint: 'db-trip-veh',
    });
    const result = await processor.processMotionRun({
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: tenant.tripId,
      sourceMotionRunId: runId,
    });
    expect(result.status).toBe('error');
    expect(result.code).toBe('TRIP_VEHICLE_MISMATCH');
  });

  it('rejects missing vehicle', async () => {
    const tenant = await seedDs4PostgresTenant(db);
    const runId = randomUUID();
    const ghostVehicle = randomUUID();
    await insertMotionRun({
      runId,
      organizationId: tenant.organizationId,
      vehicleId: ghostVehicle,
      tripId: tenant.tripId,
      contentFingerprint: 'missing-veh',
    });
    const result = await processor.processMotionRun({
      organizationId: tenant.organizationId,
      vehicleId: ghostVehicle,
      tripId: tenant.tripId,
      sourceMotionRunId: runId,
    });
    expect(result.status).toBe('error');
    expect(result.code).toBe('VEHICLE_NOT_FOUND');
  });

  it('rejects missing trip', async () => {
    const tenant = await seedDs4PostgresTenant(db);
    const runId = randomUUID();
    const ghostTrip = randomUUID();
    await insertMotionRun({
      runId,
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: ghostTrip,
      contentFingerprint: 'missing-trip',
    });
    const result = await processor.processMotionRun({
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: ghostTrip,
      sourceMotionRunId: runId,
    });
    expect(result.status).toBe('error');
    expect(result.code).toBe('TRIP_NOT_FOUND');
  });

  it('rejects stale source linkage (scope trip differs from motion run)', async () => {
    const tenant = await seedDs4PostgresTenant(db);
    const otherTrip = randomUUID();
    const runId = randomUUID();
    await insertMotionRun({
      runId,
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: tenant.tripId,
      contentFingerprint: 'stale-link',
    });
    const result = await processor.processMotionRun({
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: otherTrip,
      sourceMotionRunId: runId,
    });
    expect(result.status).toBe('error');
    expect(result.code).toBe('SCOPE_MISMATCH');
  });

  it('rejects missing boundary admission record', async () => {
    const tenant = await seedDs4PostgresTenant(db);
    await db.$executeRaw`UPDATE vehicle_trips SET raw_detection_meta = '{}'::jsonb WHERE id = ${tenant.tripId}`;
    const runId = randomUUID();
    await insertMotionRun({
      runId,
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: tenant.tripId,
      contentFingerprint: 'no-admission',
    });
    const result = await processor.processMotionRun({
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: tenant.tripId,
      sourceMotionRunId: runId,
    });
    expect(result.status).toBe('error');
    expect(result.code).toBe('BOUNDARY_ADMISSION_BLOCKED');
  });
});
