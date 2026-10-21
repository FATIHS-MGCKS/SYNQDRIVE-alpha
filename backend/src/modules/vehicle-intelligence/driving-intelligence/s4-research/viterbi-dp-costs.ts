import type { ResearchOsmWay } from './contracts';
import type { S4ResearchAlgorithmConfig } from './config';
import { headingDeltaDeg } from './geo';

export type WayHit = {
  way: ResearchOsmWay;
  distanceM: number;
  segmentBearingDeg: number | null;
};

export function emissionCostFromHits(
  heading: number | null,
  wayId: number,
  hits: WayHit[],
  config: S4ResearchAlgorithmConfig,
): number {
  const hit = hits.find((h) => h.way.osmWayId === wayId);
  if (!hit) return 1e6;
  let cost = hit.distanceM * 2;
  if (heading != null && hit.segmentBearingDeg != null) {
    const d = headingDeltaDeg(heading, hit.segmentBearingDeg);
    if (d > config.bearingCompatDeg) cost += 50 + d;
  }
  return cost;
}

export function transitionCost(
  prevWay: number | null,
  curWay: number | null,
  adj: Map<number, Set<number>>,
  speedKmh: number | null | undefined,
): number {
  if (prevWay == null || curWay == null) return prevWay === curWay ? 0 : 5;
  if (prevWay === curWay) return 0;
  if (adj.get(prevWay)?.has(curWay)) return 2;
  if (speedKmh != null && speedKmh > 80) return 80;
  return 40;
}

/** Deterministic ordering for equal-cost DP ties (lower is preferred). */
export function tieBreakWayId(wayId: number | null): number {
  return wayId == null ? Number.MAX_SAFE_INTEGER : wayId;
}
