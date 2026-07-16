import {
  detectSustainedHighLoadClusters,
  SUSTAINED_HIGH_LOAD_SHADOW_POLICY,
} from './sustained-high-load-shadow.policy';
import type { ShadowDetectorHfSample } from '../shadow-detector.types';

function sample(
  offsetSec: number,
  base: string,
  over: Partial<ShadowDetectorHfSample> = {},
): ShadowDetectorHfSample {
  const ts = new Date(new Date(base).getTime() + offsetSec * 1000).toISOString();
  return {
    timestamp: ts,
    speedKmh: 100,
    coolantC: 88,
    rpm: 3200,
    throttlePct: 75,
    loadPct: 82,
    engineRuntimeSec: 600,
    torqueNm: null,
    torquePct: 72,
    exteriorTempC: 18,
    tractionBatteryPowerKw: null,
    altitudeM: 400,
    gear: null,
    ...over,
  };
}

describe('sustained-high-load-shadow.policy', () => {
  const base = '2026-07-16T11:00:00.000Z';

  it('detects sustained highway load (Autobahnlast)', () => {
    const series = Array.from({ length: 25 }, (_, i) =>
      sample(i, base, {
        speedKmh: 125,
        loadPct: 86,
        rpm: 3500,
        throttlePct: 70,
        altitudeM: 400 + i * 0.2,
      }),
    );

    const clusters = detectSustainedHighLoadClusters(series);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].durationMs).toBeGreaterThanOrEqual(
      SUSTAINED_HIGH_LOAD_SHADOW_POLICY.minSustainedDurationMs,
    );
    expect(clusters[0].highwayContext).toBe(true);
    expect(clusters[0].confidenceFactor).toBeGreaterThan(0.9);
  });

  it('detects uphill sustained load with reduced confidence (Bergfahrt)', () => {
    const series = Array.from({ length: 25 }, (_, i) =>
      sample(i, base, {
        speedKmh: 55,
        loadPct: 80,
        rpm: 2800,
        throttlePct: 78,
        altitudeM: 500 + i * 1.2,
      }),
    );

    const clusters = detectSustainedHighLoadClusters(series);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].uphillContext).toBe(true);
    expect(clusters[0].highwayContext).toBe(false);
    expect(clusters[0].confidenceFactor).toBeLessThan(0.9);
    expect(clusters[0].altitudeGainM).toBeGreaterThanOrEqual(
      SUSTAINED_HIGH_LOAD_SHADOW_POLICY.uphillAltitudeGainM,
    );
  });

  it('rejects short high-load peaks', () => {
    const shortPeak = Array.from({ length: 6 }, (_, i) =>
      sample(i, base, { loadPct: 95, speedKmh: 110 }),
    );
    const padded = [
      ...Array.from({ length: 5 }, (_, i) => sample(i - 10, base, { loadPct: 30 })),
      ...shortPeak,
      ...Array.from({ length: 5 }, (_, i) => sample(i + 10, base, { loadPct: 25 })),
    ].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    expect(detectSustainedHighLoadClusters(shortPeak)).toHaveLength(0);
    expect(detectSustainedHighLoadClusters(padded)).toHaveLength(0);
  });
});
