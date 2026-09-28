import type {
  RawFuelAbsoluteDetectionAdmissibility,
  RawFuelAbsoluteSignalTrust,
} from './raw-fuel-refuel-fallback.types';
import type { RawFuelHybridTrustProvenance } from './raw-fuel-hybrid-absolute-signal-trust.authority';
import type { RawFuelPrePlateauBaselineRecencyClassification } from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';

export const HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY = 'hybridAbsoluteSignalTrust';

export interface HybridAbsoluteSignalTrustEvidence {
  authorityVersion: string;
  computedHybridClassification: RawFuelAbsoluteSignalTrust;
  reasonCode: string;
  baselineRecencyClassification: RawFuelPrePlateauBaselineRecencyClassification | 'NOT_PROVIDED';
  absoluteDetectionAdmissibility: RawFuelAbsoluteDetectionAdmissibility;
  relativeSampleCoverage: 'NONE' | 'PARTIAL' | 'SUFFICIENT';
  absoluteDeltaLiters: number | null;
  relativeDeltaPercent: number | null;
  materialRiseLiters: number;
  materialRisePercent: number;
  relativePrePlateauLocal: 'UNKNOWN' | 'VALID' | 'INVALID';
  relativePostPlateauLocal: 'UNKNOWN' | 'VALID' | 'INVALID';
  absolutePostPlateauLocal: 'UNKNOWN' | 'VALID' | 'INVALID';
}

export function buildHybridAbsoluteSignalTrustEvidence(
  provenance: RawFuelHybridTrustProvenance,
  locality: {
    relativePrePlateauLocal: HybridAbsoluteSignalTrustEvidence['relativePrePlateauLocal'];
    relativePostPlateauLocal: HybridAbsoluteSignalTrustEvidence['relativePostPlateauLocal'];
    absolutePostPlateauLocal: HybridAbsoluteSignalTrustEvidence['absolutePostPlateauLocal'];
  },
): HybridAbsoluteSignalTrustEvidence {
  return {
    authorityVersion: provenance.authorityVersion,
    computedHybridClassification: provenance.classification,
    reasonCode: provenance.reasonCode,
    baselineRecencyClassification: provenance.baselineRecencyClassification,
    absoluteDetectionAdmissibility: provenance.absoluteDetectionAdmissibility,
    relativeSampleCoverage: provenance.relativeSampleCoverage,
    absoluteDeltaLiters: provenance.absoluteDeltaLiters,
    relativeDeltaPercent: provenance.relativeDeltaPercent,
    materialRiseLiters: provenance.materialRiseLiters,
    materialRisePercent: provenance.materialRisePercent,
    relativePrePlateauLocal: locality.relativePrePlateauLocal,
    relativePostPlateauLocal: locality.relativePostPlateauLocal,
    absolutePostPlateauLocal: locality.absolutePostPlateauLocal,
  };
}

export function readHybridAbsoluteSignalTrustEvidence(
  evidenceMeta: unknown,
): HybridAbsoluteSignalTrustEvidence | null {
  if (!evidenceMeta || typeof evidenceMeta !== 'object' || Array.isArray(evidenceMeta)) {
    return null;
  }
  const block = (evidenceMeta as Record<string, unknown>)[HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY];
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    return null;
  }
  const m = block as Record<string, unknown>;
  if (
    typeof m.authorityVersion !== 'string' ||
    typeof m.computedHybridClassification !== 'string' ||
    typeof m.reasonCode !== 'string' ||
    typeof m.baselineRecencyClassification !== 'string' ||
    typeof m.absoluteDetectionAdmissibility !== 'string' ||
    typeof m.relativeSampleCoverage !== 'string' ||
    typeof m.materialRiseLiters !== 'number' ||
    typeof m.materialRisePercent !== 'number'
  ) {
    return null;
  }
  return m as unknown as HybridAbsoluteSignalTrustEvidence;
}

export function mergeHybridAbsoluteSignalTrustEvidence(
  evidenceMeta: Record<string, unknown> | null | undefined,
  hybrid: HybridAbsoluteSignalTrustEvidence,
): Record<string, unknown> {
  return {
    ...(evidenceMeta ?? {}),
    [HYBRID_ABSOLUTE_SIGNAL_TRUST_EVIDENCE_META_KEY]: hybrid,
  };
}

export function isHybridAbsoluteSignalTrustEvidenceComplete(
  hybrid: HybridAbsoluteSignalTrustEvidence | null,
  expectedAuthorityVersion: string,
): hybrid is HybridAbsoluteSignalTrustEvidence {
  if (!hybrid) return false;
  if (hybrid.authorityVersion !== expectedAuthorityVersion) return false;
  if (!hybrid.reasonCode || hybrid.reasonCode.length === 0) return false;
  if (
    hybrid.computedHybridClassification !== 'TRUSTED' &&
    hybrid.computedHybridClassification !== 'UNTRUSTED' &&
    hybrid.computedHybridClassification !== 'UNKNOWN'
  ) {
    return false;
  }
  if (
    hybrid.absoluteDetectionAdmissibility !== 'ADMISSIBLE' &&
    hybrid.absoluteDetectionAdmissibility !== 'INADMISSIBLE' &&
    hybrid.absoluteDetectionAdmissibility !== 'UNKNOWN'
  ) {
    return false;
  }
  return true;
}
