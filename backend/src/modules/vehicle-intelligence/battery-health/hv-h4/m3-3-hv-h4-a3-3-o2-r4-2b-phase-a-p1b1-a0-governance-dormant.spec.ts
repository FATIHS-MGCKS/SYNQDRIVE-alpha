import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import * as phaseAProductionPrismaClient from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-prisma-client.v1';
import { computePhaseAQueryManifestFingerprintV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.canonical.v1';
import { hashPhaseAP1TrustedAuthorizationSigningPayloadV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.canonical.v1';
import {
  evaluatePhaseAProductionP1DormantTrustedAuthorizationV1,
  PHASE_A_P1_DORMANT_EXECUTION_DISABLED,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-dormant-trusted-authorization-eval.v1';
import {
  M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_ENV,
  M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV,
  evaluatePhaseAHumanVerificationReadinessV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.v1';
import {
  M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V1,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_CONTRACT_V2,
  M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_CONTRACT_V1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.types.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_CONTRACT_V1,
  M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1,
  type M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-p1-trusted-authorization.types.v1';
import {
  resolvePhaseAProductionP1AuthorizationV1,
  evaluatePhaseAProductionP1ExecutionGateV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-execution-gate.v1';
import { evaluatePhaseAProductionOperationalReadinessV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-operational-readiness.v1';
import { M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-operational-readiness.v1';
import { buildPhaseAProductionP1IntegrationEnvV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-integration-env.fixture.v1';

const RELEASE_SHA = '129bfeebcfb5c6466dfaba610c33d32f50d9f56f';
const DB_URL =
  'postgresql://audit_ro@prod-db.example.com:5432/synqdrive?sslmode=verify-full&sslrootcert=/etc/ssl/certs/org-ca.pem';

function buildRatifiedAdoptionJson(): string {
  return JSON.stringify({
    contractVersion: M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_CONTRACT_V1,
    governanceMode: 'SINGLE_OPERATOR_V1',
    policyPath: 'B',
    ratificationStatus: 'RATIFIED',
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
    ratificationMethod: 'OWNER_CONTROLLED_REPOSITORY_MERGE',
    governanceProposalRef:
      'architecture/battery-v2/governance/M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_PROPOSAL_2026-10-09.md',
  });
}

function buildRiskAcceptanceJson(changeTicket: string): string {
  return JSON.stringify({
    contractVersion: M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_CONTRACT_V1,
    operatorIdentity: 'owner@example.com',
    changeTicket,
    acceptedAtUtc: '2026-10-09T12:00:00.000Z',
    attestation: 'Test fixture only — does not authorize production execution.',
    governanceMode: 'SINGLE_OPERATOR_V1',
  });
}

describe('P1B1-A0 governance adoption & dormant authorization', () => {
  it('keeps default production P1 authorization NO_GO', () => {
    expect(resolvePhaseAProductionP1AuthorizationV1()).toBe('NO_GO');
  });

  it('Path B does not bypass human verification without ratified adoption', () => {
    const result = evaluatePhaseAHumanVerificationReadinessV1(
      {
        [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_ENV]: 'SINGLE_OPERATOR_V1',
      },
      {
        verifierIdentity: 'ignored@example.com',
        approvingAuthority: 'author@example.com',
        authorizedHumanApprover: 'owner@example.com',
        changeTicket: 'CHG-TEST',
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_GOVERNANCE_RECORD_REQUIRED');
  });

  it('legacy multi-party mode still requires independent verifier', () => {
    const result = evaluatePhaseAHumanVerificationReadinessV1(
      {},
      {
        verifierIdentity: 'author@example.com',
        approvingAuthority: 'author@example.com',
        authorizedHumanApprover: 'owner@example.com',
        changeTicket: 'CHG-TEST',
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_GO_NO_GO_VERIFIER_NOT_INDEPENDENT');
  });

  it('single-operator mode requires change-specific risk acceptance when adoption ratified', () => {
    const adoptionPending = JSON.parse(buildRatifiedAdoptionJson());
    adoptionPending.ratificationStatus = 'PENDING_OWNER_CONTROLLED_REPOSITORY_MERGE';
    const pending = evaluatePhaseAHumanVerificationReadinessV1(
      {
        [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_ENV]: 'SINGLE_OPERATOR_V1',
        [M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV]:
          JSON.stringify(adoptionPending),
      },
      {
        verifierIdentity: 'x@example.com',
        approvingAuthority: 'author@example.com',
        authorizedHumanApprover: 'owner@example.com',
        changeTicket: 'CHG-TEST',
      },
    );
    expect(pending.ok).toBe(false);
    if (!pending.ok) expect(pending.reasonCode).toBe('PHASE_A_GOVERNANCE_ADOPTION_NOT_RATIFIED');

    const missingRisk = evaluatePhaseAHumanVerificationReadinessV1(
      {
        [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_ENV]: 'SINGLE_OPERATOR_V1',
        [M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV]: buildRatifiedAdoptionJson(),
      },
      {
        verifierIdentity: 'x@example.com',
        approvingAuthority: 'author@example.com',
        authorizedHumanApprover: 'owner@example.com',
        changeTicket: 'CHG-TEST',
      },
    );
    expect(missingRisk.ok).toBe(false);
    if (!missingRisk.ok) expect(missingRisk.reasonCode).toBe('PHASE_A_GOVERNANCE_RECORD_REQUIRED');
  });

  it('dormant eval never promotes execution even when offline verify inputs are well-formed', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const keyId = 'operator-key-1';
    const spki = publicKey.export({ type: 'spki', format: 'der' });
    const trustStore = {
      contractVersion: M3_3_HV_H4_A3_PHASE_A_P1_TRUST_STORE_CONTRACT_V1,
      keys: [{ keyId, publicKeySpkiBase64: spki.toString('base64') }],
      revokedKeyIds: [],
    };
    const now = new Date('2026-10-09T12:00:00.000Z');
    const start = '2026-10-09T11:00:00.000Z';
    const end = '2026-10-09T14:00:00.000Z';
    const consumptionSha = createHash('sha256').update('/var/lib/synqdrive/phase-a', 'utf8').digest('hex');
    const artifact: M3_3HvH4A3PhaseAP1TrustedAuthorizationEvidenceV1 = {
      contractVersion: M3_3_HV_H4_A3_PHASE_A_P1_TRUSTED_AUTHORIZATION_EVIDENCE_CONTRACT_V1,
      authorizationId: 'authz-test-001',
      governanceMode: 'SINGLE_OPERATOR_V1' as const,
      operatorIdentity: 'owner@example.com',
      changeTicket: 'CHG-P1B1-A0',
      authorizedReleaseSha: RELEASE_SHA,
      deploymentIdentity: {
        releaseCheckoutSha: RELEASE_SHA,
        deploymentHost: 'app.synqdrive.eu',
        deploymentLabel: 'synqdrive-production',
      },
      postgresTargetFingerprint: 'audit_ro@prod-db.example.com:5432/synqdrive',
      auditRoleLogin: 'audit_ro',
      queryManifestFingerprint: computePhaseAQueryManifestFingerprintV1(),
      approvalBinding: {
        approvalId: 'apr-test-001',
        executeNonce: 'nonce-test-abc',
        validFromUtc: start,
        validUntilUtc: end,
      },
      maintenanceWindow: { startUtc: start, endUtc: end },
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
      authorizationPolicyId: 'POLICY-1',
      maintenanceWindowPolicyId: 'MW-POLICY-1',
      evidenceStorageDestination: 'evidence://test',
      consumptionStoreBinding: {
        absolutePathSha256: consumptionSha,
        markerFileName: '.synqdrive_phase_a_production_consumption_store_v1',
      },
      issuedAtUtc: start,
      expiresAtUtc: end,
      signature: { algorithm: 'Ed25519' as const, keyId, detachedBase64: 'AAAA' },
    };
    const digest = hashPhaseAP1TrustedAuthorizationSigningPayloadV1(artifact);
    const detached = sign(null, digest, privateKey);
    artifact.signature.detachedBase64 = detached.toString('base64');
    const context = {
      runningReleaseSha: RELEASE_SHA,
      deploymentHost: 'app.synqdrive.eu',
      deploymentLabel: 'synqdrive-production',
      postgresTargetFingerprint: 'audit_ro@prod-db.example.com:5432/synqdrive',
      auditRoleLogin: 'audit_ro',
      approvalId: 'apr-test-001',
      executeNonce: 'nonce-test-abc',
      changeTicket: 'CHG-P1B1-A0',
      authorizationId: 'authz-test-001',
      queryManifestFingerprint: computePhaseAQueryManifestFingerprintV1(),
      consumptionStorePathSha256: consumptionSha,
      maintenanceWindowPolicyId: 'MW-POLICY-1',
      authorizationPolicyId: 'POLICY-1',
      liveDeploymentIdentityVerified: false as const,
    };

    const evalResult = evaluatePhaseAProductionP1DormantTrustedAuthorizationV1(
      artifact,
      trustStore,
      context,
      { now },
    );
    expect(evalResult.p1ExecutionAuthorization).toBe('NO_GO');
    expect(evalResult.dormantReasonCode).toBe(PHASE_A_P1_DORMANT_EXECUTION_DISABLED);
    expect(evalResult.deploymentIdentityVerified).toBe(false);
    expect(evalResult.runtimeP1AuthorizationResolver).toBe('NO_GO');
    expect(resolvePhaseAProductionP1AuthorizationV1()).toBe('NO_GO');
  });

  it('execution gate stays NO_GO with full integration env and synthetic signed evidence cannot enable GO', () => {
    const prismaSpy = jest.spyOn(phaseAProductionPrismaClient, 'createPhaseAProductionPrismaClientV1');
    const env = buildPhaseAProductionP1IntegrationEnvV1({
      productionDatabaseUrl: DB_URL,
      consumptionDir: `/tmp/phase-a-p1b1-a0-${Date.now()}`,
    });
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_ENV] = 'SINGLE_OPERATOR_V1';
    env[M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV] = buildRatifiedAdoptionJson();
    const go = JSON.parse(env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV] as string);
    env[M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV] = buildRiskAcceptanceJson(go.changeTicket);

    const gate = evaluatePhaseAProductionP1ExecutionGateV1(DB_URL, env);
    expect(gate.p1Authorization).toBe('NO_GO');
    expect(prismaSpy).not.toHaveBeenCalled();
    prismaSpy.mockRestore();
  });

  it('single-operator readiness can pass human verification substitute only with ratified adoption + risk acceptance', () => {
    const env = buildPhaseAProductionP1IntegrationEnvV1({
      productionDatabaseUrl: DB_URL,
      consumptionDir: `/tmp/phase-a-p1b1-a0-ready-${Date.now()}`,
    });
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GOVERNANCE_MODE_ENV] = 'SINGLE_OPERATOR_V1';
    env[M3_3_HV_H4_A3_SINGLE_OPERATOR_GOVERNANCE_ADOPTION_RECORD_JSON_ENV] = buildRatifiedAdoptionJson();
    const go = JSON.parse(env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV] as string);
    env[M3_3_HV_H4_A3_OPERATOR_RISK_ACCEPTANCE_JSON_ENV] = buildRiskAcceptanceJson(go.changeTicket);
    go.independentAuthorizationVerification.verifierIdentity = go.authorizedHumanApprover;
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV] = JSON.stringify(go);

    const report = evaluatePhaseAProductionOperationalReadinessV1(env, {
      now: new Date('2026-10-09T12:00:00.000Z'),
    });
    const humanCheck = report.checks.find((c) => c.checkId === 'INDEPENDENT_HUMAN_VERIFICATION');
    expect(humanCheck?.status).toBe('PASS');
    expect(resolvePhaseAProductionP1AuthorizationV1()).toBe('NO_GO');
  });
});
