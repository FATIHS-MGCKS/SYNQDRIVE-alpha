import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  type ResearchGpsBucket,
  type ResearchOsmWay,
} from '../../s4-research';
import { runRoadMatchingPipelineIsolated } from '../di-v0-s4-research-pipeline-isolated';

function bucket(i: number, lat: number, lon: number): ResearchGpsBucket {
  return {
    bucketLabelUtc: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`,
    availability: 'PRESENT',
    latitude: lat,
    longitude: lon,
    qcTrustLevel: 'TRUSTED',
    l3SpeedKmh: 40,
  };
}

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

describe('runRoadMatchingPipelineIsolated', () => {
  it('terminates worker when deadline elapses (does not rely on Promise.race alone)', async () => {
    const ways = Array.from({ length: 120 }, (_, i) => straightWay(i + 1, 48.13 + i * 0.00005, 11.58, 40));
    const buckets = Array.from({ length: 5000 }, (_, i) =>
      bucket(i, 48.135 + (i % 80) * 0.0001, 11.582 + (i % 80) * 0.0001),
    );

    await expect(
      runRoadMatchingPipelineIsolated(
        {
          buckets,
          roadContext: { ways, signalNodes: [], confirmedJunctions: [] },
          config: DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
        },
        50,
      ),
    ).rejects.toThrow(/PROCESSING_TIMEOUT|PIPELINE_WORKER_EXIT/);
  }, 30_000);
});
