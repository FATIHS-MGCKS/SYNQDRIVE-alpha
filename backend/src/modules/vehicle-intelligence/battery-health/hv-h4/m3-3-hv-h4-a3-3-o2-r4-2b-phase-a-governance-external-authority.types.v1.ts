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
};

export type M3_3HvH4A3OperatorRiskAcceptanceVerifiedEvidenceV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_GOVERNANCE_VERIFIED_EVIDENCE_RESULT_CONTRACT_V1;
  evidenceKind: 'OPERATOR_RISK_ACCEPTANCE';
  authorityStatus: M3_3HvH4A3GovernanceAuthorityVerificationStatusV1;
  reasonCode: string;
};
