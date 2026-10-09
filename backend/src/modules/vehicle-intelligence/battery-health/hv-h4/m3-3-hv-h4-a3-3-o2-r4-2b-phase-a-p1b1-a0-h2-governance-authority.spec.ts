import * as phaseAProductionPrismaClient from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-prisma-client.v1';
import {
  M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_CONTRACT_V1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-provenance.types.v1';
import {
  loadGovernanceRatificationProvenanceV1,
  M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_JSON_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-governance-ratification-provenance.v1';
import {
  evaluatePhaseAHumanVerificationReadinessV1,
  evaluatePhaseASingleOperatorGovernanceClaimsStructuralValidityV1,
  loadOperatorRiskAcceptanceV2,
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
  evaluatePhaseAProductionP1ExecutionGateV1,
  resolvePhaseAProductionP1AuthorizationV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-execution-gate.v1';
import { buildPhaseAProductionP1IntegrationEnvV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-integration-env.fixture.v1';

const OWNER_ROLE_LABEL = 'AUTHORITY_A';
const POLICY_ID = 'M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_CONTRACT_V1';
const PROPOSAL_REF =
  'architecture/battery-v2/governance/M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_PROPOSAL_2026-10-09.md';
const DB_URL =
  'postgresql://audit_ro@prod-db.example.com:5432/synqdrive?sslmode=verify-full&sslrootcert=/etc/ssl/certs/org-ca.pem';

const BINDING = {
  approvalId: 'apr-h2',
  executeNonce: 'nonce-h2',
  validFrom: '2026-10-09T11:00:00.000Z',
  validUntil: '2026-10-09T14:00:00.000Z',
};
const MAINTENANCE = {
  startUtc: '2026-10-09T10:00:00.000Z',
  endUtc: '2026-10-09T15:00:00.000Z',
};
const NOW = new Date('2026-10-09T12:00:00.000Z');

function buildAdoptionJson(): string {
  return JSON.stringify({
    contractVersion: M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_CONTRACT_V1,
    governanceMode: 'SINGLE_OPERATOR_V1',
    policyPath: 'B',
    ratificationStatus: 'PENDING_OWNER_CONTROLLED_REPOSITORY_MERGE',
    governanceContractId: POLICY_ID,
    governanceModeContractId: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_CONTRACT_V2,
    authorities: {
      humanOwnerOperator: OWNER_ROLE_LABEL,
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

function buildProvenanceClaimsJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    contractVersion: M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_CONTRACT_V1,
    governancePolicyId: POLICY_ID,
    governanceAdoptionProposalRef: PROPOSAL_REF,
    pullRequestNumber: 1954,
    ratifiedMergeCommitSha: 'a5b45a186774fd64e0af2ddf57cfdcd0a350550e',
    authorizedOwnerIdentity: OWNER_ROLE_LABEL,
    ratificationAction: 'OWNER_CONTROLLED_REPOSITORY_MERGE',
    provenanceAuthenticationStatus: 'UNVERIFIED',
    ...overrides,
  });
}

function buildRiskClaimsJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    contractVersion: M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V2,
    governanceMode: 'SINGLE_OPERATOR_V1',
    operatorIdentity: OWNER_ROLE_LABEL,
    authorizedOwnerIdentity: OWNER_ROLE_LABEL,
    changeTicket: 'CHG-P1B1-H2',
    approvalBinding: BINDING,
    maintenanceWindow: MAINTENANCE,
    pathBSecurityReviewExceptionScope: 'Phase-A read-only audit SQL under Path B exception',
    residualRiskAcknowledgement: true,
    provenanceAuthenticationStatus: 'UNVERIFIED',
    acceptedAtUtc: BINDING.validFrom,
    attestation: 'Attacker-controlled claim string — not authority.',
    ...overrides,
  });
}

function pathBEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_ENV]: 'SINGLE_OPERATOR_V1',
    [M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV]: buildAdoptionJson(),
    [M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_JSON_ENV]: buildProvenanceClaimsJson(),
    [M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV]: buildRiskClaimsJson(),
    ...overrides,
  };
}

function readinessOptions(changeTicket = 'CHG-P1B1-H2') {
  return {
    approvingAuthority: 'author@example.com',
    authorizedHumanApprover: OWNER_ROLE_LABEL,
    changeTicket,
    approvalBinding: BINDING,
    maintenanceWindow: MAINTENANCE,
    governanceModeFromGoRecord: 'SINGLE_OPERATOR_V1' as const,
    now: NOW,
  };
}

