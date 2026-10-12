import type {
  M3_3HvH4A3GovernanceCryptographicVerificationStatusV1,
  M3_3HvH4A3GovernanceIndependentAuthorityStatusV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-evidence.crypto-verification.types.v1';

export const M3_3_HV_H4_A3_GOVERNANCE_VERIFIED_EVIDENCE_RESULT_CONTRACT_V1 =
  'M3_3_HV_H4_A3_GOVERNANCE_VERIFIED_EVIDENCE_RESULT_V1' as const;

/** Produced only by an independently authenticated verifier — never from self-authored claim JSON. */
export type M3_3HvH4A3GovernanceAuthorityVerificationStatusV1 =
  | 'AUTHORITY_VERIFIED'
  | 'AUTHORITY_NOT_VERIFIED';

export type M3_3HvH4A3GovernanceRatificationVerifiedEvidenceV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_GOVERNANCE_VERIFIED_EVIDENCE_RESULT_CONTRACT_V1;
  evidenceKind: 'GOVERNANCE_RATIFICATION_PROVENANCE';
  authorityStatus: M3_3HvH4A3GovernanceAuthorityVerificationStatusV1;
  reasonCode: string;
  cryptographicVerificationStatus: M3_3HvH4A3GovernanceCryptographicVerificationStatusV1;
  independentAuthorityStatus: M3_3HvH4A3GovernanceIndependentAuthorityStatusV1;
};

export type M3_3HvH4A3OperatorRiskAcceptanceVerifiedEvidenceV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_GOVERNANCE_VERIFIED_EVIDENCE_RESULT_CONTRACT_V1;
  evidenceKind: 'OPERATOR_RISK_ACCEPTANCE';
  authorityStatus: M3_3HvH4A3GovernanceAuthorityVerificationStatusV1;
  reasonCode: string;
  cryptographicVerificationStatus: M3_3HvH4A3GovernanceCryptographicVerificationStatusV1;
  independentAuthorityStatus: M3_3HvH4A3GovernanceIndependentAuthorityStatusV1;
};
