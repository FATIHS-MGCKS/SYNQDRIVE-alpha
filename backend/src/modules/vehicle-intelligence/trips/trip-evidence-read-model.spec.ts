import { buildTripEvidenceSummary } from './trip-evidence-read-model';
import type { TripSignalQualityResult } from '@modules/clickhouse/clickhouse-hf.types';

function baseQuality(
  over: Partial<TripSignalQualityResult> = {},
): TripSignalQualityResult {
  return {
    available: true,
    degraded: false,
    overallQuality: 'good',
    hfAvailability: 'hf_available',
    signalCoverage: [],
    missingKeySignals: [],
    detectorFeasibilityHints: [],
    windowCount: 2,
    hfPointCount: 120,
    reasons: [],
    internalDebug: true,
    readOnly: true,
    ...over,
  };
}

describe('buildTripEvidenceSummary', () => {
  it('includes RPM available and engine load missing bullets', () => {
    const bullets = buildTripEvidenceSummary({
      signalQuality: baseQuality(),
      snapshotSampleCount: 10,
      hfEventCount: 3,
      gpsPointCount: 5,
      signalAvailability: {
        rpm: true,
        throttle: false,
        engineLoad: false,
        coolant: true,
        tractionPower: false,
      },
      hfMirrorEnabled: true,
    });
    expect(bullets.some((b) => b.includes('RPM-Daten'))).toBe(true);
    expect(bullets.some((b) => b.includes('Engine-Load-Daten fehlen'))).toBe(true);
    expect(bullets.some((b) => b.includes('HF-Signalpunkte'))).toBe(true);
    expect(bullets.some((b) => b.includes('HF-Ereignisse'))).toBe(true);
  });

  it('notes mirror disabled without claiming a score', () => {
    const bullets = buildTripEvidenceSummary({
      signalQuality: baseQuality({ hfPointCount: 0, overallQuality: 'unavailable' }),
      snapshotSampleCount: null,
      hfEventCount: 0,
      gpsPointCount: 0,
      signalAvailability: {
        rpm: false,
        throttle: false,
        engineLoad: false,
        coolant: false,
        tractionPower: false,
      },
      hfMirrorEnabled: false,
    });
    expect(bullets.some((b) => b.includes('HF_MIRROR_ENABLED'))).toBe(true);
    expect(bullets.some((b) => b.toLowerCase().includes('score'))).toBe(false);
  });
});
