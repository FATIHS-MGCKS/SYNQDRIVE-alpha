/**
 * Central tire evidence / provenance helpers.
 *
 * All write paths should resolve evidence through these functions instead of
 * scattering string comparisons or ad-hoc confidence logic.
 */

import { TireBaselineStatus, TireEvidenceSource } from '@prisma/client';
import {
  AiTireSpec,
  NewTreadRefSource,
  TIRE_HEALTH_CONFIG,
  TreadSource,
} from './tire-health.config';
import {
  mapLegacyMeasurementSourceToEvidence,
} from './tire-evidence-source';
import { buildSetupBaselineProvenance } from './tire-provenance.repository';

export type WheelPos = 'FL' | 'FR' | 'RL' | 'RR';

const MEASURED_EVIDENCE_SOURCES: ReadonlySet<TireEvidenceSource> = new Set([
  TireEvidenceSource.MANUAL_MEASUREMENT,
  TireEvidenceSource.WORKSHOP_MEASUREMENT,
  TireEvidenceSource.DOCUMENT_MEASUREMENT,
]);

const CONFIRMED_EVIDENCE_SOURCES: ReadonlySet<TireEvidenceSource> = new Set([
  TireEvidenceSource.MANUFACTURER_CONFIRMED,
  TireEvidenceSource.USER_CONFIRMED,
]);

const BASELINE_CONFIDENCE_BY_SOURCE: Record<TireEvidenceSource, number> = {
  [TireEvidenceSource.MANUAL_MEASUREMENT]: 90,
  [TireEvidenceSource.WORKSHOP_MEASUREMENT]: 88,
  [TireEvidenceSource.DOCUMENT_MEASUREMENT]: 75,
  [TireEvidenceSource.MANUFACTURER_CONFIRMED]: 82,
  [TireEvidenceSource.USER_CONFIRMED]: 78,
  [TireEvidenceSource.AI_ESTIMATED]: 45,
  [TireEvidenceSource.MODEL_ESTIMATED]: 35,
  [TireEvidenceSource.DEFAULT_ASSUMPTION]: 12,
  [TireEvidenceSource.PROVIDER_SIGNAL]: 30,
  [TireEvidenceSource.UNKNOWN]: 15,
};

export function isMeasuredEvidence(
  source: TireEvidenceSource | null | undefined,
): boolean {
  return source != null && MEASURED_EVIDENCE_SOURCES.has(source);
}

export function isConfirmedEvidence(
  source: TireEvidenceSource | null | undefined,
): boolean {
  return source != null && CONFIRMED_EVIDENCE_SOURCES.has(source);
}

export function deriveBaselineConfidence(
  evidenceSource: TireEvidenceSource,
  opts?: {
    aiConfidenceScore?: number | null;
    userConfirmedSpec?: boolean | null;
    partialWheelCoverage?: boolean;
  },
): number {
  let score = BASELINE_CONFIDENCE_BY_SOURCE[evidenceSource] ?? 15;

  if (evidenceSource === TireEvidenceSource.AI_ESTIMATED && opts?.aiConfidenceScore != null) {
    score = Math.round(25 + (opts.aiConfidenceScore / 100) * 35);
  }

  if (evidenceSource === TireEvidenceSource.USER_CONFIRMED && opts?.userConfirmedSpec) {
    score = Math.min(90, score + 8);
  }

  if (opts?.partialWheelCoverage) {
    score = Math.max(10, score - 15);
  }

  if (evidenceSource === TireEvidenceSource.DEFAULT_ASSUMPTION) {
    score = Math.min(score, 20);
  }

  return Math.max(0, Math.min(100, score));
}

export function deriveBaselineStatus(
  evidenceSource: TireEvidenceSource,
  opts?: { partialWheelCoverage?: boolean },
): TireBaselineStatus {
  if (evidenceSource === TireEvidenceSource.DEFAULT_ASSUMPTION) {
    return TireBaselineStatus.INCOMPLETE;
  }
  if (evidenceSource === TireEvidenceSource.UNKNOWN) {
    return TireBaselineStatus.UNKNOWN;
  }
  if (
    evidenceSource === TireEvidenceSource.AI_ESTIMATED ||
    evidenceSource === TireEvidenceSource.MODEL_ESTIMATED ||
    evidenceSource === TireEvidenceSource.PROVIDER_SIGNAL
  ) {
    return TireBaselineStatus.ESTIMATED;
  }
  if (evidenceSource === TireEvidenceSource.DOCUMENT_MEASUREMENT) {
    return TireBaselineStatus.DOCUMENTED;
  }
  if (opts?.partialWheelCoverage) {
    return TireBaselineStatus.INCOMPLETE;
  }
  if (isMeasuredEvidence(evidenceSource) || isConfirmedEvidence(evidenceSource)) {
    return TireBaselineStatus.CONFIRMED;
  }
  return TireBaselineStatus.UNKNOWN;
}

