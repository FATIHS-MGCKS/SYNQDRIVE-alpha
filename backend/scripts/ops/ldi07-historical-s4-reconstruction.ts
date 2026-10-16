#!/usr/bin/env ts-node
/**
 * LDI-07 — historical S4 offline reconstruction feasibility (read-only DB).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { PrismaClient, DrivingEventSource } from '@prisma/client';
import { computeDiV0TripIntervals } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/compute-trip-intervals';
import { CALIBRATION_UNSET_V0_BUNDLE } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/calibration/CALIBRATION_UNSET_V0';
import { DEFAULT_DI_V0_VERSION_TUPLE } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/versions';
import type { NormalizedPositionObservation } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/types';
import {
  buildExpectedBucketLabels,
  deriveSecondAlignedEnclosingWindow,
  formatBucketLabel,
  validateDiV0PositionWindow,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-window';
import { evaluateDiV0SpeedQcInterval } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/evaluate-di-v0-speed-qc-interval';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-policy.version';
import { isValidGeoCoordinate } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-position-index';
import type { DiV0SpeedQcPositionSample } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc.types';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import {
  analyzeInterWaypointCadence,
  buildLdi07ResultLines,
  LDI07_FUSION_ALTERNATE_TRIP_ID,
  LDI07_ORG_ID,
  LDI07_PRIMARY_TRIP_ID,
  LDI07_VEHICLE_ID,
  type NativeAlignmentRow,
} from './ldi07-historical-s4-reconstruction.lib';

const TELEMETRY = DrivingEventSource.TELEMETRY_EVENTS;

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-07');
  }
  return path.resolve(argv[i + 1]);
}

function bucketFromDate(d: Date): string {
  return formatBucketLabel(Math.floor(d.getTime() / 1000) * 1000);
}

function waypointsToPositionGrid(
  waypoints: Array<{ recordedAt: Date; latitude: number; longitude: number }>,
  fromUtc: string,
  toUtc: string,
): NormalizedPositionObservation[] {
  const window = validateDiV0PositionWindow(fromUtc, toUtc);
  const labels = buildExpectedBucketLabels(window);
  const byLabel = new Map<string, { lat: number; lon: number }>();
  for (const w of waypoints) {
    if (!isValidGeoCoordinate(w.latitude, w.longitude)) continue;
    const label = bucketFromDate(w.recordedAt);
    byLabel.set(label, { lat: w.latitude, lon: w.longitude });
  }
  return labels.map((label) => {
    const hit = byLabel.get(label);
    if (!hit) {
      return {
        bucketLabel: label,
        intervalStart: label,
        intervalEnd: label,
        referenceTime: label,
        availability: 'ROW_ABSENT',
        sourceFamily: 'RUPTELA_R1',
        provenance: { sourceSignal: 'vehicle_trip_waypoints', derivedFrom: ['LDI07_OFFLINE_WAYPOINT_MIRROR'] },
      };
    }
    return {
      bucketLabel: label,
      intervalStart: label,
      intervalEnd: label,
      referenceTime: label,
      availability: 'PRESENT',
      latitude: hit.lat,
      longitude: hit.lon,
      sourceFamily: 'RUPTELA_R1',
      provenance: { sourceSignal: 'vehicle_trip_waypoints', derivedFrom: ['LDI07_OFFLINE_WAYPOINT_MIRROR'] },
    };
  });
}

function estimateTrustedCoverageFromWaypoints(
  waypoints: Array<{ recordedAt: Date; latitude: number; longitude: number }>,
  fromUtc: string,
  toUtc: string,
): {
  trustedFraction: number;
  trustedLimitedFraction: number;
  trustedFractionOnPresentBuckets: number;
  trustedOrLimitedOnPresentBuckets: number;
  presentIntervalCount: number;
  intervalCount: number;
} {
  const positions = waypointsToPositionGrid(waypoints, fromUtc, toUtc);
  const computeOutput = computeDiV0TripIntervals(
    { sourceFamily: 'RUPTELA_R1', positions, r1Obd: [], nativeEvents: [] },
    { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE },
  );
  const qcPositions: DiV0SpeedQcPositionSample[] = positions.map((p) => ({
    bucketLabel: p.bucketLabel,
    availability: p.availability,
    latitude: p.latitude,
    longitude: p.longitude,
  }));
  const presentLabels = new Set(
    positions.filter((p) => p.availability === 'PRESENT').map((p) => p.bucketLabel),
  );
  let trusted = 0;
  let trustedLimited = 0;
  let trustedPresent = 0;
  let trustedLimitedPresent = 0;
  let presentIntervalCount = 0;
  for (const interval of computeOutput.intervals) {
    const verdict = evaluateDiV0SpeedQcInterval({
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
      centerBucketLabel: interval.referenceTime,
      shadow: {
        intervalStart: interval.intervalStart,
        intervalEnd: interval.intervalEnd,
        referenceTime: interval.referenceTime,
        estimatedSpeedKmh: interval.estimatedSpeedKmh,
        speedEvidenceState: interval.speedEvidenceState,
        valueConfidence: interval.valueConfidence,
        sourceRelation: interval.sourceRelation,
        motionState: interval.motionState,
        positionState: interval.positionState,
        abstentionReason: interval.abstentionReason,
        sourceQualityFlags: interval.sourceQualityFlags,
        evidenceSources: interval.evidenceSources,
      },
      positions: qcPositions,
      r1Obd: [],
      evidenceIdentity: { pinnedSnapshotHash: 'LDI07_OFFLINE_NO_PIN' },
    });
    if (verdict.trustLevel === 'TRUSTED') trusted += 1;
    if (verdict.trustLevel === 'TRUSTED_LIMITED') trustedLimited += 1;
    if (presentLabels.has(interval.referenceTime)) {
      presentIntervalCount += 1;
      if (verdict.trustLevel === 'TRUSTED') trustedPresent += 1;
      if (verdict.trustLevel === 'TRUSTED_LIMITED') trustedLimitedPresent += 1;
    }
  }
  const n = computeOutput.intervals.length;
  return {
    trustedFraction: n > 0 ? trusted / n : 0,
    trustedLimitedFraction: n > 0 ? (trusted + trustedLimited) / n : 0,
    trustedFractionOnPresentBuckets: presentIntervalCount > 0 ? trustedPresent / presentIntervalCount : 0,
    trustedOrLimitedOnPresentBuckets:
      presentIntervalCount > 0 ? (trustedPresent + trustedLimitedPresent) / presentIntervalCount : 0,
    presentIntervalCount,
    intervalCount: n,
  };
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = process.env.LDI07_REPO_ROOT
    ? path.resolve(process.env.LDI07_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const prisma = new PrismaClient();
  try {
    const trip = await prisma.vehicleTrip.findUnique({
      where: { id: LDI07_PRIMARY_TRIP_ID },
      select: {
        id: true,
        vehicleId: true,
        startTime: true,
        endTime: true,
        tripStatus: true,
        dimoSegmentId: true,
        rawDetectionMeta: true,
        avgRpm: true,
        avgThrottlePosition: true,
        maxSpeedKmh: true,
      },
    });
    if (!trip?.endTime || trip.vehicleId !== LDI07_VEHICLE_ID) {
      throw new Error('Primary trip missing or vehicle scope mismatch');
    }

    const waypoints = await prisma.vehicleTripWaypoint.findMany({
      where: { tripId: LDI07_PRIMARY_TRIP_ID },
      orderBy: { recordedAt: 'asc' },
      select: { id: true, latitude: true, longitude: true, speedKmh: true, recordedAt: true },
    });

    const positionUpdates = await prisma.vehiclePositionUpdate.count({
      where: {
        vehicleId: LDI07_VEHICLE_ID,
        recordedAt: { gte: trip.startTime, lte: trip.endTime },
      },
    });

    const routeArtifact = await prisma.vehicleTripRouteArtifact.findUnique({
      where: { tripId: LDI07_PRIMARY_TRIP_ID },
    });

    const s4Items = await prisma.diV0S4WorkItem.findMany({
      where: { tripId: LDI07_PRIMARY_TRIP_ID, organizationId: LDI07_ORG_ID },
      select: {
        id: true,
        status: true,
        pinnedSnapshotHash: true,
        failureClass: true,
        failureReason: true,
        skipReason: true,
        createdAt: true,
        completedAt: true,
      },
    });

    const natives = await prisma.drivingEvent.findMany({
      where: { tripId: LDI07_PRIMARY_TRIP_ID, source: TELEMETRY },
      orderBy: { recordedAt: 'asc' },
    });

    const enclosing = deriveSecondAlignedEnclosingWindow(trip.startTime.getTime(), trip.endTime.getTime());
    const windowFrom = enclosing.fromUtc;
    const windowTo = enclosing.toUtc;

    const wpTimes = waypoints.map((w) => w.recordedAt.getTime());
    const cadence = analyzeInterWaypointCadence(wpTimes);

    const validWp = waypoints.filter((w) => isValidGeoCoordinate(w.latitude, w.longitude));
    const uniqueBuckets = new Set(validWp.map((w) => bucketFromDate(w.recordedAt)));

    const offlineCoverage = estimateTrustedCoverageFromWaypoints(
      validWp.map((w) => ({ recordedAt: w.recordedAt, latitude: w.latitude, longitude: w.longitude })),
      windowFrom,
      windowTo,
    );

    const computeForL3 = computeDiV0TripIntervals(
      {
        sourceFamily: 'RUPTELA_R1',
        positions: waypointsToPositionGrid(
          validWp.map((w) => ({ recordedAt: w.recordedAt, latitude: w.latitude, longitude: w.longitude })),
          windowFrom,
          windowTo,
        ),
        r1Obd: [],
        nativeEvents: [],
      },
      { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE },
    );
    const l3ByBucket = new Map(computeForL3.intervals.map((i) => [i.referenceTime, i.estimatedSpeedKmh]));
    const wpByBucket = new Set(validWp.map((w) => bucketFromDate(w.recordedAt)));

    const nativeAlignments: NativeAlignmentRow[] = natives.map((e) => {
      const bucket = bucketFromDate(e.recordedAt);
      const t = e.recordedAt.getTime();
      let best: number | null = null;
      for (const w of validWp) {
        const d = Math.abs(w.recordedAt.getTime() - t);
        if (best == null || d < best) best = d;
      }
      return {
        eventId: e.id,
        eventType: String(e.eventType),
        recordedAtUtc: e.recordedAt.toISOString(),
        bucketLabelUtc: bucket,
        waypointAtBucket: wpByBucket.has(bucket),
        nearestWaypointDeltaMs: best,
        eventSpeedKmh: e.speedKmh,
        l3SpeedAtBucketKmh: l3ByBucket.get(bucket) ?? null,
      };
    });

    const boundaryAdmission = (trip.rawDetectionMeta as Record<string, unknown> | null)?.diV0BoundaryAdmissionV1;

    const analyticsRows = await prisma.analyticsCache.count({
      where: {
        vehicleId: LDI07_VEHICLE_ID,
        rangeFrom: { lte: trip.endTime },
        rangeTo: { gte: trip.startTime },
      },
    });

    let alternatePinSummary: Record<string, unknown> | null = null;
    const altWi = await prisma.diV0S4WorkItem.findFirst({
      where: {
        tripId: LDI07_FUSION_ALTERNATE_TRIP_ID,
        organizationId: LDI07_ORG_ID,
        status: 'COMPLETED',
        pinnedSnapshotHash: { not: null },
      },
      select: { id: true, pinnedSnapshotHash: true },
    });
    if (altWi?.pinnedSnapshotHash) {
      const altCtx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
        organizationId: LDI07_ORG_ID,
        tripId: LDI07_FUSION_ALTERNATE_TRIP_ID,
        workItemId: altWi.id,
      });
      alternatePinSummary = {
        tripId: LDI07_FUSION_ALTERNATE_TRIP_ID,
        workItemId: altWi.id,
        shadowIntervals: altCtx.shadowIntervals.length,
        positionPresent: altCtx.evidence.positions.filter((p) => p.availability === 'PRESENT').length,
        r1ObdNumeric: altCtx.evidence.r1Obd.filter((r) => r.speedKmh != null).length,
      };
    }

    const rawGpsAvailable =
      waypoints.length > 0 ? 'YES_vehicle_trip_waypoints' : positionUpdates > 0 ? 'YES_position_updates_only' : 'NO';

    const medianSec =
      cadence.medianDeltaMs != null ? `${(cadence.medianDeltaMs / 1000).toFixed(2)}s_median` : 'unknown';
    const p95Sec = cadence.p95DeltaMs != null ? `${(cadence.p95DeltaMs / 1000).toFixed(2)}s_p95` : 'unknown';
    const gpsCadence = `inter_waypoint_${medianSec}_${p95Sec}_unique_buckets_${uniqueBuckets.size}`;

    const gpsGaps = `gaps_gte_${cadence.summary.gapThresholdSeconds}s=${cadence.summary.gapsGte3s}_max_gap_s=${cadence.summary.maxGapSeconds.toFixed(1)}`;

    const missingPinCause: string[] = [];
    if (s4Items.length === 0) missingPinCause.push('NO_S4_WORK_ITEM_ROW');
    else missingPinCause.push(`S4_ROWS=${s4Items.length}`);
    if (!boundaryAdmission) missingPinCause.push('MISSING_diV0BoundaryAdmissionV1');
    else missingPinCause.push('HAS_boundary_admission_meta');

    const tripEndBeforeS4Era =
      trip.endTime < new Date('2026-10-01T00:00:00.000Z')
        ? 'LIKELY_PRE_S4_DISCOVERY_CONTAINMENT_OR_BACKLOG'
        : 'WITHIN_RECENT_WINDOW';

    const offlineFeasible =
      waypoints.length >= 10 && uniqueBuckets.size >= 10
        ? 'CONDITIONAL_YES_waypoint_grid_plus_computeDiV0TripIntervals_NOT_identical_to_provider_S4_pin'
        : 'NO_insufficient_waypoints';

    const expectedTrusted = `full_grid_${(offlineCoverage.trustedFraction * 100).toFixed(1)}pct_trusted_present_buckets_${(offlineCoverage.trustedFractionOnPresentBuckets * 100).toFixed(1)}pct_trusted_${offlineCoverage.presentIntervalCount}_of_${offlineCoverage.intervalCount}_seconds_with_waypoint`;

    const hfAvailable =
      trip.avgRpm != null || trip.avgThrottlePosition != null
        ? 'TRIP_AGGREGATE_ONLY_no_bucket_hf_without_S4_or_provider'
        : analyticsRows > 0
          ? 'ANALYTICS_CACHE_ROWS_present_not_bucketized'
          : 'NO_PERSISTED_HF_SERIES';

    const obdAvailable =
      trip.maxSpeedKmh != null
        ? 'TRIP_SUMMARY_maxSpeed_only_no_bucket_obd_without_S4_pin'
        : 'NO_PERSISTED_OBD_SERIES';

    const alignedCount = nativeAlignments.filter((r) => r.waypointAtBucket).length;
    const nativeAligned = `${alignedCount}_of_${natives.length}_exact_bucket_waypoint_overlap`;

    const independentValidationFeasible =
      alignedCount === natives.length && offlineCoverage.trustedFraction > 0.2
        ? 'PARTIAL_event_speed_vs_L3_with_circular_dependency_risk_same_DIMO_lineage'
        : 'LIMITED_gaps_or_missing_waypoints_at_event_buckets';

    const fusionReadiness =
      s4Items.some((w) => w.pinnedSnapshotHash)
        ? 'YES_EXISTING_PIN'
        : offlineFeasible.startsWith('CONDITIONAL')
          ? 'CONDITIONAL_OFFLINE_L3_ONLY_no_hf_obd_pin'
          : 'NO';

    const audit = {
      schema: 'LDI07_HISTORICAL_S4_RECONSTRUCTION_V1',
      headSha,
      observedAtUtc: new Date().toISOString(),
      vehicleId: LDI07_VEHICLE_ID,
      primaryTripId: LDI07_PRIMARY_TRIP_ID,
      trip: {
        startUtc: trip.startTime.toISOString(),
        endUtc: trip.endTime.toISOString(),
        status: String(trip.tripStatus),
        dimoSegmentId: trip.dimoSegmentId,
        durationMinutes: (trip.endTime.getTime() - trip.startTime.getTime()) / 60000,
      },
      acquisitionWindow: { fromUtc: windowFrom, toUtc: windowTo, widening: enclosing },
      rawGps: {
        vehicleTripWaypointCount: waypoints.length,
        validCoordinateCount: validWp.length,
        uniqueSecondBuckets: uniqueBuckets.size,
        vehiclePositionUpdatesInTripWindow: positionUpdates,
        routeArtifact: routeArtifact
          ? {
              routeQuality: String(routeArtifact.routeQuality),
              sourcePointCount: routeArtifact.sourcePointCount,
              algorithmVersion: routeArtifact.algorithmVersion,
              provider: routeArtifact.provider,
            }
          : null,
        provenance: 'VehicleTripWaypoint canonical measured route; S4 production uses DIMO historical position query at pin time',
      },
      cadence: cadence,
      s4PinAbsence: {
        workItems: s4Items,
        missingPinHypothesis: missingPinCause,
        tripEndEraNote: tripEndBeforeS4Era,
        boundaryAdmission,
      },
      offlineReconstruction: {
        algorithm: 'computeDiV0TripIntervals+evaluateDiV0SpeedQcInterval_v2',
        intervalCount: offlineCoverage.intervalCount,
        trustedFraction: offlineCoverage.trustedFraction,
        trustedOrLimitedFraction: offlineCoverage.trustedLimitedFraction,
        trustedFractionOnPresentBuckets: offlineCoverage.trustedFractionOnPresentBuckets,
        trustedOrLimitedOnPresentBuckets: offlineCoverage.trustedOrLimitedOnPresentBuckets,
        presentIntervalCount: offlineCoverage.presentIntervalCount,
        caveats: [
          '7s waypoint cadence vs 1Hz QC grid yields ROW_ABSENT majority — no gap interpolation',
          'Waypoints are trip-mirrored observations not byte-identical to S4 pinned POSITION channel',
          'No R1_OBD channel in offline path — OBD corroboration absent',
          'No production writes; not a substitute for owner-approved S4 backfill',
        ],
      },
      hfObdIndependent: { hfAvailable, obdAvailable, analyticsCacheOverlapRows: analyticsRows },
      nativeEventAlignments: nativeAlignments,
      fusionAlternateSecondary: alternatePinSummary,
      circularDependencyNote:
        'Native TELEMETRY_EVENTS and trip waypoints both derive from DIMO/Ruptela ingestion; event.speedKmh is not an independent kinematic witness.',
    };

    fs.writeFileSync(path.join(outDir, 'LDI07_S4_RECONSTRUCTION_AUDIT.json'), JSON.stringify(audit, null, 2));

    fs.writeFileSync(
      path.join(outDir, 'LDI07_S4_RECONSTRUCTION.md'),
      [
        '# LDI07 — Historical S4 reconstruction feasibility',
        '',
        `**Vehicle:** \`${LDI07_VEHICLE_ID}\``,
        `**Primary trip:** \`${LDI07_PRIMARY_TRIP_ID}\``,
        `**Window:** ${trip.startTime.toISOString()} → ${trip.endTime.toISOString()}`,
        '',
        '## Raw GPS',
        '',
        `- Waypoints: **${waypoints.length}** (${validWp.length} valid coords, ${uniqueBuckets.size} unique 1 Hz buckets)`,
        `- Position updates in window: **${positionUpdates}**`,
        `- Cadence: ${gpsCadence}`,
        `- Gaps: ${gpsGaps}`,
        '',
        '## Missing S4 pin',
        '',
        `- Work items: ${s4Items.length === 0 ? '**none**' : s4Items.map((w) => `${w.status}`).join(', ')}`,
        `- Boundary admission meta: ${boundaryAdmission ? 'present' : '**absent**'}`,
        `- Assessment: ${missingPinCause.join('; ')}; ${tripEndBeforeS4Era}`,
        '',
        '## Offline L3/QC (no writes)',
        '',
        `- Feasible: **${offlineFeasible}**`,
        `- Expected trusted coverage: **${expectedTrusted}** (${offlineCoverage.intervalCount} intervals)`,
        '',
        '## Native events (6)',
        '',
        ...nativeAlignments.map(
          (r) =>
            `- \`${r.eventType}\` @ ${r.recordedAtUtc} bucket=${r.bucketLabelUtc} waypoint=${r.waypointAtBucket} Δwp=${r.nearestWaypointDeltaMs}ms L3=${r.l3SpeedAtBucketKmh ?? 'null'} eventSpd=${r.eventSpeedKmh ?? 'null'}`,
        ),
        '',
        '## Fusion alternate (secondary)',
        '',
        alternatePinSummary
          ? `- \`${LDI07_FUSION_ALTERNATE_TRIP_ID}\` — pinned shadow ${alternatePinSummary.shadowIntervals} intervals`
          : '- n/a',
        '',
        '## Independent validation',
        '',
        `- **${independentValidationFeasible}**`,
      ].join('\n'),
    );

    const resultLines = buildLdi07ResultLines({
      rawGpsAvailable: rawGpsAvailable,
      gpsSampleCount: waypoints.length,
      gpsCadence,
      gpsGaps,
      offlineFeasible: offlineFeasible.replace(/\s+/g, '_'),
      expectedTrustedCoverage: expectedTrusted.replace(/\s+/g, '_'),
      hfAvailable: hfAvailable.replace(/\s+/g, '_'),
      obdAvailable: obdAvailable.replace(/\s+/g, '_'),
      nativeAligned,
      independentValidationFeasible: independentValidationFeasible.replace(/\s+/g, '_'),
      fusionReadiness,
      nextSafeAction: 'Owner_approved_S4_discovery_backfill_OR_LDI03_pin_on_alternate_only',
    });
    fs.writeFileSync(path.join(outDir, 'LDI07_RESULT.txt'), resultLines.join('\n') + '\n');

    console.log(JSON.stringify({ ok: true, waypoints: waypoints.length, trustedPct: offlineCoverage.trustedFraction }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
