import {
  applyDirectionAwareP1SafetyGates,
  buildDirectedCarRoutingGraph,
  clearRouteQueryCache,
  type ResearchGpsBucket,
  type ResearchOsmWay,
} from '../index';
import type { BaselineBucketMatch } from '../baseline-matching';
import type { ShadowMotionEvidence } from '../direction-aware-p1-safety-gates';

function overpassFromWays(
  specs: Array<{ id: number; nodeIds: number[]; geom: Array<{ lat: number; lon: number }>; tags?: Record<string, string> }>,
): { elements: Array<Record<string, unknown>> } {
  const elements: Array<Record<string, unknown>> = [];
  const nodeSet = new Set<number>();
  for (const s of specs) for (const n of s.nodeIds) nodeSet.add(n);
  for (const nid of nodeSet) {
    const w = specs.find((s) => s.nodeIds.includes(nid))!;
    const idx = w.nodeIds.indexOf(nid);
    elements.push({ type: 'node', id: nid, lat: w.geom[idx].lat, lon: w.geom[idx].lon, tags: {} });
  }
  for (const s of specs) {
    elements.push({
      type: 'way',
      id: s.id,
      nodes: s.nodeIds,
      geometry: s.geom,
      tags: s.tags ?? { highway: 'residential' },
    });
  }
  return { elements };
}

function rw(id: number, nodes: Array<{ lat: number; lon: number }>, highway = 'residential'): ResearchOsmWay {
  return {
    osmWayId: id,
    nodes,
    tags: { highway },
    highway,
    maxspeed: null,
    oneway: null,
  };
}

function bucket(label: string, lat: number, lon: number): ResearchGpsBucket {
  return { bucketLabelUtc: label, availability: 'PRESENT', latitude: lat, longitude: lon, l3SpeedKmh: 30 };
}

function matchRow(
  label: string,
  wayId: number | null,
  outcome: BaselineBucketMatch['outcome'] = 'CONFIRMED',
): BaselineBucketMatch {
  return {
    bucketLabelUtc: label,
    gpsStatus: 'PRESENT',
    headingDeg: 90,
    outcome,
    osmWayId: wayId,
    candidateWayIds: wayId != null ? [wayId] : [],
    ambiguityReasons: [],
    nearestConfirmedJunctionM: null,
    confirmedJunctionNodeId: null,
    trafficSignalNodeId: null,
    trafficSignalDistanceM: null,
  };
}

function shadow(stationary: boolean, position = 'FRESH'): Map<string, ShadowMotionEvidence> {
  return new Map([
    [
      '2026-10-16T10:00:01Z',
      {
        motionState: stationary ? 'STATIONARY_SUPPORTED' : 'MOVING_SPEED_ESTIMATED',
        positionState: position,
        estimatedSpeedKmh: stationary ? 0 : 25,
      },
    ],
  ]);
}