export interface ResolveInitialTreadEvidenceInput {
  treadMm?: number | null;
  treadByPosition?: Partial<Record<WheelPos, number | null>>;
  setupInitialTreadFrontMm?: number | null;
  setupInitialTreadRearMm?: number | null;
  setupInitialTreadDepthMm?: number | null;
  setupBaselineEvidenceSource?: TireEvidenceSource | null;
  legacySource?: string | null;
  linkedDocumentUrl?: string | null;
  workshopName?: string | null;
  aiTireSpec?: AiTireSpec | null;
  manufacturerConfirmed?: boolean;
  userConfirmedSpec?: boolean | null;
  measuredAt?: Date | null;
  confirmedAt?: Date | null;
  evidenceId?: string | null;
  /** When true, tread value is the configured 8 mm fallback with no real anchor. */
  usedDefaultFallback?: boolean;
  /** Rotation / wear-model projection without a fresh measurement. */
  modelProjected?: boolean;
}

export interface ResolvedInitialTreadEvidence {
  treadMm: number;
  evidenceSource: TireEvidenceSource;
  baselineConfidence: number;
  baselineStatus: TireBaselineStatus;
  measuredAt: Date | null;
  confirmedAt: Date | null;
  evidenceId: string | null;
  usedDefaultFallback: boolean;
}

export function isDefaultTreadFallbackValue(
  treadMm: number | null | undefined,
): boolean {
  if (treadMm == null) return false;
  return Math.abs(treadMm - TIRE_HEALTH_CONFIG.defaultInitialTreadFallbackMm) < 0.001;
}

export function resolveEvidenceFromLegacySource(
  legacySource: string | null | undefined,
  opts?: {
    linkedDocumentUrl?: string | null;
    workshopName?: string | null;
    modelProjected?: boolean;
    replacement?: boolean;
  },
): TireEvidenceSource {
  if (opts?.modelProjected) {
    return TireEvidenceSource.MODEL_ESTIMATED;
  }
  if (opts?.linkedDocumentUrl) {
    return TireEvidenceSource.DOCUMENT_MEASUREMENT;
  }
  if (opts?.workshopName) {
    return TireEvidenceSource.WORKSHOP_MEASUREMENT;
  }

  const mapped = mapLegacyMeasurementSourceToEvidence(legacySource);
  if (mapped) return mapped;

  const normalized = String(legacySource ?? '').trim().toLowerCase();
  if (normalized === 'replacement') {
    return opts?.workshopName
      ? TireEvidenceSource.WORKSHOP_MEASUREMENT
      : TireEvidenceSource.MANUAL_MEASUREMENT;
  }
  if (normalized === 'api' || normalized === 'dimo' || normalized === 'oem') {
    return TireEvidenceSource.DOCUMENT_MEASUREMENT;
  }

  return TireEvidenceSource.UNKNOWN;
}

export function mapNewTreadRefSourceToEvidence(
  source: NewTreadRefSource,
  aiTireSpec?: AiTireSpec | null,
): TireEvidenceSource {
  switch (source) {
    case 'manual_confirmed':
      return TireEvidenceSource.USER_CONFIRMED;
    case 'ai_spec':
      if (aiTireSpec?.userConfirmedSpec) {
        return TireEvidenceSource.USER_CONFIRMED;
      }
      if (aiTireSpec?.manufacturerSourceUrl) {
        return TireEvidenceSource.MANUFACTURER_CONFIRMED;
      }
      return TireEvidenceSource.AI_ESTIMATED;
    case 'archetype_default':
    case 'season_fallback':
      return TireEvidenceSource.DEFAULT_ASSUMPTION;
    default:
      return TireEvidenceSource.UNKNOWN;
  }
}

