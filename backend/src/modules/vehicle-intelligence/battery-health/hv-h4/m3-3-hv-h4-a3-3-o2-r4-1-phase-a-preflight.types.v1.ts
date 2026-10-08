export const M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_CONTRACT_V1 = 'M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_V1' as const;

/** Classified check outcome — not a certification of production safety. */
export type M3_3HvH4A3PhaseAPreflightCheckStatusV1 =
  | 'PASS'
  | 'NOT_PROVISIONED'
  | 'NOT_PRESENT'
  | 'SKIPPED'
  | 'BLOCKED'
  | 'ERROR';

export type M3_3HvH4A3PhaseAPreflightCheckResultV1 = {
  checkId: string;
  status: M3_3HvH4A3PhaseAPreflightCheckStatusV1;
  detail?: string;
  data?: Record<string, unknown>;
};

export type M3_3HvH4A3PhaseAPreflightRoleNamesV1 = {
  migrationOwner: string;
  generalAppRuntime: string;
  trustedAttestationIssuer: string;
};

export type M3_3HvH4A3PhaseAPreflightAdmissionPolicyV1 =
  | 'ISOLATED_R4_1_DEFAULT'
  | 'PRODUCTION_AUTHORIZED_R4_2A';

export type M3_3HvH4A3PhaseAPreflightRunnerInputV1 = {
  databaseUrl: string;
  roleNames: M3_3HvH4A3PhaseAPreflightRoleNamesV1;
  /** Default: isolated loopback R4.1 policy. Production requires explicit R4.2A admission. */
  admissionPolicy?: M3_3HvH4A3PhaseAPreflightAdmissionPolicyV1;
};

export type M3_3HvH4A3PhaseAPreflightReportV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_CONTRACT_V1;
  phase: 'PRE_PROVISION_READ_ONLY';
  executedAt: string;
  databaseTargetRedacted: string;
  sessionIdentity?: { sessionUser: string; currentUser: string };
  checks: M3_3HvH4A3PhaseAPreflightCheckResultV1[];
  /** Discovery checks finished without ERROR — does not certify production security. */
  phaseADiscoveryComplete: boolean;
  /** Legacy alias — same semantics as phaseADiscoveryComplete. */
  phaseAExecutionComplete: boolean;
  /** Always false in O2-R4.1 — Phase B is not certified by this runner. */
  phaseBCertified: false;
  phaseBCertificationStatus: 'NOT_CERTIFIED';
  productionCertification: 'NOT_CERTIFIED';
  securityCertification: 'NOT_CERTIFIED';
  summary: string[];
  /** Present only when M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_QUERY_TELEMETRY=1 (integration tests). */
  testDiagnostics?: { approvedQueryInvocations: number };
  productionAdmissionEvidence?: {
    admissionChannel: 'PRODUCTION_AUTHORIZED_R4_2A';
    approvalId: string;
    changeTicket: string;
    approvingAuthority: string;
    authenticationKind: string;
    cryptographicAuthentication: false;
  };
};

export type M3_3HvH4A3PhaseAPreflightRunnerOutcomeV1 =
  | { ok: true; report: M3_3HvH4A3PhaseAPreflightReportV1 }
  | { ok: false; reasonCode: string; status: 'BLOCKED' | 'ERROR' };