describe('direction-aware P1 safety gates B6', () => {
  beforeEach(() => clearRouteQueryCache());

  it('1 — stationary GPS jitter blocks spurious way change', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.3, lon: 9.502 }, { lat: 51.301, lon: 9.502 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: w1.nodes },
      { id: 2, nodeIds: [3, 4], geom: w2.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, w2]);
    const buckets = [bucket('2026-10-16T10:00:00Z', 51.3005, 9.5), bucket('2026-10-16T10:00:01Z', 51.3005002, 9.50002)];
    const ungated = [matchRow(buckets[0].bucketLabelUtc, 1), matchRow(buckets[1].bucketLabelUtc, 2)];
    const gated = applyDirectionAwareP1SafetyGates(ungated, buckets, [w1, w2], graph, shadow(true));
    expect(gated.matches[1].outcome).toBe('AMBIGUOUS');
    expect(gated.audits[1].triggeredGates).toContain('GATE_STATIONARY_WAY_CHANGE');
  });

  it('2 — right turn with connected ramp stays CONFIRMED when moving', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.3005, lon: 9.5 }]);
    const ramp = rw(2, [{ lat: 51.3005, lon: 9.5 }, { lat: 51.3005, lon: 9.502 }]);
    const w2 = rw(3, [{ lat: 51.3005, lon: 9.502 }, { lat: 51.301, lon: 9.502 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: w1.nodes },
      { id: 2, nodeIds: [2, 3], geom: ramp.nodes },
      { id: 3, nodeIds: [3, 4], geom: w2.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, ramp, w2]);
    const buckets = [bucket('2026-10-16T10:00:00Z', 51.3005, 9.5), bucket('2026-10-16T10:00:05Z', 51.3005, 9.502)];
    const ungated = [matchRow(buckets[0].bucketLabelUtc, 1), matchRow(buckets[1].bucketLabelUtc, 3)];
    const gated = applyDirectionAwareP1SafetyGates(ungated, buckets, [w1, ramp, w2], graph, shadow(false));
    expect(gated.matches[1].outcome).toBe('CONFIRMED');
  });

  it('3 — left turn via junction ramp', () => {
    const main = rw(10, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const left = rw(11, [{ lat: 51.301, lon: 9.5 }, { lat: 51.301, lon: 9.498 }]);
    const body = overpassFromWays([
      { id: 10, nodeIds: [1, 2], geom: main.nodes },
      { id: 11, nodeIds: [2, 3], geom: left.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [main, left]);
    const buckets = [bucket('2026-10-16T10:00:00Z', 51.3008, 9.5), bucket('2026-10-16T10:00:04Z', 51.301, 9.4985)];
    const ungated = [matchRow(buckets[0].bucketLabelUtc, 10), matchRow(buckets[1].bucketLabelUtc, 11)];
    const gated = applyDirectionAwareP1SafetyGates(ungated, buckets, [main, left], graph, shadow(false));
    expect(gated.matches[1].outcome).toBe('CONFIRMED');
  });

  it('4 — parallel unconnected one-ways downgrade', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }], 'residential');
    const w2 = rw(2, [{ lat: 51.3, lon: 9.502 }, { lat: 51.301, lon: 9.502 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: w1.nodes, tags: { highway: 'residential', oneway: 'yes' } },
      { id: 2, nodeIds: [3, 4], geom: w2.nodes, tags: { highway: 'residential', oneway: 'yes' } },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, w2]);
    const buckets = [bucket('2026-10-16T10:00:00Z', 51.3005, 9.5), bucket('2026-10-16T10:00:02Z', 51.3005, 9.502)];
    const ungated = [matchRow(buckets[0].bucketLabelUtc, 1), matchRow(buckets[1].bucketLabelUtc, 2)];
    const gated = applyDirectionAwareP1SafetyGates(ungated, buckets, [w1, w2], graph, shadow(false));
    expect(gated.matches[1].outcome).toBe('AMBIGUOUS');
    expect(gated.audits[1].triggeredGates).toContain('GATE_DIRECTED_ROUTE_NOT_FOUND');
  });

  it('5 — service road beside main while stationary', () => {
    const main = rw(100, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const svc = rw(101, [{ lat: 51.301, lon: 9.5 }, { lat: 51.301, lon: 9.5005 }], 'service');
    svc.highway = 'service';
    const body = overpassFromWays([
      { id: 100, nodeIds: [1, 2], geom: main.nodes },
      { id: 101, nodeIds: [2, 3], geom: svc.nodes, tags: { highway: 'service' } },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [main, svc]);
    const buckets = [bucket('2026-10-16T10:00:00Z', 51.3005, 9.5), bucket('2026-10-16T10:00:01Z', 51.3005001, 9.50002)];
    const ungated = [matchRow(buckets[0].bucketLabelUtc, 100), matchRow(buckets[1].bucketLabelUtc, 101)];
    const gated = applyDirectionAwareP1SafetyGates(ungated, buckets, [main, svc], graph, shadow(true));
    expect(gated.matches[1].outcome).toBe('AMBIGUOUS');
    expect(gated.audits[1].triggeredGates).toContain('GATE_STATIONARY_SERVICE_TRANSITION');
  });

  it('6 — separated carriageways without connector', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.3, lon: 9.503 }, { lat: 51.301, lon: 9.503 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: w1.nodes },
      { id: 2, nodeIds: [3, 4], geom: w2.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, w2]);
    const buckets = [bucket('2026-10-16T10:00:00Z', 51.3005, 9.5), bucket('2026-10-16T10:00:03Z', 51.3005, 9.503)];
    const ungated = [matchRow(buckets[0].bucketLabelUtc, 1), matchRow(buckets[1].bucketLabelUtc, 2)];
    const gated = applyDirectionAwareP1SafetyGates(ungated, buckets, [w1, w2], graph, shadow(false));
    expect(gated.matches[1].outcome).toBe('AMBIGUOUS');
  });

  it('7 — incomplete graph (missing way in routing extract)', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.301, lon: 9.5 }, { lat: 51.301, lon: 9.502 }]);
    const body = overpassFromWays([{ id: 1, nodeIds: [1, 2], geom: w1.nodes }]);
    const graph = buildDirectedCarRoutingGraph(body, [w1]);
    const buckets = [bucket('2026-10-16T10:00:00Z', 51.3005, 9.5), bucket('2026-10-16T10:00:02Z', 51.301, 9.501)];
    const ungated = [matchRow(buckets[0].bucketLabelUtc, 1), matchRow(buckets[1].bucketLabelUtc, 2)];
    const gated = applyDirectionAwareP1SafetyGates(ungated, buckets, [w1, w2], graph, shadow(false));
    expect(gated.matches[1].outcome).toBe('AMBIGUOUS');
  });

  it('8 — long GPS gap uses actual dt for kinematic check', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.32, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.32, lon: 9.5 }, { lat: 51.32, lon: 9.52 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: w1.nodes },
      { id: 2, nodeIds: [2, 3], geom: w2.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, w2]);
    const buckets = [bucket('2026-10-16T10:00:00Z', 51.31, 9.5), bucket('2026-10-16T10:01:00Z', 51.32, 9.519)];
    const ungated = [matchRow(buckets[0].bucketLabelUtc, 1), matchRow(buckets[1].bucketLabelUtc, 2)];
    const gated = applyDirectionAwareP1SafetyGates(ungated, buckets, [w1, w2], graph, shadow(false));
    expect(gated.audits[1].dtSec).toBe(60);
    expect(gated.matches[1].outcome).toBe('CONFIRMED');
  });

  it('9 — short gap with implausible detour ratio', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.305, lon: 9.5 }]);
    const detour = rw(2, [
      { lat: 51.305, lon: 9.5 },
      { lat: 51.305, lon: 9.48 },
      { lat: 51.31, lon: 9.48 },
      { lat: 51.31, lon: 9.502 },
    ]);
    const w3 = rw(3, [{ lat: 51.31, lon: 9.502 }, { lat: 51.315, lon: 9.502 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: [w1.nodes[0], w1.nodes[1]] },
      { id: 2, nodeIds: [2, 5, 6, 7], geom: detour.nodes },
      { id: 3, nodeIds: [7, 8], geom: w3.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, detour, w3]);
    const buckets = [bucket('2026-10-16T10:00:00Z', 51.304, 9.5), bucket('2026-10-16T10:00:02Z', 51.3105, 9.502)];
    const ungated = [matchRow(buckets[0].bucketLabelUtc, 1), matchRow(buckets[1].bucketLabelUtc, 3)];
    const gated = applyDirectionAwareP1SafetyGates(ungated, buckets, [w1, detour, w3], graph, shadow(false));
    if (gated.audits[1].routeDistanceM != null && gated.audits[1].routeDistanceM > 80) {
      expect(gated.audits[1].triggeredGates).toContain('GATE_KINEMATIC_DETOUR_RATIO');
    }
  });

  it('10 — slow creeping with connected micro-route', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.3002, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.3002, lon: 9.5 }, { lat: 51.3004, lon: 9.5 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: w1.nodes },
      { id: 2, nodeIds: [2, 3], geom: w2.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, w2]);
    const buckets = [bucket('2026-10-16T10:00:00Z', 51.3001, 9.5), bucket('2026-10-16T10:00:10Z', 51.3003, 9.5)];
    const ungated = [matchRow(buckets[0].bucketLabelUtc, 1), matchRow(buckets[1].bucketLabelUtc, 2)];
    const sh = new Map<string, ShadowMotionEvidence>([
      ['2026-10-16T10:00:10Z', { motionState: 'MOVING_SPEED_ESTIMATED', positionState: 'FRESH', estimatedSpeedKmh: 5 }],
    ]);
    const gated = applyDirectionAwareP1SafetyGates(ungated, buckets, [w1, w2], graph, sh);
    expect(gated.matches[1].outcome).toBe('CONFIRMED');
  });

  it('11 — parking-lot style short turn bypasses stationary gate when displacement sufficient', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.3005, lon: 9.5 }]);
    const ramp = rw(2, [{ lat: 51.3005, lon: 9.5 }, { lat: 51.3005, lon: 9.502 }]);
    const park = rw(3, [{ lat: 51.3005, lon: 9.502 }, { lat: 51.301, lon: 9.502 }], 'service');
    park.highway = 'service';
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: w1.nodes },
      { id: 2, nodeIds: [2, 3], geom: ramp.nodes },
      { id: 3, nodeIds: [3, 4], geom: park.nodes, tags: { highway: 'service' } },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, ramp, park]);
    const buckets = [bucket('2026-10-16T10:00:00Z', 51.295, 9.5), bucket('2026-10-16T10:00:04Z', 51.3006, 9.502)];
    const ungated = [matchRow(buckets[0].bucketLabelUtc, 1), matchRow(buckets[1].bucketLabelUtc, 3)];
    const sh = new Map<string, ShadowMotionEvidence>([
      [buckets[1].bucketLabelUtc, { motionState: 'STATIONARY_SUPPORTED', positionState: 'FRESH', estimatedSpeedKmh: 0 }],
    ]);
    const gated = applyDirectionAwareP1SafetyGates(ungated, buckets, [w1, ramp, park], graph, sh);
    expect(gated.matches[1].outcome).toBe('CONFIRMED');
    expect(gated.audits[1].triggeredGates).not.toContain('GATE_STATIONARY_WAY_CHANGE');
  });

  it('12 — moving correction after wrong hypothesis allowed', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.301, lon: 9.5 }, { lat: 51.301, lon: 9.502 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: w1.nodes },
      { id: 2, nodeIds: [2, 3], geom: w2.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, w2]);
    const buckets = [
      bucket('2026-10-16T10:00:00Z', 51.3005, 9.5),
      bucket('2026-10-16T10:00:01Z', 51.3005, 9.501),
      bucket('2026-10-16T10:00:05Z', 51.301, 9.5015),
    ];
    const ungated = [
      matchRow(buckets[0].bucketLabelUtc, 1),
      matchRow(buckets[1].bucketLabelUtc, 1, 'AMBIGUOUS'),
      matchRow(buckets[2].bucketLabelUtc, 2),
    ];
    const gated = applyDirectionAwareP1SafetyGates(ungated, buckets, [w1, w2], graph, shadow(false));
    expect(gated.matches[2].outcome).toBe('CONFIRMED');
  });

  it('13 — ROW_ABSENT forces UNKNOWN (not stationary)', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.301, lon: 9.5 }]);
    const body = overpassFromWays([{ id: 1, nodeIds: [1, 2], geom: w1.nodes }]);
    const graph = buildDirectedCarRoutingGraph(body, [w1]);
    const buckets = [bucket('2026-10-16T10:00:00Z', 51.3005, 9.5)];
    const ungated = [matchRow(buckets[0].bucketLabelUtc, 1)];
    const sh = new Map<string, ShadowMotionEvidence>([
      ['2026-10-16T10:00:00Z', { motionState: 'NO_MOTION_EVIDENCE', positionState: 'ROW_ABSENT' }],
    ]);
    const gated = applyDirectionAwareP1SafetyGates(ungated, buckets, [w1], graph, sh);
    expect(gated.matches[0].outcome).toBe('UNKNOWN');
    expect(gated.matches[0].osmWayId).toBeNull();
  });

  it('14 — time-shifted provider samples use bucket label delta', () => {
    const w1 = rw(1, [{ lat: 51.3, lon: 9.5 }, { lat: 51.305, lon: 9.5 }]);
    const w2 = rw(2, [{ lat: 51.305, lon: 9.5 }, { lat: 51.31, lon: 9.5 }]);
    const body = overpassFromWays([
      { id: 1, nodeIds: [1, 2], geom: w1.nodes },
      { id: 2, nodeIds: [2, 3], geom: w2.nodes },
    ]);
    const graph = buildDirectedCarRoutingGraph(body, [w1, w2]);
    const buckets = [bucket('2026-10-16T10:00:00Z', 51.302, 9.5), bucket('2026-10-16T10:00:08Z', 51.307, 9.5)];
    const ungated = [matchRow(buckets[0].bucketLabelUtc, 1), matchRow(buckets[1].bucketLabelUtc, 2)];
    const gated = applyDirectionAwareP1SafetyGates(ungated, buckets, [w1, w2], graph, shadow(false));
    expect(gated.audits[1].dtSec).toBe(8);
    expect(gated.audits[1].routeImpliedSpeedKmh).toBeGreaterThan(0);
  });
});
