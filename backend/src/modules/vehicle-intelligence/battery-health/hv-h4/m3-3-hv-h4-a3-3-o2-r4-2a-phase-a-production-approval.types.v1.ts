export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONTRACT_V1 =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_V1' as const;

/** Documented human approval — not cryptographically authenticated. */
export type M3_3HvH4A3PhaseAProductionApprovalAuthenticationKindV1 =
  'DOCUMENTED_HUMAN_APPROVAL';

export type M3_3HvH4A3PhaseAProductionApprovalRecordV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONTRACT_V1;
  approvalId: string;
  changeTicket: string;
  approvingAuthority: string;
  /** Canonical target key `user@host:port/database` (no password). */
  approvedTargetKey: string;
  validFrom: string;
  validUntil: string;
  executeNonce: string;
  authenticationKind: M3_3HvH4A3PhaseAProductionApprovalAuthenticationKindV1;
};

export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1 =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_V1' as const;

export type M3_3HvH4A3PhaseAProductionTargetSpecV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1;
  hostname: string;
  port: number;
  database: string;
  expectedAuditLogin: string;
  /** Require sslmode verify-full or verify-ca on the database URL. */
  requireTlsIdentityVerification: boolean;
  forbidSuperuserSession: boolean;
};

export type M3_3HvH4A3PhaseAProductionAdmissionEvidenceV1 = {
  admissionChannel: 'PRODUCTION_AUTHORIZED_R4_2A';
  approvalId: string;
  changeTicket: string;
  approvingAuthority: string;
  approvedTargetKey: string;
  authenticationKind: M3_3HvH4A3PhaseAProductionApprovalAuthenticationKindV1;
  cryptographicAuthentication: false;
  executeConsumedAt: string;
};
