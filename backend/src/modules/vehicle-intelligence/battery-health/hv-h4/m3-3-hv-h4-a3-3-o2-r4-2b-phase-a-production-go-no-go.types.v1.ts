export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_CONTRACT_V1 =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_V1' as const;

export type M3_3HvH4A3PhaseAProductionGoNoGoDecisionV1 = 'GO' | 'NO_GO';

/** Fail-closed authorization record for future R4.2B-P1 execution — not cryptographic. */
export type M3_3HvH4A3PhaseAProductionGoNoGoRecordV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_CONTRACT_V1;
  /** Human-authored intent; dry-run still requires all structural checks to pass for READY. */
  operatorDecision: M3_3HvH4A3PhaseAProductionGoNoGoDecisionV1;
  authorizedReleaseSha: string;
  changeTicket: string;
  authorizedHumanApprover: string;
  independentAuthorizationVerification: {
    verifierIdentity: string;
    verifiedAtUtc: string;
    verificationMethod: string;
    /** Must be true — confirms verification is not self-approval by record author alone. */
    attestsIndependentFromApprovalAuthor: true;
  };
  productionTarget: {
    hostname: string;
    port: number;
    database: string;
    auditLogin: string;
  };
  auditCredentialExpectations: {
    dedicatedReadOnlyAuditLogin: true;
    distinctFromApplicationDatabaseUrl: true;
    distinctFromMigrationOwnerCredentials: true;
    distinctFromAttestationIssuerPool: true;
  };
  tlsRequirements: {
    sslmode: 'verify-full';
    trustedCaBundleRequired: true;
    hostnameValidationRequired: true;
  };
  approvalBinding: {
    approvalId: string;
    executeNonce: string;
    validFrom: string;
    validUntil: string;
  };
  consumptionStore: {
    absolutePath: string;
    operationalOwner: string;
    markerFileName: '.synqdrive_phase_a_production_consumption_store_v1';
  };
  readOnlySqlScope: {
    approvedQueryManifestOnly: true;
    singleSessionReadOnlyTransaction: true;
    boundedStatementTimeoutRequired: true;
  };
  maintenanceWindow: {
    startUtc: string;
    endUtc: string;
  };
  stopConditions: string[];
  incidentHandling: string;
  evidenceStorageDestination: string;
  authorizationLimits: {
    schemaChangesAuthorized: false;
    issuanceActivationAuthorized: false;
    applicationRuntimeFlagChangesAuthorized: false;
    hybridLoaderActivationAuthorized: false;
    attestationInsertOrUpdateAuthorized: false;
    retentionActivationAuthorized: false;
    reconciliationActivationAuthorized: false;
    backfillActivationAuthorized: false;
  };
};

export const M3_3_HV_H4_A3_PHASE_A_OPERATIONAL_READINESS_REPORT_CONTRACT_V1 =
  'M3_3_HV_H4_A3_PHASE_A_OPERATIONAL_READINESS_REPORT_V1' as const;

export type M3_3HvH4A3PhaseAOperationalReadinessCheckStatusV1 = 'PASS' | 'FAIL' | 'SKIP';

export type M3_3HvH4A3PhaseAOperationalReadinessCheckV1 = {
  checkId: string;
  status: M3_3HvH4A3PhaseAOperationalReadinessCheckStatusV1;
  reasonCode?: string;
};

/**
 * READY = offline operational readiness PASS for artifacts and governance.
 * This is **not** authorization to access production or execute Phase-A SQL.
 */
export type M3_3HvH4A3PhaseAOperationalReadinessDecisionV1 = 'NO_GO' | 'READY';

/** Self-authored JSON cannot prove real human authentication without trusted external evidence. */
export type M3_3HvH4A3PhaseAExternalHumanAuthorizationAuthenticationV1 =
  | 'UNVERIFIED'
  | 'TRUSTED_EXTERNAL';

/**
 * Comparing env `AUTHORIZED_RELEASE_SHA` to GO/NO-GO record proves configuration consistency only —
 * not that production is running that executable (P1 operational gate).
 */
export type M3_3HvH4A3PhaseAAuthorizedReleaseShaBindingKindV1 =
  | 'CONFIGURATION_CONSISTENCY_ONLY'
  | 'NOT_EVALUATED';

export type M3_3HvH4A3PhaseAOperationalReadinessReportV1 = {
  contractVersion: typeof M3_3_HV_H4_A3_PHASE_A_OPERATIONAL_READINESS_REPORT_CONTRACT_V1;
  decision: M3_3HvH4A3PhaseAOperationalReadinessDecisionV1;
  productionPhaseAExecuted: false;
  productionNetworkAccessAttempted: false;
  postgresClientInstantiated: false;
  approvalConsumed: false;
  externalHumanAuthorizationAuthentication: M3_3HvH4A3PhaseAExternalHumanAuthorizationAuthenticationV1;
  authorizedReleaseShaBinding: M3_3HvH4A3PhaseAAuthorizedReleaseShaBindingKindV1;
  /**
   * Declarations in GO/NO-GO JSON are policy attestations — not proof a live PostgreSQL audit role exists.
   */
  auditCredentialExpectationsDeclaredOnly: true;
  checks: M3_3HvH4A3PhaseAOperationalReadinessCheckV1[];
  blockers: string[];
  sanitizedBinding: {
    changeTicket?: string;
    approvalId?: string;
    authorizedReleaseSha?: string;
    approvedTargetKeyRedacted?: string;
    consumptionStorePath?: string;
    evidenceStorageDestination?: string;
  };
};
