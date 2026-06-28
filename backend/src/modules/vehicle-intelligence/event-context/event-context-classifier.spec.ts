import type { HighFrequencyReading } from '../../dimo/dimo-segments.service';
import { computeSignalStats } from './event-context-stats';
import { classifyEventContext, type ClassifyContextInput } from './event-context-classifier';
import type { AnchorEventInfo } from './event-context-assessment.types';

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

/** Build a dense 1 Hz window from a per-second generator. */
function window(gen: (s: number) => Omit<PartialReading, 'offsetS'>): HighFrequencyReading[] {
  const out: HighFrequencyReading[] = [];
  for (let s = -10; s <= 10; s++) out.push(reading({ offsetS: s, ...gen(s) }));
  return out;
}

function classify(
  readings: HighFrequencyReading[],
  anchorEvent: AnchorEventInfo | null,
  engineSignalsApplicable = true,
) {
  const stats = computeSignalStats(readings, ANCHOR, engineSignalsApplicable);
  const input: ClassifyContextInput = {
    anchorType: 'DIMO_NATIVE_BEHAVIOR_EVENT',
    engineSignalsApplicable,
    perSignal: stats.perSignal,
    dataQuality: stats.dataQuality,
    reasonCodes: stats.reasonCodes,
    anchorEvent,
  };
  return classifyEventContext(input);
}

const accel: AnchorEventInfo = { category: 'ACCELERATION', extreme: false, eventType: 'HARSH_ACCELERATION' };
const extremeAccel: AnchorEventInfo = { category: 'ACCELERATION', extreme: true, eventType: 'HARSH_ACCELERATION' };
const braking: AnchorEventInfo = { category: 'BRAKING', extreme: false, eventType: 'HARSH_BRAKING' };

describe('classifyEventContext — behaviour-aware classification', () => {
  it('classifies AGGRESSIVE_START: accel from low speed + high load, warm engine', () => {
    // preSpeed ~4 km/h (low through the anchor second), then accelerates hard.
    const readings = window((s) => ({
      speedKmh: s <= 0 ? 4 : 4 + s * 6,
      rpm: 3200,
      throttlePosition: 85,
      engineLoad: 85,
      engineCoolantTempC: 88,
    }));
    const res = classify(readings, accel);
    expect(res.preliminaryClassifications).toContain('AGGRESSIVE_START');
  });

  it('classifies LAUNCH_LIKE_START: extreme accel from standstill + high load', () => {
    const readings = window((s) => ({
      speedKmh: s <= 0 ? 1 : 1 + s * 8,
      rpm: 4200,
      throttlePosition: 95,
      engineLoad: 95,
      engineCoolantTempC: 90,
    }));
    const res = classify(readings, extremeAccel);
    expect(res.preliminaryClassifications).toContain('LAUNCH_LIKE_START');
  });

  it('classifies KICKDOWN_LIKELY: accel while already moving fast + high load', () => {
    const readings = window((s) => ({
      speedKmh: 35 + (s + 10) * 1.5,
      rpm: 4000,
      throttlePosition: 90,
      engineLoad: 88,
      engineCoolantTempC: 90,
    }));
    const res = classify(readings, accel);
    expect(res.preliminaryClassifications).toContain('KICKDOWN_LIKELY');
  });

  it('classifies COLD_ENGINE_ACCELERATION when coolant is low', () => {
    const readings = window((s) => ({
      speedKmh: s < 0 ? 2 : 2 + (s + 1) * 5,
      rpm: 3600,
      throttlePosition: 88,
      engineLoad: 85,
      engineCoolantTempC: 30, // cold
    }));
    const res = classify(readings, accel);
    expect(res.preliminaryClassifications).toContain('COLD_ENGINE_ACCELERATION');
  });

  it('classifies EMERGENCY_LIKE_BRAKING when speed before braking is high', () => {
    const readings = window((s) => ({
      speedKmh: s < 0 ? 80 : Math.max(0, 80 - (s + 1) * 9),
      rpm: 2200,
      engineCoolantTempC: 85,
    }));
    const res = classify(readings, braking);
    expect(res.preliminaryClassifications).toContain('EMERGENCY_LIKE_BRAKING');
  });

  it('does NOT over-claim: gentle accel from low speed without high load → no aggressive label', () => {
    const readings = window((s) => ({
      speedKmh: s < 0 ? 4 : 4 + (s + 1) * 1,
      rpm: 1400,
      throttlePosition: 15,
      engineLoad: 25,
      engineCoolantTempC: 88,
    }));
    const res = classify(readings, accel);
    expect(res.preliminaryClassifications).not.toContain('AGGRESSIVE_START');
    expect(res.preliminaryClassifications).not.toContain('KICKDOWN_LIKELY');
  });

  it('returns INSUFFICIENT_CONTEXT when there is no usable data', () => {
    const res = classify([], accel);
    expect(res.status).toBe('INSUFFICIENT_CONTEXT');
    expect(res.preliminaryClassifications).toEqual(['INSUFFICIENT_CONTEXT']);
    expect(res.confidence).toBe('INSUFFICIENT');
    expect(res.evidenceGrade).toBe('D');
  });
});

describe('classifyEventContext — confidence rules', () => {
  it('HIGH: 3+ signals, dense window, nearest sample ≤ 5s', () => {
    const readings = window((s) => ({
      speedKmh: 30,
      rpm: 1500,
      throttlePosition: 20,
      engineLoad: 35,
      engineCoolantTempC: 88,
    }));
    const res = classify(readings, accel);
    expect(res.confidence).toBe('HIGH');
  });

  it('LOW: only speed present (1 relevant signal)', () => {
    const readings = window((s) => ({ speedKmh: 30 }));
    const res = classify(readings, accel);
    expect(res.confidence).toBe('LOW');
  });

  it('INSUFFICIENT when engine signals not applicable and only sparse speed', () => {
    const readings = [
      reading({ offsetS: -20, speedKmh: 10 }),
      reading({ offsetS: 20, speedKmh: 12 }),
    ];
    const res = classify(readings, accel, false);
    // grade D (too few samples) → INSUFFICIENT
    expect(res.confidence).toBe('INSUFFICIENT');
  });
});
