import {
  TIRE_WEAR_MODEL_VERSION,
  buildSnapshotPredictionPayload,
  computeTireWearModelConfigHash,
  computeTireWearModelSectionHashes,
  isWearModelConfigReproducible,
  readSnapshotPredictionPayload,
  resolveWearModelRegistryEntry,
} from './tire-wear-model-version';
import { TIRE_HEALTH_CONFIG } from './tire-health.config';

describe('tire-wear-model-version', () => {
  it('exposes a stable model version constant', () => {
    expect(TIRE_WEAR_MODEL_VERSION).toBe('tire-wear-v2');
  });

  it('hashes config sections deterministically', () => {
    const a = computeTireWearModelSectionHashes();
    const b = computeTireWearModelSectionHashes(TIRE_HEALTH_CONFIG);
    expect(a).toEqual(b);
    expect(computeTireWearModelConfigHash()).toBe(computeTireWearModelConfigHash());
  });

  it('changes hash when a config section changes', () => {
    const before = computeTireWearModelConfigHash();
    const mutated = {
      ...TIRE_HEALTH_CONFIG,
      alerts: {
        ...TIRE_HEALTH_CONFIG.alerts,
        lowRemainingKm: 2999,
      },
    };
    const after = computeTireWearModelConfigHash(mutated as typeof TIRE_HEALTH_CONFIG);
    expect(after).not.toBe(before);
  });

  it('registers the current executable model+config pair', () => {
    const hash = computeTireWearModelConfigHash();
    expect(
      resolveWearModelRegistryEntry(TIRE_WEAR_MODEL_VERSION, hash),
    ).not.toBeNull();
    expect(isWearModelConfigReproducible(TIRE_WEAR_MODEL_VERSION, hash)).toBe(true);
    expect(isWearModelConfigReproducible('tire-wear-v1', hash)).toBe(false);
    expect(isWearModelConfigReproducible(TIRE_WEAR_MODEL_VERSION, 'unknown')).toBe(false);
  });

  it('round-trips snapshot prediction payload', () => {
    const generatedAt = new Date('2026-07-16T12:00:00Z');
    const payload = buildSnapshotPredictionPayload({
      modelVersion: TIRE_WEAR_MODEL_VERSION,
      modelConfigHash: computeTireWearModelConfigHash(),
      predictionGeneratedAt: generatedAt,
      frontLeftMm: 6.8,
      frontRightMm: 6.7,
      rearLeftMm: 6.6,
      rearRightMm: 6.5,
    });

    const evidenceSummary = {
      ...payload,
      isMeasured: false,
    };

    const parsed = readSnapshotPredictionPayload(evidenceSummary);
    expect(parsed?.predictedTreadByAxle.front).toBeCloseTo(6.8, 1);
    expect(parsed?.predictedTreadByAxle.rear).toBeCloseTo(6.6, 1);
    expect(parsed?.modelVersion).toBe(TIRE_WEAR_MODEL_VERSION);
  });
});
