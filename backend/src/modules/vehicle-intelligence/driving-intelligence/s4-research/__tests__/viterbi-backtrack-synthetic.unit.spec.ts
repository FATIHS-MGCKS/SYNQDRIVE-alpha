import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  buildViterbiMatches,
  buildViterbiMatchesBacktrackR1,
  verifyReportedPathCost,
  headingsFromBaseline,
  buildBaselineMatches,
  type ResearchGpsBucket,
  type ResearchOsmWay,
} from '../index';

function straightWay(id: number, lat0: number, lon0: number, steps: number, extra?: Partial<ResearchOsmWay>): ResearchOsmWay {
  const nodes = [];
  for (let i = 0; i < steps; i++) nodes.push({ lat: lat0 + i * 0.0001, lon: lon0 });
  return {
    osmWayId: id,
    nodes,
    tags: { highway: 'residential' },
    highway: 'residential',
    maxspeed: null,
    oneway: null,
    ...extra,
  };
}

function bucket(i: number, lat: number, lon: number, extra?: Partial<ResearchGpsBucket>): ResearchGpsBucket {
  return {
    bucketLabelUtc: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
    availability: 'PRESENT',
    latitude: lat,
    longitude: lon,
    l3SpeedKmh: 30,
    ...extra,
  };
}

describe('viterbi backtrack R1 synthetic', () => {
  const roadContext = (ways: ResearchOsmWay[]) => ({ ways, signalNodes: [], confirmedJunctions: [] });

  it('1: backtrack can lower global path cost vs forward (truncated predecessor beam)', () => {
    const junction = { lat: 51.301, lon: 9.5 };
    const wNorth: ResearchOsmWay = {
      osmWayId: 100,
      nodes: [junction, { lat: 51.305, lon: 9.5 }],
      tags: { highway: 'residential' },
      highway: 'residential',
      maxspeed: null,
      oneway: null,
    };
    const wEast: ResearchOsmWay = {
      osmWayId: 101,
      nodes: [junction, { lat: 51.301, lon: 9.50015 }],
      tags: { highway: 'residential' },
      highway: 'residential',
      maxspeed: null,
      oneway: null,
    };
    const ways = [wNorth, wEast];
    const buckets = [0, 1, 2, 3, 4].map((i) => bucket(i, 51.301 + i * 0.0008, 9.5));
    const cfg = { ...DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, viterbiTopK: 1, competitorGapM: 0.01 };
    const base = buildBaselineMatches(buckets, roadContext(ways), cfg);
    const headings = headingsFromBaseline(base);
    const forward = buildViterbiMatches(buckets, ways, headings, cfg);
    const back = buildViterbiMatchesBacktrackR1(buckets, ways, headings, cfg);
    const forwardCost = verifyReportedPathCost(
      buckets,
      forward.map((r) => r.osmWayId),
      ways,
      headings,
      cfg,
    );
    const backCost = verifyReportedPathCost(
      buckets,
      back.matches.map((r) => r.osmWayId),
      ways,
      headings,
      cfg,
    );
    expect(backCost).toBeLessThanOrEqual(forwardCost);
    for (const seg of back.segments) {
      expect(seg.tracebackEndCost).toBeCloseTo(seg.tracebackVerifiedPathCost, 6);
    }
  });

  it('2: parallel roads — backtrack remains deterministic', () => {
    const ways = [straightWay(1, 51.3, 9.5, 10), { ...straightWay(2, 51.3, 9.50003, 10), osmWayId: 2 }];
    const buckets = [0, 1, 2, 3].map((i) => bucket(i, 51.3001 + i * 0.0001, 9.5));
    const base = buildBaselineMatches(buckets, roadContext(ways), DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    const h = headingsFromBaseline(base);
    const a = buildViterbiMatchesBacktrackR1(buckets, ways, h, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    const b = buildViterbiMatchesBacktrackR1(buckets, ways, h, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    expect(a.matches.map((m) => m.osmWayId)).toEqual(b.matches.map((m) => m.osmWayId));
  });

  it('3: disconnected parallel ways — no forced bridge across gap in candidates', () => {
    const w1 = straightWay(1, 51.3, 9.5, 6);
    const w2 = straightWay(2, 51.305, 9.505, 6);
    const buckets = [bucket(0, 51.3002, 9.5), bucket(1, 51.3052, 9.505)];
    const base = buildBaselineMatches(buckets, roadContext([w1, w2]), DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    const back = buildViterbiMatchesBacktrackR1(
      buckets,
      [w1, w2],
      headingsFromBaseline(base),
      DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    );
    expect(back.matches).toHaveLength(2);
  });

  it('4: ambiguous junction region can label AMBIGUOUS', () => {
    const ways = [straightWay(10, 51.3, 9.5, 8), { ...straightWay(11, 51.3, 9.50002, 8), osmWayId: 11 }];
    const buckets = [bucket(0, 51.30015, 9.50001)];
    const base = buildBaselineMatches(buckets, roadContext(ways), DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    const back = buildViterbiMatchesBacktrackR1(
      buckets,
      ways,
      headingsFromBaseline(base),
      DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    );
    expect(['AMBIGUOUS', 'CONFIRMED']).toContain(back.matches[0].outcome);
  });

  it('5: GPS gap resets segment (UNKNOWN in gap, separate traceback segments)', () => {
    const ways = [straightWay(1, 51.3, 9.5, 10)];
    const buckets: ResearchGpsBucket[] = [
      bucket(0, 51.3001, 9.5),
      { bucketLabelUtc: '2026-01-01T00:00:01Z', availability: 'ROW_ABSENT', latitude: null, longitude: null },
      bucket(2, 51.3003, 9.5),
    ];
    const base = buildBaselineMatches(buckets, roadContext(ways), DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    const back = buildViterbiMatchesBacktrackR1(
      buckets,
      ways,
      headingsFromBaseline(base),
      DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    );
    expect(back.segments).toHaveLength(2);
    expect(back.matches[1].outcome).toBe('UNKNOWN');
  });

  it('6: determinism — identical input yields identical backtrack path', () => {
    const ways = [straightWay(1, 51.3, 9.5, 15)];
    const buckets = [0, 1, 2, 3, 4].map((i) => bucket(i, 51.3001 + i * 0.0001, 9.5));
    const base = buildBaselineMatches(buckets, roadContext(ways), DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    const h = headingsFromBaseline(base);
    const x = buildViterbiMatchesBacktrackR1(buckets, ways, h, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    const y = buildViterbiMatchesBacktrackR1(buckets, ways, h, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    expect(x.totalReportedPathCost).toBe(y.totalReportedPathCost);
    expect(x.matches).toEqual(y.matches);
  });

  it('7: runtime completes for modest bucket count', () => {
    const ways = [straightWay(1, 51.3, 9.5, 40)];
    const buckets = Array.from({ length: 30 }, (_, i) => bucket(i, 51.3001 + i * 0.0001, 9.5));
    const base = buildBaselineMatches(buckets, roadContext(ways), DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
    const t0 = Date.now();
    const back = buildViterbiMatchesBacktrackR1(
      buckets,
      ways,
      headingsFromBaseline(base),
      DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    );
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(back.matches).toHaveLength(30);
  });
});