export function mapTreadSourceToEvidence(
  treadSource: TreadSource,
  baselineSource?: TireEvidenceSource | null,
): TireEvidenceSource {
  switch (treadSource) {
    case 'manual_measurement':
      return baselineSource && isMeasuredEvidence(baselineSource)
        ? baselineSource
        : TireEvidenceSource.MANUAL_MEASUREMENT;
    case 'calibration_projection':
      return TireEvidenceSource.MODEL_ESTIMATED;
    case 'initial_manual_plus_wear':
      return baselineSource ?? TireEvidenceSource.USER_CONFIRMED;
    case 'fallback_estimate':
      return TireEvidenceSource.DEFAULT_ASSUMPTION;
    default:
      return TireEvidenceSource.UNKNOWN;
  }
}

export function resolveWheelTreadMm(
  position: WheelPos,
  input: Pick<
    ResolveInitialTreadEvidenceInput,
    | 'treadByPosition'
    | 'setupInitialTreadFrontMm'
    | 'setupInitialTreadRearMm'
    | 'setupInitialTreadDepthMm'
  >,
): { treadMm: number; usedDefaultFallback: boolean } {
  const perWheel = input.treadByPosition?.[position];
  if (perWheel != null) {
    return { treadMm: perWheel, usedDefaultFallback: false };
  }

  const isFront = position.startsWith('F');
  const axleTread = isFront
    ? input.setupInitialTreadFrontMm
    : input.setupInitialTreadRearMm;
  if (axleTread != null) {
    return { treadMm: axleTread, usedDefaultFallback: false };
  }

  if (input.setupInitialTreadDepthMm != null) {
    return { treadMm: input.setupInitialTreadDepthMm, usedDefaultFallback: false };
  }

  const frontFallback =
    input.treadByPosition?.FL ??
    input.treadByPosition?.FR ??
    input.setupInitialTreadFrontMm ??
    input.setupInitialTreadDepthMm;
  if (!isFront && frontFallback != null) {
    return { treadMm: frontFallback, usedDefaultFallback: false };
  }

  return {
    treadMm: TIRE_HEALTH_CONFIG.defaultInitialTreadFallbackMm,
    usedDefaultFallback: true,
  };
}

export function resolveInitialTreadEvidence(
  input: ResolveInitialTreadEvidenceInput,
): ResolvedInitialTreadEvidence {
  const treadMm =
    input.treadMm ??
    input.setupInitialTreadDepthMm ??
    input.setupInitialTreadFrontMm ??
    input.setupInitialTreadRearMm ??
    TIRE_HEALTH_CONFIG.defaultInitialTreadFallbackMm;

  const usedDefaultFallback =
    input.usedDefaultFallback ??
  (
    input.treadMm == null &&
    input.setupInitialTreadFrontMm == null &&
    input.setupInitialTreadRearMm == null &&
    input.setupInitialTreadDepthMm == null &&
    !input.treadByPosition
  );

  let evidenceSource: TireEvidenceSource;

  if (input.setupBaselineEvidenceSource) {
    evidenceSource = input.setupBaselineEvidenceSource;
  } else if (input.manufacturerConfirmed) {
    evidenceSource = TireEvidenceSource.MANUFACTURER_CONFIRMED;
  } else if (input.userConfirmedSpec || input.aiTireSpec?.userConfirmedSpec) {
    evidenceSource = TireEvidenceSource.USER_CONFIRMED;
  } else if (input.aiTireSpec?.newTreadDepthMm != null && !input.usedDefaultFallback) {
    if (input.aiTireSpec.manufacturerSourceUrl) {
      evidenceSource = TireEvidenceSource.MANUFACTURER_CONFIRMED;
    } else {
      evidenceSource = TireEvidenceSource.AI_ESTIMATED;
    }
  } else if (input.modelProjected) {
    evidenceSource = TireEvidenceSource.MODEL_ESTIMATED;
  } else if (input.usedDefaultFallback || (usedDefaultFallback && isDefaultTreadFallbackValue(treadMm))) {
    evidenceSource = TireEvidenceSource.DEFAULT_ASSUMPTION;
  } else if (input.legacySource || input.linkedDocumentUrl || input.workshopName) {
    evidenceSource = resolveEvidenceFromLegacySource(input.legacySource, {
      linkedDocumentUrl: input.linkedDocumentUrl,
      workshopName: input.workshopName,
      modelProjected: input.modelProjected,
    });
  } else if (input.treadMm != null || input.setupInitialTreadFrontMm != null || input.setupInitialTreadRearMm != null) {
    evidenceSource = TireEvidenceSource.USER_CONFIRMED;
  } else {
    evidenceSource = TireEvidenceSource.UNKNOWN;
  }

  const partialWheelCoverage = input.treadByPosition
    ? Object.values(input.treadByPosition).filter((v) => v != null).length > 0 &&
      Object.values(input.treadByPosition).filter((v) => v != null).length < 4
    : false;

  const baselineConfidence = deriveBaselineConfidence(evidenceSource, {
    aiConfidenceScore: input.aiTireSpec?.confidenceScore,
    userConfirmedSpec: input.userConfirmedSpec ?? input.aiTireSpec?.userConfirmedSpec,
    partialWheelCoverage,
  });

  const baselineStatus = deriveBaselineStatus(evidenceSource, { partialWheelCoverage });

  return {
    treadMm,
    evidenceSource,
    baselineConfidence,
    baselineStatus,
    measuredAt: isMeasuredEvidence(evidenceSource) ? input.measuredAt ?? null : null,
    confirmedAt:
      isConfirmedEvidence(evidenceSource) || isMeasuredEvidence(evidenceSource)
        ? input.confirmedAt ?? input.measuredAt ?? null
        : null,
    evidenceId: isMeasuredEvidence(evidenceSource) ? input.evidenceId ?? null : null,
    usedDefaultFallback: evidenceSource === TireEvidenceSource.DEFAULT_ASSUMPTION,
  };
}

