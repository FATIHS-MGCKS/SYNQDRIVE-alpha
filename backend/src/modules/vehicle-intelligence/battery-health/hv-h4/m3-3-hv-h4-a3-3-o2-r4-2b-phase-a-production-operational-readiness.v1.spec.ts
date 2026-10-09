import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalPostgresTargetKeyV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';
import * as phaseAPreflightRunner from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.runner.v1';
import * as phaseAProductionPrismaClient from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-prisma-client.v1';
import * as phaseAProductionConsumptionStore from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-consumption-store.v1';
import { provisionPhaseAProductionConsumptionStoreFixtureV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-consumption-store.v1';
import { M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONTRACT_V1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.types.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_DATABASE_URL_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.v1';
import { M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.types.v1';
import { M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_CONTRACT_V1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-go-no-go.types.v1';
import {
  evaluatePhaseAProductionOperationalReadinessV1,
  loadPhaseAProductionGoNoGoRecordV1,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUTHORIZED_RELEASE_SHA_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_PATH_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-operational-readiness.v1';

const DB_URL =
  'postgresql://audit_ro@prod-db.example.com:5432/synqdrive?sslmode=verify-full&sslrootcert=/etc/ssl/certs/org-ca.pem';

function buildGoRecord(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_CONTRACT_V1,
    operatorDecision: 'GO',
    authorizedReleaseSha: 'a5b45a186774fd64e0af2ddf57cfdcd0a350550e',
    changeTicket: 'CHG-TEST-001',
    authorizedHumanApprover: 'change-manager@example.com',
    independentAuthorizationVerification: {
      verifierIdentity: 'security-officer@example.com',
      verifiedAtUtc: new Date(now - 30_000).toISOString(),
      verificationMethod: 'CHANGE_TICKET_PEER_REVIEW',
      attestsIndependentFromApprovalAuthor: true,
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
      sslmode: 'verify-full',
      trustedCaBundleRequired: true,
      hostnameValidationRequired: true,
    },
    approvalBinding: {
      approvalId: 'apr-test-001',
      executeNonce: 'nonce-test-abc',
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
    stopConditions: ['TLS identity not certified', 'Superuser session detected', 'Unexpected mutation'],
    incidentHandling: 'Stop execution, revoke credentials, open incident per IR-001',
    evidenceStorageDestination: 'change-system://CHG-TEST-001/phase-a-evidence',
    authorizationLimits: {
      schemaChangesAuthorized: false,
      issuanceActivationAuthorized: false,
      applicationRuntimeFlagChangesAuthorized: false,
      hybridLoaderActivationAuthorized: false,
      attestationInsertOrUpdateAuthorized: false,
    },
    ...overrides,
  };
}

function baseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const key = canonicalPostgresTargetKeyV1(DB_URL)!;
  const record = {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONTRACT_V1,
    approvalId: 'apr-test-001',
    changeTicket: 'CHG-TEST-001',
    approvingAuthority: 'change-author@example.com',
    approvedTargetKey: key,
    validFrom: new Date(Date.now() - 60_000).toISOString(),
    validUntil: new Date(Date.now() + 3600_000).toISOString(),
    executeNonce: 'nonce-test-abc',
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
  const dir = join(process.cwd(), `.phase-a-readiness-store-${Date.now()}`);
  provisionPhaseAProductionConsumptionStoreFixtureV1(dir);
  const go = buildGoRecord({
    consumptionStore: {
      absolutePath: dir,
      operationalOwner: 'platform-ops@example.com',
      markerFileName: '.synqdrive_phase_a_production_consumption_store_v1',
    },
    approvalBinding: {
      approvalId: record.approvalId,
      executeNonce: record.executeNonce,
      validFrom: record.validFrom,
      validUntil: record.validUntil,
    },
  });
  return {
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV]: JSON.stringify(go),
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON_ENV]: JSON.stringify(record),
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON_ENV]: JSON.stringify(spec),
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR_ENV]: dir,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_DATABASE_URL_ENV]: DB_URL,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUTHORIZED_RELEASE_SHA_ENV]: go.authorizedReleaseSha,
    ...overrides,
    __consumptionDir: dir,
  } as NodeJS.ProcessEnv;
}

