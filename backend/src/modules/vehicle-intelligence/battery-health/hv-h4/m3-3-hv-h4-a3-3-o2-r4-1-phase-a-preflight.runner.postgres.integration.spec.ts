import { PrismaClient } from '@prisma/client';
import { DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.config.v1';
import {
  assertPhaseAPreflightIntegrationDatabaseReachableV1,
  isPhaseAPreflightPostgresIntegrationJobV1,
  resolvePhaseAPreflightIntegrationDatabaseUrlV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.integration.harness.v1';
import {
  provisionPhaseAMigrationSelectDenialFixtureV1,
  teardownPhaseAMigrationSelectDenialFixtureV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.migration-denial.fixture.v1';
import { M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_QUERY_TELEMETRY_ENV } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.isolated-target.v1';
import { redactPostgresDatabaseTargetV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.redaction.v1';
import {
  assertM3_3HvH4A3PhaseAPreflightReadOnlyRejectsMutationV1,
  M3_3_HV_H4_A3_PHASE_A_TRUSTED_FUNCTION_REGPROC_V1,
  runM3_3HvH4A3PhaseAPreflightV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.runner.v1';

const integrationJobActive = isPhaseAPreflightPostgresIntegrationJobV1();

(integrationJobActive ? describe : describe.skip)(
  'M3.3-HV-H4-A3.3-O2-R4.1 Phase-A preflight runner (PostgreSQL integration)',
  () => {
    let integrationDatabaseUrl: string;

    beforeAll(async () => {
      integrationDatabaseUrl = resolvePhaseAPreflightIntegrationDatabaseUrlV1();
      await assertPhaseAPreflightIntegrationDatabaseReachableV1(integrationDatabaseUrl);
    });

    it('redacts database target in reports', () => {
      const redacted = redactPostgresDatabaseTargetV1(integrationDatabaseUrl);
      expect(redacted).not.toContain('synqdrive:synqdrive');
      expect(redacted).toContain('postgresql://***@');
    });

    it('enforces READ ONLY — SQLSTATE 25006 on mutation probe', async () => {
      const probe = await assertM3_3HvH4A3PhaseAPreflightReadOnlyRejectsMutationV1(integrationDatabaseUrl);
      expect(probe.ok).toBe(true);
      if (probe.ok) {
        expect(probe.enforced).toBe(true);
        expect(probe.sqlState).toBe('25006');
      }
    });

    it('classifies missing future production roles as NOT_PROVISIONED', async () => {
      const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
        databaseUrl: integrationDatabaseUrl,
        roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
      });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      expect(outcome.report.phaseBCertified).toBe(false);
      expect(outcome.report.securityCertification).toBe('NOT_CERTIFIED');
      expect(outcome.report.checks[0]?.checkId).toBe('PHASE_A_SESSION_CONTEXT');

      const notProvisioned = outcome.report.checks.filter((c) => c.status === 'NOT_PROVISIONED');
      expect(notProvisioned.length).toBeGreaterThan(0);

      const functionChecks = outcome.report.checks.filter(
        (c) => c.checkId === 'PHASE_A_FUNCTION_OWNERSHIP_SNAPSHOT',
      );
      expect(functionChecks.length).toBe(M3_3_HV_H4_A3_PHASE_A_TRUSTED_FUNCTION_REGPROC_V1.length);
    });

    it('classifies empty database without _prisma_migrations as NOT_PRESENT', async () => {
      const parsed = new URL(integrationDatabaseUrl.replace(/^postgresql:/, 'postgres:'));
      const emptyDbName = `ph_a_empty_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const admin = new PrismaClient({ datasources: { db: { url: integrationDatabaseUrl } } });
      await admin.$executeRawUnsafe(`CREATE DATABASE "${emptyDbName}"`);

      parsed.pathname = `/${emptyDbName}`;
      const emptyUrl = parsed.toString().replace(/^postgres:/, 'postgresql:');

      try {
        const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
          databaseUrl: emptyUrl,
          roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
        });
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;

        const migrationCheck = outcome.report.checks.find((c) => c.checkId === 'PHASE_A_MIGRATION_HISTORY');
        expect(migrationCheck?.status).toBe('NOT_PRESENT');
      } finally {
        await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${emptyDbName}"`);
        await admin.$disconnect().catch(() => undefined);
      }
    });

    it('classifies missing SELECT on _prisma_migrations as ERROR without further SQL', async () => {
      process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_QUERY_TELEMETRY_ENV] = '1';
      const { databaseUrl: restrictedUrl } = await provisionPhaseAMigrationSelectDenialFixtureV1(
        integrationDatabaseUrl,
      );

      try {
        const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
          databaseUrl: restrictedUrl,
          roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
        });
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;

        const migrationCheck = outcome.report.checks.find((c) => c.checkId === 'PHASE_A_MIGRATION_HISTORY');
        expect(migrationCheck?.status).toBe('ERROR');
        expect(migrationCheck?.detail).toMatch(/^PHASE_A_/);
        expect(outcome.report.phaseADiscoveryComplete).toBe(false);

        const tableChecks = outcome.report.checks.filter(
          (c) => c.checkId === 'PHASE_A_TABLE_OWNERSHIP_SNAPSHOT',
        );
        expect(tableChecks.length).toBe(0);

        expect(outcome.report.testDiagnostics?.approvedQueryInvocations).toBeGreaterThan(0);
      } finally {
        await teardownPhaseAMigrationSelectDenialFixtureV1(integrationDatabaseUrl);
        delete process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_QUERY_TELEMETRY_ENV];
      }
    });
  },
);
