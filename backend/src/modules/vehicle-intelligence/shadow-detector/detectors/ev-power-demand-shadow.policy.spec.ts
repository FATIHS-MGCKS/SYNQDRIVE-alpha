import {
  detectEvHighPowerDemandClusters,
  inferEvPowerSignConvention,
  toDemandKw,
} from './ev-power-demand-shadow.policy';
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
    coolantC: null,
    rpm: null,
    throttlePct: null,
    loadPct: null,
    engineRuntimeSec: null,
    torqueNm: null,
    torquePct: null,
    exteriorTempC: 18,
    tractionBatteryPowerKw: -80,
    socPct: 72,
    tractionBatteryTemperatureC: 28,
    altitudeM: 200,
    gear: null,
    ignitionOn: null,
    ...over,
  };
}

describe('ev-power-demand-shadow.policy', () => {
  const base = '2026-07-16T14:00:00.000Z';

  it('infers NEGATIVE_IS_DISCHARGE when accelerating samples are negative', () => {
    const series = Array.from({ length: 8 }, (_, i) =>
      sample(i, base, {
        speedKmh: 30 + i * 8,
        tractionBatteryPowerKw: -90 - i,
      }),
    );
    expect(inferEvPowerSignConvention(series)).toBe('NEGATIVE_IS_DISCHARGE');
    expect(toDemandKw(-95, 'NEGATIVE_IS_DISCHARGE')).toBe(95);
    expect(toDemandKw(40, 'NEGATIVE_IS_DISCHARGE')).toBe(0);
  });

  it('detects sustained high demand with ramp context', () => {
    const series = Array.from({ length: 20 }, (_, i) =>
      sample(i, base, {
        speedKmh: 25 + i * 3,
        tractionBatteryPowerKw: -85,
        altitudeM: 200 + i * 0.2,
        socPct: 65,
      }),
    );
    const clusters = detectEvHighPowerDemandClusters(series);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].rampContext).toBe(true);
    expect(clusters[0].peakDemandKw).toBeGreaterThanOrEqual(85);
  });

  it('reduces confidence factor for uphill context', () => {
    const uphill = Array.from({ length: 20 }, (_, i) =>
      sample(i, base, {
        speedKmh: 55,
        tractionBatteryPowerKw: -95,
        altitudeM: 300 + i * 1.5,
      }),
    );
    const flat = Array.from({ length: 20 }, (_, i) =>
      sample(i, base, {
        speedKmh: 90,
        tractionBatteryPowerKw: -95,
        altitudeM: 300,
      }),
    );
    const uphillClusters = detectEvHighPowerDemandClusters(uphill);
    const flatClusters = detectEvHighPowerDemandClusters(flat);
    expect(uphillClusters[0].uphillContext).toBe(true);
    expect(uphillClusters[0].confidenceFactor).toBeLessThan(flatClusters[0].confidenceFactor);
  });
});
