import { createHash } from 'crypto';
import { TIRE_HEALTH_CONFIG, type TireHealthConfig } from './tire-health.config';

/**
 * Canonical tire wear prediction model version. Bump when formula semantics change.
 * Snapshots and validation rows stamp this value for historical reproducibility.
 */
export const TIRE_WEAR_MODEL_VERSION = 'tire-wear-v2';

/** @deprecated Use {@link TIRE_WEAR_MODEL_VERSION} */
export const TIRE_RECALCULATION_MODEL_VERSION = TIRE_WEAR_MODEL_VERSION;

export type TireWearModelConfigSection =
  | 'baseWear'
  | 'axleFactors'
  | 'powertrain'
  | 'driving'
  | 'pressure'
  | 'temperature'
  | 'clamps'
  | 'thresholds'
  | 'confidenceRules'
  | 'regression'
  | 'calibration'
  | 'staggered'
  | 'interaction';

export interface TireWearModelConfigSectionHashes {
  baseWear: string;
  axleFactors: string;
  powertrain: string;
  driving: string;
  pressure: string;
  temperature: string;
  clamps: string;
  thresholds: string;
  confidenceRules: string;
  regression: string;
  calibration: string;
  staggered: string;
  interaction: string;
}

export interface TireWearModelConfigRegistryEntry {
  modelVersion: string;
  modelConfigHash: string;
  sectionHashes: TireWearModelConfigSectionHashes;
  introducedAt: string;
  reproducible: true;
}

function stableSortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSortObject);
  }
  if (value != null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableSortObject((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(stableSortObject(value));
}

function hashSection(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/** Extract versioned config slices used by the wear formula. */
export function extractTireWearModelConfigSections(
  config: TireHealthConfig = TIRE_HEALTH_CONFIG,
): Record<TireWearModelConfigSection, unknown> {
  return {
    baseWear: {
      legalMinTreadMm: config.legalMinTreadMm,
      replaceThresholds: config.replaceThresholds,
      defaultReplaceThresholdMm: config.defaultReplaceThresholdMm,
      defaultInitialTreadMm: config.defaultInitialTreadMm,
      defaultInitialTreadFallbackMm: config.defaultInitialTreadFallbackMm,
      archetypeDefaults: config.archetypeDefaults,
      expectedLifeKm: config.expectedLifeKm,
      urbanHeavyLifeMultiplier: config.urbanHeavyLifeMultiplier,
      setLevelHealth: config.setLevelHealth,
    },
    axleFactors: {
      drivetrainBias: config.drivetrainBias,
      steeringAxleBias: config.steeringAxleBias,
      loadBiasDampingCoeff: config.loadBiasDampingCoeff,
    },
    powertrain: {
      regenFactors: config.regenFactors,
    },
    driving: {
      usageFactors: config.usageFactors,
      behaviorFactorWeights: config.behaviorFactorWeights,
      behaviorScoreAnchors: config.behaviorScoreAnchors,
      scoreFactorByDrivingScore: config.scoreFactorByDrivingScore,
    },
    pressure: config.pressure,
    temperature: {
      temperatureFactors: config.temperatureFactors,
      heatStress: config.heatStress,
      seasonMismatch: config.seasonMismatch,
    },
    clamps: config.factorCaps,
    thresholds: {
      alerts: config.alerts,
      rotationReview: config.rotationReview,
      treadStatusBands: config.treadStatusBands,
      defaultTreadStatusBand: config.defaultTreadStatusBand,
      measurementFreshness: config.measurementFreshness,
      tireAge: config.tireAge,
      seasonCalendar: config.seasonCalendar,
    },
    confidenceRules: {
      confidence: config.confidence,
      confidenceLevels: config.confidenceLevels,
      confidenceThresholds: config.confidenceThresholds,
      remainingKmConfidenceDiscount: config.remainingKmConfidenceDiscount,
    },
    regression: config.regression,
    calibration: config.calibration,
    staggered: config.staggered,
    interaction: config.interaction,
  };
}

export function computeTireWearModelSectionHashes(
  config: TireHealthConfig = TIRE_HEALTH_CONFIG,
): TireWearModelConfigSectionHashes {
  const sections = extractTireWearModelConfigSections(config);
  return {
    baseWear: hashSection(sections.baseWear),
    axleFactors: hashSection(sections.axleFactors),
    powertrain: hashSection(sections.powertrain),
    driving: hashSection(sections.driving),
    pressure: hashSection(sections.pressure),
    temperature: hashSection(sections.temperature),
    clamps: hashSection(sections.clamps),
    thresholds: hashSection(sections.thresholds),
    confidenceRules: hashSection(sections.confidenceRules),
    regression: hashSection(sections.regression),
    calibration: hashSection(sections.calibration),
    staggered: hashSection(sections.staggered),
    interaction: hashSection(sections.interaction),
  };
}

/** Deterministic hash of the full effective wear-model configuration. */
export function computeTireWearModelConfigHash(
  config: TireHealthConfig = TIRE_HEALTH_CONFIG,
): string {
  const sectionHashes = computeTireWearModelSectionHashes(config);
  return createHash('sha256').update(canonicalJson(sectionHashes)).digest('hex');
}

/** @deprecated Use {@link computeTireWearModelConfigHash} */
export const computeTireHealthConfigHash = computeTireWearModelConfigHash;

const CURRENT_REGISTRY_ENTRY: TireWearModelConfigRegistryEntry = {
  modelVersion: TIRE_WEAR_MODEL_VERSION,
  modelConfigHash: computeTireWearModelConfigHash(),
  sectionHashes: computeTireWearModelSectionHashes(),
  introducedAt: '2026-07-16',
  reproducible: true,
};

/** Known executable model+config combinations (current code can reproduce). */
export const TIRE_WEAR_MODEL_CONFIG_REGISTRY: readonly TireWearModelConfigRegistryEntry[] = [
  CURRENT_REGISTRY_ENTRY,
];

export function resolveWearModelRegistryEntry(
  modelVersion: string | null | undefined,
  modelConfigHash: string | null | undefined,
): TireWearModelConfigRegistryEntry | null {
  if (!modelVersion || !modelConfigHash) return null;
  return (
    TIRE_WEAR_MODEL_CONFIG_REGISTRY.find(
      (entry) =>
        entry.modelVersion === modelVersion &&
        entry.modelConfigHash === modelConfigHash,
    ) ?? null
  );
}

export function isWearModelConfigReproducible(
  modelVersion: string | null | undefined,
  modelConfigHash: string | null | undefined,
): boolean {
  return resolveWearModelRegistryEntry(modelVersion, modelConfigHash) != null;
}

export interface SnapshotPredictionPayload {
  predictedTreadByAxle: { front: number; rear: number };
  predictedTreadByWheel: {
    FL: number;
    FR: number;
    RL: number;
    RR: number;
  };
  modelVersion: string;
  modelConfigHash: string;
  predictionGeneratedAt: string;
}

export function buildSnapshotPredictionPayload(args: {
  modelVersion: string;
  modelConfigHash: string;
  predictionGeneratedAt: Date;
  frontLeftMm: number;
  frontRightMm: number;
  rearLeftMm: number;
  rearRightMm: number;
}): SnapshotPredictionPayload {
  const round1 = (v: number) => Math.round(v * 10) / 10;
  return {
    predictedTreadByAxle: {
      front: round1((args.frontLeftMm + args.frontRightMm) / 2),
      rear: round1((args.rearLeftMm + args.rearRightMm) / 2),
    },
    predictedTreadByWheel: {
      FL: round1(args.frontLeftMm),
      FR: round1(args.frontRightMm),
      RL: round1(args.rearLeftMm),
      RR: round1(args.rearRightMm),
    },
    modelVersion: args.modelVersion,
    modelConfigHash: args.modelConfigHash,
    predictionGeneratedAt: args.predictionGeneratedAt.toISOString(),
  };
}

export function readSnapshotPredictionPayload(
  evidenceSummary: unknown,
): SnapshotPredictionPayload | null {
  if (evidenceSummary == null || typeof evidenceSummary !== 'object' || Array.isArray(evidenceSummary)) {
    return null;
  }
  const row = evidenceSummary as Record<string, unknown>;
  const byAxle = row.predictedTreadByAxle;
  const byWheel = row.predictedTreadByWheel;
  if (
    byAxle == null ||
    typeof byAxle !== 'object' ||
    byWheel == null ||
    typeof byWheel !== 'object'
  ) {
    return null;
  }
  const axle = byAxle as Record<string, unknown>;
  const wheel = byWheel as Record<string, unknown>;
  if (
    typeof axle.front !== 'number' ||
    typeof axle.rear !== 'number' ||
    typeof wheel.FL !== 'number' ||
    typeof wheel.FR !== 'number' ||
    typeof wheel.RL !== 'number' ||
    typeof wheel.RR !== 'number'
  ) {
    return null;
  }
  return {
    predictedTreadByAxle: { front: axle.front, rear: axle.rear },
    predictedTreadByWheel: {
      FL: wheel.FL,
      FR: wheel.FR,
      RL: wheel.RL,
      RR: wheel.RR,
    },
    modelVersion: String(row.modelVersion ?? ''),
    modelConfigHash: String(row.modelConfigHash ?? ''),
    predictionGeneratedAt: String(row.predictionGeneratedAt ?? ''),
  };
}
