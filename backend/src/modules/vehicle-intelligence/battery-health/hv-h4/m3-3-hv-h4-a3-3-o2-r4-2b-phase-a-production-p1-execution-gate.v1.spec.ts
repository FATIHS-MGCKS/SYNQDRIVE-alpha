import { evaluatePhaseAProductionP1ExecutionGateV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-execution-gate.v1';
import {
  evaluatePhaseAProductionOperationalReadinessV1,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUTHORIZED_RELEASE_SHA_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-operational-readiness.v1';
import { M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_DATABASE_URL_ENV } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-migration-owner-boundary.v1';
import { provisionPhaseAProductionConsumptionStoreFixtureV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-consumption-store.v1';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { canonicalPostgresTargetKeyV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';
import { M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONTRACT_V1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.types.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_DATABASE_URL_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_ACK_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_APPROVAL_ID_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_NONCE_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.v1';
import { M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.types.v1';
import { M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_CONTRACT_V1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-go-no-go.types.v1';

const DB_URL =
  'postgresql://audit_ro@prod-db.example.com:5432/synqdrive?sslmode=verify-full&sslrootcert=/etc/ssl/certs/org-ca.pem';
const MIGRATION_URL =
  'postgresql://migration_owner@prod-db.example.com:5432/synqdrive?sslmode=verify-full&sslrootcert=/etc/ssl/certs/org-ca.pem';

function buildReadyEnv(): NodeJS.ProcessEnv {
  const dir = join(process.cwd(), `.phase-a-p1-gate-${Date.now()}`);
  provisionPhaseAProductionConsumptionStoreFixtureV1(dir);
  const key = canonicalPostgresTargetKeyV1(DB_URL)!;
  const now = Date.now();
  const approvalId = 'apr-p1-gate-001';
  const nonce = 'nonce-p1-gate';
  const record = {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONTRACT_V1,
    approvalId,
    changeTicket: 'CHG-P1-GATE',
    approvingAuthority: 'approver@example.com',
    approvedTargetKey: key,
    validFrom: new Date(now - 60_000).toISOString(),
    validUntil: new Date(now + 3600_000).toISOString(),
    executeNonce: nonce,
    authenticationKind: 'DOCUMENTED_HUMAN_APPROVAL' as const,
  };
  const spec = {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1,
    hostname: 'prod-db.example.com',
    port: 5432,
    database: 'synqdrive',
    expectedAuditLogin: 'audit_ro',
    forbidSuperuserSession: true,
  };
  const releaseSha = '675bb252b5f18daa5da96275b48b39afa15ef305';
  const go = {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_CONTRACT_V1,
    operatorDecision: 'GO' as const,
    authorizedReleaseSha: releaseSha,
    changeTicket: record.changeTicket,
    authorizedHumanApprover: 'change-manager@example.com',
    independentAuthorizationVerification: {
      verifierIdentity: 'verifier@example.com',
      verifiedAtUtc: new Date(now - 30_000).toISOString(),
      verificationMethod: 'PEER_REVIEW',
      attestsIndependentFromApprovalAuthor: true as const,
    },
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
      sslmode: 'verify-full' as const,
      trustedCaBundleRequired: true,
      hostnameValidationRequired: true,
    },
    approvalBinding: {
      approvalId,
      executeNonce: nonce,
      validFrom: record.validFrom,
      validUntil: record.validUntil,
    },
    consumptionStore: {
      absolutePath: dir,
      operationalOwner: 'ops@example.com',
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
    stopConditions: ['stop'],
    incidentHandling: 'incident',
    evidenceStorageDestination: 'evidence://dest',
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
  };

  return {
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV]: JSON.stringify(go),
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON_ENV]: JSON.stringify(record),
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON_ENV]: JSON.stringify(spec),
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR_ENV]: dir,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_DATABASE_URL_ENV]: DB_URL,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUTHORIZED_RELEASE_SHA_ENV]: releaseSha,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_DATABASE_URL_ENV]: MIGRATION_URL,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED_ENV]: '1',
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_ACK_ENV]: '1',
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_APPROVAL_ID_ENV]: approvalId,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_NONCE_ENV]: nonce,
    __consumptionDir: dir,
  } as NodeJS.ProcessEnv;
}

describe('evaluatePhaseAProductionP1ExecutionGateV1', () => {
  it('blocks when GO/NO-GO record is missing', () => {
    const gate = evaluatePhaseAProductionP1ExecutionGateV1(DB_URL, {});
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reasonCode).toBe('PHASE_A_GO_NO_GO_RECORD_REQUIRED');
      expect(gate.p1Authorization).toBe('NO_GO');
    }
  });

  it('blocks when release SHA mismatches GO record', () => {
    const env = buildReadyEnv();
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUTHORIZED_RELEASE_SHA_ENV] =
      '0000000000000000000000000000000000000000';
    const gate = evaluatePhaseAProductionP1ExecutionGateV1(DB_URL, env);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reasonCode).toBe('PHASE_A_GO_NO_GO_RELEASE_SHA_MISMATCH');
    }
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('blocks when migration owner reference is missing', () => {
    const env = buildReadyEnv();
    delete env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_DATABASE_URL_ENV];
    const gate = evaluatePhaseAProductionP1ExecutionGateV1(DB_URL, env);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reasonCode).toBe('PHASE_A_PRODUCTION_MIGRATION_OWNER_REFERENCE_REQUIRED');
    }
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('passes gate with READY artifacts but p1Authorization remains NO_GO', () => {
    const env = buildReadyEnv();
    const gate = evaluatePhaseAProductionP1ExecutionGateV1(DB_URL, env);
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.p1Authorization).toBe('NO_GO');
      expect(gate.externalHumanAuthorizationAuthentication).toBe('UNVERIFIED');
      expect(gate.operationalReadinessDecision).toBe('READY');
    }
    const readiness = evaluatePhaseAProductionOperationalReadinessV1(env);
    expect(readiness.decision).toBe('READY');
    expect(readiness.externalHumanAuthorizationAuthentication).toBe('UNVERIFIED');
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });
});
