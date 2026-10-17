import { existsSync } from 'fs';
import { join } from 'path';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  type ResearchGpsBucket,
  type ResearchOsmWay,
} from '../../s4-research';
import { runRoadMatchingPipelineIsolated } from '../di-v0-s4-research-pipeline-isolated';

function bucket(i: number, lat: number, lon: number): ResearchGpsBucket {
  return {
    bucketLabelUtc: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
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

function smallPipelineInput() {
  const ways = [straightWay(1, 48.135, 11.582, 12)];
  const buckets = [0, 1, 2, 3, 4].map((i) => bucket(i, 48.135 + i * 0.0001, 11.582));
  return {
    buckets,
    roadContext: { ways, signalNodes: [], confirmedJunctions: [] },
    config: DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  };
}

describe('runRoadMatchingPipelineIsolated', () => {
  it('worker script is present (compiled .js or ts-node .ts fallback)', () => {
    const js = join(__dirname, '..', 'di-v0-s4-research-pipeline.worker.js');
    const ts = join(__dirname, '..', 'di-v0-s4-research-pipeline.worker.ts');
    expect(existsSync(js) || existsSync(ts)).toBe(true);
  });

  it('completes a small pipeline job in a real worker thread', async () => {
    const result = await runRoadMatchingPipelineIsolated(smallPipelineInput(), 30_000);
    expect(result.windows.length).toBeGreaterThan(0);
    expect(result.summary.independentAccuracy).toBe('NOT_ASSESSABLE');
  }, 45_000);

  it('terminates worker when deadline elapses', async () => {
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

  it('surfaces worker-reported pipeline errors and cleans up', async () => {
    const workerPath = join(__dirname, '..', 'di-v0-s4-research-pipeline.worker.ts');
    const execArgv = existsSync(join(__dirname, '..', 'di-v0-s4-research-pipeline.worker.js'))
      ? undefined
      : ['--require', 'ts-node/register/transpile-only'];
    const { Worker } = await import('worker_threads');
    await expect(
      new Promise((_, reject) => {
        const worker = new Worker(workerPath, { workerData: {}, execArgv });
        worker.once('message', (msg: { ok: boolean; error?: string }) => {
          if (!msg.ok) reject(new Error(msg.error ?? 'WORKER_PIPELINE_ERROR'));
        });
        worker.once('error', reject);
        worker.once('exit', (code) => {
          if (code === 0) return;
          reject(new Error(`PIPELINE_WORKER_EXIT_${code}`));
        });
      }),
    ).rejects.toThrow('WORKER_INPUT_MISSING');
  }, 15_000);

  it('uses compiled worker .js when present (nest build parity)', () => {
    const distRoot = join(__dirname, '../../../../../../..', 'dist', 'src');
    const distWorker = join(
      distRoot,
      'modules/vehicle-intelligence/driving-intelligence/s4-research-worker/di-v0-s4-research-pipeline.worker.js',
    );
    if (!existsSync(distRoot)) {
      expect(existsSync(join(__dirname, '..', 'di-v0-s4-research-pipeline.worker.ts'))).toBe(true);
      return;
    }
    expect(existsSync(distWorker)).toBe(true);
  });
});
