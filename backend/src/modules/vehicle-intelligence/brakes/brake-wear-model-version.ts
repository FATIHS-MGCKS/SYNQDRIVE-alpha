import { createHash } from 'crypto';
import { BRAKE_HEALTH_CONFIG, type BrakeHealthConfig } from './brake-health.config';

/**
 * Canonical brake wear prediction model version. Bump when formula semantics change.
 * Snapshots and validation rows stamp this value for historical reproducibility.
 */
export const BRAKE_WEAR_MODEL_VERSION = 'brake-wear-v2';

/** @deprecated Use {@link BRAKE_WEAR_MODEL_VERSION} */
export const BRAKE_RECALCULATION_MODEL_VERSION = BRAKE_WEAR_MODEL_VERSION;

export type BrakeWearModelConfigSection =
  | 'pad'
  | 'disc'
  | 'brakeBias'
  | 'padFactors'
  | 'discFactors'
  | 'calibration'
  | 'confidence'
  | 'setLevel'
  | 'alerts'
  | 'conditionBands'
  | 'inspection'
  | 'harshBraking'
  | 'coverageGap';

export interface BrakeWearModelConfigSectionHashes {
  pad: string;
  disc: string;
  brakeBias: string;
  padFactors: string;
  discFactors: string;
  calibration: string;
  confidence: string;
  setLevel: string;
  alerts: string;
  conditionBands: string;
  inspection: string;
  harshBraking: string;
  coverageGap: string;
}

export interface BrakeWearModelConfigRegistryEntry {
  modelVersion: string;
  modelConfigHash: string;
  sectionHashes: BrakeWearModelConfigSectionHashes;
  introducedAt: string;
  reproducible: true;
}

const GAP_POLICY_VERSION = 'brake-coverage-gap-v1';

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

/** Extract versioned config slices used by the brake wear formula. */
export function extractBrakeWearModelConfigSections(
  config: BrakeHealthConfig = BRAKE_HEALTH_CONFIG,
): Record<BrakeWearModelConfigSection, unknown> {
  return {
    pad: config.pad,
    disc: config.disc,
    brakeBias: config.brakeBias,
    padFactors: {
      padUsageFactors: config.padUsageFactors,
      padStopDensityAnchors: config.padStopDensityAnchors,
      padHardBrakeAnchors: config.padHardBrakeAnchors,
      padFullBrakingAnchors: config.padFullBrakingAnchors,
      padRekuFactors: config.padRekuFactors,
    },
    discFactors: {
      discUsageFactors: config.discUsageFactors,
      discHighSpeedBrakeAnchors: config.discHighSpeedBrakeAnchors,
      discHardBrakeAnchors: config.discHardBrakeAnchors,
      discFullBrakingAnchors: config.discFullBrakingAnchors,
      discThermalAnchors: config.discThermalAnchors,
      discRekuFactors: config.discRekuFactors,
    },
    calibration: config.calibration,
    confidence: {
      confidence: config.confidence,
      confidenceThresholds: config.confidenceThresholds,
      confidenceLevels: config.confidenceLevels,
      remainingKmRange: config.remainingKmRange,
      measurementFreshness: config.measurementFreshness,
    },
    setLevel: config.setLevel,
    alerts: config.alerts,
    conditionBands: config.conditionBands,
    inspection: config.inspection,
    harshBraking: config.harshBraking,
    coverageGap: { gapPolicyVersion: GAP_POLICY_VERSION },
  };
}

export function computeBrakeWearModelSectionHashes(
  config: BrakeHealthConfig = BRAKE_HEALTH_CONFIG,
): BrakeWearModelConfigSectionHashes {
  const sections = extractBrakeWearModelConfigSections(config);
  return {
    pad: hashSection(sections.pad),
    disc: hashSection(sections.disc),
    brakeBias: hashSection(sections.brakeBias),
    padFactors: hashSection(sections.padFactors),
    discFactors: hashSection(sections.discFactors),
    calibration: hashSection(sections.calibration),
    confidence: hashSection(sections.confidence),
    setLevel: hashSection(sections.setLevel),
    alerts: hashSection(sections.alerts),
    conditionBands: hashSection(sections.conditionBands),
    inspection: hashSection(sections.inspection),
    harshBraking: hashSection(sections.harshBraking),
    coverageGap: hashSection(sections.coverageGap),
  };
}

