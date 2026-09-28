import type { HybridTrustActivationDecision } from './raw-fuel-hybrid-trust-activation.authority';

export const HYBRID_TRUST_ACTIVATION_EVIDENCE_META_KEY = 'hybridTrustActivation';

export interface HybridTrustActivationEvidenceMeta {
  activationPolicyVersion: string;
  activationMode: string;
  activationAuthorized: boolean;
  activationScopeType: string;
  computedHybridClassification: string;
  effectiveAbsoluteSignalTrust: string;
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

export function readHybridTrustActivationFromEvidenceMeta(
  evidenceMeta: unknown,
): HybridTrustActivationEvidenceMeta | null {
  if (!evidenceMeta || typeof evidenceMeta !== 'object' || Array.isArray(evidenceMeta)) {
    return null;
  }
  const block = (evidenceMeta as Record<string, unknown>)[HYBRID_TRUST_ACTIVATION_EVIDENCE_META_KEY];
  if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
  const m = block as Record<string, unknown>;
  if (
    typeof m.activationPolicyVersion !== 'string' ||
    typeof m.activationMode !== 'string' ||
    typeof m.activationAuthorized !== 'boolean' ||
    typeof m.activationScopeType !== 'string' ||
    typeof m.computedHybridClassification !== 'string' ||
    typeof m.effectiveAbsoluteSignalTrust !== 'string'
  ) {
    return null;
  }
  return {
    activationPolicyVersion: m.activationPolicyVersion,
    activationMode: m.activationMode,
    activationAuthorized: m.activationAuthorized,
    activationScopeType: m.activationScopeType,
    computedHybridClassification: m.computedHybridClassification,
    effectiveAbsoluteSignalTrust: m.effectiveAbsoluteSignalTrust,
  };
}
