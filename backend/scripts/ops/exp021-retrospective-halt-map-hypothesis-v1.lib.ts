/**
 * EXP021 offline map decision hypothesis V1 — separate from frozen v0_2 classifier.
 * Proximity alone never creates LIKELY_HALT.
 */
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/geo/haversine';
import { bucketLabelToMs } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import type { RetrospectiveExplanation } from './exp021-retrospective-halt-prototype.lib';
import type { GapBracketStructure } from './exp021-retrospective-halt-prototype-v2.lib';
import type { PresentPoint } from './exp021-retrospective-halt-prototype.lib';

export const MAP_DECISION_HYPOTHESIS_V1_ID = 'EXP021_MAP_DECISION_HYPOTHESIS_V1';

/** Frozen before evaluation — do not tune on this trip after seeing outcomes. */
export const MAP_DECISION_HYPOTHESIS_V1_RULES = {
  id: MAP_DECISION_HYPOTHESIS_V1_ID,
  purpose: 'Single offline experiment: map may adjust class only under fixed rules; v0_2 remains baseline.',
  neverFromMapAlone: ['LIKELY_HALT'],
  alongRouteMaxM_forSignalContext: 35,
  bearingDeltaMaxDeg_forSignalContext: 50,
  alongRouteMinM_toWeakenHalt: 80,
  alongRouteMaxM_movingThroughSignalCounter: 25,
  allowedUpgrades: {
    NOT_DISTINGUISHABLE_to: 'LIKELY_SLOW_ROLL_STOP_GO',
    condition:
      'nearest signal along measured path ≤35m AND bearingΔ≤50° AND at least one gap-edge leg is MOVING or SLOW_ROLL',
  },
  allowedDowngrades: [
    {
      from: 'LIKELY_HALT',
      to: 'NOT_DISTINGUISHABLE',
      condition: 'along-route signal distance >80m (halt-at-intersection less plausible)',
    },
    {
      from: 'LIKELY_HALT',
      to: 'LIKELY_MOVING_WITH_GAP',
      condition:
        'both gap-edge legs MOVING_GEOMETRY AND signal ≤25m along path (counter: roll-through at signal without stop evidence)',
    },
  ],
  dataLimits: [
    'Route = polyline of PRESENT points ±60s around gap (no OSM routing graph).',
    'Signals = frozen OSM traffic_signals from prior Overpass export only.',
    'No street-name join; roadAssociation not resolved.',
    'No red-phase or historical signal state.',
  ],
} as const;

export type OsmSignal = { id: number; lat: number; lon: number };

export type MapAssociationAnalysis = {
  signalCandidates: Array<{
    id: number;
    euclideanM: number;
    alongRouteM: number | null;
    bearingDeltaDeg: number | null;
  }>;
  nearestAlongRoute: {
    id: number;
    alongRouteM: number;
    euclideanM: number;
    bearingDeltaDeg: number | null;
  } | null;
  routeBasis: {
    presentPointCount: number;
    windowUtc: { from: string; to: string };
    note: string;
  };
  missingData: string[];
  alternativesNote: string;
};

function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function polylineForGapWindow(
  presentPoints: PresentPoint[],
  gapFrom: string,
  gapTo: string,
  padSec = 60,
): PresentPoint[] {
  const t0 = bucketLabelToMs(gapFrom) - padSec * 1000;
  const t1 = bucketLabelToMs(gapTo) + padSec * 1000;
  return presentPoints.filter((p) => {
    const t = bucketLabelToMs(p.bucketLabelUtc);
    return t >= t0 && t <= t1;
  });
}

/** Approximate along-route distance from path start to closest path point to `at`, then to signal via that vertex. */
function alongRouteViaClosestVertex(
  path: PresentPoint[],
  at: { lat: number; lon: number },
  signal: OsmSignal,
): { alongRouteM: number; euclideanAtToSignal: number } | null {
  if (path.length < 2) return null;
  let bestIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < path.length; i += 1) {
    const d = haversineMeters(at.lat, at.lon, path[i].lat, path[i].lon);
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  let along = 0;
  for (let i = 1; i <= bestIdx; i += 1) {
    along += haversineMeters(path[i - 1].lat, path[i - 1].lon, path[i].lat, path[i].lon);
  }
  const vertex = path[bestIdx];
  const hopToSignal = haversineMeters(vertex.lat, vertex.lon, signal.lat, signal.lon);
  return { alongRouteM: along + hopToSignal, euclideanAtToSignal: hopToSignal };
}

