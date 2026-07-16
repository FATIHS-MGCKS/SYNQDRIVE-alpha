import type { HighFrequencyReading } from '../../dimo/dimo-segments.service';
import { computeSignalStats } from './event-context-stats';
import {
  buildEventContextQuality,
  HF_REQUESTED_INTERVAL,
  resolveContextCapabilityVersion,
} from './event-context-quality';
import { deriveUsedAndMissingSignals } from './event-context-stats';

const ANCHOR = new Date('2026-06-26T12:00:00.000Z').getTime();

function reading(offsetS: number, over: Partial<HighFrequencyReading> = {}): HighFrequencyReading {
  return {
    timestamp: new Date(ANCHOR + offsetS * 1000).toISOString(),
    speedKmh: 30,
    rpm: 1500,
    throttlePosition: 20,
    engineLoad: 35,
    engineCoolantTempC: 88,
    tractionBatteryPowerKw: null,
    ...over,
  };
}

function intervalReadings(intervalS: number, fromS: number, toS: number): HighFrequencyReading[] {
  const out: HighFrequencyReading[] = [];
  for (let s = fromS; s <= toS; s += intervalS) {
    out.push(reading(s));
  }
  return out;
}

describe('buildEventContextQuality', () => {
  it('records ~1s effective cadence without claiming requested 1s equals 1 Hz', () => {
    const stats = computeSignalStats(intervalReadings(1, -10, 10), ANCHOR, true);
    const { usedSignals, missingSignals } = deriveUsedAndMissingSignals(stats.signalCoverage);
    const quality = buildEventContextQuality({
      dataQuality: stats.dataQuality,
      signalCoverage: stats.signalCoverage,
      usedSignals,
      missingSignals,
      contextConfidence: 'HIGH',
      capabilityVersion: 'cap-probe-v1',
      status: 'SUCCESS',
      anchorCoverage: {
        coverageBeforeAnchor: stats.coverageBeforeAnchor,
        coverageAfterAnchor: stats.coverageAfterAnchor,
      },
    });

    expect(quality.requestedInterval).toBe(HF_REQUESTED_INTERVAL);
    expect(quality.effectiveMedianCadenceMs).toBe(1000);
    expect(quality.effectiveP95CadenceMs).toBe(1000);
    expect(quality.sampleCount).toBe(21);
    expect(quality.coverageBeforeAnchor).toBe(11);
    expect(quality.coverageAfterAnchor).toBe(11);
    expect(quality.availableSignals).toContain('speed');
    expect(quality.contextConfidence).toBe('HIGH');
    expect(quality.capabilityVersion).toBe('cap-probe-v1');
    expect(quality.qualityReasons).toContain('NATIVE_EVENT_ANCHOR_PRESERVED');
    expect(quality.qualityReasons).toContain('CONTEXT_SIGNALS_EXPLAIN_ONLY');
    expect(quality.qualityReasons).not.toContain('HF_INTERVAL_REQUESTED_NOT_EFFECTIVE');
    expect(quality.qualityReasons).not.toContain('EFFECTIVE_CADENCE_INSUFFICIENT');
  });

  it('flags sparse 5s cadence as LIMITED-quality (not true 1 Hz)', () => {
    const stats = computeSignalStats(intervalReadings(5, -25, 25), ANCHOR, true);
    const { usedSignals, missingSignals } = deriveUsedAndMissingSignals(stats.signalCoverage);
    const quality = buildEventContextQuality({
      dataQuality: stats.dataQuality,
      signalCoverage: stats.signalCoverage,
      usedSignals,
      missingSignals,
      contextConfidence: 'LOW',
      capabilityVersion: null,
      status: 'LIMITED',
      anchorCoverage: {
        coverageBeforeAnchor: stats.coverageBeforeAnchor,
        coverageAfterAnchor: stats.coverageAfterAnchor,
      },
    });

    expect(quality.effectiveMedianCadenceMs).toBe(5000);
    expect(quality.qualityReasons).toContain('HF_INTERVAL_REQUESTED_NOT_EFFECTIVE');
    expect(quality.qualityReasons).toContain('EFFECTIVE_CADENCE_SPARSE');
    expect(quality.qualityReasons).not.toContain('EFFECTIVE_CADENCE_INSUFFICIENT');
  });

  it('flags 20s cadence as insufficient for reliable context', () => {
    const stats = computeSignalStats(intervalReadings(20, -20, 20), ANCHOR, true);
    const { usedSignals, missingSignals } = deriveUsedAndMissingSignals(stats.signalCoverage);
    const quality = buildEventContextQuality({
      dataQuality: stats.dataQuality,
      signalCoverage: stats.signalCoverage,
      usedSignals,
      missingSignals,
      contextConfidence: 'INSUFFICIENT',
      capabilityVersion: 'cap-probe-v1',
      status: 'INSUFFICIENT_CADENCE',
      anchorCoverage: {
        coverageBeforeAnchor: stats.coverageBeforeAnchor,
        coverageAfterAnchor: stats.coverageAfterAnchor,
      },
    });

    expect(quality.effectiveMedianCadenceMs).toBe(20_000);
    expect(quality.qualityReasons).toContain('EFFECTIVE_CADENCE_INSUFFICIENT');
    expect(quality.qualityReasons).toContain('LOW_SAMPLE_COUNT');
  });

  it('detects gappy 1s data with window gaps', () => {
    const gappy: HighFrequencyReading[] = [];
    for (let s = -10; s <= -6; s++) gappy.push(reading(s));
    gappy.push(reading(10));
    const stats = computeSignalStats(gappy, ANCHOR, true);
    const { usedSignals, missingSignals } = deriveUsedAndMissingSignals(stats.signalCoverage);
    const quality = buildEventContextQuality({
      dataQuality: stats.dataQuality,
      signalCoverage: stats.signalCoverage,
      usedSignals,
      missingSignals,
      contextConfidence: 'INSUFFICIENT',
      capabilityVersion: null,
      status: 'LIMITED',
      anchorCoverage: {
        coverageBeforeAnchor: stats.coverageBeforeAnchor,
        coverageAfterAnchor: stats.coverageAfterAnchor,
      },
    });

    expect(quality.qualityReasons).toContain('WINDOW_GAPS');
    expect(stats.dataQuality.maxGapMs).toBeGreaterThan(5_000);
  });
});

describe('resolveContextCapabilityVersion', () => {
  it('picks the newest probe capability version', () => {
    const version = resolveContextCapabilityVersion([
      {
        checkedAt: new Date('2026-01-01'),
        row: { capabilityVersion: 'cap-old' },
      },
      {
        checkedAt: new Date('2026-06-01'),
        row: { capabilityVersion: 'cap-probe-v1' },
      },
    ]);
    expect(version).toBe('cap-probe-v1');
  });
});
