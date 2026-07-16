import {
  clustersToCandidateEvents,
  detectKickdownLikeClusters,
  KICKDOWN_LIKE_SHADOW_POLICY,
} from './kickdown-like-shadow.policy';
import type { ShadowDetectorHfSample } from '../shadow-detector.types';

function sample(
  offsetSec: number,
  base: string,
  over: Partial<ShadowDetectorHfSample> = {},
): ShadowDetectorHfSample {
  const ts = new Date(new Date(base).getTime() + offsetSec * 1000).toISOString();
  return {
    timestamp: ts,
    speedKmh: 60,
    coolantC: 90,
    rpm: 2200,
    throttlePct: 30,
    loadPct: 40,
    engineRuntimeSec: 600,
    torqueNm: null,
    torquePct: 45,
    exteriorTempC: 20,
    tractionBatteryPowerKw: null,
    altitudeM: 200,
    gear: null,
    ...over,
  };
}

describe('kickdown-like-shadow.policy', () => {
  const base = '2026-07-16T12:00:00.000Z';

  it('detects kickdown-like proxy with sharp throttle, rpm and speed rise', () => {
    const series: ShadowDetectorHfSample[] = [
      sample(0, base, { throttlePct: 25, rpm: 2000, speedKmh: 55, loadPct: 45 }),
      sample(1, base, { throttlePct: 55, rpm: 2600, speedKmh: 62, loadPct: 60 }),
      sample(2, base, { throttlePct: 92, rpm: 3200, speedKmh: 70, loadPct: 78, torquePct: 70 }),
    ];

    const clusters = detectKickdownLikeClusters(series);
    expect(clusters).toHaveLength(1);
    const events = clustersToCandidateEvents(clusters);
    expect(events[0].eventType).toBe('KICKDOWN_LIKE_PROXY');
    expect(clusters[0].durationMs).toBeGreaterThanOrEqual(
      KICKDOWN_LIKE_SHADOW_POLICY.minClusterDurationMs,
    );
    expect(clusters[0].gearSignalAvailable).toBe(false);
  });

  it('documents gear change when gear signal is available', () => {
    const series: ShadowDetectorHfSample[] = [
      sample(0, base, { throttlePct: 20, rpm: 2100, speedKmh: 50, gear: 4, loadPct: 50 }),
      sample(1, base, { throttlePct: 60, rpm: 2800, speedKmh: 58, gear: 3, loadPct: 68 }),
      sample(2, base, { throttlePct: 94, rpm: 3400, speedKmh: 68, gear: 2, loadPct: 82 }),
    ];

    const clusters = detectKickdownLikeClusters(series);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].gearSignalAvailable).toBe(true);
    expect(clusters[0].gearChangeObserved).toBe(true);
    expect(clustersToCandidateEvents(clusters)[0].eventType).toBe('KICKDOWN_LIKE_PROXY');
  });

  it('rejects normal gradual acceleration and short peaks', () => {
    const gradual = Array.from({ length: 12 }, (_, i) =>
      sample(i, base, {
        throttlePct: 30 + i * 3,
        rpm: 2000 + i * 80,
        speedKmh: 50 + i * 2,
        loadPct: 40 + i * 2,
      }),
    );
    expect(detectKickdownLikeClusters(gradual)).toHaveLength(0);

    const shortPeak = [
      sample(0, base, { throttlePct: 20, rpm: 2000, speedKmh: 55 }),
      sample(1, base, { throttlePct: 95, rpm: 3500, speedKmh: 70, loadPct: 80 }),
    ];
    expect(detectKickdownLikeClusters(shortPeak)).toHaveLength(0);
  });
});
