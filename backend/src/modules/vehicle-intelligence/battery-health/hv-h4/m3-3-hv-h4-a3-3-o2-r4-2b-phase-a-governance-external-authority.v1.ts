import {
  M3_3_HV_H4_A3_GOVERNANCE_VERIFIED_EVIDENCE_RESULT_CONTRACT_V1,
  type M3_3HvH4A3GovernanceRatificationVerifiedEvidenceV1,
  type M3_3HvH4A3OperatorRiskAcceptanceVerifiedEvidenceV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-external-authority.types.v1';
import { PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto-verification.types.v1';
import type { M3_3HvH4A3GovernanceRatificationProvenanceV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-provenance.types.v1';
import type { M3_3HvH4A3OperatorRiskAcceptanceV2 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1';
import type { M3_3HvH4A3SingleOperatorGovernanceAdoptionRecordV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1';

export type PhaseAGovernanceExternalAuthorityVerifierV1 = {
  verifyRatificationProvenanceV1(input: {
    provenanceClaims: M3_3HvH4A3GovernanceRatificationProvenanceV1;
    adoptionRecord: M3_3HvH4A3SingleOperatorGovernanceAdoptionRecordV1;
    now?: Date;
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
    authorizedReleaseSha?: string;
    postgresTargetFingerprint?: string;
    now: Date;
  }): M3_3HvH4A3OperatorRiskAcceptanceVerifiedEvidenceV1;
};

function notVerifiedRatification(reasonCode: string): M3_3HvH4A3GovernanceRatificationVerifiedEvidenceV1 {
  return {
    contractVersion: M3_3_HV_H4_A3_GOVERNANCE_VERIFIED_EVIDENCE_RESULT_CONTRACT_V1,
    evidenceKind: 'GOVERNANCE_RATIFICATION_PROVENANCE',
    authorityStatus: 'AUTHORITY_NOT_VERIFIED',
    reasonCode,
    cryptographicVerificationStatus: 'SIGNATURE_NOT_EVALUATED',
    independentAuthorityStatus: 'INDEPENDENT_AUTHORITY_NOT_VERIFIED',
  };
}

function notVerifiedRisk(reasonCode: string): M3_3HvH4A3OperatorRiskAcceptanceVerifiedEvidenceV1 {
  return {
    contractVersion: M3_3_HV_H4_A3_GOVERNANCE_VERIFIED_EVIDENCE_RESULT_CONTRACT_V1,
    evidenceKind: 'OPERATOR_RISK_ACCEPTANCE',
    authorityStatus: 'AUTHORITY_NOT_VERIFIED',
    reasonCode,
    cryptographicVerificationStatus: 'SIGNATURE_NOT_EVALUATED',
    independentAuthorityStatus: 'INDEPENDENT_AUTHORITY_NOT_VERIFIED',
  };
}

/** Production governance authority verifier — always fail-closed in A1/H1/H2/H3/A2. */
export function createPhaseAGovernanceExternalAuthorityVerifierDisabledV1(): PhaseAGovernanceExternalAuthorityVerifierV1 {
  return {
    verifyRatificationProvenanceV1: () =>
      notVerifiedRatification(PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED),
    verifyOperatorRiskAcceptanceV1: () =>
      notVerifiedRisk(PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED),
  };
}

/**
 * Production readiness authority resolver.
 * Caller-supplied trust-store / owner-policy JSON from the same channel as claims cannot establish authority.
 */
export function resolvePhaseAGovernanceExternalAuthorityVerifierV1(
  _env: NodeJS.ProcessEnv = process.env,
): PhaseAGovernanceExternalAuthorityVerifierV1 {
  return createPhaseAGovernanceExternalAuthorityVerifierDisabledV1();
}
