import { haversineMeters } from '../speed-qc/di-v0-speed-qc-geo';
import type { ResearchGpsBucket, ResearchRoadContext } from './contracts';
import type { S4ResearchAlgorithmConfig } from './config';
import { bearingDeg, headingDeltaDeg } from './geo';
import { nearestWayCandidates } from './osm-parse';
import type { InternalMatchOutcome } from './labels';

export type BaselineBucketMatch = {
  bucketLabelUtc: string;
  gpsStatus: ResearchGpsBucket['availability'];
  headingDeg: number | null;
  outcome: InternalMatchOutcome;
  osmWayId: number | null;
  candidateWayIds: number[];
  ambiguityReasons: string[];
  nearestConfirmedJunctionM: number | null;
  confirmedJunctionNodeId: number | null;
  trafficSignalNodeId: number | null;
  trafficSignalDistanceM: number | null;
};

function associatePresentBucket(params: {
  lat: number;
  lon: number;
  headingDeg: number | null;
  prevConfirmedWayId: number | null;
  ctx: ResearchRoadContext;
  config: S4ResearchAlgorithmConfig;
}): BaselineBucketMatch {
  const { lat, lon, headingDeg, prevConfirmedWayId, ctx, config } = params;
  const ambiguityReasons: string[] = [];
  const hits = nearestWayCandidates(lat, lon, ctx.ways, config.uncertaintyRadiusM);

  let outcome: InternalMatchOutcome = 'UNKNOWN';
  let osmWayId: number | null = null;

  if (hits.length === 0) {
    ambiguityReasons.push('NO_WAY_WITHIN_UNCERTAINTY_RADIUS');
  } else if (hits.length > 1 && hits[1].distanceM - hits[0].distanceM < config.competitorGapM) {
    ambiguityReasons.push('COMPETING_WAYS_WITHIN_5M');
    outcome = 'AMBIGUOUS';
  } else {
    const top = hits[0];
    let bearingOk = true;
    if (headingDeg != null && top.segmentBearingDeg != null) {
      const delta = headingDeltaDeg(headingDeg, top.segmentBearingDeg);
      if (delta > config.bearingCompatDeg) {
        ambiguityReasons.push(`BEARING_MISMATCH_${delta.toFixed(0)}deg`);
        bearingOk = false;
      }
    }
    if (prevConfirmedWayId != null) {
      const prevStill = hits.find((h) => h.way.osmWayId === prevConfirmedWayId);
      if (prevStill && bearingOk) {
        outcome = 'CONFIRMED';
        osmWayId = prevConfirmedWayId;
      }
    }
    if (outcome === 'UNKNOWN' && bearingOk && ambiguityReasons.length === 0) {
      outcome = 'CONFIRMED';
      osmWayId = top.way.osmWayId;
    } else if (outcome === 'UNKNOWN' && ambiguityReasons.length > 0) {
      outcome = 'AMBIGUOUS';
    }
  }

  let nearestConfirmedJunctionM: number | null = null;
  let confirmedJunctionNodeId: number | null = null;
  for (const j of ctx.confirmedJunctions) {
    const d = haversineMeters(lat, lon, j.lat, j.lon);
    if (nearestConfirmedJunctionM == null || d < nearestConfirmedJunctionM) {
      nearestConfirmedJunctionM = d;
      confirmedJunctionNodeId = j.nodeId;
    }
  }

  const signals = ctx.signalNodes
    .map((n) => ({ n, d: haversineMeters(lat, lon, n.lat, n.lon) }))
    .filter((s) => s.d <= config.signalSearchRadiusM)
    .sort((a, b) => a.d - b.d);
  const trafficSignalNodeId = signals[0]?.n.osmNodeId ?? null;
  const trafficSignalDistanceM = signals[0]?.d ?? null;
  if (signals.length > 1 && signals[1].d - signals[0].d < 8) {
    ambiguityReasons.push('COMPETING_SIGNALS_WITHIN_8M');
  }

  return {
    bucketLabelUtc: '',
    gpsStatus: 'PRESENT',
    headingDeg,
    outcome,
    osmWayId,
    candidateWayIds: hits.map((h) => h.way.osmWayId),
    ambiguityReasons,
    nearestConfirmedJunctionM,
    confirmedJunctionNodeId:
      nearestConfirmedJunctionM != null && nearestConfirmedJunctionM <= config.junctionAttachMaxM
        ? confirmedJunctionNodeId
        : null,
    trafficSignalNodeId,
    trafficSignalDistanceM,
  };
}

export function buildBaselineMatches(
  buckets: ResearchGpsBucket[],
  ctx: ResearchRoadContext,
  config: S4ResearchAlgorithmConfig,
): BaselineBucketMatch[] {
  const headings: (number | null)[] = new Array(buckets.length).fill(null);
  for (let i = 1; i < buckets.length; i++) {
    const prev = buckets[i - 1];
    const cur = buckets[i];
    if (
      prev.availability === 'PRESENT' &&
      cur.availability === 'PRESENT' &&
      prev.latitude != null &&
      cur.latitude != null &&
      prev.longitude != null &&
      cur.longitude != null
    ) {
      headings[i] = bearingDeg(prev.latitude, prev.longitude, cur.latitude, cur.longitude);
    }
  }

  const out: BaselineBucketMatch[] = [];
  let prevConfirmedWay: number | null = null;

  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) {
      out.push({
        bucketLabelUtc: b.bucketLabelUtc,
        gpsStatus: b.availability,
        headingDeg: null,
        outcome: 'UNKNOWN',
        osmWayId: null,
        candidateWayIds: [],
        ambiguityReasons: [
          b.availability === 'ROW_ABSENT' ? 'ROW_ABSENT' : 'NO_FINITE_COORDINATES',
        ],
        nearestConfirmedJunctionM: null,
        confirmedJunctionNodeId: null,
        trafficSignalNodeId: null,
        trafficSignalDistanceM: null,
      });
      continue;
    }
    const assoc = associatePresentBucket({
      lat: b.latitude,
      lon: b.longitude,
      headingDeg: headings[i],
      prevConfirmedWayId: prevConfirmedWay,
      ctx,
      config,
    });
    assoc.bucketLabelUtc = b.bucketLabelUtc;
    if (assoc.outcome === 'CONFIRMED' && assoc.osmWayId != null) {
      prevConfirmedWay = assoc.osmWayId;
    }
    out.push(assoc);
  }
  return out;
}
