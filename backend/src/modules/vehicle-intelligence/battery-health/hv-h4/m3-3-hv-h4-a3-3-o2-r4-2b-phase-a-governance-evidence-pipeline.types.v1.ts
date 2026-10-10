/** Four-state evidence pipeline (P1B1-A2). Only state 4 may eventually affect readiness — never P1 execution in A2. */
export type M3_3HvH4A3GovernanceEvidencePipelineStateV1 =
  | 'EVIDENCE_RECEIVED'
  | 'EVIDENCE_STRUCTURALLY_VALID'
  | 'CRYPTOGRAPHIC_VERIFICATION_WITH_SUPPLIED_KEY_SUCCEEDED'
  | 'INDEPENDENT_AUTHORITY_AUTHENTICATED';

export type M3_3HvH4A3GovernanceEvidencePipelineStatusV1 = {
  highestStateReached: M3_3HvH4A3GovernanceEvidencePipelineStateV1;
  evidenceReceived: boolean;
  structurallyValid: boolean;
  cryptographicVerificationSucceeded: boolean;
  independentAuthorityAuthenticated: boolean;
  reasonCode: string;
};
