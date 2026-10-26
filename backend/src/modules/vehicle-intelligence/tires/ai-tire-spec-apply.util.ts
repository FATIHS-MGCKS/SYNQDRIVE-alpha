import { TireBaselineStatus, TireEvidenceSource } from '@prisma/client';
import type { PersistedAiTireSpec } from './ai-tire-spec-normalizer';
import {
  deriveBaselineConfidence,
  deriveBaselineStatus,
  isConfirmedEvidence,
  isMeasuredEvidence,
} from './tire-evidence-provenance';
import { buildSetupBaselineProvenance } from './tire-provenance.repository';

export interface TireSetupBaselineSnapshot {
  initialTreadEvidenceSource: TireEvidenceSource | null;
  initialTreadDepthMm?: number | null;
  initialTreadFrontMm?: number | null;
  initialTreadRearMm?: number | null;
}

export function isProtectedTreadBaseline(
  source: TireEvidenceSource | null | undefined,
): boolean {
  if (source == null) return false;
  return isMeasuredEvidence(source) || isConfirmedEvidence(source);
}

export function hasAnchoredTreadMeasurements(setup: TireSetupBaselineSnapshot): boolean {
  return (
    setup.initialTreadDepthMm != null ||
    setup.initialTreadFrontMm != null ||
    setup.initialTreadRearMm != null
  );
}

/**
 * Build Prisma update payload for AI tire spec apply.
 * Never uses factory nominal newTreadDepthMm as measured tread.
 * Preserves confirmed/measured baseline provenance when already anchored.
 */
export function buildAiTireSpecApplySetupUpdate(args: {
  setup: TireSetupBaselineSnapshot;
  persisted: PersistedAiTireSpec;
  confidenceScore: number | null;
}): {
  aiTireSpec: PersistedAiTireSpec;
  initialTreadEvidenceSource?: TireEvidenceSource;
  initialTreadMeasuredAt?: null;
  initialTreadConfirmedAt?: null;
  initialTreadEvidenceId?: null;
  baselineConfidence?: number;
  baselineStatus?: TireBaselineStatus;
} {
  const base = { aiTireSpec: args.persisted };

  if (
    isProtectedTreadBaseline(args.setup.initialTreadEvidenceSource) ||
    hasAnchoredTreadMeasurements(args.setup)
  ) {
    return base;
  }

  const evidenceSource = TireEvidenceSource.AI_ESTIMATED;
  const baselineConfidence = deriveBaselineConfidence(evidenceSource, {
    aiConfidenceScore: args.confidenceScore,
    userConfirmedSpec: false,
  });
  const baselineStatus = deriveBaselineStatus(evidenceSource);
  const provenance = buildSetupBaselineProvenance({
    evidenceSource,
    measuredAt: null,
    confirmedAt: null,
    evidenceId: null,
    baselineConfidence,
    baselineStatus,
  });

  return {
    ...base,
    initialTreadEvidenceSource: provenance.initialTreadEvidenceSource ?? evidenceSource,
    initialTreadMeasuredAt: null,
    initialTreadConfirmedAt: null,
    initialTreadEvidenceId: null,
    baselineConfidence: provenance.baselineConfidence ?? baselineConfidence,
    baselineStatus: provenance.baselineStatus ?? baselineStatus,
  };
}
