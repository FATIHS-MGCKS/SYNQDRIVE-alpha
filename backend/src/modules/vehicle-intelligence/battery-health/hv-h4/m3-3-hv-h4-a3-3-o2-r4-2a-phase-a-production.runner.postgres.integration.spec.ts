import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { canonicalPostgresTargetKeyV1, parsePostgresUrlLoginV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';
import { M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.isolated-target.v1';
import {
  assertPhaseAPreflightIntegrationDatabaseReachableV1,
  isPhaseAPreflightPostgresIntegrationJobV1,
  resolvePhaseAPreflightIntegrationDatabaseUrlV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.integration.harness.v1';
import { DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.config.v1';
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
  assertPhaseAProductionAuditFixtureCannotInsertOnPublicV1,
  provisionPhaseAProductionAuditFixtureUrlV1,
  teardownPhaseAProductionAuditFixtureV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-audit.fixture.v1';
import { provisionPhaseAProductionConsumptionStoreFixtureV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-consumption-store.v1';
import {
  capturePhaseAProductionSessionIdentityV1,
  validatePhaseAProductionSessionIdentityAgainstSpecV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-session-identity.v1';
import {
  evaluatePhaseAProductionTlsIdentityInSessionV1,
  readPhaseAProductionBackendPidV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-tls-identity.v1';
import { evaluatePhaseAPreflightProductionAdmissionV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-admission.v1';
import { buildPhaseAProductionP1IntegrationEnvV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-integration-env.fixture.v1';
import { PHASE_A_P1_EXTERNAL_AUTHORIZATION_UNVERIFIED } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-execution-gate.v1';

const integrationJobActive = isPhaseAPreflightPostgresIntegrationJobV1();

const DEFAULT_SSLROOTCERT = '/etc/ssl/certs/ca-certificates.crt';

function withVerifyFullTlsParams(databaseUrl: string, sslrootcert = DEFAULT_SSLROOTCERT): string {
  const parsed = new URL(databaseUrl.replace(/^postgresql:/, 'postgres:'));
  parsed.searchParams.set('sslmode', 'verify-full');
  parsed.searchParams.set('sslrootcert', sslrootcert);
  return parsed.toString().replace(/^postgres:/, 'postgresql:');
}

function buildProductionFixtureEnv(
  productionDatabaseUrl: string,
  options: { consumptionDir: string; migrationOwnerRoleIdentityReference?: string },
): NodeJS.ProcessEnv {
  return buildPhaseAProductionP1IntegrationEnvV1({
    productionDatabaseUrl,
    migrationOwnerRoleIdentityReference: options.migrationOwnerRoleIdentityReference,
    consumptionDir: options.consumptionDir,
  });
}

function restoreEnv(keys: string[], prev: Record<string, string | undefined>): void {
  for (const k of keys) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
}

(integrationJobActive ? describe : describe.skip)(
  'M3.3-HV-H4-A3.3-O2-R4.2A production Phase-A admission (PostgreSQL integration)',
  () => {
    let integrationDatabaseUrl: string;

    beforeAll(async () => {
      integrationDatabaseUrl = resolvePhaseAPreflightIntegrationDatabaseUrlV1();
      await assertPhaseAPreflightIntegrationDatabaseReachableV1(integrationDatabaseUrl);
    });

    it('blocks production runner before connect when GO/NO-GO evidence is absent', async () => {
      const fictionalAuditUrl =
        'postgresql://audit_ro@prod-db.example.com:5432/synqdrive?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-certificates.crt';
      const keys = [
        M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED_ENV,
        M3_3_HV_H4_A3_PHASE_A_PRODUCTION_DATABASE_URL_ENV,
      ];
      const prev: Record<string, string | undefined> = {};
      for (const k of keys) prev[k] = process.env[k];
      process.env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED_ENV] = '1';
      process.env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_DATABASE_URL_ENV] = fictionalAuditUrl;

      try {
        const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
          databaseUrl: fictionalAuditUrl,
          roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
          admissionPolicy: 'PRODUCTION_AUTHORIZED_R4_2A',
        });
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) {
          expect(outcome.reasonCode).toBe('PHASE_A_GO_NO_GO_RECORD_REQUIRED');
        }
      } finally {
        restoreEnv(keys, prev);
      }
    });

    it('blocks production path when integration harness is active', async () => {
      const consumptionDir = join(process.cwd(), `.phase-a-prod-harness-${Date.now()}`);
      provisionPhaseAProductionConsumptionStoreFixtureV1(consumptionDir);
      const { databaseUrl: auditDatabaseUrl } = await provisionPhaseAProductionAuditFixtureUrlV1(
        integrationDatabaseUrl,
      );
      const verifyFullUrl = withVerifyFullTlsParams(auditDatabaseUrl);
      const fixture = buildProductionFixtureEnv(verifyFullUrl, {
        consumptionDir,
      });
      const keys = Object.keys(fixture);
      const prev: Record<string, string | undefined> = {};
      for (const k of keys) prev[k] = process.env[k];
      const prevHarness = process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV];
      Object.assign(process.env, fixture);
      process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV] = '1';

      try {
        const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
          databaseUrl: verifyFullUrl,
          roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
          admissionPolicy: 'PRODUCTION_AUTHORIZED_R4_2A',
        });
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) {
          expect(outcome.reasonCode).toBe('PHASE_A_PRODUCTION_INTEGRATION_HARNESS_FORBIDDEN');
        }
      } finally {
        await teardownPhaseAProductionAuditFixtureV1(integrationDatabaseUrl);
        restoreEnv(keys, prev);
        if (prevHarness === undefined) delete process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV];
        else process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV] = prevHarness;
        rmSync(consumptionDir, { recursive: true, force: true });
      }
    });

    it('blocks production runner before connect when offline contracts pass but P1 authorization is NO_GO', async () => {
      const consumptionDir = join(process.cwd(), `.phase-a-prod-p1-block-${Date.now()}`);
      const { databaseUrl: auditDatabaseUrl } = await provisionPhaseAProductionAuditFixtureUrlV1(
        integrationDatabaseUrl,
      );
      const verifyFullUrl = withVerifyFullTlsParams(auditDatabaseUrl);
      const fixture = buildProductionFixtureEnv(verifyFullUrl, { consumptionDir });
      const keys = Object.keys(fixture);
      const prev: Record<string, string | undefined> = {};
      for (const k of keys) prev[k] = process.env[k];
      const prevHarness = process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV];
      Object.assign(process.env, fixture);
      delete process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV];

      try {
        const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
          databaseUrl: verifyFullUrl,
          roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
          admissionPolicy: 'PRODUCTION_AUTHORIZED_R4_2A',
        });
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) {
          expect(outcome.reasonCode).toBe(PHASE_A_P1_EXTERNAL_AUTHORIZATION_UNVERIFIED);
        }
      } finally {
        await teardownPhaseAProductionAuditFixtureV1(integrationDatabaseUrl);
        restoreEnv(keys, prev);
        if (prevHarness === undefined) delete process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV];
        else process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV] = prevHarness;
        rmSync(consumptionDir, { recursive: true, force: true });
      }
    });

    it('rejects ephemeral /tmp consumption store at admission', async () => {
      const { databaseUrl: auditDatabaseUrl } = await provisionPhaseAProductionAuditFixtureUrlV1(
        integrationDatabaseUrl,
      );
      const verifyFullUrl = withVerifyFullTlsParams(auditDatabaseUrl);
      const ephemeralDir = mkdtempSync(join(tmpdir(), 'phase-a-prod-ephemeral-'));
      const fixture = buildProductionFixtureEnv(verifyFullUrl, {
        consumptionDir: ephemeralDir,
      });
      const admission = evaluatePhaseAPreflightProductionAdmissionV1(verifyFullUrl, fixture, {
        consumeApproval: false,
      });
      expect(admission.ok).toBe(false);
      if (!admission.ok) {
        expect(admission.reasonCode).toBe('PHASE_A_PRODUCTION_CONSUMPTION_STORE_EPHEMERAL_FORBIDDEN');
      }
      rmSync(ephemeralDir, { recursive: true, force: true });
      await teardownPhaseAProductionAuditFixtureV1(integrationDatabaseUrl);
    });

    it('reports non-encrypted session on CI plain PostgreSQL (pg_stat_ssl)', async () => {
      const client = new PrismaClient({
        datasources: { db: { url: integrationDatabaseUrl } },
      });
      try {
        await client.$connect();
        const anchorPid = await readPhaseAProductionBackendPidV1(client);
        const plainUrl =
          'postgresql://u@127.0.0.1:5432/db?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-certificates.crt';
        const probe = await evaluatePhaseAProductionTlsIdentityInSessionV1(
          client,
          plainUrl,
          anchorPid,
        );
        expect(probe.ok).toBe(false);
        if (!probe.ok) {
          expect(probe.reasonCode).toBe('PHASE_A_PRODUCTION_TLS_HANDSHAKE_NOT_ENCRYPTED');
        }
      } finally {
        await client.$disconnect().catch(() => undefined);
      }
    });

    it('fixture audit login cannot perform catalog writes (least-privilege)', async () => {
      const { databaseUrl: auditDatabaseUrl } = await provisionPhaseAProductionAuditFixtureUrlV1(
        integrationDatabaseUrl,
      );
      const writeCheck = await assertPhaseAProductionAuditFixtureCannotInsertOnPublicV1(auditDatabaseUrl);
      expect(writeCheck.ok).toBe(true);
      await teardownPhaseAProductionAuditFixtureV1(integrationDatabaseUrl);
    });

    it('validates dedicated audit fixture login is non-superuser', async () => {
      const { databaseUrl: auditDatabaseUrl } = await provisionPhaseAProductionAuditFixtureUrlV1(
        integrationDatabaseUrl,
      );
      const parsed = new URL(auditDatabaseUrl.replace(/^postgresql:/, 'postgres:'));
      const login = parsePostgresUrlLoginV1(auditDatabaseUrl)!;
      const spec = {
        contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1,
        hostname: parsed.hostname,
        port: Number(parsed.port || '5432'),
        database: parsed.pathname.replace(/^\//, '').split('/')[0],
        expectedAuditLogin: login,
        forbidSuperuserSession: true,
      };

      const client = new PrismaClient({ datasources: { db: { url: auditDatabaseUrl } } });
      try {
        await client.$connect();
        const identity = await capturePhaseAProductionSessionIdentityV1(client);
        const ok = validatePhaseAProductionSessionIdentityAgainstSpecV1(identity, spec);
        expect(ok.ok).toBe(true);
        expect(identity.isSuperuser).toBe(false);
      } finally {
        await client.$disconnect().catch(() => undefined);
        await teardownPhaseAProductionAuditFixtureV1(integrationDatabaseUrl);
      }
    });

    it('denies integration admin superuser session for production identity policy', async () => {
      const parsed = new URL(integrationDatabaseUrl.replace(/^postgresql:/, 'postgres:'));
      const login = parsePostgresUrlLoginV1(integrationDatabaseUrl)!;
      const spec = {
        contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1,
        hostname: parsed.hostname,
        port: Number(parsed.port || '5432'),
        database: parsed.pathname.replace(/^\//, '').split('/')[0],
        expectedAuditLogin: login,
        forbidSuperuserSession: true,
      };

      const client = new PrismaClient({ datasources: { db: { url: integrationDatabaseUrl } } });
      try {
        await client.$connect();
        const identity = await capturePhaseAProductionSessionIdentityV1(client);
        const ok = validatePhaseAProductionSessionIdentityAgainstSpecV1(identity, spec);
        if (identity.isSuperuser) {
          expect(ok.ok).toBe(false);
          if (!ok.ok) expect(ok.reasonCode).toBe('PHASE_A_PRODUCTION_SUPERUSER_SESSION_FORBIDDEN');
        }
      } finally {
        await client.$disconnect().catch(() => undefined);
      }
    });

    it('blocks production runner before connect when database URL lacks verify-full', async () => {
      const consumptionDir = join(process.cwd(), `.phase-a-prod-tls-url-${Date.now()}`);
      provisionPhaseAProductionConsumptionStoreFixtureV1(consumptionDir);
      const { databaseUrl: auditDatabaseUrl } = await provisionPhaseAProductionAuditFixtureUrlV1(
        integrationDatabaseUrl,
      );
      const verifyFullUrl = withVerifyFullTlsParams(auditDatabaseUrl);
      const fixture = buildProductionFixtureEnv(verifyFullUrl, {
        consumptionDir,
      });
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
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) {
          expect(outcome.status).toBe('BLOCKED');
          expect(outcome.reasonCode).toBe('PHASE_A_PRODUCTION_TLS_VERIFY_FULL_REQUIRED');
        }
      } finally {
        await teardownPhaseAProductionAuditFixtureV1(integrationDatabaseUrl);
        restoreEnv(keys, prev);
        if (prevHarness === undefined) delete process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV];
        else process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV] = prevHarness;
        rmSync(consumptionDir, { recursive: true, force: true });
      }
    });
  },
);
