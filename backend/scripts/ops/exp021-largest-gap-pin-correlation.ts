#!/usr/bin/env ts-node
/**
 * EXP021 — read-only correlation of sealed pin channels + DB trip/connectivity
 * during the largest POSITION missing run. No DIMO/provider calls.
 */
import * as fs from 'node:fs';
import { Prisma, PrismaClient } from '@prisma/client';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4d-replay/di-v0-s4d-verified-snapshot';
import { parseDiV0PositionSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-snapshot-parse';
import { parseDiV0R1ObdSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/r1-obd-acquisition/di-v0-r1-obd-snapshot-parse';
import { DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-acquisition.versions';
import { DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3 } from '../../src/modules/vehicle-intelligence/driving-intelligence/r1-obd-acquisition/di-v0-r1-obd-acquisition.versions';
import type { DiV0S4SourceFamily } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-trip-speed-quality-projection.types';

const ORG = process.env.EXP021_GAP_ORG ?? 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const TRIP = process.env.EXP021_GAP_TRIP_ID ?? '533b2bf8-fa07-4f0b-bc40-d540447a1542';
const WI = process.env.EXP021_GAP_WORK_ITEM_ID ?? '339856c6-a4af-43f8-aecd-07baacec3d22';
const VEHICLE = process.env.EXP021_GAP_VEHICLE_ID ?? '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const GAP_BEFORE = process.env.EXP021_GAP_BOUNDARY_BEFORE ?? '2026-10-14T14:58:35Z';
const GAP_AFTER = process.env.EXP021_GAP_BOUNDARY_AFTER ?? '2026-10-14T15:21:20Z';
const OUT =
  process.env.EXP021_GAP_CORRELATION_OUT ?? '/tmp/exp021-largest-gap-pin-correlation.json';

function bucketLabelsInterior(before: string, after: string): string[] {
  const fromMs = Date.parse(before.replace(/(\.\d{3})?Z$/, 'Z'));
  const toMs = Date.parse(after.replace(/(\.\d{3})?Z$/, 'Z'));
  const labels: string[] = [];
  for (let t = fromMs + 1000; t < toMs; t += 1000) {
    labels.push(new Date(t).toISOString().replace('.000', ''));
  }
  return labels;
}

function signalPresent(bucket: { signals: Array<{ availability: string; value: number | null }> }, id: string): boolean {
  const s = bucket.signals.find((x) => x.signal === id);
  return s != null && s.availability !== 'ROW_ABSENT' && s.value != null;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const interiorLabels = bucketLabelsInterior(GAP_BEFORE, GAP_AFTER);
  try {
    const report = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL transaction_read_only = on`;
        const wiRows = await tx.$queryRaw<
          Array<{
            id: string;
            trip_id: string;
            vehicle_id: string;
            source_family: string;
            boundary_fingerprint: string;
            pinned_snapshot_hash: string;
            completed_at: Date;
          }>
        >`
          SELECT id, trip_id, vehicle_id, source_family::text AS source_family, boundary_fingerprint,
                 pinned_snapshot_hash, completed_at
          FROM di_v0_s4_work_items
          WHERE organization_id = ${ORG} AND id = ${WI} AND trip_id = ${TRIP}
          LIMIT 1`;
        const wi = wiRows[0];
        if (!wi) throw new Error('WORK_ITEM_NOT_FOUND');

        const snapRows = await tx.$queryRaw<
          Array<{
            snapshot_hash: string;
            acquisition_window_start: Date;
            acquisition_window_end: Date;
            channel_manifest: unknown;
            payload_gzip: Buffer;
            uncompressed_bytes: number | bigint;
            created_at: Date;
          }>
        >`
          SELECT snapshot_hash, acquisition_window_start, acquisition_window_end, channel_manifest,
                 payload_gzip, uncompressed_bytes, created_at
          FROM di_v0_s4_evidence_snapshots
          WHERE organization_id = ${ORG} AND trip_id = ${TRIP} AND snapshot_hash = ${wi.pinned_snapshot_hash}
          LIMIT 1`;
        const snap = snapRows[0];
        if (!snap) throw new Error('SNAPSHOT_NOT_FOUND');

        const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(
          {
            organization_id: ORG,
            vehicle_id: wi.vehicle_id,
            trip_id: wi.trip_id,
            boundary_fingerprint: wi.boundary_fingerprint,
            acquisition_window_start: snap.acquisition_window_start,
            acquisition_window_end: snap.acquisition_window_end,
            channel_manifest: snap.channel_manifest,
            payload_gzip: snap.payload_gzip,
            uncompressed_bytes: snap.uncompressed_bytes,
          },
          {
            organizationId: ORG,
            vehicleId: wi.vehicle_id,
            tripId: wi.trip_id,
            boundaryFingerprint: wi.boundary_fingerprint,
            snapshotHash: wi.pinned_snapshot_hash,
            sourceFamily: wi.source_family as DiV0S4SourceFamily,
          },
        );
        if (!verified.ok) throw new Error(`SNAPSHOT_VERIFY:${verified.code}`);

        const posPayload = verified.parsed.channelPayloads.POSITION;
        const r1Payload = verified.parsed.channelPayloads.R1_OBD;
        const posEntry = verified.parsed.channelManifest.find((c) => c.channel === 'POSITION');
        const r1Entry = verified.parsed.channelManifest.find((c) => c.channel === 'R1_OBD');

        const position = posPayload && posEntry?.formatVersion === DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1
          ? parseDiV0PositionSnapshot(posPayload)
          : null;
        const r1 =
          r1Payload && r1Entry?.formatVersion === DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3
            ? parseDiV0R1ObdSnapshot(r1Payload)
            : null;

        const posByLabel = new Map(position?.buckets.map((b) => [b.bucketLabel, b]) ?? []);
        const r1ByLabel = new Map(r1?.buckets.map((b) => [b.bucketLabel, b]) ?? []);

        const countPos = (labels: string[]) => {
          let present = 0;
          let absent = 0;
          for (const l of labels) {
            const b = posByLabel.get(l);
            if (!b || b.availability === 'ROW_ABSENT') absent += 1;
            else present += 1;
          }
          return { present, absent, total: labels.length };
        };

        const countR1Signal = (labels: string[], signalId: string) => {
          let present = 0;
          let absent = 0;
          for (const l of labels) {
            const b = r1ByLabel.get(l);
            if (!b || !signalPresent(b, signalId)) absent += 1;
            else present += 1;
          }
          return { present, absent, total: labels.length };
        };

        const fullLabels = position?.buckets.map((b) => b.bucketLabel) ?? [];
        const gapInterior = interiorLabels;
        const boundaryPair = [GAP_BEFORE, GAP_AFTER];

        const vehicleRows = await tx.$queryRaw<
          Array<{ id: string; license_plate: string | null; vehicle_name: string | null; make: string | null; model: string | null; dimo_vehicle_id: string | null }>
        >`
          SELECT id, license_plate, vehicle_name, make, model, dimo_vehicle_id
          FROM vehicles WHERE organization_id = ${ORG} AND id::text = ${VEHICLE} LIMIT 1`;

        const tripRows = await tx.$queryRaw<
          Array<{
            id: string;
            start_time: Date;
            end_time: Date | null;
            trip_status: string;
            distance_km: number | null;
            dimo_segment_id: string | null;
          }>
        >`
          SELECT id, start_time, end_time, trip_status::text AS trip_status, distance_km, dimo_segment_id
          FROM vehicle_trips
          WHERE id::text = ${TRIP} AND vehicle_id::text = ${VEHICLE}
          LIMIT 1`;

        const neighborTrips = await tx.$queryRaw<
          Array<{ id: string; start_time: Date; end_time: Date | null; trip_status: string }>
        >`
          SELECT id, start_time, end_time, trip_status::text AS trip_status
          FROM vehicle_trips
          WHERE vehicle_id::text = ${VEHICLE}
            AND start_time >= ${new Date('2026-10-14T12:00:00Z')}
            AND start_time < ${new Date('2026-10-14T20:00:00Z')}
          ORDER BY start_time ASC`;

        const connEvents = await tx.$queryRaw<
          Array<{ event_type: string; observed_at: Date; received_at: Date }>
        >`
          SELECT event_type::text AS event_type, observed_at, received_at
          FROM dimo_device_connection_events
          WHERE organization_id = ${ORG}
            AND vehicle_id::text = ${VEHICLE}
            AND observed_at >= ${new Date('2026-10-14T14:40:00Z')}
            AND observed_at < ${new Date('2026-10-14T16:15:00Z')}
          ORDER BY observed_at ASC
          LIMIT 200`;

        const episodes = await tx.$queryRaw<
          Array<{
            id: string;
            opened_at: Date;
            resolved_at: Date | null;
            status: string;
            opened_reason: string;
          }>
        >`
          SELECT id, opened_at, resolved_at, status::text AS status, opened_reason::text AS opened_reason
          FROM device_connection_episodes
          WHERE organization_id = ${ORG}
            AND vehicle_id::text = ${VEHICLE}
            AND opened_at < ${new Date('2026-10-14T16:15:00Z')}
            AND (resolved_at IS NULL OR resolved_at > ${new Date('2026-10-14T14:40:00Z')})
          ORDER BY opened_at ASC
          LIMIT 50`;

        const speedInGap = countR1Signal(gapInterior, 'speed');
        const rpmInGap = countR1Signal(gapInterior, 'powertrainCombustionEngineSpeed');

        return {
          kind: 'EXP021_LARGEST_GAP_PIN_CORRELATION_V1',
          scope: { org: ORG, trip: TRIP, workItem: WI, vehicle: VEHICLE, tokenId: position?.dimoTokenId ?? null },
          gapDefinition: {
            boundaryPositionsPresent: boundaryPair,
            interiorGridLabelsHalfOpen: `[${GAP_BEFORE} +1s, ${GAP_AFTER})`,
            interiorBucketCount: gapInterior.length,
            pointToPointGapSeconds: Math.round((Date.parse(GAP_AFTER) - Date.parse(GAP_BEFORE)) / 1000),
            absentGridSecondsInInterior: gapInterior.length,
            note: '1365s between returned POSITION labels; 1364 absent 1s grid buckets strictly inside.',
          },
          pinProvenance: {
            pinnedSnapshotHash: wi.pinned_snapshot_hash,
            snapshotCreatedAtUtc: snap.created_at.toISOString(),
            workItemCompletedAtUtc: wi.completed_at.toISOString(),
            source: 'SEALED_S4_EVIDENCE_SNAPSHOT (historical acquisition pin, not live latest)',
          },
          positionChannel: {
            format: posEntry?.formatVersion ?? null,
            fullWindow: countPos(fullLabels),
            gapInterior: countPos(gapInterior),
            boundaryBuckets: boundaryPair.map((l) => ({
              label: l,
              availability: posByLabel.get(l)?.availability ?? 'MISSING_FROM_MAP',
            })),
          },
          r1ObdChannel: {
            format: r1Entry?.formatVersion ?? null,
            sealedSignals: ['speed', 'powertrainCombustionEngineSpeed', 'obdThrottlePosition', 'obdEngineLoad', 'powertrainCombustionEngineECT'],
            notInSealedR1Pin: ['isIgnitionOn', 'powertrainTransmissionTravelledDistance (odometer)'],
            fullWindow: {
              speed: countR1Signal(fullLabels, 'speed'),
              rpm: countR1Signal(fullLabels, 'powertrainCombustionEngineSpeed'),
            },
            gapInterior: {
              speed: speedInGap,
              rpm: rpmInGap,
            },
          },
          vehicleIdentity: vehicleRows[0] ?? null,
          tripBoundary: tripRows[0]
            ? {
                ...tripRows[0],
                start_time: tripRows[0].start_time.toISOString(),
                end_time: tripRows[0].end_time?.toISOString() ?? null,
              }
            : null,
          neighborTripsSameDay: neighborTrips.map((t) => ({
            id: t.id,
            start_time: t.start_time.toISOString(),
            end_time: t.end_time?.toISOString() ?? null,
            trip_status: t.trip_status,
          })),
          connectivity: {
            dimoDeviceConnectionEvents: connEvents.map((e) => ({
              event_type: e.event_type,
              observed_at: e.observed_at.toISOString(),
              received_at: e.received_at.toISOString(),
            })),
            deviceConnectionEpisodes: episodes.map((e) => ({
              id: e.id,
              opened_at: e.opened_at.toISOString(),
              resolved_at: e.resolved_at?.toISOString() ?? null,
              status: e.status,
              opened_reason: e.opened_reason,
            })),
          },
        };
      },
      { timeout: 120_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: true, out: OUT }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
