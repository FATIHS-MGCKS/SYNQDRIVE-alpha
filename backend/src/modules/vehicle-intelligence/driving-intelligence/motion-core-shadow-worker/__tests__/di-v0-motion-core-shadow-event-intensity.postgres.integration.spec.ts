import { gzipSync } from 'zlib';
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { S4A_POSTGRES_LIVE } from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import {
  cleanupP2Tenant,
  seedP2CompletedPrimaryFixture,
  type P2CompletedPrimaryFixture,
} from '../../trip-speed-quality/__tests__/di-v0-trip-speed-quality-postgres-harness';
import { DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1 } from '../di-v0-motion-core-shadow.bundle.version';
import {
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY,
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
  readPersistedMotionEventIntensity,
  resolveMotionCoreShadowEventRowContract,
} from '../di-v0-motion-core-shadow-event-row.contract';
import { buildMotionCoreShadowIntentKey } from '../di-v0-motion-core-shadow-intent';
import { processDiV0MotionCoreShadowFromEvidenceAdaptation } from '../di-v0-motion-core-shadow-processor';
import { DiV0MotionCoreShadowRunRepository } from '../di-v0-motion-core-shadow-run.repository';
import { buildMotionTripMapSamples, mapMotionTripMapEvents } from '../di-v0-motion-core-shadow-trip-map-read.mapper';
import type { DiV0MotionCoreShadowPayloadV1 } from '../di-v0-motion-core-shadow.types';
import { syntheticDriveEvidence } from './di-v0-motion-core-shadow-synthetic-drive.fixture';

async function cleanupMotionForTrip(db: PrismaClient, tripId: string): Promise<void> {
  await db.$executeRaw`DELETE FROM di_v0_motion_core_shadow_runs_v1 WHERE trip_id = ${tripId}`;
  await db.$executeRaw`DELETE FROM di_v0_motion_core_shadow_outbox_v1 WHERE trip_id = ${tripId}`;
}

