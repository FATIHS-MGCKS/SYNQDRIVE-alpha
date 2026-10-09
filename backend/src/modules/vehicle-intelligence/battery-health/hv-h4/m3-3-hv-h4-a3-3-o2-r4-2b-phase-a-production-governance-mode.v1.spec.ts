import {
  evaluatePhaseAHumanVerificationReadinessV1,
  loadSingleOperatorGovernanceAdoptionRecordV1,
  resolvePhaseAProductionGovernanceModeV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_CONTRACT_V2,
  M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_CONTRACT_V1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1';
import { M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.v1';

describe('resolvePhaseAProductionGovernanceModeV1', () => {
  it('defaults to MULTI_PARTY_V1 when unset', () => {
    const resolved = resolvePhaseAProductionGovernanceModeV1({});
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.mode).toBe('MULTI_PARTY_V1');
  });
});

describe('loadSingleOperatorGovernanceAdoptionRecordV1', () => {
  it('rejects pending ratification at load time for readiness substitution', () => {
    const record = {
      contractVersion: M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_CONTRACT_V1,
      governanceMode: 'SINGLE_OPERATOR_V1',
      policyPath: 'B',
      ratificationStatus: 'PENDING_OWNER_CONTROLLED_REPOSITORY_MERGE',
      governanceContractId: 'M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_CONTRACT_V1',
      governanceModeContractId: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_CONTRACT_V2,
      authorities: {
        humanOwnerOperator: 'AUTHORITY_A',
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
      governanceProposalRef: 'proposal.md',
    };
    const loaded = loadSingleOperatorGovernanceAdoptionRecordV1({
      [M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV]: JSON.stringify(record),
    });
    expect(loaded.ok).toBe(true);
    const readiness = evaluatePhaseAHumanVerificationReadinessV1(
      {
        M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE: 'SINGLE_OPERATOR_V1',
        [M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV]: JSON.stringify(record),
      },
      {
        approvingAuthority: 'a@example.com',
        authorizedHumanApprover: 'o@example.com',
        changeTicket: 'CHG',
        approvalBinding: {
          approvalId: 'apr',
          executeNonce: 'nonce',
          validFrom: '2026-10-09T11:00:00.000Z',
          validUntil: '2026-10-09T14:00:00.000Z',
        },
        maintenanceWindow: {
          startUtc: '2026-10-09T10:00:00.000Z',
          endUtc: '2026-10-09T15:00:00.000Z',
        },
        governanceModeFromGoRecord: 'SINGLE_OPERATOR_V1',
      },
    );
    expect(readiness.ok).toBe(false);
    if (!readiness.ok) {
      expect(readiness.reasonCode).toBe('PHASE_A_GOVERNANCE_RATIFICATION_PROVENANCE_REQUIRED');
    }
  });
});
