import {
  M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_CONTRACT_V1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-provenance.types.v1';
import {
  M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_JSON_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-provenance.v1';
import {
  evaluatePhaseAHumanVerificationReadinessV1,
  M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_ENV,
  M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.v1';
import {
  M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V2,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_CONTRACT_V2,
  M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_CONTRACT_V1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_CONTRACT_V2,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-go-no-go.types.v1';
import {
  loadPhaseAProductionGoNoGoRecordV1,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-operational-readiness.v1';
import { resolvePhaseAProductionP1AuthorizationV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-execution-gate.v1';

const OWNER = 'AUTHORITY_A';
const POLICY_ID = 'M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_CONTRACT_V1';
const PROPOSAL_REF =
  'architecture/battery-v2/governance/M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_PROPOSAL_2026-10-09.md';

function buildPendingAdoptionJson(): string {
  return JSON.stringify({
    contractVersion: M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_CONTRACT_V1,
    governanceMode: 'SINGLE_OPERATOR_V1',
    policyPath: 'B',
    ratificationStatus: 'PENDING_OWNER_CONTROLLED_REPOSITORY_MERGE',
    governanceContractId: POLICY_ID,
    governanceModeContractId: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_CONTRACT_V2,
    authorities: {
      humanOwnerOperator: OWNER,
      aiTechnicalReview: 'AUTHORITY_B_ADVISORY_ONLY',
      machineAuthorization: 'AUTHORITY_C_CRYPTOGRAPHIC_FUTURE',
    },
    acknowledgements: {
      noSecondHumanSecurityReviewerAtPolicyLevel: true,
      residualRiskSingleOperatorGovernance: true,
      multiPartyModePreservedForOtherOperations: true,
      externalSeparationOfDutiesCannotBeSelfWaived: true,
      doesNotAuthorizeProductionExecution: true,
      doesNotGrantPerChangeRiskAcceptance: true,
    },
    ownerDeclaredChoice: 'PATH_B_SINGLE_OPERATOR_SECURITY_REVIEW_EXCEPTION',
    governanceProposalRef: PROPOSAL_REF,
  });
}

function buildProvenanceClaimsJson(mergeSha: string): string {
  return JSON.stringify({
    contractVersion: M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_CONTRACT_V1,
    governancePolicyId: POLICY_ID,
    governanceAdoptionProposalRef: PROPOSAL_REF,
    pullRequestNumber: 1954,
    ratifiedMergeCommitSha: mergeSha,
    authorizedOwnerIdentity: OWNER,
    ratificationAction: 'OWNER_CONTROLLED_REPOSITORY_MERGE',
    provenanceAuthenticationStatus: 'UNVERIFIED',
  });
}

function buildRiskAcceptanceV2Json(options: {
  changeTicket: string;
  approvalBinding: {
    approvalId: string;
    executeNonce: string;
    validFrom: string;
    validUntil: string;
  };
  maintenanceWindow: { startUtc: string; endUtc: string };
  owner?: string;
}): string {
  return JSON.stringify({
    contractVersion: M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V2,
    governanceMode: 'SINGLE_OPERATOR_V1',
    operatorIdentity: options.owner ?? OWNER,
    authorizedOwnerIdentity: options.owner ?? OWNER,
    changeTicket: options.changeTicket,
    approvalBinding: options.approvalBinding,
    maintenanceWindow: options.maintenanceWindow,
    pathBSecurityReviewExceptionScope: 'Phase-A read-only audit SQL under Path B exception',
    residualRiskAcknowledgement: true,
    provenanceAuthenticationStatus: 'UNVERIFIED',
    acceptedAtUtc: options.approvalBinding.validFrom,
    attestation: 'Test fixture — does not authorize production execution.',
  });
}

function buildSingleOperatorGoNoGoV2(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Date.now();
  return {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_CONTRACT_V2,
    governanceMode: 'SINGLE_OPERATOR_V1',
    operatorDecision: 'GO',
    authorizedReleaseSha: 'a5b45a186774fd64e0af2ddf57cfdcd0a350550e',
    changeTicket: 'CHG-P1B1-H1',
    authorizedHumanApprover: OWNER,
    productionTarget: {
      hostname: 'prod-db.example.com',
      port: 5432,
      database: 'synqdrive',
      auditLogin: 'audit_ro',
    },
    auditCredentialExpectations: {
      dedicatedReadOnlyAuditLogin: true,
      distinctFromApplicationDatabaseUrl: true,
      distinctFromMigrationOwnerCredentials: true,
      distinctFromAttestationIssuerPool: true,
    },
    tlsRequirements: {
      sslmode: 'verify-full',
      trustedCaBundleRequired: true,
      hostnameValidationRequired: true,
    },
    approvalBinding: {
      approvalId: 'apr-h1',
      executeNonce: 'nonce-h1',
      validFrom: new Date(now - 60_000).toISOString(),
      validUntil: new Date(now + 3600_000).toISOString(),
    },
    consumptionStore: {
      absolutePath: '/var/lib/synqdrive/phase-a-consumption',
      operationalOwner: 'platform-ops@example.com',
      markerFileName: '.synqdrive_phase_a_production_consumption_store_v1',
    },
    readOnlySqlScope: {
      approvedQueryManifestOnly: true,
      singleSessionReadOnlyTransaction: true,
      boundedStatementTimeoutRequired: true,
    },
    maintenanceWindow: {
      startUtc: new Date(now - 120_000).toISOString(),
      endUtc: new Date(now + 7200_000).toISOString(),
    },
    stopConditions: ['TLS identity not certified'],
    incidentHandling: 'Stop and escalate',
    evidenceStorageDestination: 'evidence://test',
    authorizationLimits: {
      schemaChangesAuthorized: false,
      issuanceActivationAuthorized: false,
      applicationRuntimeFlagChangesAuthorized: false,
      hybridLoaderActivationAuthorized: false,
      attestationInsertOrUpdateAuthorized: false,
      retentionActivationAuthorized: false,
      reconciliationActivationAuthorized: false,
      backfillActivationAuthorized: false,
    },
    ...overrides,
  };
}

describe('P1B1-A0-H1 governance trust boundaries', () => {
  it('loads Path B GO/NO-GO V2 without independentAuthorizationVerification', () => {
    const loaded = loadPhaseAProductionGoNoGoRecordV1({
      [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV]: JSON.stringify(
        buildSingleOperatorGoNoGoV2(),
      ),
    });
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.record.governanceMode).toBe('SINGLE_OPERATOR_V1');
      expect(loaded.record.independentAuthorizationVerification).toBeUndefined();
    }
  });

  it('rejects fabricated second-human verifier on Path B V2 record', () => {
    const loaded = loadPhaseAProductionGoNoGoRecordV1({
      [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV]: JSON.stringify(
        buildSingleOperatorGoNoGoV2({
          independentAuthorizationVerification: {
            verifierIdentity: 'fake@example.com',
            verifiedAtUtc: new Date().toISOString(),
            verificationMethod: 'FABRICATED',
            attestsIndependentFromApprovalAuthor: true,
          },
        }),
      ),
    });
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.reasonCode).toBe('PHASE_A_GO_NO_GO_FABRICATED_SECOND_HUMAN_VERIFIER_FORBIDDEN');
    }
  });

  it('blocks self-declared RATIFIED adoption JSON without trusted provenance', () => {
    const adoption = JSON.parse(buildPendingAdoptionJson());
    adoption.ratificationStatus = 'RATIFIED';
    const result = evaluatePhaseAHumanVerificationReadinessV1(
      {
        [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_ENV]: 'SINGLE_OPERATOR_V1',
        [M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV]: JSON.stringify(adoption),
      },
      {
        approvingAuthority: 'author@example.com',
        authorizedHumanApprover: OWNER,
        changeTicket: 'CHG-P1B1-H1',
        approvalBinding: {
          approvalId: 'apr-h1',
          executeNonce: 'nonce-h1',
          validFrom: '2026-10-09T11:00:00.000Z',
          validUntil: '2026-10-09T14:00:00.000Z',
        },
        maintenanceWindow: {
          startUtc: '2026-10-09T10:00:00.000Z',
          endUtc: '2026-10-09T15:00:00.000Z',
        },
        governanceModeFromGoRecord: 'SINGLE_OPERATOR_V1',
        now: new Date('2026-10-09T12:00:00.000Z'),
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('PHASE_A_GOVERNANCE_SELF_DECLARED_RATIFIED_UNTRUSTED');
    }
  });

  it('does not grant Path B governance readiness without external authority verifier', () => {
    const go = buildSingleOperatorGoNoGoV2();
    const mergeSha = 'a5b45a186774fd64e0af2ddf57cfdcd0a350550e';
    const result = evaluatePhaseAHumanVerificationReadinessV1(
      {
        [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_ENV]: 'SINGLE_OPERATOR_V1',
        [M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV]: buildPendingAdoptionJson(),
        [M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_JSON_ENV]: buildProvenanceClaimsJson(mergeSha),
        [M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV]: buildRiskAcceptanceV2Json({
          changeTicket: go.changeTicket as string,
          approvalBinding: go.approvalBinding as {
            approvalId: string;
            executeNonce: string;
            validFrom: string;
            validUntil: string;
          },
          maintenanceWindow: go.maintenanceWindow as { startUtc: string; endUtc: string },
        }),
      },
      {
        approvingAuthority: 'author@example.com',
        authorizedHumanApprover: OWNER,
        changeTicket: go.changeTicket as string,
        approvalBinding: go.approvalBinding as {
          approvalId: string;
          executeNonce: string;
          validFrom: string;
          validUntil: string;
        },
        maintenanceWindow: go.maintenanceWindow as { startUtc: string; endUtc: string },
        governanceModeFromGoRecord: 'SINGLE_OPERATOR_V1',
        now: new Date((go.approvalBinding as { validFrom: string }).validFrom),
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('PHASE_A_GOVERNANCE_INDEPENDENT_TRUST_ANCHOR_NOT_PROVISIONED');
    }
    expect(resolvePhaseAProductionP1AuthorizationV1()).toBe('NO_GO');
  });

  it('legacy multi-party mode still requires independent verifier', () => {
    const result = evaluatePhaseAHumanVerificationReadinessV1(
      {},
      {
        verifierIdentity: 'author@example.com',
        approvingAuthority: 'author@example.com',
        authorizedHumanApprover: 'owner@example.com',
        changeTicket: 'CHG',
        governanceModeFromGoRecord: 'MULTI_PARTY_V1',
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_GO_NO_GO_VERIFIER_NOT_INDEPENDENT');
  });
});
