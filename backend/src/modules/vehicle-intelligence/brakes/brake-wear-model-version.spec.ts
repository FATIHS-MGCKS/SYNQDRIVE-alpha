import {
  BRAKE_WEAR_MODEL_VERSION,
  computeBrakeWearModelConfigHash,
  computeBrakeWearModelSectionHashes,
  isBrakeWearModelConfigReproducible,
  buildSnapshotPredictionPayload,
  readSnapshotPredictionPayload,
} from './brake-wear-model-version';
import { BRAKE_HEALTH_CONFIG } from './brake-health.config';

describe('brake-wear-model-version', () => {
  it('exposes a dedicated BRAKE_WEAR_MODEL_VERSION', () => {
    expect(BRAKE_WEAR_MODEL_VERSION).toBe('brake-wear-v2');
    expect(BRAKE_WEAR_MODEL_VERSION).not.toBe(BRAKE_HEALTH_CONFIG.MODEL_VERSION);
  });

  it('computes a deterministic sectioned config hash', () => {
    const a = computeBrakeWearModelConfigHash();
    const b = computeBrakeWearModelConfigHash();
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(computeBrakeWearModelSectionHashes().coverageGap).toHaveLength(64);
  });

  it('marks the current registry entry as reproducible', () => {
    const hash = computeBrakeWearModelConfigHash();
    expect(isBrakeWearModelConfigReproducible(BRAKE_WEAR_MODEL_VERSION, hash)).toBe(true);
    expect(isBrakeWearModelConfigReproducible('brake-wear-v1', hash)).toBe(false);
    expect(isBrakeWearModelConfigReproducible(BRAKE_WEAR_MODEL_VERSION, 'legacy-hash')).toBe(
      false,
    );
  });

  it('round-trips snapshot prediction payload via anchor evidence summary', () => {
    const generatedAt = new Date('2026-07-17T10:00:00Z');
    const payload = buildSnapshotPredictionPayload({
      modelVersion: BRAKE_WEAR_MODEL_VERSION,
      modelConfigHash: computeBrakeWearModelConfigHash(),
      predictionGeneratedAt: generatedAt,
      frontPadEstimateMm: 8.4,
      rearPadEstimateMm: 7.9,
      frontDiscEstimateMm: 27.1,
      rearDiscEstimateMm: 25.8,
    });

    const read = readSnapshotPredictionPayload({
      prediction: payload,
      modelVersion: payload.modelVersion,
    });

    expect(read?.frontPadEstimateMm).toBe(8.4);
    expect(read?.rearPadEstimateMm).toBe(7.9);
    expect(read?.modelVersion).toBe(BRAKE_WEAR_MODEL_VERSION);
  });
});
