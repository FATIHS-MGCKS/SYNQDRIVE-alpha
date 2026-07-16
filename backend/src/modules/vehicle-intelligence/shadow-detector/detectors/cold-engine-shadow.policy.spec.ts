import {
  assessCadenceCoverageGate,
  clustersToCandidateEvents,
  confirmIceOperation,
  detectColdEngineLoadClusters,
  COLD_ENGINE_SHADOW_POLICY,
} from './cold-engine-shadow.policy';
import type { ShadowDetectorHfSample } from '../shadow-detector.types';

function sample(
  offsetSec: number,
  base: string,
  over: Partial<ShadowDetectorHfSample> = {},
): ShadowDetectorHfSample {
  const ts = new Date(new Date(base).getTime() + offsetSec * 1000).toISOString();
  return {
    timestamp: ts,
    speedKmh: 40,
    coolantC: 45,
    rpm: 3000,
    throttlePct: 50,
    loadPct: 85,
    engineRuntimeSec: 120,
    torqueNm: null,
    torquePct: null,
    exteriorTempC: 5,
    tractionBatteryPowerKw: null,
    altitudeM: null,
    gear: null,
    ...over,
  };
}

function denseColdLoadSeries(base = '2026-07-16T10:00:00.000Z'): ShadowDetectorHfSample[] {
  return Array.from({ length: 10 }, (_, i) =>
    sample(i, base, {
      coolantC: 42,
      loadPct: 88,
      rpm: 4200,
      throttlePct: 70,
    }),
  );
}

describe('cold-engine-shadow.policy', () => {
  const base = '2026-07-16T10:00:00.000Z';

  it('detects cold high-load clusters (not warm engine)', () => {
    const cold = denseColdLoadSeries(base);
    const clusters = detectColdEngineLoadClusters(cold);
    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters[0].kind).toBe('COLD_ENGINE_HIGH_LOAD');
    expect(clusters[0].durationMs).toBeGreaterThanOrEqual(
      COLD_ENGINE_SHADOW_POLICY.clusterMinDurationMs,
    );

    const warm = cold.map((s) => ({ ...s, coolantC: 85 }));
    expect(detectColdEngineLoadClusters(warm)).toHaveLength(0);
  });

  it('rejects insufficient context when coolant is missing (no exterior substitute)', () => {
    const noCoolant = denseColdLoadSeries(base).map((s) => ({
      ...s,
      coolantC: null,
      exteriorTempC: -5,
    }));
    expect(detectColdEngineLoadClusters(noCoolant)).toHaveLength(0);
    expect(noCoolant.every((s) => s.coolantC == null)).toBe(true);
    expect(noCoolant.some((s) => s.exteriorTempC != null)).toBe(true);
  });

  it('requires cadence/coverage gate before policy is considered assessable', () => {
    const sparse = assessCadenceCoverageGate({
      effectiveCadenceMs: 15_000,
      coverage: 0.3,
      sampleCount: 4,
      capabilityCadenceMs: null,
      capabilityCoverage: null,
    });
    expect(sparse.passed).toBe(false);
    expect(sparse.rejectionReasons).toEqual(
      expect.arrayContaining(['INSUFFICIENT_HF_SAMPLES', 'CADENCE_TOO_SPARSE', 'COVERAGE_BELOW_MINIMUM']),
    );

    const good = assessCadenceCoverageGate({
      effectiveCadenceMs: 4_000,
      coverage: 0.8,
      sampleCount: 12,
      capabilityCadenceMs: null,
      capabilityCoverage: null,
    });
    expect(good.passed).toBe(true);
  });

  it('confirms ICE operation for PHEV only with combustion activity samples', () => {
    const evOnly: ShadowDetectorHfSample[] = Array.from({ length: 5 }, (_, i) =>
      sample(i, base, { rpm: 0, loadPct: 0, tractionBatteryPowerKw: -15 }),
    );
    expect(confirmIceOperation(evOnly).confirmed).toBe(false);

    const iceActive: ShadowDetectorHfSample[] = Array.from({ length: 5 }, (_, i) =>
      sample(i, base, { rpm: 1800, loadPct: 35 }),
    );
    expect(confirmIceOperation(iceActive).confirmed).toBe(true);
  });

  it('emits shadow candidate events (not confirmed abuse)', () => {
    const candidates = clustersToCandidateEvents(detectColdEngineLoadClusters(denseColdLoadSeries(base)));
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].label).toBe('shadow_candidate');
    expect(candidates[0].eventType).toBe('COLD_ENGINE_HIGH_LOAD');
  });
});