export function buildSetupBaselineFields(
  input: ResolveInitialTreadEvidenceInput,
) {
  const resolved = resolveInitialTreadEvidence(input);
  return buildSetupBaselineProvenance({
    evidenceSource: resolved.evidenceSource,
    measuredAt: resolved.measuredAt,
    confirmedAt: resolved.confirmedAt,
    evidenceId: resolved.evidenceId,
    baselineConfidence: resolved.baselineConfidence,
    baselineStatus: resolved.baselineStatus,
  });
}

export interface SnapshotEvidenceSummary {
  currentTreadValue: number;
  currentTreadSource: TireEvidenceSource;
  isMeasured: boolean;
  isEstimated: boolean;
  isDefaultAssumption: boolean;
  lastActualMeasurementAt: string | null;
  baselineSource: TireEvidenceSource | null;
  measurementState: 'measured' | 'estimated' | 'mixed';
}

export function buildSnapshotEvidenceSummary(args: {
  currentTreadMm: number;
  treadSource: TreadSource;
  baselineSource?: TireEvidenceSource | null;
  lastMeasurementAt?: Date | null;
  measurementEvidenceSource?: TireEvidenceSource | null;
}): SnapshotEvidenceSummary {
  const currentTreadSource = args.measurementEvidenceSource ??
    mapTreadSourceToEvidence(args.treadSource, args.baselineSource);

  const isMeasured = isMeasuredEvidence(currentTreadSource);
  const isDefaultAssumption = currentTreadSource === TireEvidenceSource.DEFAULT_ASSUMPTION;
  const isEstimated =
    !isMeasured &&
    (currentTreadSource === TireEvidenceSource.MODEL_ESTIMATED ||
      currentTreadSource === TireEvidenceSource.AI_ESTIMATED ||
      isDefaultAssumption);

  let measurementState: SnapshotEvidenceSummary['measurementState'] = 'estimated';
  if (args.treadSource === 'manual_measurement') measurementState = 'measured';
  else if (args.treadSource === 'calibration_projection') measurementState = 'mixed';

  return {
    currentTreadValue: args.currentTreadMm,
    currentTreadSource,
    isMeasured,
    isEstimated,
    isDefaultAssumption,
    lastActualMeasurementAt: args.lastMeasurementAt?.toISOString() ?? null,
    baselineSource: args.baselineSource ?? null,
    measurementState,
  };
}

export function resolveSummaryProvenanceFlags(
  evidenceSource: TireEvidenceSource | null | undefined,
): Pick<
  SnapshotEvidenceSummary,
  'isMeasured' | 'isEstimated' | 'isDefaultAssumption'
> {
  const source = evidenceSource ?? TireEvidenceSource.UNKNOWN;
  return {
    isMeasured: isMeasuredEvidence(source),
    isEstimated:
      source === TireEvidenceSource.MODEL_ESTIMATED ||
      source === TireEvidenceSource.AI_ESTIMATED ||
      source === TireEvidenceSource.DEFAULT_ASSUMPTION,
    isDefaultAssumption: source === TireEvidenceSource.DEFAULT_ASSUMPTION,
  };
}
