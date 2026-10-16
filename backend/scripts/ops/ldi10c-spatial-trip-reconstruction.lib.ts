/**
 * LDI-10C Phase 1 — spatial-temporal trip reconstruction (offline frozen LDI-08…10B).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { LDI08_EXPECTED_PINNED_HASH, LDI08_TRIP_ID, LDI08_VEHICLE_ID } from './ldi08-r1-fusion-replay.lib';
import { sha256File, verifyArtifactProvenance } from './ldi10a-longitudinal-candidate-forensics.lib';
import { loadLdi08Artifacts, type Ldi08Row } from './ldi09-accel-decel-signal-forensics.lib';

export const LDI10C_EXPECTED_SNAPSHOT_SHA256 =
  'effe180fe128a6c9f5c5f74f52f34ddc0c7d6f9960825d55573b02ca5b2f7009';

export const LDI10C_TEMPORAL_MATCH = {
  mode: 'exact_1s_calendar_bucket_inclusive',
  toleranceMs: 0,
  description:
    'Rows selected when evaluationIndexUtc is within [maneuver.startUtc, maneuver.endUtc] inclusive; no sub-second slack or interpolation.',
};

export const LDI10C_SPATIAL_MATCH = {
  mode: 'observed_gps_per_bucket_only',
  interpolationForbidden: true,
  description:
    'Coordinates taken only from gps.availability=PRESENT rows in the temporal window; ROW_ABSENT buckets omitted from geometry.',
};

/** Descriptive kinematic screen — not a map feature claim. */
const CURVATURE_BEARING_DELTA_DEG = 25;
const LOW_SPEED_STOP_CANDIDATE_KMH = 5;

export type Ldi10bGroup = {
  groupId: string;
  kind: string;
  taxonomy: string;
  windowUtc: { start: string; end: string };
  candidateIds: string[];
  stepCount: number;
  speedStartKmh: number | null;
  speedEndKmh: number | null;
  plausibilityVerdict: string;
  qcInWindow: {
    bucketsInWindow: number;
    trusted: number;
    trustedLimited: number;
    untrusted: number;
    rowAbsentGps: number;
  };
  meanObservedLongitudinalAccelMs2: number | null;
  maxAbsObservedLongitudinalAccelMs2: number | null;
};

export type RoutePoint = {
  evaluationIndexUtc: string;
  longitude: number;
  latitude: number;
  l3SpeedKmh: number | null;
  l3QcTrustLevel: string;
  gpsProvenance: string;
};

export function bucketMs(label: string): number {
  return Date.parse(label);
}

export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function normalizeBearingDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

export function verifyLdi10cProvenance(repoRoot: string): {
  ok: boolean;
  errors: string[];
  hashes: Record<string, string | null>;
  pinnedSnapshotHash: string;
} {
  const errors: string[] = [];
  const prov = verifyArtifactProvenance(repoRoot);
  const snapSha = prov.ldi08CombinedSnapshotSha256;
  if (snapSha !== LDI10C_EXPECTED_SNAPSHOT_SHA256) {
    errors.push(`LDI08 snapshot SHA mismatch: got ${snapSha}`);
  }
  const pin = prov.pinnedSnapshotHash;
  if (pin !== LDI08_EXPECTED_PINNED_HASH) {
    errors.push(`Pin hash mismatch: got ${pin}`);
  }

  const paths = {
    ldi08CombinedSnapshot: path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-08/LDI08_COMBINED_SNAPSHOT.json'),
    ldi10bPhysics: path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10/LDI10B_MANEUVER_PHYSICS.json'),
    ldi10aAudit: path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10/LDI10A_CANDIDATE_AUDIT.json'),
  };
  const hashes: Record<string, string | null> = {
    ldi08CombinedSnapshotSha256: snapSha,
    ldi08CandidatesSha256: prov.ldi08AccelDecelCandidatesSha256,
    ldi10aCandidateAuditSha256: fs.existsSync(paths.ldi10aAudit) ? sha256File(paths.ldi10aAudit) : null,
    ldi10bManeuverPhysicsSha256: fs.existsSync(paths.ldi10bPhysics) ? sha256File(paths.ldi10bPhysics) : null,
  };
  if (!fs.existsSync(paths.ldi10bPhysics)) errors.push('Missing LDI10B_MANEUVER_PHYSICS.json');

  const physics = fs.existsSync(paths.ldi10bPhysics)
    ? (JSON.parse(fs.readFileSync(paths.ldi10bPhysics, 'utf8')) as { reproduction?: { candidateCount?: number; groupCount?: number } })
    : null;
  if (physics?.reproduction?.groupCount !== 32) errors.push('LDI10B groupCount != 32');
  if (physics?.reproduction?.candidateCount !== 75) errors.push('LDI10B candidateCount != 75');

  return { ok: errors.length === 0, errors, hashes, pinnedSnapshotHash: pin };
}

