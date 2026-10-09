import { loadGovernanceJsonFromEnvV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.env.v1';
import type { PhaseAGovernanceExternalAuthorityVerifierV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-external-authority.v1';
import { createPhaseAGovernanceExternalAuthorityVerifierDisabledV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-external-authority.v1';
import {
  parseGovernanceOwnerPolicyV1,
  parseGovernanceRatificationAttestationV1,
  parseGovernanceTrustStoreV1,
  parseRepositoryMergeEvidenceV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-verify-offline.v1';
import {
  parseGovernanceOperatorRiskAttestationV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-operator-risk-attestation-verify-offline.v1';
import type {
  M3_3HvH4A3GovernanceOperatorRiskAttestationV1,
  M3_3HvH4A3GovernanceOwnerPolicyV1,
  M3_3HvH4A3GovernanceRatificationAttestationV1,
  M3_3HvH4A3GovernanceTrustStoreV1,
  M3_3HvH4A3RepositoryMergeEvidenceV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.types.v1';

export const M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_JSON_ENV =
  'M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_JSON' as const;
export const M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_PATH_ENV =
  'M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_PATH' as const;

export const M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_JSON_ENV =
  'M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_JSON' as const;
export const M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_PATH_ENV =
  'M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_PATH' as const;

export const M3_3_HV_H4_A3_GOVERNANCE_REPOSITORY_MERGE_EVIDENCE_JSON_ENV =
  'M3_3_HV_H4_A3_GOVERNANCE_REPOSITORY_MERGE_EVIDENCE_JSON' as const;
export const M3_3_HV_H4_A3_GOVERNANCE_REPOSITORY_MERGE_EVIDENCE_PATH_ENV =
  'M3_3_HV_H4_A3_GOVERNANCE_REPOSITORY_MERGE_EVIDENCE_PATH' as const;

export const M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_JSON_ENV =
  'M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_JSON' as const;
export const M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_PATH_ENV =
  'M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_PATH' as const;

export const M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_JSON_ENV =
  'M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_JSON' as const;
export const M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_PATH_ENV =
  'M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_PATH' as const;

export type OfflineGovernanceEvidenceBundleV1 = {
  ownerPolicy: M3_3HvH4A3GovernanceOwnerPolicyV1;
  ratification?: {
    trustStore: M3_3HvH4A3GovernanceTrustStoreV1;
    repositoryEvidence: M3_3HvH4A3RepositoryMergeEvidenceV1;
    attestation: M3_3HvH4A3GovernanceRatificationAttestationV1;
  };
  risk?: {
    trustStore: M3_3HvH4A3GovernanceTrustStoreV1;
    attestation: M3_3HvH4A3GovernanceOperatorRiskAttestationV1;
  };
};

function parseJsonEnv(
  env: NodeJS.ProcessEnv,
  jsonKey: string,
  pathKey: string,
): { ok: true; parsed: unknown } | { ok: false; reasonCode: string } {
  const loaded = loadGovernanceJsonFromEnvV1(env, jsonKey, pathKey);
  if (!loaded.ok) return loaded;
  try {
    return { ok: true, parsed: JSON.parse(loaded.raw) };
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_GOVERNANCE_EVIDENCE_INVALID_JSON' };
  }
}

/** Loads caller-supplied evidence for cryptographic diagnostics/tests only — not production authority. */
export function loadPhaseAGovernanceOfflineEvidenceBundleV1(
  env: NodeJS.ProcessEnv,
): { ok: true; bundle: OfflineGovernanceEvidenceBundleV1 } | { ok: false; reasonCode: string } {
  const policyLoaded = parseJsonEnv(
    env,
    M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_JSON_ENV,
    M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_PATH_ENV,
  );
  if (!policyLoaded.ok) return policyLoaded;
  const ownerPolicy = parseGovernanceOwnerPolicyV1(policyLoaded.parsed);
  if (!ownerPolicy.ok) return ownerPolicy;

  const bundle: OfflineGovernanceEvidenceBundleV1 = { ownerPolicy: ownerPolicy.policy };

  const ratTrust = parseJsonEnv(env, M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_JSON_ENV, M3_3_HV_H4_A3_GOVERNANCE_TRUST_STORE_PATH_ENV);
  const ratRepo = parseJsonEnv(
    env,
    M3_3_HV_H4_A3_GOVERNANCE_REPOSITORY_MERGE_EVIDENCE_JSON_ENV,
    M3_3_HV_H4_A3_GOVERNANCE_REPOSITORY_MERGE_EVIDENCE_PATH_ENV,
  );
  const ratAtt = parseJsonEnv(
    env,
    M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_JSON_ENV,
    M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_ATTESTATION_PATH_ENV,
  );
  if (ratTrust.ok && ratRepo.ok && ratAtt.ok) {
    const trustStore = parseGovernanceTrustStoreV1(ratTrust.parsed);
    if (!trustStore.ok) return trustStore;
    const repositoryEvidence = parseRepositoryMergeEvidenceV1(ratRepo.parsed);
    if (!repositoryEvidence.ok) return repositoryEvidence;
    const attestation = parseGovernanceRatificationAttestationV1(ratAtt.parsed);
    if (!attestation.ok) return attestation;
    bundle.ratification = {
      trustStore: trustStore.store,
      repositoryEvidence: repositoryEvidence.evidence,
      attestation: attestation.attestation,
    };
  }

  const riskAtt = parseJsonEnv(
    env,
    M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_JSON_ENV,
    M3_3_HV_H4_A3_GOVERNANCE_OPERATOR_RISK_ATTESTATION_PATH_ENV,
  );
  if (ratTrust.ok && riskAtt.ok) {
    const trustStore = parseGovernanceTrustStoreV1(ratTrust.parsed);
    if (!trustStore.ok) return trustStore;
    const attestation = parseGovernanceOperatorRiskAttestationV1(riskAtt.parsed);
    if (!attestation.ok) return attestation;
    bundle.risk = { trustStore: trustStore.store, attestation: attestation.attestation };
  }

  return { ok: true, bundle };
}

/** @deprecated Use loadPhaseAGovernanceOfflineEvidenceBundleV1 */
export const loadPhaseAGovernanceOfflineAuthorityBundleV1 = loadPhaseAGovernanceOfflineEvidenceBundleV1;

/**
 * Production authority must not be instantiated from env-supplied trust material (P1B1-A1-H1).
 * Returns the same fail-closed verifier as resolvePhaseAGovernanceExternalAuthorityVerifierV1.
 */
export function tryCreatePhaseAGovernanceExternalAuthorityVerifierFromEnvV1(
  _env: NodeJS.ProcessEnv,
): PhaseAGovernanceExternalAuthorityVerifierV1 | null {
  return null;
}

/** Each call returns a fresh disabled verifier (fresh ephemeral state is not replay protection). */
export function createPhaseAGovernanceExternalAuthorityVerifierOfflineV1(
  _bundle: OfflineGovernanceEvidenceBundleV1,
): PhaseAGovernanceExternalAuthorityVerifierV1 {
  return createPhaseAGovernanceExternalAuthorityVerifierDisabledV1();
}
