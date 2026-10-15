import {
  classifyVsiSignalQuality,
  computeBundleSourceAdvanceStats,
  VsiSignalQualityClassification,
} from './vsi-signal-quality.classifier';
import { VsiEmpiricalObservationStatus } from './vehicle-signal-evidence.contract';
import type { VsiProfileSignalSnapshotV1 } from './vsi-profile.types';

function baseSignal(
  overrides: Partial<VsiProfileSignalSnapshotV1> = {},
): VsiProfileSignalSnapshotV1 {
  return {
    canonicalSignalKey: 'lv_voltage',
    providerNativeSignalName: 'lowVoltageBatteryCurrentVoltage',
    declaredSupport: 'LISTED',
    empiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
    lastValidObservationAt: '2026-10-15T12:00:00.000Z',
    lastSourceTimestamp: '2026-10-15T12:00:00.000Z',
    lastProviderFetchAt: '2026-10-15T12:00:01.000Z',
    lastProvenStrictSourceAdvanceAt: null,
    strictSourceAdvanced: 'UNKNOWN',
    freshnessClassification: 'FRESH',
    evidenceProvenance: ['VEHICLE_LATEST_STATE'],
    limitations: [],
    ...overrides,
  };
}

describe('vsi-signal-quality.classifier', () => {
  it('classifies listed-but-never-observed as NEVER_OBSERVED', () => {
    const quality = classifyVsiSignalQuality({
      signal: baseSignal({
        empiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
        declaredSupport: 'LISTED',
      }),
      bundleHistory: { bundleSourceTimestamps: [] },
      profileLimitations: [],
      projectionAsOf: new Date(),
    });
    expect(quality).toBe(VsiSignalQualityClassification.NEVER_OBSERVED);
  });

  it('classifies stale empirical axis as OBSERVED_STALE', () => {
    const quality = classifyVsiSignalQuality({
      signal: baseSignal({
        empiricalObservation: VsiEmpiricalObservationStatus.OBSERVED_STALE,
        freshnessClassification: 'STALE',
      }),
      bundleHistory: { bundleSourceTimestamps: [new Date('2026-10-15T10:00:00Z')] },
      profileLimitations: [],
      projectionAsOf: new Date(),
    });
    expect(quality).toBe(VsiSignalQualityClassification.OBSERVED_STALE);
  });

  it('does not derive cadence from insufficient bundle history', () => {
    const stats = computeBundleSourceAdvanceStats([
      new Date('2026-10-15T10:00:00Z'),
      new Date('2026-10-15T10:05:00Z'),
    ]);
    expect(stats.observedCadenceSampleCount).toBe(1);
    expect(stats.observedCadenceMedianSeconds).toBe(300);
    const quality = classifyVsiSignalQuality({
      signal: baseSignal({
        canonicalSignalKey: 'vehicle_speed',
        freshnessClassification: 'UNKNOWN',
      }),
      bundleHistory: {
        bundleSourceTimestamps: [
          new Date('2026-10-15T10:00:00Z'),
          new Date('2026-10-15T10:05:00Z'),
        ],
      },
      profileLimitations: [],
      projectionAsOf: new Date(),
    });
    expect(quality).toBe(VsiSignalQualityClassification.INSUFFICIENT_HISTORY);
  });
});
