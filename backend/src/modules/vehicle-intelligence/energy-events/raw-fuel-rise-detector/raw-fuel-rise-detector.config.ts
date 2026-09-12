/** Versioned F3 detector thresholds — epistemic labels in thresholdProvenance. */
export const RAW_FUEL_RISE_DETECTOR_CONFIG_V1 = {
  absolute: {
    materialRiseLiters: 5,
    prePlateauMinSamples: 3,
    prePlateauToleranceLiters: 0.5,
    postPlateauMinSamples: 3,
    postPlateauToleranceLiters: 0.5,
    postPlateauMinPersistenceMs: 2 * 60 * 1000,
    negativeWobbleLiters: 1,
    maxSampleGapMs: 6 * 60 * 1000,
  },
  relative: {
    materialRisePercent: 5,
    prePlateauMinSamples: 3,
    prePlateauTolerancePercent: 1.0,
    postPlateauMinSamples: 3,
    postPlateauTolerancePercent: 1.0,
    postPlateauMinPersistenceMs: 2 * 60 * 1000,
    negativeWobblePercent: 1,
    maxSampleGapMs: 6 * 60 * 1000,
  },
  riseMinDurationMs: 30 * 1000,
  riseMaxDurationMs: 45 * 60 * 1000,
  relativeValidRange: { min: 0, max: 100 },
  thresholdProvenance: {
    materialRiseLiters: 'PROVISIONAL',
    materialRisePercent: 'PROVISIONAL',
    prePlateauMinSamples: 'INFERRED',
    postPlateauMinSamples: 'INFERRED',
    prePlateauToleranceLiters: 'INFERRED',
    postPlateauToleranceLiters: 'INFERRED',
    maxSampleGapMs: 'PROVISIONAL_INCIDENT_ANCHORED',
    negativeWobbleLiters: 'INFERRED',
    negativeWobblePercent: 'INFERRED',
    postPlateauMinPersistenceMs: 'INFERRED',
    riseMinDurationMs: 'INFERRED_FROM_EXISTING_CODE',
    riseMaxDurationMs: 'PROVISIONAL',
  },
} as const;

export type RawFuelRiseDetectorConfig = typeof RAW_FUEL_RISE_DETECTOR_CONFIG_V1;

export const RFRF_RISE_DETECTION_VERSION = 'rfrf-rise-v1';
export const RFRF_RISE_DETECTOR_VERSION = 'rfrf-rise-detector-v1';
