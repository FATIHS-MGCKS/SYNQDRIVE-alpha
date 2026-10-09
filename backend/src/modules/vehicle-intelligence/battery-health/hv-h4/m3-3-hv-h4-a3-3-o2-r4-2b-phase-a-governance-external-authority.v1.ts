import {
  M3_3_HV_H4_A3_GOVERNANCE_VERIFIED_EVIDENCE_RESULT_CONTRACT_V1,
  type M3_3HvH4A3GovernanceRatificationVerifiedEvidenceV1,
  type M3_3HvH4A3OperatorRiskAcceptanceVerifiedEvidenceV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-external-authority.types.v1';
import type { M3_3HvH4A3GovernanceRatificationProvenanceV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-provenance.types.v1';
import type { M3_3HvH4A3OperatorRiskAcceptanceV2 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1';
import type { M3_3HvH4A3SingleOperatorGovernanceAdoptionRecordV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1';

export type PhaseAGovernanceExternalAuthorityVerifierV1 = {
  verifyRatificationProvenanceV1(input: {
    provenanceClaims: M3_3HvH4A3GovernanceRatificationProvenanceV1;
    adoptionRecord: M3_3HvH4A3SingleOperatorGovernanceAdoptionRecordV1;
  }): M3_3HvH4A3GovernanceRatificationVerifiedEvidenceV1;
  verifyOperatorRiskAcceptanceV1(input: {
    riskAcceptanceClaims: M3_3HvH4A3OperatorRiskAcceptanceV2;
    authorizedHumanApprover: string;
    changeTicket: string;
    approvalBinding: {
      approvalId: string;
      executeNonce: string;
      validFrom: string;
      validUntil: string;
    };
    maintenanceWindow: { startUtc: string; endUtc: string };
    now: Date;
  }): M3_3HvH4A3OperatorRiskAcceptanceVerifiedEvidenceV1;
};

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

/** P1B1-A0: no trusted external verifier is wired — claims never become authority. */
export function createPhaseAGovernanceExternalAuthorityVerifierDisabledV1(): PhaseAGovernanceExternalAuthorityVerifierV1 {
  return {
    verifyRatificationProvenanceV1: () =>
      notVerifiedRatification('PHASE_A_GOVERNANCE_EXTERNAL_AUTHORITY_VERIFIER_NOT_CONFIGURED'),
    verifyOperatorRiskAcceptanceV1: () =>
      notVerifiedRisk('PHASE_A_GOVERNANCE_EXTERNAL_AUTHORITY_VERIFIER_NOT_CONFIGURED'),
  };
}

/**
 * Resolves the governance external authority verifier for production readiness.
 * Intentionally ignores env/JSON — self-asserted trust cannot enable a verifier in A0.
 */
export function resolvePhaseAGovernanceExternalAuthorityVerifierV1(
  _env: NodeJS.ProcessEnv = process.env,
): PhaseAGovernanceExternalAuthorityVerifierV1 {
  return createPhaseAGovernanceExternalAuthorityVerifierDisabledV1();
}