describe('P1B1-A0-H2 governance authority vs self-asserted claims', () => {
  it('rejects self-asserted TRUSTED_EXTERNAL_VERIFIED in ratification provenance JSON', () => {
    const loaded = loadGovernanceRatificationProvenanceV1({
      [M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_JSON_ENV]: buildProvenanceClaimsJson({
        provenanceAuthenticationStatus: 'TRUSTED_EXTERNAL_VERIFIED',
      }),
    });
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.reasonCode).toBe('PHASE_A_GOVERNANCE_SELF_ASSERTED_TRUST_STATUS_FORBIDDEN');
    }
  });

  it('rejects self-asserted TRUSTED_EXTERNAL_VERIFIED in operator risk acceptance JSON', () => {
    const loaded = loadOperatorRiskAcceptanceV2({
      [M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV]: buildRiskClaimsJson({
        provenanceAuthenticationStatus: 'TRUSTED_EXTERNAL_VERIFIED',
      }),
    });
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.reasonCode).toBe('PHASE_A_GOVERNANCE_SELF_ASSERTED_TRUST_STATUS_FORBIDDEN');
    }
  });

  it('does not grant governance readiness when attacker sets both trust fields to TRUSTED_EXTERNAL_VERIFIED', () => {
    const env = pathBEnv({
      [M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_JSON_ENV]: buildProvenanceClaimsJson({
        provenanceAuthenticationStatus: 'TRUSTED_EXTERNAL_VERIFIED',
      }),
      [M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV]: buildRiskClaimsJson({
        provenanceAuthenticationStatus: 'TRUSTED_EXTERNAL_VERIFIED',
      }),
    });
    const readiness = evaluatePhaseAHumanVerificationReadinessV1(env, readinessOptions());
    expect(readiness.ok).toBe(false);
    expect(resolvePhaseAProductionP1AuthorizationV1()).toBe('NO_GO');
  });

  it('fails authority verification even when claim records are internally consistent', () => {
    const claims = evaluatePhaseASingleOperatorGovernanceClaimsStructuralValidityV1(
      pathBEnv(),
      readinessOptions(),
    );
    expect(claims.ok).toBe(true);

    const readiness = evaluatePhaseAHumanVerificationReadinessV1(pathBEnv(), readinessOptions());
    expect(readiness.ok).toBe(false);
    if (!readiness.ok) {
      expect(readiness.reasonCode).toBe('PHASE_A_GOVERNANCE_EXTERNAL_AUTHORITY_VERIFIER_NOT_CONFIGURED');
    }
  });

  it('fails closed on forged merge SHA with wrong policy or PR claims', () => {
    const wrongPolicy = evaluatePhaseASingleOperatorGovernanceClaimsStructuralValidityV1(
      pathBEnv({
        [M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_JSON_ENV]: buildProvenanceClaimsJson({
          governancePolicyId: 'WRONG_POLICY',
        }),
      }),
      readinessOptions(),
    );
    expect(wrongPolicy.ok).toBe(false);

    const wrongPr = evaluatePhaseASingleOperatorGovernanceClaimsStructuralValidityV1(
      pathBEnv({
        [M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_JSON_ENV]: buildProvenanceClaimsJson({
          pullRequestNumber: 9999,
        }),
      }),
      readinessOptions(),
    );
    expect(wrongPr.ok).toBe(true);
    const readinessWrongPr = evaluatePhaseAHumanVerificationReadinessV1(
      pathBEnv({
        [M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_JSON_ENV]: buildProvenanceClaimsJson({
          pullRequestNumber: 9999,
        }),
      }),
      readinessOptions(),
    );
    expect(readinessWrongPr.ok).toBe(false);
  });

  it('fails closed on wrong change ticket, nonce, and future acceptance timestamp', () => {
    const wrongTicket = evaluatePhaseASingleOperatorGovernanceClaimsStructuralValidityV1(
      pathBEnv({
        [M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV]: buildRiskClaimsJson({
          changeTicket: 'CHG-OTHER',
        }),
      }),
      readinessOptions('CHG-P1B1-H2'),
    );
    expect(wrongTicket.ok).toBe(false);

    const wrongNonce = evaluatePhaseASingleOperatorGovernanceClaimsStructuralValidityV1(
      pathBEnv({
        [M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV]: buildRiskClaimsJson({
          approvalBinding: { ...BINDING, executeNonce: 'wrong-nonce' },
        }),
      }),
      readinessOptions(),
    );
    expect(wrongNonce.ok).toBe(false);

    const futureAccept = evaluatePhaseASingleOperatorGovernanceClaimsStructuralValidityV1(
      pathBEnv({
        [M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV]: buildRiskClaimsJson({
          acceptedAtUtc: '2026-10-09T16:00:00.000Z',
        }),
      }),
      readinessOptions(),
    );
    expect(futureAccept.ok).toBe(false);
  });

  it('keeps execution gate NO_GO with zero Prisma usage for forged governance env', () => {
    const prismaSpy = jest.spyOn(phaseAProductionPrismaClient, 'createPhaseAProductionPrismaClientV1');
    const env = buildPhaseAProductionP1IntegrationEnvV1({
      productionDatabaseUrl: DB_URL,
      consumptionDir: `/tmp/phase-a-p1b1-h2-${Date.now()}`,
      governanceMode: 'SINGLE_OPERATOR_V1',
    });
    Object.assign(env, pathBEnv());
    env[M3_3_HV_H4_A3_GOVERNANCE_RATIFICATION_PROVENANCE_JSON_ENV] = buildProvenanceClaimsJson({
      provenanceAuthenticationStatus: 'TRUSTED_EXTERNAL_VERIFIED',
    });
    env[M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV] = buildRiskClaimsJson({
      provenanceAuthenticationStatus: 'TRUSTED_EXTERNAL_VERIFIED',
    });

    const gate = evaluatePhaseAProductionP1ExecutionGateV1(DB_URL, env);
    expect(gate.p1Authorization).toBe('NO_GO');
    expect(prismaSpy).not.toHaveBeenCalled();
    prismaSpy.mockRestore();
  });
});
