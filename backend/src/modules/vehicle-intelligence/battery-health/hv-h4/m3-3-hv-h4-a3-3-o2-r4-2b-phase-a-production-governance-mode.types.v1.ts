export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_CONTRACT_V2 =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_V2' as const;

export const M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_CONTRACT_V1 =
  'M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_V1' as const;

export const M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V1 =
  'M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_V1' as const;

export const M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V2 =
  'M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_V2' as const;

/** Claim-only — `TRUSTED_EXTERNAL_VERIFIED` is rejected at load. */
export type M3_3HvH4A3OperatorRiskAcceptanceAuthenticationStatusV1 = 'UNVERIFIED';

export type M3_3HvH4A3PhaseAProductionGovernanceModeV1 = 'MULTI_PARTY_V1' | 'SINGLE_OPERATOR_V1';

export type M3_3HvH4A3SingleOperatorGovernanceAdoptionRecordV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_CONTRACT_V1;
  governanceMode: 'SINGLE_OPERATOR_V1';
  policyPath: 'B';
  ratificationStatus: 'PENDING_OWNER_CONTROLLED_REPOSITORY_MERGE' | 'RATIFIED';
  governanceContractId: string;
  governanceModeContractId: typeof M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_CONTRACT_V2;
  authorities: {
    humanOwnerOperator: string;
    aiTechnicalReview: string;
    machineAuthorization: string;
  };
  acknowledgements: {
    noSecondHumanSecurityReviewerAtPolicyLevel: true;
    residualRiskSingleOperatorGovernance: true;
    multiPartyModePreservedForOtherOperations: true;
    externalSeparationOfDutiesCannotBeSelfWaived: true;
    doesNotAuthorizeProductionExecution: true;
    doesNotGrantPerChangeRiskAcceptance: true;
  };
  ownerDeclaredChoice: 'PATH_B_SINGLE_OPERATOR_SECURITY_REVIEW_EXCEPTION';
  ratificationMethod?: 'OWNER_CONTROLLED_REPOSITORY_MERGE' | null;
  governanceProposalRef: string;
};

export type M3_3HvH4A3OperatorRiskAcceptanceV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V1;
  operatorIdentity: string;
  changeTicket: string;
  acceptedAtUtc: string;
  attestation: string;
  governanceMode: 'SINGLE_OPERATOR_V1';
};

/** Per-change Path B risk acceptance — JSON presence does not authenticate human consent. */
export type M3_3HvH4A3OperatorRiskAcceptanceV2 = {
  contractVersion: typeof M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V2;
  governanceMode: 'SINGLE_OPERATOR_V1';
  operatorIdentity: string;
  authorizedOwnerIdentity: string;
  changeTicket: string;
  approvalBinding: {
    approvalId: string;
    executeNonce: string;
    validFrom: string;
    validUntil: string;
  };
  maintenanceWindow: {
    startUtc: string;
    endUtc: string;
  };
  pathBSecurityReviewExceptionScope: string;
  residualRiskAcknowledgement: true;
  provenanceAuthenticationStatus: M3_3HvH4A3OperatorRiskAcceptanceAuthenticationStatusV1;
  acceptedAtUtc: string;
  attestation: string;
};
