import { join } from 'node:path';
import { canonicalPostgresTargetKeyV1, parsePostgresUrlLoginV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';
import { provisionPhaseAProductionConsumptionStoreFixtureV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-consumption-store.v1';
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
import {
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUTHORIZED_RELEASE_SHA_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-operational-readiness.v1';
import { M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_DATABASE_URL_ENV } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-migration-owner-boundary.v1';

const DEFAULT_RELEASE_SHA = '675bb252b5f18daa5da96275b48b39afa15ef305';

export type BuildPhaseAProductionP1IntegrationEnvOptionsV1 = {
  productionDatabaseUrl: string;
  migrationOwnerDatabaseUrl: string;
  consumptionDir?: string;
  releaseSha?: string;
};

/** CI/integration fixture — not production authorization evidence. */
export function buildPhaseAProductionP1IntegrationEnvV1(
  options: BuildPhaseAProductionP1IntegrationEnvOptionsV1,
): NodeJS.ProcessEnv {
  const consumptionDir =
    options.consumptionDir ?? join(process.cwd(), `.phase-a-p1-int-${Date.now()}`);
  provisionPhaseAProductionConsumptionStoreFixtureV1(consumptionDir);

  const parsed = new URL(options.productionDatabaseUrl.replace(/^postgresql:/, 'postgres:'));
  const login = parsePostgresUrlLoginV1(options.productionDatabaseUrl) ?? 'synqdrive';
  const key = canonicalPostgresTargetKeyV1(options.productionDatabaseUrl)!;
  const approvalId = `apr-p1-int-${Date.now()}`;
  const nonce = `nonce-p1-${Date.now()}`;
  const now = Date.now();
  const validFrom = new Date(now - 60_000).toISOString();
  const validUntil = new Date(now + 3600_000).toISOString();
  const releaseSha = options.releaseSha ?? DEFAULT_RELEASE_SHA;

  const record = {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONTRACT_V1,
    approvalId,
    changeTicket: 'CHG-P1-INTEGRATION-FIXTURE',
    approvingAuthority: 'ci-approver@synqdrive.local',
    approvedTargetKey: key,
    validFrom,
    validUntil,
    executeNonce: nonce,
    authenticationKind: 'DOCUMENTED_HUMAN_APPROVAL' as const,
  };

  const spec = {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1,
    hostname: parsed.hostname,
    port: Number(parsed.port || '5432'),
    database: parsed.pathname.replace(/^\//, '').split('/')[0],
    expectedAuditLogin: login,
    forbidSuperuserSession: true,
  };

  const go = {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_CONTRACT_V1,
    operatorDecision: 'GO' as const,
    authorizedReleaseSha: releaseSha,
    changeTicket: record.changeTicket,
    authorizedHumanApprover: 'ci-change-manager@synqdrive.local',
    independentAuthorizationVerification: {
      verifierIdentity: 'ci-verifier@synqdrive.local',
      verifiedAtUtc: new Date(now - 30_000).toISOString(),
      verificationMethod: 'CI_FIXTURE_PEER_REVIEW',
      attestsIndependentFromApprovalAuthor: true as const,
    },
    productionTarget: {
      hostname: spec.hostname,
      port: spec.port,
      database: spec.database,
      auditLogin: login,
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
      validFrom,
      validUntil,
    },
    consumptionStore: {
      absolutePath: consumptionDir,
      operationalOwner: 'ci-platform-ops@synqdrive.local',
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
    stopConditions: ['TLS identity not certified', 'Superuser session detected'],
    incidentHandling: 'CI fixture — stop and review',
    evidenceStorageDestination: 'ci://fixture/phase-a-evidence',
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
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED_ENV]: '1',
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_DATABASE_URL_ENV]: options.productionDatabaseUrl,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_DATABASE_URL_ENV]:
      options.migrationOwnerDatabaseUrl,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_ACK_ENV]: '1',
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_APPROVAL_ID_ENV]: approvalId,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_NONCE_ENV]: nonce,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON_ENV]: JSON.stringify(record),
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON_ENV]: JSON.stringify(spec),
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR_ENV]: consumptionDir,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV]: JSON.stringify(go),
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUTHORIZED_RELEASE_SHA_ENV]: releaseSha,
    __consumptionDir: consumptionDir,
  } as NodeJS.ProcessEnv;
}