async function workItemIdentity(db: PrismaClient, workItemId: string) {
  const [row] = await db.$queryRaw<
    Array<{ pinned_snapshot_hash: string; combined_input_identity: string }>
  >`SELECT pinned_snapshot_hash, combined_input_identity FROM di_v0_s4_work_items WHERE id = ${workItemId}`;
  return { pinnedSnapshotHash: row.pinned_snapshot_hash, combinedInputIdentity: row.combined_input_identity };
}

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DS4 event intensity persistence (postgres round-trip)', () => {
  let db: PrismaClient;
  let runs: DiV0MotionCoreShadowRunRepository;
  const fixtures: P2CompletedPrimaryFixture[] = [];

  beforeAll(async () => {
    const { PrismaClient: Client } = await import('@prisma/client');
    db = new Client();
    await db.$connect();
    runs = new DiV0MotionCoreShadowRunRepository(db);
  });

  afterEach(async () => {
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

  it('persists V2 event rows through insertSucceededRun and reads intensity back after gzip/jsonb round-trip', async () => {
    const fx = await seedP2CompletedPrimaryFixture(db);
    fixtures.push(fx);
    await cleanupMotionForTrip(db, fx.tenant.tripId);
    const identity = await workItemIdentity(db, fx.workItemId);

    const processed = processDiV0MotionCoreShadowFromEvidenceAdaptation(
      syntheticDriveEvidence(),
      { ...identity, computedAt: new Date('2026-10-28T00:00:00Z') },
    );
    expect(processed.payload.events.length).toBeGreaterThan(0);

    const intentKey = buildMotionCoreShadowIntentKey({
      ...identity,
      bundleVersion: DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1,
    });
    const insert = await runs.insertSucceededRun({
      runId: randomUUID(),
      organizationId: fx.tenant.organizationId,
      vehicleId: fx.tenant.vehicleId,
      tripId: fx.tenant.tripId,
      workItemId: fx.workItemId,
      shadowIntentKey: intentKey,
      shadowBundleVersion: DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1,
      pinnedSnapshotHash: identity.pinnedSnapshotHash,
      combinedInputIdentity: identity.combinedInputIdentity,
      contentFingerprint: processed.payloadFingerprint,
      summary: processed.summary,
      payload: processed.payload,
    });
    expect(insert.outcome).toBe('inserted');

    const run = await runs.findLatestSucceededRunForTrip({
      organizationId: fx.tenant.organizationId,
      vehicleId: fx.tenant.vehicleId,
      tripId: fx.tenant.tripId,
    });
    expect(run).not.toBeNull();
    expect(run!.shadowBundleVersion).toBe(DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1);
    expect(run!.summaryJson.eventRowContract).toBe(DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY);
    expect(run!.summaryJson.eventAcceptedCount).toBe(processed.summary.eventAcceptedCount);
    expect(run!.summaryJson.eventArtefactSuspectCount).toBe(processed.summary.eventArtefactSuspectCount);
    expect(run!.summaryJson.contentFingerprint).toBe(processed.payloadFingerprint);

    const decoded = runs.decodePayload(run!.payloadGzip);
    expect(decoded).toEqual(processed.payload);
    expect(resolveMotionCoreShadowEventRowContract(decoded)).toBe(
      DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
    );
    for (const ev of decoded.events) {
      const intensity = readPersistedMotionEventIntensity(ev);
      expect(intensity).not.toBeNull();
      expect(Number.isFinite(intensity!.meanAccelMps2)).toBe(true);
      expect(Number.isInteger(intensity!.steps)).toBe(true);
    }
    expect(JSON.stringify(decoded.events)).not.toContain('peakAccel');

    const { samples } = buildMotionTripMapSamples(decoded, [], []);
    const dtos = mapMotionTripMapEvents(decoded, new Map(samples.map((s) => [s.bucketLabelUtc, s])));
    expect(dtos.length).toBe(decoded.events.length);
    expect(dtos.every((d) => d.peakAccel1sMps2 === null && !('intensity' in d))).toBe(true);
  });

  it('decodes a pre-existing legacy (V1) row without intensity as contract V1 with intensity=null', async () => {
    const fx = await seedP2CompletedPrimaryFixture(db);
    fixtures.push(fx);
    await cleanupMotionForTrip(db, fx.tenant.tripId);
    const identity = await workItemIdentity(db, fx.workItemId);

    const processed = processDiV0MotionCoreShadowFromEvidenceAdaptation(
      syntheticDriveEvidence(),
      identity,
    );
    const { persistence: _p, ...legacyContract } = processed.payload.contract;
    const legacyPayload: DiV0MotionCoreShadowPayloadV1 = {
      ...processed.payload,
      contract: legacyContract,
      events: processed.payload.events.map(({ intensity: _i, ...rest }) => rest),
    };
    const { eventRowContract: _c, ...legacySummary } = processed.summary;
    const legacyJson = JSON.stringify(legacyPayload);
    const runId = randomUUID();
    const intentKey = buildMotionCoreShadowIntentKey({
      ...identity,
      bundleVersion: DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1,
    });
    await db.$executeRaw`
      INSERT INTO di_v0_motion_core_shadow_runs_v1 (
        id, organization_id, vehicle_id, trip_id, work_item_id,
        shadow_intent_key, shadow_bundle_version, pinned_snapshot_hash, combined_input_identity,
        content_fingerprint, shadow_status, summary_json, payload_gzip, uncompressed_bytes
      ) VALUES (
        ${runId}, ${fx.tenant.organizationId}, ${fx.tenant.vehicleId}, ${fx.tenant.tripId}, ${fx.workItemId},
        ${intentKey}, ${DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1}, ${identity.pinnedSnapshotHash}, ${identity.combinedInputIdentity},
        ${'legacy-' + runId}, 'SUCCEEDED', ${JSON.stringify(legacySummary)}::jsonb,
        ${gzipSync(legacyJson)}, ${legacyJson.length}
      )`;

    const run = await runs.findLatestSucceededRunForTrip({
      organizationId: fx.tenant.organizationId,
      vehicleId: fx.tenant.vehicleId,
      tripId: fx.tenant.tripId,
    });
    expect(run).not.toBeNull();
    expect(run!.summaryJson.eventRowContract).toBeUndefined();
    const decoded = runs.decodePayload(run!.payloadGzip);
    expect(resolveMotionCoreShadowEventRowContract(decoded)).toBe(DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY);
    expect(decoded.events.length).toBe(processed.payload.events.length);
    expect(decoded.events.every((e) => readPersistedMotionEventIntensity(e) === null)).toBe(true);
    expect(decoded.events.map((e) => [e.kind, e.startLabel, e.endLabel, e.quality])).toEqual(
      processed.payload.events.map((e) => [e.kind, e.startLabel, e.endLabel, e.quality]),
    );

    const { samples } = buildMotionTripMapSamples(decoded, [], []);
    const dtos = mapMotionTripMapEvents(decoded, new Map(samples.map((s) => [s.bucketLabelUtc, s])));
    expect(dtos.length).toBe(decoded.events.length);
  });
});