/** Deterministic hash of the full effective brake wear-model configuration. */
export function computeBrakeWearModelConfigHash(
  config: BrakeHealthConfig = BRAKE_HEALTH_CONFIG,
): string {
  const sectionHashes = computeBrakeWearModelSectionHashes(config);
  return createHash('sha256').update(canonicalJson(sectionHashes)).digest('hex');
}

/** @deprecated Use {@link computeBrakeWearModelConfigHash} */
export const computeBrakeHealthConfigHash = computeBrakeWearModelConfigHash;

const CURRENT_REGISTRY_ENTRY: BrakeWearModelConfigRegistryEntry = {
  modelVersion: BRAKE_WEAR_MODEL_VERSION,
  modelConfigHash: computeBrakeWearModelConfigHash(),
  sectionHashes: computeBrakeWearModelSectionHashes(),
  introducedAt: '2026-07-17',
  reproducible: true,
};

/** Known executable model+config combinations (current code can reproduce). */
export const BRAKE_WEAR_MODEL_CONFIG_REGISTRY: readonly BrakeWearModelConfigRegistryEntry[] = [
  CURRENT_REGISTRY_ENTRY,
];

export function resolveBrakeWearModelRegistryEntry(
  modelVersion: string | null | undefined,
  modelConfigHash: string | null | undefined,
): BrakeWearModelConfigRegistryEntry | null {
  if (!modelVersion || !modelConfigHash) return null;
  return (
    BRAKE_WEAR_MODEL_CONFIG_REGISTRY.find(
      (entry) =>
        entry.modelVersion === modelVersion && entry.modelConfigHash === modelConfigHash,
    ) ?? null
  );
}

export function isBrakeWearModelConfigReproducible(
  modelVersion: string | null | undefined,
  modelConfigHash: string | null | undefined,
): boolean {
  return resolveBrakeWearModelRegistryEntry(modelVersion, modelConfigHash) != null;
}

export interface BrakeSnapshotPredictionPayload {
  frontPadEstimateMm: number | null;
  rearPadEstimateMm: number | null;
  frontDiscEstimateMm: number | null;
  rearDiscEstimateMm: number | null;
  modelVersion: string;
  modelConfigHash: string;
  predictionGeneratedAt: string;
}

export function buildSnapshotPredictionPayload(args: {
  modelVersion: string;
  modelConfigHash: string;
  predictionGeneratedAt: Date;
  frontPadEstimateMm: number | null;
  rearPadEstimateMm: number | null;
  frontDiscEstimateMm: number | null;
  rearDiscEstimateMm: number | null;
}): BrakeSnapshotPredictionPayload {
  const round1 = (v: number | null) => (v != null ? Math.round(v * 10) / 10 : null);
  return {
    frontPadEstimateMm: round1(args.frontPadEstimateMm),
    rearPadEstimateMm: round1(args.rearPadEstimateMm),
    frontDiscEstimateMm: round1(args.frontDiscEstimateMm),
    rearDiscEstimateMm: round1(args.rearDiscEstimateMm),
    modelVersion: args.modelVersion,
    modelConfigHash: args.modelConfigHash,
    predictionGeneratedAt: args.predictionGeneratedAt.toISOString(),
  };
}

export function readSnapshotPredictionPayload(
  anchorEvidenceSummary: unknown,
): BrakeSnapshotPredictionPayload | null {
  if (
    anchorEvidenceSummary == null ||
    typeof anchorEvidenceSummary !== 'object' ||
    Array.isArray(anchorEvidenceSummary)
  ) {
    return null;
  }
  const row = anchorEvidenceSummary as Record<string, unknown>;
  const prediction = row.prediction;
  if (prediction == null || typeof prediction !== 'object' || Array.isArray(prediction)) {
    return null;
  }
  const payload = prediction as Record<string, unknown>;
  const readMm = (value: unknown) => (typeof value === 'number' ? value : null);
  return {
    frontPadEstimateMm: readMm(payload.frontPadEstimateMm),
    rearPadEstimateMm: readMm(payload.rearPadEstimateMm),
    frontDiscEstimateMm: readMm(payload.frontDiscEstimateMm),
    rearDiscEstimateMm: readMm(payload.rearDiscEstimateMm),
    modelVersion: String(payload.modelVersion ?? row.modelVersion ?? ''),
    modelConfigHash: String(payload.modelConfigHash ?? row.modelConfigHash ?? ''),
    predictionGeneratedAt: String(
      payload.predictionGeneratedAt ?? row.predictionGeneratedAt ?? '',
    ),
  };
}
