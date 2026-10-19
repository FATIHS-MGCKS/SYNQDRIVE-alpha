import type { RawOsmWay } from './osm-parse';
import type { WaySegmentProjection } from './route-segment-projection';
import { partialSegmentLengthsM } from './route-query';

export type SegmentAttachment = {
  nodeId: number;
  /** Cost in meters from projection point to this node along the segment. */
  linkCostM: number;
};

function segmentOnewayRules(raw: RawOsmWay | undefined): {
  forward: boolean;
  reverse: boolean;
} {
  if (!raw) return { forward: true, reverse: true };
  const tags = raw.tags;
  const roundabout = tags.junction === 'roundabout' || tags.highway === 'mini_roundabout';
  const ow = tags.oneway;
  if (roundabout && ow !== '-1' && ow !== 'no') {
    return { forward: true, reverse: false };
  }
  if (ow === 'yes') return { forward: true, reverse: false };
  if (ow === '-1') return { forward: false, reverse: true };
  return { forward: true, reverse: true };
}

/** Legal nodes to start graph routing from a projection (leave projection toward node). */
export function departureAttachments(
  proj: WaySegmentProjection,
  raw: RawOsmWay | undefined,
  totalSegM: number,
): SegmentAttachment[] {
  const { toStartM, toEndM } = partialSegmentLengthsM(totalSegM, proj.fractionAlongSegment);
  const rules = segmentOnewayRules(raw);
  const out: SegmentAttachment[] = [];
  if (proj.startNodeId != null && rules.reverse) {
    out.push({ nodeId: proj.startNodeId, linkCostM: toStartM });
  }
  if (proj.endNodeId != null && rules.forward) {
    out.push({ nodeId: proj.endNodeId, linkCostM: toEndM });
  }
  return out;
}

/** Tail cost from an arrival node to the projection point. */
export function arrivalTailCostM(
  proj: WaySegmentProjection,
  raw: RawOsmWay | undefined,
  totalSegM: number,
  arrivalNodeId: number,
): number | null {
  const { toStartM, toEndM } = partialSegmentLengthsM(totalSegM, proj.fractionAlongSegment);
  const rules = segmentOnewayRules(raw);
  if (arrivalNodeId === proj.startNodeId && rules.forward) return toStartM;
  if (arrivalNodeId === proj.endNodeId && rules.reverse) return toEndM;
  return null;
}
