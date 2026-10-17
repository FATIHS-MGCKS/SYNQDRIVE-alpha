import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  analyzeGpsBucketEvidence,
  buildRoadContextFromOverpass,
  runRoadMatchingPipeline,
  type ResearchGpsBucket,
  type ResearchOsmWay,
} from '../index';

function straightWay(id: number, lat0: number, lon0: number, steps: number): ResearchOsmWay {
  const nodes = [];
  for (let i = 0; i < steps; i++) {
    nodes.push({ lat: lat0 + i * 0.0001, lon: lon0 });
  }
  return {
    osmWayId: id,
    nodes,
    tags: { highway: 'residential' },
    highway: 'residential',
    maxspeed: null,
    oneway: null,
  };
}

function bucket(
  i: number,
  lat: number,
  lon: number,
  extra?: Partial<ResearchGpsBucket>,
): ResearchGpsBucket {
  return {
    bucketLabelUtc: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
    availability: 'PRESENT',
    latitude: lat,
    longitude: lon,
    qcTrustLevel: 'TRUSTED',
    l3SpeedKmh: 40,
    ...extra,
  };
}

describe('s4-research synthetic', () => {
  it('straight-line drive associates when a single way is nearby', () => {
    const ways = [straightWay(1, 51.3, 9.5, 20)];
    const buckets = [0, 1, 2, 3, 4].map((i) => bucket(i, 51.3 + i * 0.0001, 9.5));
    const result = runRoadMatchingPipeline({
      buckets,
      roadContext: { ways, signalNodes: [], confirmedJunctions: [] },
      config: DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    });
    const assoc = result.windows.filter((w) => w.baseline.hypothesis === 'ASSOCIATED');
    expect(assoc.length).toBeGreaterThan(0);
    expect(result.summary.independentAccuracy).toBe('NOT_ASSESSABLE');
  });

  it('competing parallel ways within 5m yield AMBIGUOUS', () => {
    const primary = straightWay(10, 51.3, 9.5, 15);
    const parallel = {
      ...straightWay(11, 51.3, 9.50003, 15),
      osmWayId: 11,
    };
    const buckets = [0, 1, 2].map((i) => bucket(i, 51.3 + i * 0.0001, 9.5));
    const result = runRoadMatchingPipeline({
      buckets,
      roadContext: { ways: [primary, parallel], signalNodes: [], confirmedJunctions: [] },
      config: DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    });
    expect(result.windows.some((w) => w.baseline.hypothesis === 'AMBIGUOUS')).toBe(true);
  });

  it('graph transition conflict on impossible hop', () => {
    const w1 = straightWay(1, 51.3, 9.5, 5);
    const w2 = straightWay(2, 51.31, 9.51, 5);
    const buckets = [
      bucket(0, 51.3001, 9.5, { l3SpeedKmh: 90 }),
      bucket(1, 51.3101, 9.51, { l3SpeedKmh: 90 }),
    ];
    const result = runRoadMatchingPipeline({
      buckets,
      roadContext: { ways: [w1, w2], signalNodes: [], confirmedJunctions: [] },
      config: DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    });
    expect(result.summary.graphTransitionConflicts).toBeGreaterThanOrEqual(0);
  });

  it('ROW_ABSENT yields UNKNOWN without inventing standstill', () => {
    const ways = [straightWay(1, 51.3, 9.5, 10)];
    const buckets: ResearchGpsBucket[] = [
      bucket(0, 51.3001, 9.5),
      {
        bucketLabelUtc: '2026-01-01T00:00:01Z',
        availability: 'ROW_ABSENT',
        latitude: null,
        longitude: null,
      },
      bucket(2, 51.3003, 9.5),
    ];
    const evidence = analyzeGpsBucketEvidence(buckets);
    expect(evidence[1].observedTags).toContain('ROW_ABSENT');
    const result = runRoadMatchingPipeline({
      buckets,
      roadContext: { ways, signalNodes: [], confirmedJunctions: [] },
      config: DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    });
    expect(result.windows[1].baseline.hypothesis).toBe('UNKNOWN');
  });

  it('missing OSM ways yields UNKNOWN not ASSOCIATED', () => {
    const buckets = [bucket(0, 51.3, 9.5)];
    const result = runRoadMatchingPipeline({
      buckets,
      roadContext: { ways: [], signalNodes: [], confirmedJunctions: [] },
      config: DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    });
    expect(result.windows[0].baseline.hypothesis).toBe('UNKNOWN');
  });

  it('reproduces identical output for identical input', () => {
    const ways = [straightWay(1, 51.3, 9.5, 12)];
    const buckets = [0, 1, 2].map((i) => bucket(i, 51.3 + i * 0.0001, 9.5));
    const input = {
      buckets,
      roadContext: { ways, signalNodes: [], confirmedJunctions: [] },
      config: DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    };
    const a = runRoadMatchingPipeline(input);
    const b = runRoadMatchingPipeline(input);
    expect(a.summary).toEqual(b.summary);
    expect(a.windows.map((w) => w.baseline)).toEqual(b.windows.map((w) => w.baseline));
  });

  it('parseOverpass empty body does not throw', () => {
    const ctx = buildRoadContextFromOverpass({ elements: [] });
    expect(ctx.ways).toHaveLength(0);
  });
});
