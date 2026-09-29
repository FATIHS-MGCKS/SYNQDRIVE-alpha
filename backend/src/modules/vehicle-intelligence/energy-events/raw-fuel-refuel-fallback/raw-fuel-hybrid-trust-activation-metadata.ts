import type {
  HybridTrustActivationDecision,
  HybridTrustActivationMode,
  HybridTrustActivationScopeType,
} from './raw-fuel-hybrid-trust-activation.authority';
import {
  HYBRID_TRUST_ACTIVATION_MODES,
  RFRF_HYBRID_TRUST_ACTIVATION_POLICY_VERSION,
} from './raw-fuel-hybrid-trust-activation.authority';
import type { RawFuelAbsoluteSignalTrust } from './raw-fuel-refuel-fallback.types';

export const HYBRID_TRUST_ACTIVATION_EVIDENCE_META_KEY = 'hybridTrustActivation';

export const PROMOTION_TIME_HYBRID_TRUST_ACTIVATION_QUALITY_META_KEY =
  'promotionTimeHybridTrustActivation';

const ACTIVATION_SCOPE_TYPES: readonly HybridTrustActivationScopeType[] = [
  'NONE',
  'ORGANIZATION',
  'VEHICLE',
  'UNSCOPED',
];

const SIGNAL_TRUST_VALUES: readonly RawFuelAbsoluteSignalTrust[] = [
  'TRUSTED',
  'UNTRUSTED',
  'UNKNOWN',
];

function isEnumMember<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

export interface HybridTrustActivationEvidenceMeta {
  activationPolicyVersion: string;
  activationMode: HybridTrustActivationMode;
  activationAuthorized: boolean;
  activationScopeType: HybridTrustActivationScopeType;
  computedHybridClassification: RawFuelAbsoluteSignalTrust;
  effectiveAbsoluteSignalTrust: RawFuelAbsoluteSignalTrust;
}

export function buildHybridTrustActivationEvidenceMeta(
  decision: HybridTrustActivationDecision,
): HybridTrustActivationEvidenceMeta {
  return {
    activationPolicyVersion: decision.activationPolicyVersion,
    activationMode: decision.activationMode,
    activationAuthorized: decision.activationAuthorized,
    activationScopeType: decision.activationScopeType,
    computedHybridClassification: decision.computedHybridClassification,
    effectiveAbsoluteSignalTrust: decision.effectiveAbsoluteSignalTrust,
  };
}

export function mergeHybridTrustActivationIntoEvidenceMeta(
  evidenceMeta: Record<string, unknown> | null | undefined,
  activation: HybridTrustActivationEvidenceMeta,
): Record<string, unknown> {
  return {
    ...(evidenceMeta ?? {}),
    [HYBRID_TRUST_ACTIVATION_EVIDENCE_META_KEY]: activation,
  };
}

function parseHybridTrustActivationEvidenceMetaBlock(
  block: unknown,
): HybridTrustActivationEvidenceMeta | null {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
  const m = block as Record<string, unknown>;
  if (typeof m.activationPolicyVersion !== 'string' || m.activationPolicyVersion.trim() === '') {
    return null;
  }
  if (typeof m.activationAuthorized !== 'boolean') return null;
  if (!isEnumMember(m.activationMode, HYBRID_TRUST_ACTIVATION_MODES)) return null;
  if (!isEnumMember(m.activationScopeType, ACTIVATION_SCOPE_TYPES)) return null;
  if (!isEnumMember(m.computedHybridClassification, SIGNAL_TRUST_VALUES)) return null;
  if (!isEnumMember(m.effectiveAbsoluteSignalTrust, SIGNAL_TRUST_VALUES)) return null;
  return {
    activationPolicyVersion: m.activationPolicyVersion,
    activationMode: m.activationMode,
    activationAuthorized: m.activationAuthorized,
    activationScopeType: m.activationScopeType,
    computedHybridClassification: m.computedHybridClassification,
    effectiveAbsoluteSignalTrust: m.effectiveAbsoluteSignalTrust,
  };
}

export function readHybridTrustActivationFromEvidenceMeta(
  evidenceMeta: unknown,
): HybridTrustActivationEvidenceMeta | null {
  if (!evidenceMeta || typeof evidenceMeta !== 'object' || Array.isArray(evidenceMeta)) {
    return null;
  }
  const block = (evidenceMeta as Record<string, unknown>)[HYBRID_TRUST_ACTIVATION_EVIDENCE_META_KEY];
  return parseHybridTrustActivationEvidenceMetaBlock(block);
}

export function readPromotionTimeHybridTrustActivationFromQualityMeta(
  qualityMeta: unknown,
): HybridTrustActivationEvidenceMeta | null {
  if (!qualityMeta || typeof qualityMeta !== 'object' || Array.isArray(qualityMeta)) {
    return null;
  }
  const block = (qualityMeta as Record<string, unknown>)[
    PROMOTION_TIME_HYBRID_TRUST_ACTIVATION_QUALITY_META_KEY
  ];
  return parseHybridTrustActivationEvidenceMetaBlock(block);
}

export function mergePromotionTimeHybridTrustActivationIntoQualityMeta(
  qualityMeta: Record<string, unknown> | null | undefined,
  decision: HybridTrustActivationDecision,
  decidedAtIso: string,
): Record<string, unknown> {
  return {
    ...(qualityMeta ?? {}),
    [PROMOTION_TIME_HYBRID_TRUST_ACTIVATION_QUALITY_META_KEY]:
      buildHybridTrustActivationEvidenceMeta(decision),
    promotionTimeHybridTrustActivationAt: decidedAtIso,
  };
}

/** Current policy version for promotion-time revalidation (not persisted allowlist secrets). */
export function isCurrentHybridTrustActivationPolicyVersion(version: string): boolean {
  return version === RFRF_HYBRID_TRUST_ACTIVATION_POLICY_VERSION;
}
