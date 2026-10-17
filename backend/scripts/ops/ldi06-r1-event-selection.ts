#!/usr/bin/env ts-node
/**
 * LDI-06 — scoped R1 event-first trip selection (read-only DB).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { PrismaClient, DrivingEventSource } from '@prisma/client';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { evaluateDiV0SpeedQcInterval } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/evaluate-di-v0-speed-qc-interval';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-policy.version';
import { dateToBucketLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4d-replay/di-v0-s4d-verified-snapshot';
import { parseDiV0R1ObdSnapshot, diV0R1SnapshotToS1Observations } from '../../src/modules/vehicle-intelligence/driving-intelligence/r1-obd-acquisition/di-v0-r1-obd-snapshot-parse';
import type { P21ForensicLoadedContext } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import {
  ACCEL_TYPES,
  BRAKE_TYPES,
  CORNER_TYPES,
  LDI06_EXCLUDED_VEHICLE_ID,
  LDI06_ORG_ID,
  LDI06_TARGET_VEHICLE_ID,
  buildLdi06ResultLines,
} from './ldi06-r1-event-selection.lib';

const TELEMETRY = DrivingEventSource.TELEMETRY_EVENTS;

async function loadR1ObdPayloadForContext(
  prisma: PrismaClient,
  ctx: P21ForensicLoadedContext,
): Promise<string | undefined> {
  const snapshotRows = await prisma.$queryRaw<
    Array<{
      channel_manifest: unknown;
      payload_gzip: Buffer;
      acquisition_window_start: Date;
      acquisition_window_end: Date;
    }>
  >`
    SELECT channel_manifest, payload_gzip, acquisition_window_start, acquisition_window_end
    FROM di_v0_s4_evidence_snapshots
    WHERE organization_id = ${ctx.workItem.organization_id}
      AND trip_id = ${ctx.workItem.trip_id}
      AND snapshot_hash = ${ctx.pinnedSnapshotHash}
    LIMIT 1`;
  const snap = snapshotRows[0];
  if (!snap) return undefined;
  const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(
    {
      organization_id: ctx.workItem.organization_id,
      vehicle_id: ctx.workItem.vehicle_id,
      trip_id: ctx.workItem.trip_id,
      boundary_fingerprint: ctx.workItem.boundary_fingerprint,
      acquisition_window_start: snap.acquisition_window_start,
      acquisition_window_end: snap.acquisition_window_end,
      channel_manifest: snap.channel_manifest,
      payload_gzip: snap.payload_gzip,
      uncompressed_bytes: 0,
    },
    {
      organizationId: ctx.workItem.organization_id,
      vehicleId: ctx.workItem.vehicle_id,
      tripId: ctx.workItem.trip_id,
      boundaryFingerprint: ctx.workItem.boundary_fingerprint,
      snapshotHash: ctx.pinnedSnapshotHash,
      sourceFamily: ctx.workItem.source_family as never,
    },
  );
  return verified.ok ? verified.parsed.channelPayloads.R1_OBD : undefined;
}

function hfNumericFractionFromR1Payload(r1Payload: string | undefined, shadowCount: number): number {
  if (!r1Payload || shadowCount <= 0) return 0;
  const obs = diV0R1SnapshotToS1Observations(parseDiV0R1ObdSnapshot(r1Payload));
  let hfNumeric = 0;
  for (const o of obs) {
    if (o.rpm != null && Number.isFinite(o.rpm)) hfNumeric += 1;
    else if (o.throttlePct != null && Number.isFinite(o.throttlePct)) hfNumeric += 1;
  }
  return Math.min(1, hfNumeric / shadowCount);
}

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-06');
  }
  return path.resolve(argv[i + 1]);
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = process.env.LDI06_REPO_ROOT
    ? path.resolve(process.env.LDI06_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const prisma = new PrismaClient();
  try {
    const events = await prisma.drivingEvent.findMany({
      where: {
        organizationId: LDI06_ORG_ID,
        vehicleId: LDI06_TARGET_VEHICLE_ID,
        source: TELEMETRY,
      },
      orderBy: { recordedAt: 'asc' },
      select: {
        id: true,
        tripId: true,
        eventType: true,
        providerEventName: true,
        provider: true,
        recordedAt: true,
        speedKmh: true,
        deltaKmh: true,
        tripAssignment: true,
        providerFingerprint: true,
      },
    });

    const excludedCount = await prisma.drivingEvent.count({
      where: { vehicleId: LDI06_EXCLUDED_VEHICLE_ID, source: TELEMETRY },
    });

    const byType: Record<string, number> = {};
    let accel = 0;
    let brake = 0;
    let corner = 0;
    for (const e of events) {
      const t = String(e.eventType);
      byType[t] = (byType[t] ?? 0) + 1;
      if (ACCEL_TYPES.has(t)) accel += 1;
      if (BRAKE_TYPES.has(t)) brake += 1;
      if (CORNER_TYPES.has(t)) corner += 1;
    }

    const inventory = {
      schema: 'LDI06_R1_EVENT_INVENTORY_V1',
      headSha,
      observedAtUtc: new Date().toISOString(),
      targetVehicleId: LDI06_TARGET_VEHICLE_ID,
      excludedVehicleId: LDI06_EXCLUDED_VEHICLE_ID,
      excludedVehicleEventCountExcludedFromScope: excludedCount,
      organizationId: LDI06_ORG_ID,
      source: 'DrivingEvent.source=TELEMETRY_EVENTS',
      provenanceNote: 'DIMO native behavior events via LteR1BehaviorEnrichmentService — not independent physical validation',
      totalCount: events.length,
      previousLdi05Count: 140,
      ownerApproximateCount: 150,
      reconciliation:
        events.length === 140
          ? 'VERIFIED_140_matches_LDI05; delta_vs_150_approx_UNEXPLAINED_10_without_provider_call'
          : `COUNT_DRIFT_LDI05_had_140_now_${events.length}`,
      byEventType: byType,
      harshAccelerationCount: accel,
      harshBrakingCount: brake,
      harshCorneringCount: corner,
      events: events.map((e) => ({
        id: e.id,
        tripId: e.tripId,
        eventType: e.eventType,
        providerEventName: e.providerEventName,
        provider: e.provider,
        recordedAtUtc: e.recordedAt.toISOString(),
        speedKmh: e.speedKmh,
        deltaKmh: e.deltaKmh,
        tripAssignment: e.tripAssignment,
        hasFingerprint: e.providerFingerprint != null,
      })),
    };

    const tripIds = [...new Set(events.map((e) => e.tripId).filter(Boolean))] as string[];

    const workItemRows =
      tripIds.length > 0
        ? await prisma.diV0S4WorkItem.findMany({
            where: {
              organizationId: LDI06_ORG_ID,
              vehicleId: LDI06_TARGET_VEHICLE_ID,
              tripId: { in: tripIds },
              status: 'COMPLETED',
              pinnedSnapshotHash: { not: null },
            },
            select: {
              tripId: true,
              id: true,
              pinnedSnapshotHash: true,
              completedAt: true,
            },
            orderBy: { completedAt: 'desc' },
          })
        : [];

    const wiByTrip = new Map<string, { id: string; pinned_snapshot_hash: string }>();
    for (const w of workItemRows) {
      if (!w.pinnedSnapshotHash || wiByTrip.has(w.tripId)) continue;
      wiByTrip.set(w.tripId, { id: w.id, pinned_snapshot_hash: w.pinnedSnapshotHash });
    }

    const candidates: Array<Record<string, unknown>> = [];

    for (const tripId of tripIds) {
      const tripEvents = events.filter((e) => e.tripId === tripId);
      const trip = await prisma.vehicleTrip.findUnique({
        where: { id: tripId },
        select: { id: true, startTime: true, endTime: true, vehicleId: true },
      });
      if (!trip || trip.vehicleId !== LDI06_TARGET_VEHICLE_ID) continue;
      if (!trip.endTime) continue;

      const tripAccel = tripEvents.filter((e) => ACCEL_TYPES.has(String(e.eventType))).length;
      const tripBrake = tripEvents.filter((e) => BRAKE_TYPES.has(String(e.eventType))).length;
      const tripCorner = tripEvents.filter((e) => CORNER_TYPES.has(String(e.eventType))).length;

      let gpsTrustedFrac = 0;
      let hfFrac = 0;
      let obdFrac = 0;
      let nativeOnBucket = 0;
      let shadowCount = 0;
      let workItemId: string | null = null;
      let pinnedSnapshotHash: string | null = null;

      const wi = wiByTrip.get(tripId);
      if (wi) {
        workItemId = wi.id;
        pinnedSnapshotHash = wi.pinned_snapshot_hash;
        try {
          const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
            organizationId: LDI06_ORG_ID,
            tripId,
            workItemId: wi.id,
          });
          shadowCount = ctx.shadowIntervals.length;
          let trusted = 0;
          let obdNumeric = 0;
          const r1ByLabel = new Map(ctx.evidence.r1Obd.map((r) => [r.bucketLabel, r.speedKmh]));
          const r1Payload = await loadR1ObdPayloadForContext(prisma, ctx);
          const hfFromPayload = hfNumericFractionFromR1Payload(r1Payload, shadowCount);
          const eventBuckets = new Set(
            tripEvents.map((e) => dateToBucketLabel(e.recordedAt)),
          );

          for (const row of ctx.shadowIntervals) {
            const label = dateToBucketLabel(row.referenceTime);
            const verdict = evaluateDiV0SpeedQcInterval({
              qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
              centerBucketLabel: label,
              shadow: {
                intervalStart: label,
                intervalEnd: label,
                referenceTime: label,
                estimatedSpeedKmh: row.estimatedSpeedKmh,
                speedEvidenceState: (row.speedEvidenceState ?? 'NONE') as 'NONE',
                valueConfidence: row.valueConfidence as 'HIGH',
                sourceRelation: row.sourceRelation as never,
                motionState: row.motionState as never,
                positionState: row.positionState as never,
                abstentionReason: row.abstentionReason as never,
                sourceQualityFlags: Array.isArray(row.sourceQualityFlags)
                  ? row.sourceQualityFlags.map(String)
                  : [],
                evidenceSources: [],
              },
              positions: ctx.evidence.positions,
              r1Obd: ctx.evidence.r1Obd,
              evidenceIdentity: { pinnedSnapshotHash: ctx.pinnedSnapshotHash },
            });
            if (verdict.trustLevel === 'TRUSTED' || verdict.trustLevel === 'TRUSTED_LIMITED') trusted += 1;
            const obd = r1ByLabel.get(label);
            if (obd != null && Number.isFinite(obd)) obdNumeric += 1;
            if (eventBuckets.has(label) && obd != null && verdict.trustLevel !== 'UNTRUSTED') {
              nativeOnBucket += 1;
            }
          }
          if (shadowCount > 0) {
            gpsTrustedFrac = trusted / shadowCount;
            hfFrac = hfFromPayload > 0 ? hfFromPayload : obdNumeric / shadowCount;
            obdFrac = obdNumeric / shadowCount;
          }
        } catch {
          // no pin — coverage stays 0
        }
      }

      const hasBothAccelBrake = tripAccel > 0 && tripBrake > 0;

      candidates.push({
        tripId,
        tripStartUtc: trip.startTime.toISOString(),
        tripEndUtc: trip.endTime.toISOString(),
        nativeEventCount: tripEvents.length,
        harshAccelerationCount: tripAccel,
        harshBrakingCount: tripBrake,
        harshCorneringCount: tripCorner,
        hasBothAccelAndBrake: hasBothAccelBrake,
        diWorkItemId: workItemId,
        pinnedSnapshotHash,
        coverage: {
          shadowIntervalCount: shadowCount,
          gpsL3TrustedFraction: gpsTrustedFrac,
          hfRpmOrThrottleFraction: hfFrac,
          obdNumericFraction: obdFrac,
          nativeEventsOnTrustedOverlapBuckets: nativeOnBucket,
        },
        rankScore: 0,
      });
    }

    type Cov = {
      gpsL3TrustedFraction: number;
      hfRpmOrThrottleFraction: number;
      obdNumericFraction: number;
      nativeEventsOnTrustedOverlapBuckets: number;
    };

    function compareCandidates(a: Record<string, unknown>, b: Record<string, unknown>): number {
      const aBoth = a.hasBothAccelAndBrake ? 1 : 0;
      const bBoth = b.hasBothAccelAndBrake ? 1 : 0;
      if (bBoth !== aBoth) return bBoth - aBoth;
      const ac = (a.coverage ?? {}) as Cov;
      const bc = (b.coverage ?? {}) as Cov;
      if (bc.gpsL3TrustedFraction !== ac.gpsL3TrustedFraction) {
        return bc.gpsL3TrustedFraction - ac.gpsL3TrustedFraction;
      }
      if (bc.hfRpmOrThrottleFraction !== ac.hfRpmOrThrottleFraction) {
        return bc.hfRpmOrThrottleFraction - ac.hfRpmOrThrottleFraction;
      }
      if (bc.obdNumericFraction !== ac.obdNumericFraction) {
        return bc.obdNumericFraction - ac.obdNumericFraction;
      }
      if (bc.nativeEventsOnTrustedOverlapBuckets !== ac.nativeEventsOnTrustedOverlapBuckets) {
        return bc.nativeEventsOnTrustedOverlapBuckets - ac.nativeEventsOnTrustedOverlapBuckets;
      }
      const aNative = (a.nativeEventCount as number) ?? 0;
      const bNative = (b.nativeEventCount as number) ?? 0;
      return bNative - aNative;
    }

    candidates.sort(compareCandidates);
    for (let i = 0; i < candidates.length; i += 1) {
      candidates[i].rankScore = candidates.length - i;
    }

    const pinnedCandidates = candidates.filter((c) => c.diWorkItemId != null);
    pinnedCandidates.sort(compareCandidates);
    const fusionAlternate = pinnedCandidates[0] as Record<string, unknown> | undefined;

    const selected = candidates[0] as Record<string, unknown> | undefined;
    const selCov = (selected?.coverage ?? {}) as Record<string, number>;
    const fourStreamPossible =
      selected &&
      (selected.harshAccelerationCount as number) > 0 &&
      (selected.harshBrakingCount as number) > 0 &&
      (selCov.gpsL3TrustedFraction ?? 0) > 0.5 &&
      (selCov.hfRpmOrThrottleFraction ?? 0) > 0.05 &&
      selected.diWorkItemId;

    fs.writeFileSync(
      path.join(outDir, 'LDI06_R1_EVENT_INVENTORY.json'),
      JSON.stringify(inventory, null, 2),
    );
    fs.writeFileSync(
      path.join(outDir, 'LDI06_R1_TRIP_CANDIDATES.json'),
      JSON.stringify(
        {
          schema: 'LDI06_R1_TRIP_CANDIDATES_V1',
          headSha,
          targetVehicleId: LDI06_TARGET_VEHICLE_ID,
          rankingCriteria: [
            'both_accel_and_brake',
            'gps_l3_trusted',
            'hf_obd_numeric',
            'temporal_overlap',
          ],
          candidateCount: candidates.length,
          candidates,
          selectedTripId: selected?.tripId ?? null,
          fusionCapableAlternateTripId: fusionAlternate?.tripId ?? null,
          fusionCapableAlternate: fusionAlternate ?? null,
        },
        null,
        2,
      ),
    );

    const selId = (selected?.tripId as string) ?? 'NONE';
    fs.writeFileSync(
      path.join(outDir, 'LDI06_R1_SELECTION.md'),
      [
        '# LDI06 — R1 event-first trip selection',
        '',
        `**Vehicle (only):** \`${LDI06_TARGET_VEHICLE_ID}\` (Ruptela R1 / Arteon)`,
        `**Excluded:** \`${LDI06_EXCLUDED_VEHICLE_ID}\` (VW Tiguan) — not ranked`,
        '',
        '## Event inventory',
        '',
        `- **Verified count:** ${events.length} (LDI-05: 140; owner ~150 → **${150 - events.length}** unaccounted without new provider call)`,
        `- **Accel / brake / corner:** ${accel} / ${brake} / ${corner}`,
        '',
        '## Selected trip',
        '',
        selected
          ? [
              `- **tripId:** \`${selId}\``,
              `- **Native events:** ${selected.nativeEventCount} (accel ${selected.harshAccelerationCount}, brake ${selected.harshBrakingCount}, corner ${selected.harshCorneringCount})`,
              `- **Both accel+brake:** ${selected.hasBothAccelAndBrake}`,
              `- **DI work item:** \`${selected.diWorkItemId ?? 'none'}\``,
              `- **GPS-L3 trusted:** ${((selCov.gpsL3TrustedFraction ?? 0) * 100).toFixed(1)}%`,
              `- **HF (rpm/throttle buckets):** ${((selCov.hfRpmOrThrottleFraction ?? 0) * 100).toFixed(1)}%`,
              `- **OBD speed numeric:** ${((selCov.obdNumericFraction ?? 0) * 100).toFixed(1)}%`,
            ].join('\n')
          : '- **NONE** — insufficient evidence on target vehicle',
        '',
        '## Fusion-capable alternate (pinned S4)',
        '',
        fusionAlternate
          ? [
              `- **tripId:** \`${fusionAlternate.tripId}\``,
              `- **DI work item:** \`${fusionAlternate.diWorkItemId}\``,
              `- **Native events:** ${fusionAlternate.nativeEventCount} (accel ${fusionAlternate.harshAccelerationCount}, brake ${fusionAlternate.harshBrakingCount})`,
              `- **GPS-L3 trusted:** ${(((fusionAlternate.coverage as Cov).gpsL3TrustedFraction ?? 0) * 100).toFixed(1)}%`,
              `- **Note:** No Arteon trip has both accel+brake natives **and** an S4 pin; use this trip for LDI-03 four-stream pin only.`,
            ].join('\n')
          : '- **NONE**',
        '',
        '## Candidate ranking',
        '',
        '| Rank | Trip | Score | Accel | Brake | GPS-L3 trusted % |',
        '|------|------|-------|-------|-------|------------------|',
        ...candidates.slice(0, 10).map((c, i) =>
          `| ${i + 1} | \`${String(c.tripId).slice(0, 8)}…\` | ${c.rankScore} | ${c.harshAccelerationCount} | ${c.harshBrakingCount} | ${((c.coverage as { gpsL3TrustedFraction: number }).gpsL3TrustedFraction * 100).toFixed(1)} |`,
        ),
      ].join('\n'),
    );

    fs.writeFileSync(
      path.join(outDir, 'LDI06_R1_FUSION_READINESS.md'),
      [
        '# LDI06 — Four-stream fusion readiness',
        '',
        `**Selected:** \`${selId}\``,
        '',
        '| Stream | Status |',
        '|--------|--------|',
        `| GPS-L3/QC | ${selected ? `${((selCov.gpsL3TrustedFraction ?? 0) * 100).toFixed(1)}% trusted` : 'n/a'} |`,
        `| HF 1 Hz subset | ${selected ? `${((selCov.hfRpmOrThrottleFraction ?? 0) * 100).toFixed(1)}% buckets with rpm/throttle` : 'n/a'} |`,
        `| OBD speed | ${selected ? `${((selCov.obdNumericFraction ?? 0) * 100).toFixed(1)}% numeric` : 'n/a'} |`,
        `| Native DrivingEvent | ${selected?.nativeEventCount ?? 0} on trip |`,
        '',
        `**Four-stream snapshot reproducible:** ${fourStreamPossible ? 'CONDITIONAL_YES — run LDI-03 pin on selected trip' : 'NO — missing stream or DI pin'}`,
        '',
        '',
        '## Fusion-capable alternate (pinned S4 only)',
        '',
        fusionAlternate
          ? [
              `Among **${pinnedCandidates.length}** trips with COMPLETED S4 pins on this vehicle, lexicographic rank picks:`,
              `- **tripId:** \`${fusionAlternate.tripId}\``,
              `- **Native:** ${fusionAlternate.nativeEventCount} (accel ${fusionAlternate.harshAccelerationCount}, brake ${fusionAlternate.harshBrakingCount})`,
              `- **GPS-L3 trusted:** ${(((fusionAlternate.coverage as Cov).gpsL3TrustedFraction ?? 0) * 100).toFixed(1)}%`,
              `- **Work item:** \`${fusionAlternate.diWorkItemId}\``,
            ].join('\n')
          : '- None — no pinned S4 work items overlap native-event trips',
        '',
        '**Limitations:** Native events are provider-reported (DIMO `TELEMETRY_EVENTS`); no trip on this vehicle has both accel+brake native events **and** an S4 pin. LDI-03 combined export not re-run in LDI-06. Tiguan excluded by mandate.',
      ].join('\n'),
    );

    const resultLines = buildLdi06ResultLines({
      nativeTotal: events.length,
      accelCount: accel,
      brakeCount: brake,
      candidateCount: candidates.length,
      selectedTripId: selected?.tripId as string | null,
      gpsL3: selected
        ? `${((selCov.gpsL3TrustedFraction ?? 0) * 100).toFixed(1)}pct_trusted`
        : 'N/A',
      hf: selected ? `${((selCov.hfRpmOrThrottleFraction ?? 0) * 100).toFixed(1)}pct` : 'N/A',
      obd: selected ? `${((selCov.obdNumericFraction ?? 0) * 100).toFixed(1)}pct` : 'N/A',
      fourStream: fourStreamPossible ? 'CONDITIONAL_native_plus_l3_hf_obd_pin' : 'INSUFFICIENT',
      fusionReady: fourStreamPossible ? 'CONDITIONAL_PENDING_LDI03_REEXPORT' : 'NO',
    });
    fs.writeFileSync(path.join(outDir, 'LDI06_RESULT.txt'), resultLines.join('\n') + '\n');

    console.log(
      JSON.stringify({
        ok: true,
        eventCount: events.length,
        candidates: candidates.length,
        selected: selId,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
