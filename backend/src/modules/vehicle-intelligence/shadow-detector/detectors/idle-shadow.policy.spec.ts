import {
  clustersToCandidateEvents,
  detectHighRpmStationaryClusters,
} from './high-rpm-stationary-shadow.policy';
import {
  detectExcessiveIdlingFromHf,
  EXCESSIVE_IDLING_SHADOW_POLICY,
} from './excessive-idling-shadow.policy';
import type { ShadowDetectorHfSample } from '../shadow-detector.types';

function sample(
  offsetSec: number,
  base: string,
  over: Partial<ShadowDetectorHfSample> = {},
): ShadowDetectorHfSample {
  const ts = new Date(new Date(base).getTime() + offsetSec * 1000).toISOString();
  return {
    timestamp: ts,
    speedKmh: 0,
    coolantC: 90,
    rpm: 850,
    throttlePct: 10,
    loadPct: 15,
    engineRuntimeSec: 600,
    torqueNm: null,
    torquePct: null,
    exteriorTempC: 20,
    tractionBatteryPowerKw: null,
    socPct: null,
    tractionBatteryTemperatureC: null,
    altitudeM: null,
    gear: null,
    ignitionOn: true,
    ...over,
  };
}

describe('idle shadow policies', () => {
  const base = '2026-07-16T12:00:00.000Z';

  it('detects parking revving as HIGH_RPM_WHILE_STATIONARY_PROXY', () => {
    const series = [0, 1, 2, 3].map((i) =>
      sample(i, base, { speedKmh: 0, rpm: 2000 + i * 200 }),
    );
    const clusters = detectHighRpmStationaryClusters(series);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].synchronizedSampleCount).toBeGreaterThanOrEqual(3);
    expect(clustersToCandidateEvents(clusters)[0].eventType).toBe(
      'HIGH_RPM_WHILE_STATIONARY_PROXY',
    );
  });

  it('rejects short traffic-light idle (Ampel) for excessive idling', () => {
    const ampel = Array.from({ length: 75 }, (_, i) =>
      sample(i, base, { speedKmh: 0, rpm: 820 }),
    );
    const ampelClusters = detectExcessiveIdlingFromHf(ampel, false);
    expect(ampelClusters).toHaveLength(0);
  });

  it('detects true long idle phase (HF)', () => {
    const longIdle = Array.from({ length: 200 }, (_, i) =>
      sample(i, base, { speedKmh: 0, rpm: 850, ignitionOn: true }),
    );
    const clusters = detectExcessiveIdlingFromHf(longIdle, false);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].durationMs).toBeGreaterThanOrEqual(
      EXCESSIVE_IDLING_SHADOW_POLICY.minExcessiveIdleDurationMs,
    );
  });

  it('supports BEV excessive idling via speed-only stationary context', () => {
    const bevIdle = Array.from({ length: 190 }, (_, i) =>
      sample(i, base, { speedKmh: 0, rpm: null, ignitionOn: null }),
    );
    const clusters = detectExcessiveIdlingFromHf(bevIdle, true);
    expect(clusters).toHaveLength(1);
  });
});
