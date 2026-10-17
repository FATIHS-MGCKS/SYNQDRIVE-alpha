/**
 * LDI-10D Phase 2B — topology replay & synthetic invariants.
 */
import * as path from 'node:path';
import {
  buildDrivableGraph,
  classifyCompetingWays,
  parseFrozenTopologyElements,
  verifyPhase2bPreflight,
  type RawOsmWay,
} from '../../../../../scripts/ops/ldi10d-phase2b-topology-forensics.lib';
import { verifyPhase2aIntegrity } from '../../../../../scripts/ops/ldi10d-phase2a-unknown-root-cause.lib';

const repoRoot =
  process.env.LDI10D_REPO_ROOT ?? path.resolve(__dirname, '../../../../../..');

function way(id: number, nodeIds: number[], tags: Record<string, string>, geometry: Array<{ lat: number; lon: number }>): RawOsmWay {
  return { osmId: id, nodeIds, tags, geometry };
}

describe('LDI-10D Phase 2B', () => {
  it('passes preflight SHA and baseline counts', () => {
    const p = verifyPhase2bPreflight(repoRoot);
    expect(p.inputIntegrity).toBe('PASS');
    expect(p.baseline).toEqual({
      groups: 32,
      candidates: 75,
      gpsPresent: 346,
      rowAbsent: 16,
      associated: 14,
      unknown: 18,
      g2: 11,
      g3: 6,
      g1: 1,
    });
  });

  it('preserves Phase 2 association invariants', () => {
    const v = verifyPhase2aIntegrity(repoRoot);
    expect(v.inputIntegrity).toBe('PASS');
  });

  it('detects same-road split via shared nodes', () => {
    const w1 = way(1, [10, 11, 12], { highway: 'residential', name: 'Haupt' }, [
      { lat: 51.4, lon: 9.67 },
      { lat: 51.401, lon: 9.671 },
      { lat: 51.402, lon: 9.672 },
    ]);
    const w2 = way(2, [12, 13, 14], { highway: 'residential', name: 'Haupt' }, [
      { lat: 51.402, lon: 9.672 },
      { lat: 51.403, lon: 9.673 },
      { lat: 51.404, lon: 9.674 },
    ]);
    const c = classifyCompetingWays(w1, w2, 2);
    expect(c.classification).toBe('SAME_ROAD_SPLIT');
    expect(c.wouldRemainUnknownUnderPhase2Gates).toBe(true);
  });

  it('detects parallel genuine alternatives (different highway class)', () => {
    const w1 = way(1, [1, 2], { highway: 'residential' }, [
      { lat: 51.4, lon: 9.67 },
      { lat: 51.401, lon: 9.67 },
    ]);
    const w2 = way(2, [3, 4], { highway: 'service' }, [
      { lat: 51.4, lon: 9.6701 },
      { lat: 51.401, lon: 9.6701 },
    ]);
    const c = classifyCompetingWays(w1, w2, 1);
    expect(c.classification).toBe('GENUINE_ALTERNATIVE_ROADS');
  });

  it('excludes pedestrian crossings from drivable junction graph', () => {
    const crossing = new Set<number>([99]);
    const ways = [
      way(1, [1, 99], { highway: 'residential' }, [
        { lat: 51.4, lon: 9.67 },
        { lat: 51.401, lon: 9.671 },
      ]),
      way(2, [99, 2], { highway: 'residential' }, [
        { lat: 51.401, lon: 9.671 },
        { lat: 51.402, lon: 9.672 },
      ]),
    ];
    const coords = new Map<number, { lat: number; lon: number }>([
      [1, { lat: 51.4, lon: 9.67 }],
      [99, { lat: 51.401, lon: 9.671 }],
      [2, { lat: 51.402, lon: 9.672 }],
    ]);
    const g = buildDrivableGraph({ ways, pedestrianCrossingNodeIds: crossing, nodeCoords: coords });
    expect(g.junctionCandidates.find((j) => j.nodeId === 99)).toBeUndefined();
  });

  it('marks grade-separated layers as ambiguous junction', () => {
    const ways = [
      way(1, [1, 2], { highway: 'residential', layer: '0' }, [
        { lat: 51.4, lon: 9.67 },
        { lat: 51.401, lon: 9.671 },
      ]),
      way(2, [1, 3], { highway: 'residential', layer: '1' }, [
        { lat: 51.4, lon: 9.67 },
        { lat: 51.401, lon: 9.672 },
      ]),
    ];
    const coords = new Map<number, { lat: number; lon: number }>([
      [1, { lat: 51.4, lon: 9.67 }],
      [2, { lat: 51.401, lon: 9.671 }],
      [3, { lat: 51.401, lon: 9.672 }],
    ]);
    const g = buildDrivableGraph({ ways, pedestrianCrossingNodeIds: new Set(), nodeCoords: coords });
    const j = g.junctionCandidates.find((x) => x.nodeId === 1);
    expect(j?.classification).toBe('AMBIGUOUS');
    expect(j?.excludedReason).toBe('GRADE_SEPARATION_LAYER_MISMATCH');
  });

  it('frozen OSM has zero mapped traffic signals', () => {
    const frozenPath = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/ldi-10d/LDI10D_OSM_FROZEN_SNAPSHOT.json',
    );
    const frozen = JSON.parse(require('node:fs').readFileSync(frozenPath, 'utf8')) as {
      overpassResponse: unknown;
    };
    const topo = parseFrozenTopologyElements(
      frozen.overpassResponse as { elements?: Array<Record<string, unknown>> },
    );
    const signals = [...topo.nodeTags.values()].filter((t) => t.highway === 'traffic_signals');
    expect(signals.length).toBe(0);
  });
});
