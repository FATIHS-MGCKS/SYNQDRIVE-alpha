import { DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG } from '../config';
import type { ResearchOsmWay } from '../contracts';
import {
  emissionCostFromHitsDirectionAwareP1Detailed,
  headingDeltaForTravelPolicy,
  resolveWayTravelDirectionPolicy,
} from '../emission-direction-aware-p1';
import { emissionCostFromHits, type WayHit } from '../viterbi-dp-costs';

const cfg = DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG;

function way(
  id: number,
  tags: Record<string, string> = {},
  oneway: string | null = null,
): ResearchOsmWay {
  return {
    osmWayId: id,
    nodes: [
      { lat: 51.3, lon: 9.5 },
      { lat: 51.301, lon: 9.5 },
    ],
    tags: { highway: tags.highway ?? 'residential', ...tags },
    highway: tags.highway ?? 'residential',
    maxspeed: null,
    oneway,
  };
}

function hit(w: ResearchOsmWay, distanceM: number, segmentBearingDeg: number): WayHit {
  return { way: w, distanceM, segmentBearingDeg };
}

describe('emission-direction-aware P1 (research)', () => {
  it('1 — bidirectional: reverse digitization uses REVERSE orientation when GPS matches reverse bearing', () => {
    const w = way(1);
    const gpsHeading = 151;
    const forwardBearing = 331;
    const hits = [hit(w, 1, forwardBearing)];
    const d = emissionCostFromHitsDirectionAwareP1Detailed(gpsHeading, 1, hits, cfg);
    expect(d.policy).toBe('DIRECTION_UNKNOWN_DEFAULT_BIDIRECTIONAL');
    expect(d.orientationUsed).toBe('REVERSE');
    expect(d.headingDeltaDeg).toBeLessThanOrEqual(cfg.bearingCompatDeg);
    expect(d.headingCost).toBe(0);
    const baseline = emissionCostFromHits(gpsHeading, 1, hits, cfg);
    expect(baseline).toBeGreaterThan(d.distanceCost);
  });

  it('2 — bidirectional: forward digitization uses FORWARD when GPS matches forward bearing', () => {
    const w = way(2);
    const gpsHeading = 331;
    const hits = [hit(w, 1, 331)];
    const d = emissionCostFromHitsDirectionAwareP1Detailed(gpsHeading, 2, hits, cfg);
    expect(d.orientationUsed).toBe('FORWARD');
    expect(d.headingCost).toBe(0);
  });

  it('3 — oneway=yes: allowed direction keeps low heading cost', () => {
    const w = way(3, {}, 'yes');
    expect(resolveWayTravelDirectionPolicy(w)).toBe('ONEWAY_FORWARD');
    const hits = [hit(w, 1, 90)];
    const d = emissionCostFromHitsDirectionAwareP1Detailed(92, 3, hits, cfg);
    expect(d.orientationUsed).toBe('FORWARD');
    expect(d.headingCost).toBe(0);
  });

  it('4 — oneway=yes: forbidden (reverse-aligned GPS) cannot use reverse bearing discount', () => {
    const w = way(4, {}, 'yes');
    const hits = [hit(w, 1, 90)];
    const d = emissionCostFromHitsDirectionAwareP1Detailed(270, 4, hits, cfg);
    expect(d.orientationUsed).toBe('FORWARD');
    expect(d.headingDeltaDeg).toBeGreaterThan(cfg.bearingCompatDeg);
    expect(d.headingCost).toBeGreaterThan(100);
    const { deltaDeg: revWouldBe } = headingDeltaForTravelPolicy(
      270,
      90,
      'DIRECTION_UNKNOWN_DEFAULT_BIDIRECTIONAL',
    );
    expect(revWouldBe).toBeLessThan(cfg.bearingCompatDeg);
    expect(d.headingDeltaDeg).not.toBe(revWouldBe);
  });

  it('5 — oneway=-1: travel against digitization uses REVERSE orientation only', () => {
    const w = way(5, {}, '-1');
    expect(resolveWayTravelDirectionPolicy(w)).toBe('ONEWAY_REVERSE');
    const hits = [hit(w, 1, 0)];
    const d = emissionCostFromHitsDirectionAwareP1Detailed(180, 5, hits, cfg);
    expect(d.orientationUsed).toBe('REVERSE');
    expect(d.headingCost).toBe(0);
    const wrong = emissionCostFromHitsDirectionAwareP1Detailed(0, 5, hits, cfg);
    expect(wrong.orientationUsed).toBe('REVERSE');
    expect(wrong.headingDeltaDeg).toBe(180);
    expect(wrong.headingCost).toBeGreaterThan(100);
  });

  it('6 — roundabout junction implies implicit oneway (forward only)', () => {
    const w = way(6, { junction: 'roundabout' });
    expect(resolveWayTravelDirectionPolicy(w)).toBe('IMPLICIT_ONEWAY_ROUNDABOUT');
    const hits = [hit(w, 1, 45)];
    const allowed = emissionCostFromHitsDirectionAwareP1Detailed(50, 6, hits, cfg);
    expect(allowed.orientationUsed).toBe('FORWARD');
    const forbidden = emissionCostFromHitsDirectionAwareP1Detailed(230, 6, hits, cfg);
    expect(forbidden.orientationUsed).toBe('FORWARD');
    expect(forbidden.headingCost).toBeGreaterThan(50);
  });

  it('7 — parallel ways: each way evaluated with its own orientation policy', () => {
    const fwd = way(71, {}, 'yes');
    const rev = way(72, {}, '-1');
    const hits = [hit(fwd, 2, 90), hit(rev, 2.1, 90)];
    const costFwdGps = emissionCostFromHitsDirectionAwareP1Detailed(88, 71, hits, cfg);
    const costRevGps = emissionCostFromHitsDirectionAwareP1Detailed(268, 72, hits, cfg);
    expect(costFwdGps.headingCost).toBe(0);
    expect(costRevGps.headingCost).toBe(0);
    expect(costFwdGps.distanceCost + costFwdGps.headingCost).toBeLessThan(
      costRevGps.distanceCost + costRevGps.headingCost + 200,
    );
  });

  it('8 — missing oneway tag defaults to bidirectional min-delta', () => {
    const w = way(8);
    const hits = [hit(w, 1, 10)];
    const d = emissionCostFromHitsDirectionAwareP1Detailed(190, 8, hits, cfg);
    expect(d.policy).toBe('DIRECTION_UNKNOWN_DEFAULT_BIDIRECTIONAL');
    expect(d.orientationUsed).toBe('REVERSE');
    expect(d.headingCost).toBe(0);
  });

  it('9 — explicit oneway=no is bidirectional', () => {
    const w = way(9, {}, 'no');
    expect(resolveWayTravelDirectionPolicy(w)).toBe('EXPLICIT_TWO_WAY');
  });

  it('10 — null GPS heading: distance-only emission (no heading penalty)', () => {
    const w = way(10);
    const hits = [hit(w, 3, 100)];
    const d = emissionCostFromHitsDirectionAwareP1Detailed(null, 10, hits, cfg);
    expect(d.headingCost).toBe(0);
    expect(d.headingDeltaDeg).toBeNull();
    expect(d.orientationUsed).toBe('NONE');
  });

  it('11 — missing segment bearing: no heading cost', () => {
    const w = way(11);
    const hits: WayHit[] = [{ way: w, distanceM: 2, segmentBearingDeg: null }];
    const d = emissionCostFromHitsDirectionAwareP1Detailed(153, 11, hits, cfg);
    expect(d.headingCost).toBe(0);
  });

  it('12 — motorway_link implicit oneway forbids reverse shortcut', () => {
    const w = way(12, { highway: 'motorway_link' });
    expect(resolveWayTravelDirectionPolicy(w)).toBe('IMPLICIT_ONEWAY_HIGHWAY_CLASS');
    const hits = [hit(w, 1, 0)];
    const d = emissionCostFromHitsDirectionAwareP1Detailed(180, 12, hits, cfg);
    expect(d.orientationUsed).toBe('FORWARD');
    expect(d.headingCost).toBeGreaterThan(100);
  });

  it('underpass-style: bidirectional primary matches E002 bearing pattern (331 fwd / 153 gps)', () => {
    const w = way(5048137, { highway: 'primary', cutting: 'yes' });
    const hits = [hit(w, 0.5, 331.04)];
    const p1 = emissionCostFromHitsDirectionAwareP1Detailed(153.2, 5048137, hits, cfg);
    const base = emissionCostFromHits(153.2, 5048137, hits, cfg);
    expect(p1.headingCost).toBe(0);
    expect(base).toBeGreaterThan(200);
  });
});
