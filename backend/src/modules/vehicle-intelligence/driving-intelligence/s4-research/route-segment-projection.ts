import type { ResearchGpsBucket, ResearchOsmWay } from './contracts';
import { latLonToLocalMeters, pointToSegmentDistanceM } from './osm-parse';

export type WaySegmentProjection = {
  wayId: number;
  segmentIndex: number;
  /** 0 at segment start node, 1 at segment end node. */
  fractionAlongSegment: number;
  distanceToWayM: number;
  lat: number;
  lon: number;
  startNodeId: number | null;
  endNodeId: number | null;
};

function projectOntoWay(
  lat: number,
  lon: number,
  way: ResearchOsmWay,
  nodeIds: number[] | null,
): WaySegmentProjection | null {
  if (way.nodes.length < 2) return null;
  let bestDist = Infinity;
  let bestSeg = 0;
  let bestFrac = 0;
  let bestLat = lat;
  let bestLon = lon;
  for (let i = 1; i < way.nodes.length; i++) {
    const a = way.nodes[i - 1];
    const b = way.nodes[i];
    const refLat = (a.lat + b.lat) / 2;
    const refLon = (a.lon + b.lon) / 2;
    const p = latLonToLocalMeters(lat, lon, refLat, refLon);
    const aM = latLonToLocalMeters(a.lat, a.lon, refLat, refLon);
    const bM = latLonToLocalMeters(b.lat, b.lon, refLat, refLon);
    const dx = bM.x - aM.x;
    const dy = bM.y - aM.y;
    const segLenSq = dx * dx + dy * dy;
    let t = 0;
    if (segLenSq >= 0.25) {
      t = Math.max(0, Math.min(1, ((p.x - aM.x) * dx + (p.y - aM.y) * dy) / segLenSq));
    }
    const projX = aM.x + t * dx;
    const projY = aM.y + t * dy;
    const d = Math.hypot(p.x - projX, p.y - projY);
    if (d < bestDist) {
      bestDist = d;
      bestSeg = i - 1;
      bestFrac = t;
      bestLat = a.lat + t * (b.lat - a.lat);
      bestLon = a.lon + t * (b.lon - a.lon);
    }
  }
  const startNodeId = nodeIds?.[bestSeg] ?? null;
  const endNodeId = nodeIds?.[bestSeg + 1] ?? null;
  return {
    wayId: way.osmWayId,
    segmentIndex: bestSeg,
    fractionAlongSegment: bestFrac,
    distanceToWayM: pointToSegmentDistanceM(lat, lon, way.nodes[bestSeg], way.nodes[bestSeg + 1]),
    lat: bestLat,
    lon: bestLon,
    startNodeId,
    endNodeId,
  };
}

export function projectBucketOntoWay(
  bucket: ResearchGpsBucket,
  way: ResearchOsmWay,
  nodeIds: number[] | null,
): WaySegmentProjection | null {
  if (bucket.latitude == null || bucket.longitude == null) return null;
  return projectOntoWay(bucket.latitude, bucket.longitude, way, nodeIds);
}