export function loadLdi10bGroups(repoRoot: string): Ldi10bGroup[] {
  const p = path.join(repoRoot, 'architecture/drivingintelligence/evidence/ldi-10/LDI10B_MANEUVER_PHYSICS.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as { groups: Ldi10bGroup[] };
  return raw.groups;
}

export function buildObservedRoute(rows: Ldi08Row[]): RoutePoint[] {
  const out: RoutePoint[] = [];
  for (const r of rows) {
    if (r.gps.availability !== 'PRESENT' || r.gps.latitude == null || r.gps.longitude == null) continue;
    out.push({
      evaluationIndexUtc: r.evaluationIndexUtc,
      longitude: r.gps.longitude,
      latitude: r.gps.latitude,
      l3SpeedKmh: r.l3.speedKmh,
      l3QcTrustLevel: r.l3.qcTrustLevel,
      gpsProvenance: r.gps.provenance ?? 'S4_POSITION_PIN',
    });
  }
  return out;
}

export function rowsInInclusiveWindow(rows: Ldi08Row[], startUtc: string, endUtc: string): Ldi08Row[] {
  const a = bucketMs(startUtc);
  const b = bucketMs(endUtc);
  return rows.filter((r) => {
    const t = bucketMs(r.evaluationIndexUtc);
    return t >= a && t <= b;
  });
}

export function matchManeuverTrajectory(
  group: Ldi10bGroup,
  rows: Ldi08Row[],
): {
  matchedBucketUtc: string[];
  gpsPresentInWindow: number;
  gpsAbsentInWindow: number;
  pathCoordinates: Array<[number, number]>;
  pathLengthM: number;
  bearingStartDeg: number | null;
  bearingEndDeg: number | null;
  centroid: { latitude: number; longitude: number } | null;
  speedProgressionKmh: Array<{ utc: string; speedKmh: number | null; qc: string }>;
} {
  const windowRows = rowsInInclusiveWindow(rows, group.windowUtc.start, group.windowUtc.end);
  const gpsPresent = windowRows.filter(
    (r) => r.gps.availability === 'PRESENT' && r.gps.latitude != null && r.gps.longitude != null,
  );
  const pathCoordinates: Array<[number, number]> = gpsPresent.map((r) => [r.gps.longitude!, r.gps.latitude!]);
  let pathLengthM = 0;
  for (let i = 1; i < gpsPresent.length; i++) {
    pathLengthM += haversineMeters(
      gpsPresent[i - 1].gps.latitude!,
      gpsPresent[i - 1].gps.longitude!,
      gpsPresent[i].gps.latitude!,
      gpsPresent[i].gps.longitude!,
    );
  }
  const bearingStartDeg =
    gpsPresent.length >= 2
      ? bearingDeg(
          gpsPresent[0].gps.latitude!,
          gpsPresent[0].gps.longitude!,
          gpsPresent[1].gps.latitude!,
          gpsPresent[1].gps.longitude!,
        )
      : null;
  const bearingEndDeg =
    gpsPresent.length >= 2
      ? bearingDeg(
          gpsPresent[gpsPresent.length - 2].gps.latitude!,
          gpsPresent[gpsPresent.length - 2].gps.longitude!,
          gpsPresent[gpsPresent.length - 1].gps.latitude!,
          gpsPresent[gpsPresent.length - 1].gps.longitude!,
        )
      : null;
  const centroid =
    gpsPresent.length > 0
      ? {
          latitude: gpsPresent.reduce((s, r) => s + r.gps.latitude!, 0) / gpsPresent.length,
          longitude: gpsPresent.reduce((s, r) => s + r.gps.longitude!, 0) / gpsPresent.length,
        }
      : null;

  return {
    matchedBucketUtc: gpsPresent.map((r) => r.evaluationIndexUtc),
    gpsPresentInWindow: gpsPresent.length,
    gpsAbsentInWindow: windowRows.length - gpsPresent.length,
    pathCoordinates,
    pathLengthM,
    bearingStartDeg,
    bearingEndDeg,
    centroid,
    speedProgressionKmh: windowRows.map((r) => ({
      utc: r.evaluationIndexUtc,
      speedKmh: r.l3.speedKmh,
      qc: r.l3.qcTrustLevel,
    })),
  };
}

export function detectCurvatureProxies(route: RoutePoint[]): Array<{
  evaluationIndexUtc: string;
  bearingDeltaDeg: number;
  epistemic: 'OBSERVED_GPS_BEARING_CHANGE';
  notMapVerifiedCurve: true;
}> {
  const hits: Array<{
    evaluationIndexUtc: string;
    bearingDeltaDeg: number;
    epistemic: 'OBSERVED_GPS_BEARING_CHANGE';
    notMapVerifiedCurve: true;
  }> = [];
  for (let i = 2; i < route.length; i++) {
    const b1 = bearingDeg(route[i - 2].latitude, route[i - 2].longitude, route[i - 1].latitude, route[i - 1].longitude);
    const b2 = bearingDeg(route[i - 1].latitude, route[i - 1].longitude, route[i].latitude, route[i].longitude);
    const d = normalizeBearingDelta(b1, b2);
    if (d >= CURVATURE_BEARING_DELTA_DEG) {
      hits.push({
        evaluationIndexUtc: route[i - 1].evaluationIndexUtc,
        bearingDeltaDeg: d,
        epistemic: 'OBSERVED_GPS_BEARING_CHANGE',
        notMapVerifiedCurve: true,
      });
    }
  }
  return hits;
}

export function detectLowSpeedStopCandidates(route: RoutePoint[]): Array<{
  evaluationIndexUtc: string;
  l3SpeedKmh: number;
  epistemic: 'OBSERVED_L3_SPEED';
  notMapVerifiedStop: true;
}> {
  return route
    .filter((p) => p.l3SpeedKmh != null && p.l3SpeedKmh <= LOW_SPEED_STOP_CANDIDATE_KMH)
    .map((p) => ({
      evaluationIndexUtc: p.evaluationIndexUtc,
      l3SpeedKmh: p.l3SpeedKmh!,
      epistemic: 'OBSERVED_L3_SPEED' as const,
      notMapVerifiedStop: true as const,
    }));
}

export type SequentialPattern = {
  patternId: string;
  type: 'SEQUENTIAL_CHAIN' | 'STOP_AND_GO_CANDIDATE' | 'REPEATED_DECEL_ACCEL' | 'OVERSEGMENTATION_CLUSTER';
  groupIds: string[];
  gapMsBetweenGroups: number | null;
  note: string;
  notDriverIntent: true;
};

export function analyzeSequentialPatterns(
  groups: Array<Ldi10bGroup & { spatial: { gapToNextGroupMs: number | null } }>,
): SequentialPattern[] {
  const sorted = [...groups].sort((a, b) => a.windowUtc.start.localeCompare(b.windowUtc.start));
  const patterns: SequentialPattern[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const g0 = sorted[i];
    const g1 = sorted[i + 1];
    const gap = bucketMs(g1.windowUtc.start) - bucketMs(g0.windowUtc.end);
    if (gap === 0) {
      patterns.push({
        patternId: `CHAIN_${g0.groupId}_${g1.groupId}`,
        type: 'SEQUENTIAL_CHAIN',
        groupIds: [g0.groupId, g1.groupId],
        gapMsBetweenGroups: gap,
        note: 'Adjacent 1s buckets with no pause — continuous longitudinal activity split into separate maneuver groups.',
        notDriverIntent: true,
      });
      if (g0.kind !== g1.kind) {
        patterns.push({
          patternId: `REPEAT_${g0.groupId}_${g1.groupId}`,
          type: 'REPEATED_DECEL_ACCEL',
          groupIds: [g0.groupId, g1.groupId],
          gapMsBetweenGroups: gap,
          note: 'Alternating or adjacent opposite-sign groups — kinematic pattern only.',
          notDriverIntent: true,
        });
        if (g0.kind === 'DECELERATION' && g1.kind === 'ACCELERATION') {
          patterns.push({
            patternId: `STOPGO_${g0.groupId}_${g1.groupId}`,
            type: 'STOP_AND_GO_CANDIDATE',
            groupIds: [g0.groupId, g1.groupId],
            gapMsBetweenGroups: gap,
            note: 'Decel immediately followed by accel on grid — possible stop-and-go; not verified standstill without dense speed+GPS.',
            notDriverIntent: true,
          });
        }
      }
    }
  }
  const singles = sorted.filter((g) => g.stepCount === 1);
  if (singles.length >= 5) {
    patterns.push({
      patternId: 'OVERSEGMENTATION_SINGLE_STEP_CLUSTER',
      type: 'OVERSEGMENTATION_CLUSTER',
      groupIds: singles.map((g) => g.groupId),
      gapMsBetweenGroups: null,
      note: `${singles.length} single-step groups — consistent with LDI-10B oversplitRisk on ±3 km/h gate.`,
      notDriverIntent: true,
    });
  }
  return patterns;
}

export function runLdi10cReconstruction(repoRoot: string) {
  const provenance = verifyLdi10cProvenance(repoRoot);
  const { snapshot } = loadLdi08Artifacts(repoRoot);
  const rows = snapshot.rows;
  const groups10b = loadLdi10bGroups(repoRoot);

  const route = buildObservedRoute(rows);
  const bbox = route.reduce(
    (b, p) => ({
      south: Math.min(b.south, p.latitude),
      north: Math.max(b.north, p.latitude),
      west: Math.min(b.west, p.longitude),
      east: Math.max(b.east, p.longitude),
    }),
    { south: 90, north: -90, west: 180, east: -180 },
  );

  const curvatureProxies = detectCurvatureProxies(route);
  const stopCandidates = detectLowSpeedStopCandidates(route);

  const nativeCornerBuckets: string[] = [];
  for (const r of rows) {
    const ev = r.nativeEventsAtIndex as Array<{ type?: string }> | undefined;
    if (ev?.some((e) => String(e.type ?? '').toLowerCase().includes('corner'))) {
      nativeCornerBuckets.push(r.evaluationIndexUtc);
    }
  }

  const mapContext = {
    frozenOsmArtifactInPr2051: false,
    blocker:
      'No trip-scoped frozen OpenStreetMap/Overpass export in ldi-08/09/10/10b for f3e1fa83; offline mode forbids live Overpass fetch.',
    bboxFromObservedGps: bbox,
    verifiedFromPinOnly: {
      gpsPolylinePointCount: route.length,
      curvatureBearingProxyCount: curvatureProxies.length,
      lowSpeedL3StopCandidateCount: stopCandidates.length,
      nativeCornerEventBuckets: nativeCornerBuckets,
    },
    hypothesesNotVerified: [
      'intersection_proximity',
      'traffic_signal_proximity',
      'named_road_geometry',
      'braking_cause_from_map',
    ],
    referenceOnlyExternalOsm:
      'EXP021 retrospective halt exports exist for other workflows — not bound to this trip in frozen LDI chain.',
  };

  const maneuverTimeline: Array<Record<string, unknown>> = [];
  const groupAudits: Array<Record<string, unknown>> = [];

  const enrichedGroups: Array<Ldi10bGroup & { spatial: ReturnType<typeof matchManeuverTrajectory> & { gapToNextGroupMs: number | null } }> =
    [];

  const sortedIds = [...groups10b].sort((a, b) => a.windowUtc.start.localeCompare(b.windowUtc.start));

  for (let i = 0; i < sortedIds.length; i++) {
    const g = sortedIds[i];
    const spatial = matchManeuverTrajectory(g, rows);
    const next = sortedIds[i + 1];
    const gapToNextGroupMs = next ? bucketMs(next.windowUtc.start) - bucketMs(g.windowUtc.end) : null;
    const touchesUntrusted = g.qcInWindow.untrusted > 0;
    const plausibilityPreserved = g.plausibilityVerdict;

    enrichedGroups.push({ ...g, spatial: { ...spatial, gapToNextGroupMs } });

    maneuverTimeline.push({
      sequenceIndex: i + 1,
      groupId: g.groupId,
      kind: g.kind,
      taxonomy: g.taxonomy,
      windowUtc: g.windowUtc,
      candidateIds: g.candidateIds,
      candidateCount: g.candidateIds.length,
      plausibilityVerdict: plausibilityPreserved,
      touchesUntrustedQcBucket: touchesUntrusted,
      untrustedBucketsInWindow: g.qcInWindow.untrusted,
      speedStartKmh: g.speedStartKmh,
      speedEndKmh: g.speedEndKmh,
      meanAccelMs2: g.meanObservedLongitudinalAccelMs2,
      maxAbsAccelMs2: g.maxAbsObservedLongitudinalAccelMs2,
      spatialMatch: {
        temporalPolicy: LDI10C_TEMPORAL_MATCH,
        spatialPolicy: LDI10C_SPATIAL_MATCH,
        gpsPresentInWindow: spatial.gpsPresentInWindow,
        gpsAbsentInWindow: spatial.gpsAbsentInWindow,
        pathLengthM: spatial.pathLengthM,
        bearingStartDeg: spatial.bearingStartDeg,
        bearingEndDeg: spatial.bearingEndDeg,
        centroid: spatial.centroid,
        matchedBucketUtc: spatial.matchedBucketUtc,
      },
      speedProgression: spatial.speedProgressionKmh,
      limitations: touchesUntrusted
        ? ['UNTRUSTED_QC_in_window — promotion-grade spatial interpretation degraded per LDI-10B']
        : [],
    });

    const nearCurvature = curvatureProxies.filter((c) =>
      spatial.matchedBucketUtc.includes(c.evaluationIndexUtc),
    );
    const nearStop = stopCandidates.filter((s) => spatial.matchedBucketUtc.includes(s.evaluationIndexUtc));

    groupAudits.push({
      groupId: g.groupId,
      evidence: {
        candidates: g.candidateIds,
        ldi10bPlausibility: plausibilityPreserved,
        qcInWindow: g.qcInWindow,
        coordinates: spatial.pathCoordinates.length ? spatial.pathCoordinates : null,
        pathLengthM: spatial.pathLengthM,
      },
      spatialContext: {
        mapFeatures: 'UNAVAILABLE_FROZEN_OSM',
        observedCurvatureProxies: nearCurvature,
        observedLowSpeedBuckets: nearStop,
        notBrakeCauseNotIntent: true,
      },
      unresolvedQuestions: [
        ...(spatial.gpsAbsentInWindow > 0 ? [`${spatial.gpsAbsentInWindow} ROW_ABSENT buckets in window — geometry incomplete`] : []),
        ...(touchesUntrusted ? ['UNTRUSTED L3 QC overlaps maneuver — speed/coordinate coupling uncertain'] : []),
        ...(mapContext.frozenOsmArtifactInPr2051 === false ? ['Road network context requires owner-approved frozen OSM capture for bbox'] : []),
      ],
    });
  }

  const sequentialPatterns = analyzeSequentialPatterns(enrichedGroups);

  const plausible = groups10b.filter((g) => g.plausibilityVerdict === 'PLAUSIBLE').length;
  const unclear = groups10b.filter((g) => g.plausibilityVerdict === 'UNCLEAR_QC_OR_GAPS').length;
  const untrustedTouching = groups10b.filter((g) => g.qcInWindow.untrusted > 0).length;

  const geojson = {
    type: 'FeatureCollection',
    properties: {
      schema: 'LDI10C_ROUTE_GEOJSON_V1',
      tripId: LDI08_TRIP_ID,
      vehicleId: LDI08_VEHICLE_ID,
      productionMutations: 'NONE',
      provenance: {
        ...provenance.hashes,
        pinnedSnapshotHash: provenance.pinnedSnapshotHash,
        temporalMatch: LDI10C_TEMPORAL_MATCH,
        spatialMatch: LDI10C_SPATIAL_MATCH,
      },
      mapLayerStatus: 'NO_FROZEN_OSM_IN_CHAIN',
    },
    features: [
      {
        type: 'Feature',
        properties: {
          featureType: 'observed_gps_route',
          pointCount: route.length,
          bucketUtcParallel: route.map((p) => p.evaluationIndexUtc),
          source: 'LDI08_COMBINED_SNAPSHOT.gps PRESENT rows only',
        },
        geometry: {
          type: 'LineString',
          coordinates: route.map((p) => [p.longitude, p.latitude]),
        },
      },
      ...groups10b
        .map((g) => {
          const spatial = matchManeuverTrajectory(g, rows);
          const c = spatial.centroid;
          if (!c) return null;
          return {
            type: 'Feature' as const,
            properties: {
              featureType: 'maneuver_group_marker',
              groupId: g.groupId,
              kind: g.kind,
              taxonomy: g.taxonomy,
              plausibilityVerdict: g.plausibilityVerdict,
              touchesUntrustedQc: g.qcInWindow.untrusted > 0,
              candidateIds: g.candidateIds,
              windowUtc: g.windowUtc,
              pathLengthM: spatial.pathLengthM,
              gpsAbsentInWindow: spatial.gpsAbsentInWindow,
              notDriverIntentNotBrakeCause: true,
            },
            geometry: { type: 'Point' as const, coordinates: [c.longitude, c.latitude] },
          };
        })
        .filter(Boolean),
      ...groups10b
        .map((g) => {
          const spatial = matchManeuverTrajectory(g, rows);
          if (spatial.pathCoordinates.length < 2) return null;
          return {
            type: 'Feature' as const,
            properties: {
              featureType: 'maneuver_sub_route',
              groupId: g.groupId,
              matchedBucketUtc: spatial.matchedBucketUtc,
            },
            geometry: {
              type: 'LineString' as const,
              coordinates: spatial.pathCoordinates,
            },
          };
        })
        .filter(Boolean),
    ],
  };

  return {
    provenance,
    mapContext,
    route: { pointCount: route.length, bbox, route },
    maneuverTimeline,
    groupAudits,
    sequentialPatterns,
    geojson,
    summary: {
      groupCount: groups10b.length,
      candidateCount: groups10b.reduce((s, g) => s + g.candidateIds.length, 0),
      plausibleGroups: plausible,
      unclearGroups: unclear,
      untrustedTouchingGroups: untrustedTouching,
      sequentialPatternCount: sequentialPatterns.length,
    },
  };
}