export function analyzeMapAssociation(args: {
  gapFromUtc: string;
  gapToUtc: string;
  brackets: GapBracketStructure;
  presentPoints: PresentPoint[];
  signals: OsmSignal[];
}): MapAssociationAnalysis {
  const path = polylineForGapWindow(args.presentPoints, args.gapFromUtc, args.gapToUtc);
  const mid =
    args.brackets.calendarAdjacentBefore ??
    args.brackets.calendarAdjacentAfter ??
    path[Math.floor(path.length / 2)] ??
    null;
  const missing: string[] = [];
  if (path.length < 3) missing.push('insufficient_present_polyline_near_gap');
  if (args.signals.length === 0) missing.push('no_osm_traffic_signals_in_frozen_export');

  const travelBearing =
    args.brackets.calendarAdjacentBefore && args.brackets.calendarAdjacentAfter
      ? bearingDeg(args.brackets.calendarAdjacentBefore, args.brackets.calendarAdjacentAfter)
      : null;

  const candidates = args.signals
    .map((s) => {
      if (!mid) {
        return { id: s.id, euclideanM: Infinity, alongRouteM: null, bearingDeltaDeg: null };
      }
      const euclideanM = haversineMeters(mid.lat, mid.lon, s.lat, s.lon);
      const along = path.length >= 2 ? alongRouteViaClosestVertex(path, mid, s) : null;
      const bToSig = bearingDeg(mid, { lat: s.lat, lon: s.lon });
      let bearingDeltaDeg: number | null = null;
      if (travelBearing != null) {
        bearingDeltaDeg = Math.abs(travelBearing - bToSig);
        if (bearingDeltaDeg > 180) bearingDeltaDeg = 360 - bearingDeltaDeg;
      } else missing.push('travel_bearing_unresolved');
      return {
        id: s.id,
        euclideanM,
        alongRouteM: along?.alongRouteM ?? null,
        bearingDeltaDeg,
      };
    })
    .sort((a, b) => (a.alongRouteM ?? a.euclideanM) - (b.alongRouteM ?? b.euclideanM))
    .slice(0, 8);

  const withAlong = candidates.filter((c) => c.alongRouteM != null);
  const nearestAlongRoute =
    withAlong.length > 0
      ? {
          id: withAlong[0].id,
          alongRouteM: withAlong[0].alongRouteM!,
          euclideanM: withAlong[0].euclideanM,
          bearingDeltaDeg: withAlong[0].bearingDeltaDeg,
        }
      : null;

  return {
    signalCandidates: candidates,
    nearestAlongRoute,
    routeBasis: {
      presentPointCount: path.length,
      windowUtc: {
        from: new Date(bucketLabelToMs(args.gapFromUtc) - 60000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        to: new Date(bucketLabelToMs(args.gapToUtc) + 60000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      },
      note: 'Measured PRESENT polyline ±60s; not OSM-driven route.',
    },
    missingData: [...new Set(missing)],
    alternativesNote:
      'Other signals may align on parallel carriageway; no turn restriction or lane join — assignment ambiguous without road graph.',
  };
}

export function applyMapDecisionHypothesisV1(args: {
  classificationV02: RetrospectiveExplanation;
  map: MapAssociationAnalysis;
  legIntoGapClass: string | null;
  legOutOfGapClass: string | null;
}): {
  classificationWithMapV1: RetrospectiveExplanation;
  changed: boolean;
  ruleFired: string | null;
} {
  const v02 = args.classificationV02;
  const sig = args.map.nearestAlongRoute;
  const rules = MAP_DECISION_HYPOTHESIS_V1_RULES;

  if (!sig) {
    return { classificationWithMapV1: v02, changed: false, ruleFired: null };
  }

  const edgeMoving =
    args.legIntoGapClass === 'MOVING_GEOMETRY' || args.legOutOfGapClass === 'MOVING_GEOMETRY';
  const edgeSlow =
    args.legIntoGapClass === 'SLOW_ROLL_GEOMETRY' || args.legOutOfGapClass === 'SLOW_ROLL_GEOMETRY';

  if (
    v02 === 'NOT_DISTINGUISHABLE' &&
    sig.alongRouteM <= rules.alongRouteMaxM_forSignalContext &&
    (sig.bearingDeltaDeg ?? 999) <= rules.bearingDeltaMaxDeg_forSignalContext &&
    (edgeMoving || edgeSlow)
  ) {
    return {
      classificationWithMapV1: 'LIKELY_SLOW_ROLL_STOP_GO',
      changed: true,
      ruleFired: 'V1_UPGRADE_ND_TO_SLOW_ROLL_AT_SIGNAL_CONTEXT',
    };
  }

  if (v02 === 'LIKELY_HALT' && sig.alongRouteM > rules.alongRouteMinM_toWeakenHalt) {
    return {
      classificationWithMapV1: 'NOT_DISTINGUISHABLE',
      changed: true,
      ruleFired: 'V1_DOWNGRADE_HALT_FAR_FROM_SIGNAL',
    };
  }

  if (
    v02 === 'LIKELY_HALT' &&
    args.legIntoGapClass === 'MOVING_GEOMETRY' &&
    args.legOutOfGapClass === 'MOVING_GEOMETRY' &&
    sig.alongRouteM <= rules.alongRouteMaxM_movingThroughSignalCounter
  ) {
    return {
      classificationWithMapV1: 'LIKELY_MOVING_WITH_GAP',
      changed: true,
      ruleFired: 'V1_COUNTER_ROLL_THROUGH_NEAR_SIGNAL',
    };
  }

  return { classificationWithMapV1: v02, changed: false, ruleFired: null };
}