describe('evaluatePhaseAProductionOperationalReadinessV1', () => {
  const prismaSpy = jest.spyOn(phaseAProductionPrismaClient, 'createPhaseAProductionPrismaClientV1');
  const consumeSpy = jest.spyOn(phaseAProductionConsumptionStore, 'markPhaseAProductionApprovalConsumedAtomicV1');
  const runnerSpy = jest.spyOn(phaseAPreflightRunner, 'runM3_3HvH4A3PhaseAPreflightV1');

  afterEach(() => {
    prismaSpy.mockClear();
    consumeSpy.mockClear();
    runnerSpy.mockClear();
  });

  it('defaults to NO_GO when GO/NO-GO record missing', () => {
    const report = evaluatePhaseAProductionOperationalReadinessV1({});
    expect(report.decision).toBe('NO_GO');
    expect(report.productionNetworkAccessAttempted).toBe(false);
    expect(report.postgresClientInstantiated).toBe(false);
    expect(report.approvalConsumed).toBe(false);
    expect(report.blockers).toContain('PHASE_A_GO_NO_GO_RECORD_REQUIRED');
  });

  it('rejects verifier that matches approval author (not independent)', () => {
    const env = baseEnv();
    const go = JSON.parse(env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV] as string);
    go.independentAuthorizationVerification.verifierIdentity = 'change-author@example.com';
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV] = JSON.stringify(go);
    const report = evaluatePhaseAProductionOperationalReadinessV1(env);
    expect(report.decision).toBe('NO_GO');
    expect(report.blockers).toContain('PHASE_A_GO_NO_GO_VERIFIER_NOT_INDEPENDENT');
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('passes offline readiness with synthetic fixtures (READY ≠ production authorization)', () => {
    const env = baseEnv();
    const report = evaluatePhaseAProductionOperationalReadinessV1(env);
    expect(report.decision).toBe('READY');
    expect(report.externalHumanAuthorizationAuthentication).toBe('UNVERIFIED');
    const externalCheck = report.checks.find((c) => c.checkId === 'EXTERNAL_HUMAN_AUTHORIZATION_AUTHENTICATION');
    expect(externalCheck?.status).toBe('SKIP');
    expect(externalCheck?.reasonCode).toBe('PHASE_A_EXTERNAL_HUMAN_AUTHORIZATION_UNVERIFIED');
    expect(report.checks.some((c) => c.checkId === 'EXTERNAL_HUMAN_AUTHORIZATION_AUTHENTICATION' && c.status === 'PASS')).toBe(
      false,
    );
    expect(report.authorizedReleaseShaBinding).toBe('CONFIGURATION_CONSISTENCY_ONLY');
    expect(report.auditCredentialExpectationsDeclaredOnly).toBe(true);
    expect(report.productionPhaseAExecuted).toBe(false);
    expect(report.approvalConsumed).toBe(false);
    expect(prismaSpy).not.toHaveBeenCalled();
    expect(consumeSpy).not.toHaveBeenCalled();
    expect(runnerSpy).not.toHaveBeenCalled();
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('requires AUTHORIZED_RELEASE_SHA env binding', () => {
    const env = baseEnv();
    delete env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUTHORIZED_RELEASE_SHA_ENV];
    const report = evaluatePhaseAProductionOperationalReadinessV1(env);
    expect(report.decision).toBe('NO_GO');
    expect(report.blockers).toContain('PHASE_A_AUTHORIZED_RELEASE_SHA_REQUIRED');
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('rejects release SHA mismatch between env and GO record', () => {
    const env = baseEnv({
      [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUTHORIZED_RELEASE_SHA_ENV]:
        '0000000000000000000000000000000000000000',
    });
    const report = evaluatePhaseAProductionOperationalReadinessV1(env);
    expect(report.decision).toBe('NO_GO');
    expect(report.blockers).toContain('PHASE_A_GO_NO_GO_RELEASE_SHA_MISMATCH');
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('returns NO_GO for malformed GO JSON without throwing', () => {
    const report = evaluatePhaseAProductionOperationalReadinessV1({
      [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV]: '{not-json',
    });
    expect(report.decision).toBe('NO_GO');
    expect(report.blockers).toContain('PHASE_A_GO_NO_GO_RECORD_INVALID_JSON');
  });

  it('returns NO_GO for unreadable GO record path', () => {
    const report = evaluatePhaseAProductionOperationalReadinessV1({
      [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_PATH_ENV]: '/nonexistent/go-no-go.json',
    });
    expect(report.decision).toBe('NO_GO');
    expect(report.blockers).toContain('PHASE_A_GO_NO_GO_RECORD_UNREADABLE');
  });

  it('returns NO_GO when maintenanceWindow is missing', () => {
    const env = baseEnv();
    const go = JSON.parse(env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV] as string);
    delete go.maintenanceWindow;
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV] = JSON.stringify(go);
    const loaded = loadPhaseAProductionGoNoGoRecordV1(env);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.reasonCode).toBe('PHASE_A_GO_NO_GO_MAINTENANCE_WINDOW_INCOMPLETE');
    }
    const report = evaluatePhaseAProductionOperationalReadinessV1(env);
    expect(report.decision).toBe('NO_GO');
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('returns NO_GO for reversed maintenance window timestamps', () => {
    const env = baseEnv();
    const go = buildGoRecord({
      maintenanceWindow: {
        startUtc: new Date(Date.now() + 3600_000).toISOString(),
        endUtc: new Date(Date.now() - 3600_000).toISOString(),
      },
    });
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV] = JSON.stringify(go);
    const loaded = loadPhaseAProductionGoNoGoRecordV1(env);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.reasonCode).toBe('PHASE_A_GO_NO_GO_MAINTENANCE_WINDOW_REVERSED');
    }
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('returns NO_GO for invalid stopConditions element types', () => {
    const env = baseEnv();
    const go = buildGoRecord({ stopConditions: ['valid', 42] });
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV] = JSON.stringify(go);
    const report = evaluatePhaseAProductionOperationalReadinessV1(env);
    expect(report.decision).toBe('NO_GO');
    expect(report.blockers).toContain('PHASE_A_GO_NO_GO_STOP_CONDITIONS_INVALID');
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('returns NO_GO when auditCredentialExpectations field is false', () => {
    const env = baseEnv();
    const go = buildGoRecord({
      auditCredentialExpectations: {
        dedicatedReadOnlyAuditLogin: true,
        distinctFromApplicationDatabaseUrl: false,
        distinctFromMigrationOwnerCredentials: true,
        distinctFromAttestationIssuerPool: true,
      },
    });
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV] = JSON.stringify(go);
    const report = evaluatePhaseAProductionOperationalReadinessV1(env);
    expect(report.decision).toBe('NO_GO');
    expect(report.blockers).toContain('PHASE_A_GO_NO_GO_AUDIT_CREDENTIAL_EXPECTATIONS_INVALID');
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('returns NO_GO for timezone-less maintenance window timestamps', () => {
    const env = baseEnv();
    const go = buildGoRecord({
      maintenanceWindow: {
        startUtc: '2026-10-09T00:00:00',
        endUtc: '2026-10-09T23:59:59',
      },
    });
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV] = JSON.stringify(go);
    const loaded = loadPhaseAProductionGoNoGoRecordV1(env);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.reasonCode).toBe('PHASE_A_GO_NO_GO_MAINTENANCE_WINDOW_INVALID');
    }
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('returns NO_GO for verifier timestamp in the future', () => {
    const env = baseEnv();
    const go = JSON.parse(env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV] as string);
    go.independentAuthorizationVerification.verifiedAtUtc = new Date(Date.now() + 3600_000).toISOString();
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV] = JSON.stringify(go);
    const report = evaluatePhaseAProductionOperationalReadinessV1(env);
    expect(report.decision).toBe('NO_GO');
    expect(report.blockers).toContain('PHASE_A_GO_NO_GO_VERIFIER_TIMESTAMP_FUTURE');
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });

  it('does not import or invoke production runner when module loads', () => {
    const env = baseEnv();
    evaluatePhaseAProductionOperationalReadinessV1(env);
    expect(runnerSpy).not.toHaveBeenCalled();
    rmSync(env.__consumptionDir as string, { recursive: true, force: true });
  });
});

describe('operational readiness CLI', () => {
  it('exits non-zero and prints structured NO_GO JSON on invalid input', () => {
    let stderr = '';
    let stdout = '';
    let exitCode = 0;
    try {
      stdout = execFileSync(
        'npx',
        [
          'ts-node',
          '-r',
          'tsconfig-paths/register',
          'scripts/ops/m3-3-hv-h4-a3-o2-r4-2b-phase-a-production-operational-readiness.ts',
        ],
        {
          cwd: join(__dirname, '../../../../..'),
          env: {
            ...process.env,
            M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON: '{bad-json',
          },
          encoding: 'utf8',
        },
      );
    } catch (error: unknown) {
      const e = error as { status?: number; stdout?: string; stderr?: string };
      exitCode = e.status ?? 1;
      stdout = e.stdout ?? '';
      stderr = e.stderr ?? '';
    }
    expect(exitCode).not.toBe(0);
    const combined = `${stdout}\n${stderr}`;
    expect(combined).toContain('PHASE_A_OPERATIONAL_READINESS_SUMMARY');
    expect(combined).toContain('"decision": "NO_GO"');
    expect(combined).not.toMatch(/postgresql:\/\//);
  });
});

describe('operational readiness CLI isolation', () => {
  it('readiness module has no PrismaClient import path', () => {
    const source = require('node:fs').readFileSync(
      join(__dirname, 'm3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-operational-readiness.v1.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/PrismaClient/);
    expect(source).not.toMatch(/@prisma\/client/);
    expect(source).not.toMatch(/runM3_3HvH4A3PhaseAPreflightV1/);
    expect(source).not.toMatch(/createPhaseAProductionPrismaClientV1/);
  });
});
