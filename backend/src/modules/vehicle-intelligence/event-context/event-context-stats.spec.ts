import type { HighFrequencyReading } from '../../dimo/dimo-segments.service';
import { computeSignalStats } from './event-context-stats';

const ANCHOR = new Date('2026-06-26T12:00:00.000Z').getTime();

interface PartialReading {
  offsetS: number;
  speedKmh?: number | null;
  rpm?: number | null;
  throttlePosition?: number | null;
  engineLoad?: number | null;
  engineCoolantTempC?: number | null;
}

function reading(p: PartialReading): HighFrequencyReading {
  return {
    timestamp: new Date(ANCHOR + p.offsetS * 1000).toISOString(),
    speedKmh: p.speedKmh ?? null,
    rpm: p.rpm ?? null,
    throttlePosition: p.throttlePosition ?? null,
    engineLoad: p.engineLoad ?? null,
    engineCoolantTempC: p.engineCoolantTempC ?? null,
    tractionBatteryPowerKw: null,
  };
}

/** Dense (1 Hz) good-cadence window with all engine signals present. */
function denseReadings(): HighFrequencyReading[] {
  const out: HighFrequencyReading[] = [];
  for (let s = -10; s <= 10; s++) {
    out.push(
      reading({
        offsetS: s,
        speedKmh: 30,
        rpm: 1500,
        throttlePosition: 20,
        engineLoad: 35,
        engineCoolantTempC: 88,
      }),
    );
  }
  return out;
}

describe('computeSignalStats', () => {
  it('flags GOOD coverage for a dense 1 Hz window', () => {
    const result = computeSignalStats(denseReadings(), ANCHOR, true);
    expect(result.perSignal.speed.coverageQuality).toBe('GOOD');
    expect(result.perSignal.rpm.coverageQuality).toBe('GOOD');
    expect(result.dataQuality.sampleCount).toBe(21);
    expect(result.reasonCodes).not.toContain('SPARSE_SIGNAL_CADENCE');
  });

  it('flags SPARSE coverage for a gappy low-sample window', () => {
    // 3 samples ~20s apart => sparse cadence, too few for GOOD.
    const readings = [
      reading({ offsetS: -20, speedKmh: 10, rpm: 1200 }),
      reading({ offsetS: 0, speedKmh: 12, rpm: 1300 }),
      reading({ offsetS: 20, speedKmh: 15, rpm: 1400 }),
    ];
    const result = computeSignalStats(readings, ANCHOR, true);
    expect(result.perSignal.speed.coverageQuality).toBe('SPARSE');
    expect(result.perSignal.rpm.coverageQuality).toBe('SPARSE');
    expect(result.reasonCodes).toContain('SPARSE_SIGNAL_CADENCE');
  });

  it('emits MISSING_RPM when RPM is absent but applicable', () => {
    const readings = denseReadings().map((r) => ({ ...r, rpm: null }));
    const result = computeSignalStats(readings, ANCHOR, true);
    expect(result.perSignal.rpm.coverageQuality).toBe('MISSING');
    expect(result.perSignal.rpm.nonNullCount).toBe(0);
    expect(result.reasonCodes).toContain('MISSING_RPM');
  });

  it('marks engine signals NOT_APPLICABLE for battery-electric powertrains', () => {
    const result = computeSignalStats(denseReadings(), ANCHOR, false);
    expect(result.perSignal.speed.coverageQuality).toBe('GOOD');
    expect(result.perSignal.rpm.coverageQuality).toBe('NOT_APPLICABLE');
    expect(result.perSignal.coolant.coverageQuality).toBe('NOT_APPLICABLE');
    expect(result.reasonCodes).toContain('NOT_APPLICABLE_POWERTRAIN');
    expect(result.reasonCodes).not.toContain('MISSING_RPM');
  });

  it('computes nearest-to-anchor value and standstill framing', () => {
    const readings = [
      reading({ offsetS: -5, speedKmh: 0, rpm: 3600 }),
      reading({ offsetS: -1, speedKmh: 0, rpm: 3800 }),
      reading({ offsetS: 4, speedKmh: 0, rpm: 3700 }),
    ];
    const result = computeSignalStats(readings, ANCHOR, true);
    expect(result.perSignal.speed.nearestValueToAnchor).toBe(0);
    expect(result.perSignal.speed.nearestSampleDistanceMs).toBe(1000);
    expect(result.reasonCodes).toContain('STANDSTILL_BEFORE_EVENT');
    expect(result.reasonCodes).toContain('HIGH_RPM');
  });
});
