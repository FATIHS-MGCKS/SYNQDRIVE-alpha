import {
  OPERATOR_RISK_ACCEPTANCE_NOT_GRANTED,
  OWNER_RATIFICATION_AUTHORITY_UNVERIFIED,
  PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto-verification.types.v1';
import type { M3_3HvH4A3GovernanceEvidencePipelineStatusV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence-pipeline.types.v1';
import { resolvePhaseAGovernanceExternalAuthorityVerifierV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-external-authority.v1';
import {
  resolvePhaseAProductionP1AuthorizationV1,
  type M3_3HvH4A3PhaseAProductionP1AuthorizationV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-execution-gate.v1';
import type { M3_3HvH4A3GitHubRepositoryProvenanceVerifyResultV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-github-repository-provenance.types.v1';

export type M3_3HvH4A3GovernanceIndependentEvidenceReportV1 = {
  contractVersion: 'M3_3_HV_H4_A3_GOVERNANCE_INDEPENDENT_EVIDENCE_REPORT_V1';
  pipeline: M3_3HvH4A3GovernanceEvidencePipelineStatusV1;
  githubProvenance: M3_3HvH4A3GitHubRepositoryProvenanceVerifyResultV1 | null;
  operatorRiskAcceptanceStatus: typeof OPERATOR_RISK_ACCEPTANCE_NOT_GRANTED;
  productionGovernanceAuthorityResolver: 'DISABLED';
  p1Authorization: M3_3HvH4A3PhaseAProductionP1AuthorizationV1;
  independentTrustAnchorReason: typeof PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED;
};

export function buildGovernancePipelineStatusFromGitHubProvenanceV1(
  github: M3_3HvH4A3GitHubRepositoryProvenanceVerifyResultV1 | null,
  cryptoSucceeded: boolean,
): M3_3HvH4A3GovernanceEvidencePipelineStatusV1 {
  if (!github?.evidenceReceived) {
    return {
      highestStateReached: 'EVIDENCE_RECEIVED',
      evidenceReceived: false,
      structurallyValid: false,
      cryptographicVerificationSucceeded: false,
      independentAuthorityAuthenticated: false,
      reasonCode: PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED,
    };
  }
  if (!github.structurallyValid) {
    return {
      highestStateReached: 'EVIDENCE_RECEIVED',
      evidenceReceived: true,
      structurallyValid: false,
      cryptographicVerificationSucceeded: false,
      independentAuthorityAuthenticated: false,
      reasonCode: github.reasonCode,
    };
  }
  if (!github.githubRepositoryFactsVerified) {
    return {
      highestStateReached: 'EVIDENCE_STRUCTURALLY_VALID',
      evidenceReceived: true,
      structurallyValid: true,
      cryptographicVerificationSucceeded: false,
      independentAuthorityAuthenticated: false,
      reasonCode: github.reasonCode,
    };
  }
  if (cryptoSucceeded) {
    return {
      highestStateReached: 'CRYPTOGRAPHIC_VERIFICATION_WITH_SUPPLIED_KEY_SUCCEEDED',
      evidenceReceived: true,
      structurallyValid: true,
      cryptographicVerificationSucceeded: true,
      independentAuthorityAuthenticated: false,
      reasonCode: OWNER_RATIFICATION_AUTHORITY_UNVERIFIED,
    };
  }
  return {
    highestStateReached: 'EVIDENCE_STRUCTURALLY_VALID',
    evidenceReceived: true,
    structurallyValid: true,
    cryptographicVerificationSucceeded: false,
    independentAuthorityAuthenticated: false,
    reasonCode: github.reasonCode,
  };
}

/** A2 reporting only — does not enable production authority resolver or P1 GO. */
export function buildGovernanceIndependentEvidenceReportV1(input: {
  githubProvenance: M3_3HvH4A3GitHubRepositoryProvenanceVerifyResultV1 | null;
  cryptographicVerificationSucceeded: boolean;
}): M3_3HvH4A3GovernanceIndependentEvidenceReportV1 {
  const resolver = resolvePhaseAGovernanceExternalAuthorityVerifierV1(process.env);
  void resolver;
  return {
    contractVersion: 'M3_3_HV_H4_A3_GOVERNANCE_INDEPENDENT_EVIDENCE_REPORT_V1',
    pipeline: buildGovernancePipelineStatusFromGitHubProvenanceV1(
      input.githubProvenance,
      input.cryptographicVerificationSucceeded,
    ),
    githubProvenance: input.githubProvenance,
    operatorRiskAcceptanceStatus: OPERATOR_RISK_ACCEPTANCE_NOT_GRANTED,
    productionGovernanceAuthorityResolver: 'DISABLED',
    p1Authorization: resolvePhaseAProductionP1AuthorizationV1(),
    independentTrustAnchorReason: PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED,
  };
}
