import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalPostgresTargetKeyV1, parsePostgresUrlLoginV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';
import { DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.config.v1';
import {
  assertPhaseAPreflightIntegrationDatabaseReachableV1,
  isPhaseAPreflightPostgresIntegrationJobV1,
  resolvePhaseAPreflightIntegrationDatabaseUrlV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.integration.harness.v1';
import { M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.isolated-target.v1';
import { runM3_3HvH4A3PhaseAPreflightV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.runner.v1';
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
import {
  provisionPhaseAProductionAuditFixtureUrlV1,
  teardownPhaseAProductionAuditFixtureV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-audit.fixture.v1';

const integrationJobActive = isPhaseAPreflightPostgresIntegrationJobV1();

function buildProductionFixtureEnv(integrationDatabaseUrl: string): NodeJS.ProcessEnv {
  const parsed = new URL(integrationDatabaseUrl.replace(/^postgresql:/, 'postgres:'));
  const login = parsePostgresUrlLoginV1(integrationDatabaseUrl) ?? 'synqdrive';
  const key = canonicalPostgresTargetKeyV1(integrationDatabaseUrl)!;
  const consumptionDir = mkdtempSync(join(tmpdir(), 'phase-a-prod-int-'));
  const approvalId = `apr-int-${Date.now()}`;
  const nonce = `nonce-${Date.now()}`;
  const record = {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONTRACT_V1,
    approvalId,
    changeTicket: 'CHG-INTEGRATION-FIXTURE',
    approvingAuthority: 'ci-fixture@synqdrive.local',
    approvedTargetKey: key,
    validFrom: new Date(Date.now() - 60_000).toISOString(),
    validUntil: new Date(Date.now() + 3600_000).toISOString(),
    executeNonce: nonce,
    authenticationKind: 'DOCUMENTED_HUMAN_APPROVAL' as const,
  };
  const spec = {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1,
    hostname: parsed.hostname,
    port: Number(parsed.port || '5432'),
    database: parsed.pathname.replace(/^\//, '').split('/')[0],
    expectedAuditLogin: login,
    requireTlsIdentityVerification: false,
    /** CI postgres admin is often superuser; production runbook requires true. */
    forbidSuperuserSession: false,
  };

  return {
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED_ENV]: '1',
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_DATABASE_URL_ENV]: integrationDatabaseUrl,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_ACK_ENV]: '1',
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_APPROVAL_ID_ENV]: approvalId,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_NONCE_ENV]: nonce,
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON_ENV]: JSON.stringify(record),
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON_ENV]: JSON.stringify(spec),
    [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR_ENV]: consumptionDir,
    __consumptionDir: consumptionDir,
  } as NodeJS.ProcessEnv;
}

(integrationJobActive ? describe : describe.skip)(
  'M3.3-HV-H4-A3.3-O2-R4.2A production Phase-A admission (PostgreSQL integration)',
  () => {
    let integrationDatabaseUrl: string;

    beforeAll(async () => {
      integrationDatabaseUrl = resolvePhaseAPreflightIntegrationDatabaseUrlV1();
      await assertPhaseAPreflightIntegrationDatabaseReachableV1(integrationDatabaseUrl);
    });

    it('blocks production path when integration harness is active', async () => {
      const fixture = buildProductionFixtureEnv(integrationDatabaseUrl);
      const keys = Object.keys(fixture);
      const prev: Record<string, string | undefined> = {};
      for (const k of keys) prev[k] = process.env[k];
      const prevHarness = process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV];
      Object.assign(process.env, fixture);
      process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV] = '1';

      try {
        const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
          databaseUrl: integrationDatabaseUrl,
          roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
          admissionPolicy: 'PRODUCTION_AUTHORIZED_R4_2A',
        });
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) {
          expect(outcome.reasonCode).toBe('PHASE_A_PRODUCTION_INTEGRATION_HARNESS_FORBIDDEN');
        }
      } finally {
        for (const k of keys) {
          if (prev[k] === undefined) delete process.env[k];
          else process.env[k] = prev[k];
        }
        if (prevHarness === undefined) delete process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV];
        else process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV] = prevHarness;
        rmSync(fixture.__consumptionDir as string, { recursive: true, force: true });
      }
    });

    it('runs Phase-A discovery with production admission on fixture URL', async () => {
      const { databaseUrl: auditDatabaseUrl } = await provisionPhaseAProductionAuditFixtureUrlV1(
        integrationDatabaseUrl,
      );
      const fixture = buildProductionFixtureEnv(auditDatabaseUrl);
      const keys = Object.keys(fixture);
      const prev: Record<string, string | undefined> = {};
      for (const k of keys) prev[k] = process.env[k];
      const prevHarness = process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV];
      Object.assign(process.env, fixture);
      delete process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV];

      try {
        const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
          databaseUrl: auditDatabaseUrl,
          roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
          admissionPolicy: 'PRODUCTION_AUTHORIZED_R4_2A',
        });
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) {
          throw new Error(`expected ok, got ${outcome.reasonCode}`);
        }
        expect(outcome.report.productionCertification).toBe('NOT_CERTIFIED');
        expect(outcome.report.productionAdmissionEvidence?.cryptographicAuthentication).toBe(false);
        expect(outcome.report.productionAdmissionEvidence?.approvalId).toBeDefined();
      } finally {
        await teardownPhaseAProductionAuditFixtureV1(integrationDatabaseUrl);
        for (const k of keys) {
          if (prev[k] === undefined) delete process.env[k];
          else process.env[k] = prev[k];
        }
        if (prevHarness === undefined) delete process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV];
        else process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV] = prevHarness;
        rmSync(fixture.__consumptionDir as string, { recursive: true, force: true });
      }
    });
  },
);
