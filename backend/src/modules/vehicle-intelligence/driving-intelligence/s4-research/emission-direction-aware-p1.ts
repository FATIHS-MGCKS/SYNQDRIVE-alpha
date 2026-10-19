import type { ResearchOsmWay } from './contracts';
import type { S4ResearchAlgorithmConfig } from './config';
import { headingDeltaDeg } from './geo';
import type { WayHit } from './viterbi-dp-costs';

export const S4_RESEARCH_EMISSION_DIRECTION_AWARE_P1 = 'S4_RESEARCH_EMISSION_DIRECTION_AWARE_P1';

/** How travel direction may be interpreted relative to OSM node order (forward bearing). */
export type WayTravelDirectionPolicy =
  | 'BIDIRECTIONAL'
  | 'ONEWAY_FORWARD'
  | 'ONEWAY_REVERSE'
  | 'EXPLICIT_TWO_WAY'
  | 'IMPLICIT_ONEWAY_ROUNDABOUT'
  | 'IMPLICIT_ONEWAY_HIGHWAY_CLASS'
  | 'DIRECTION_UNKNOWN_DEFAULT_BIDIRECTIONAL'
  /** Explicit oneway tag present but not a safe bidirectional model (alternating, reversible, unknown). */
  | 'ONEWAY_UNSUPPORTED_FORWARD_ONLY';

export type DirectionAwareEmissionBreakdown = {
  algorithmId: typeof S4_RESEARCH_EMISSION_DIRECTION_AWARE_P1;
  distanceCost: number;
  headingCost: number;
  headingDeltaDeg: number | null;
  orientationUsed: 'FORWARD' | 'REVERSE' | 'NONE';
  policy: WayTravelDirectionPolicy;
  forwardBearingDeg: number | null;
  reverseBearingDeg: number | null;
};

const IMPLICIT_ONEWAY_HIGHWAYS = new Set(['motorway', 'motorway_link', 'trunk_link']);
const KNOWN_ONEWAY_TAGS = new Set(['yes', 'no', '-1']);
const VARIABLE_DIRECTION_ONEWAY_TAGS = new Set(['alternating', 'reversible']);

function normalizeOnewayTag(way: ResearchOsmWay): string | null {
  const raw = way.oneway ?? way.tags.oneway ?? null;
  if (raw == null) return null;
  const v = String(raw).toLowerCase();
  if (v === 'true' || v === '1') return 'yes';
  if (v === 'false' || v === '0') return 'no';
  return v;
}

/**
 * Resolves which travel orientations are eligible for heading–bearing comparison.
 * Research-only; does not override production emission.
 */
export function resolveWayTravelDirectionPolicy(way: ResearchOsmWay): WayTravelDirectionPolicy {
  const oneway = normalizeOnewayTag(way);
  if (oneway === 'yes') return 'ONEWAY_FORWARD';
  if (oneway === '-1') return 'ONEWAY_REVERSE';
  if (oneway === 'no') return 'EXPLICIT_TWO_WAY';
  if (oneway != null) {
    if (VARIABLE_DIRECTION_ONEWAY_TAGS.has(oneway) || !KNOWN_ONEWAY_TAGS.has(oneway)) {
      return 'ONEWAY_UNSUPPORTED_FORWARD_ONLY';
    }
  }

  const junction = way.tags.junction ?? '';
  if (junction === 'roundabout' || junction === 'circular') {
    return 'IMPLICIT_ONEWAY_ROUNDABOUT';
  }

  const hw = (way.highway ?? way.tags.highway ?? '').toLowerCase();
  if (hw === 'mini_roundabout') {
    return 'IMPLICIT_ONEWAY_ROUNDABOUT';
  }
  if (IMPLICIT_ONEWAY_HIGHWAYS.has(hw)) {
    return 'IMPLICIT_ONEWAY_HIGHWAY_CLASS';
  }

  return 'DIRECTION_UNKNOWN_DEFAULT_BIDIRECTIONAL';
}

export function headingDeltaForTravelPolicy(
  headingDeg: number,
  forwardBearingDeg: number,
  policy: WayTravelDirectionPolicy,
): { deltaDeg: number; orientationUsed: 'FORWARD' | 'REVERSE' } {
  const reverseBearingDeg = (forwardBearingDeg + 180) % 360;
  const dFwd = headingDeltaDeg(headingDeg, forwardBearingDeg);
  const dRev = headingDeltaDeg(headingDeg, reverseBearingDeg);

  switch (policy) {
    case 'ONEWAY_FORWARD':
    case 'IMPLICIT_ONEWAY_ROUNDABOUT':
    case 'IMPLICIT_ONEWAY_HIGHWAY_CLASS':
    case 'ONEWAY_UNSUPPORTED_FORWARD_ONLY':
      return { deltaDeg: dFwd, orientationUsed: 'FORWARD' };
    case 'ONEWAY_REVERSE':
      return { deltaDeg: dRev, orientationUsed: 'REVERSE' };
    case 'BIDIRECTIONAL':
    case 'EXPLICIT_TWO_WAY':
    case 'DIRECTION_UNKNOWN_DEFAULT_BIDIRECTIONAL':
    default:
      if (dRev < dFwd) return { deltaDeg: dRev, orientationUsed: 'REVERSE' };
      return { deltaDeg: dFwd, orientationUsed: 'FORWARD' };
  }
}

/** Research P1 emission — same distance/heading weights as legacy `emissionCostFromHits`. */
export function emissionCostFromHitsDirectionAwareP1(
  heading: number | null,
  wayId: number,
  hits: WayHit[],
  config: S4ResearchAlgorithmConfig,
): number {
  const d = emissionCostFromHitsDirectionAwareP1Detailed(heading, wayId, hits, config);
  return d.distanceCost + d.headingCost;
}

export function emissionCostFromHitsDirectionAwareP1Detailed(
  heading: number | null,
  wayId: number,
  hits: WayHit[],
  config: S4ResearchAlgorithmConfig,
): DirectionAwareEmissionBreakdown {
  const hit = hits.find((h) => h.way.osmWayId === wayId);
  if (!hit) {
    return {
      algorithmId: S4_RESEARCH_EMISSION_DIRECTION_AWARE_P1,
      distanceCost: 1e6,
      headingCost: 0,
      headingDeltaDeg: null,
      orientationUsed: 'NONE',
      policy: 'DIRECTION_UNKNOWN_DEFAULT_BIDIRECTIONAL',
      forwardBearingDeg: null,
      reverseBearingDeg: null,
    };
  }
  const distanceCost = hit.distanceM * 2;
  let headingCost = 0;
  let headingDelta: number | null = null;
  let orientationUsed: 'FORWARD' | 'REVERSE' | 'NONE' = 'NONE';
  const policy = resolveWayTravelDirectionPolicy(hit.way);
  const forwardBearingDeg = hit.segmentBearingDeg;
  const reverseBearingDeg = forwardBearingDeg != null ? (forwardBearingDeg + 180) % 360 : null;

  if (heading != null && forwardBearingDeg != null) {
    const { deltaDeg, orientationUsed: o } = headingDeltaForTravelPolicy(heading, forwardBearingDeg, policy);
    headingDelta = deltaDeg;
    orientationUsed = o;
    if (deltaDeg > config.bearingCompatDeg) headingCost = 50 + deltaDeg;
  }

  return {
    algorithmId: S4_RESEARCH_EMISSION_DIRECTION_AWARE_P1,
    distanceCost,
    headingCost,
    headingDeltaDeg: headingDelta,
    orientationUsed,
    policy,
    forwardBearingDeg,
    reverseBearingDeg,
  };
}
