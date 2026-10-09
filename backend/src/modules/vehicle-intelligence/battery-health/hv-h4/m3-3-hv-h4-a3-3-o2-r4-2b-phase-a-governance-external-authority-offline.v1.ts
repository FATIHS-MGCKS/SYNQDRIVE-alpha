import { loadGovernanceJsonFromEnvV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.env.v1';
import type { PhaseAGovernanceExternalAuthorityVerifierV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-external-authority.v1';
import {
  M3_3_HV_H4_A3_GOVERNANCE_VERIFIED_EVIDENCE_RESULT_CONTRACT_V1,
  type M3_3HvH4A3GovernanceRatificationVerifiedEvidenceV1,
  type M3_3HvH4A3OperatorRiskAcceptanceVerifiedEvidenceV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-external-authority.types.v1';
import {
  parseGovernanceOwnerPolicyV1,
  parseGovernanceRatificationAttestationV1,
  parseGovernanceTrustStoreV1,
  parseRepositoryMergeEvidenceV1,
  verifyGovernanceRatificationOfflineV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-verify-offline.v1';
import {
  parseGovernanceOperatorRiskAttestationV1,
  verifyGovernanceOperatorRiskAttestationOfflineV1,
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

type OfflineGovernanceAuthorityBundleV1 = {
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

export function loadPhaseAGovernanceOfflineAuthorityBundleV1(
  env: NodeJS.ProcessEnv,
): { ok: true; bundle: OfflineGovernanceAuthorityBundleV1 } | { ok: false; reasonCode: string } {
  const policyLoaded = parseJsonEnv(
    env,
    M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_JSON_ENV,
    M3_3_HV_H4_A3_GOVERNANCE_OWNER_POLICY_PATH_ENV,
  );
  if (!policyLoaded.ok) return policyLoaded;
  const ownerPolicy = parseGovernanceOwnerPolicyV1(policyLoaded.parsed);
  if (!ownerPolicy.ok) return ownerPolicy;

  const bundle: OfflineGovernanceAuthorityBundleV1 = { ownerPolicy: ownerPolicy.policy };

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

function verifiedRatification(): M3_3HvH4A3GovernanceRatificationVerifiedEvidenceV1 {
  return {
    contractVersion: M3_3_HV_H4_A3_GOVERNANCE_VERIFIED_EVIDENCE_RESULT_CONTRACT_V1,
    evidenceKind: 'GOVERNANCE_RATIFICATION_PROVENANCE',
    authorityStatus: 'AUTHORITY_VERIFIED',
    reasonCode: 'PHASE_A_GOVERNANCE_RATIFICATION_AUTHORITY_VERIFIED_OFFLINE',
  };
}

function verifiedRisk(): M3_3HvH4A3OperatorRiskAcceptanceVerifiedEvidenceV1 {
  return {
    contractVersion: M3_3_HV_H4_A3_GOVERNANCE_VERIFIED_EVIDENCE_RESULT_CONTRACT_V1,
    evidenceKind: 'OPERATOR_RISK_ACCEPTANCE',
    authorityStatus: 'AUTHORITY_VERIFIED',
    reasonCode: 'PHASE_A_GOVERNANCE_OPERATOR_RISK_AUTHORITY_VERIFIED_OFFLINE',
  };
}

function notVerifiedRatification(reasonCode: string): M3_3HvH4A3GovernanceRatificationVerifiedEvidenceV1 {
  return {
    contractVersion: M3_3_HV_H4_A3_GOVERNANCE_VERIFIED_EVIDENCE_RESULT_CONTRACT_V1,
    evidenceKind: 'GOVERNANCE_RATIFICATION_PROVENANCE',
    authorityStatus: 'AUTHORITY_NOT_VERIFIED',
    reasonCode,
  };
}

function notVerifiedRisk(reasonCode: string): M3_3HvH4A3OperatorRiskAcceptanceVerifiedEvidenceV1 {
  return {
    contractVersion: M3_3_HV_H4_A3_GOVERNANCE_VERIFIED_EVIDENCE_RESULT_CONTRACT_V1,
    evidenceKind: 'OPERATOR_RISK_ACCEPTANCE',
    authorityStatus: 'AUTHORITY_NOT_VERIFIED',
    reasonCode,
  };
}

export function createPhaseAGovernanceExternalAuthorityVerifierOfflineV1(
  bundle: OfflineGovernanceAuthorityBundleV1,
): PhaseAGovernanceExternalAuthorityVerifierV1 {
  const seenEvidenceNonces = new Set<string>();
  const seenAcceptanceIds = new Set<string>();

  return {
    verifyRatificationProvenanceV1: (input) => {
      if (!bundle.ratification) {
        return notVerifiedRatification('PHASE_A_GOVERNANCE_EXTERNAL_AUTHORITY_VERIFIER_NOT_CONFIGURED');
      }
      const { provenanceClaims, adoptionRecord } = input;
      if (
        provenanceClaims.governancePolicyId.trim() !== adoptionRecord.governanceContractId.trim() ||
        provenanceClaims.governanceAdoptionProposalRef.trim() !== adoptionRecord.governanceProposalRef.trim()
      ) {
        return notVerifiedRatification('PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_POLICY_MISMATCH');
      }
      if (provenanceClaims.pullRequestNumber !== bundle.ownerPolicy.expectedPullRequestNumber) {
        return notVerifiedRatification('PHASE_A_GOVERNANCE_PULL_REQUEST_MISMATCH');
      }
      const mergeSha = provenanceClaims.ratifiedMergeCommitSha.trim();
      if (mergeSha !== bundle.ratification.attestation.mergeCommitSha) {
        return notVerifiedRatification('PHASE_A_GOVERNANCE_MERGE_SHA_MISMATCH');
      }

      const result = verifyGovernanceRatificationOfflineV1({
        trustStore: bundle.ratification.trustStore,
        ownerPolicy: bundle.ownerPolicy,
        repositoryEvidence: bundle.ratification.repositoryEvidence,
        attestation: bundle.ratification.attestation,
        now: input.now ?? new Date(),
        seenEvidenceNonces,
      });
      if (!result.ok) return notVerifiedRatification(result.reasonCode);
      return verifiedRatification();
    },
    verifyOperatorRiskAcceptanceV1: (input) => {
      if (!bundle.risk) {
        return notVerifiedRisk('PHASE_A_GOVERNANCE_EXTERNAL_AUTHORITY_VERIFIER_NOT_CONFIGURED');
      }
      if (!input.authorizedReleaseSha || !input.postgresTargetFingerprint) {
        return notVerifiedRisk('PHASE_A_GOVERNANCE_OPERATOR_RISK_EVIDENCE_CONTEXT_INCOMPLETE');
      }
      const result = verifyGovernanceOperatorRiskAttestationOfflineV1({
        trustStore: bundle.risk.trustStore,
        ownerPolicy: bundle.ownerPolicy,
        attestation: bundle.risk.attestation,
        changeTicket: input.changeTicket,
        approvalBinding: input.approvalBinding,
        maintenanceWindow: input.maintenanceWindow,
        authorizedReleaseSha: input.authorizedReleaseSha,
        postgresTargetFingerprint: input.postgresTargetFingerprint,
        now: input.now,
        seenAcceptanceIds,
      });
      if (!result.ok) return notVerifiedRisk(result.reasonCode);
      return verifiedRisk();
    },
  };
}

export function tryCreatePhaseAGovernanceExternalAuthorityVerifierFromEnvV1(
  env: NodeJS.ProcessEnv,
): PhaseAGovernanceExternalAuthorityVerifierV1 | null {
  const loaded = loadPhaseAGovernanceOfflineAuthorityBundleV1(env);
  if (!loaded.ok) return null;
  if (!loaded.bundle.ratification && !loaded.bundle.risk) {
    return null;
  }
  return createPhaseAGovernanceExternalAuthorityVerifierOfflineV1(loaded.bundle);
}
