import { PrismaClient } from '@prisma/client';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.config.v1';
import { redactPostgresDatabaseTargetV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.redaction.v1';
import {
  assertM3_3HvH4A3PhaseAPreflightReadOnlyRejectsMutationV1,
  runM3_3HvH4A3PhaseAPreflightV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.runner.v1';
import { getApprovedPhaseAQuerySqlV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.query-manifest.v1';
import { assertM3_3HvH4A3PreflightSqlReadOnlyV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-production-role-preflight.spec-validator.v1';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';
const databaseUrl = process.env.DATABASE_URL;

describe('M3.3-HV-H4-A3.3-O2-R4.1 Phase-A preflight runner (PostgreSQL)', () => {
  it('manifest queries are read-only SELECT statements', () => {
    for (const id of [
      'SESSION_CONTEXT',
      'PGCRYPTO_STATUS',
      'REGCLASS_PRISMA_MIGRATIONS',
      'ROLE_BY_NAME',
    ] as const) {
      expect(() => assertM3_3HvH4A3PreflightSqlReadOnlyV1(getApprovedPhaseAQuerySqlV1(id))).not.toThrow();
    }
  });

  it('redacts database target in reports', async () => {
    if (!databaseUrl) return;
    const redacted = redactPostgresDatabaseTargetV1(databaseUrl);
    expect(redacted).not.toContain('synqdrive:synqdrive');
    expect(redacted).toContain('postgresql://***@');
  });

  it('enforces READ ONLY — mutation cannot commit', async () => {
    if (!integrationEnabled || !databaseUrl) return;
    const probe = await probePostgresDatabase();
    if (!probe) return;
    await assertM3_3HvH4A3PhaseAPreflightReadOnlyRejectsMutationV1(databaseUrl);
  });

  it('classifies missing future production roles as NOT_PROVISIONED', async () => {
    if (!integrationEnabled || !databaseUrl) return;
    const probe = await probePostgresDatabase();
    if (!probe) return;

    const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
      databaseUrl,
      roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.report.phaseBCertified).toBe(false);
    expect(outcome.report.phaseBCertificationStatus).toBe('NOT_CERTIFIED');
    expect(outcome.report.productionCertification).toBe('NOT_CERTIFIED');
    expect(outcome.report.checks.some((c) => c.checkId === 'PHASE_A_SESSION_CONTEXT')).toBe(true);

    const migrationCheck = outcome.report.checks.find((c) => c.checkId === 'PHASE_A_MIGRATION_HISTORY');
    expect(migrationCheck?.status === 'PASS' || migrationCheck?.status === 'NOT_PRESENT').toBe(true);

    const notProvisioned = outcome.report.checks.filter((c) => c.status === 'NOT_PROVISIONED');
    expect(notProvisioned.length).toBeGreaterThan(0);
  });

  it('classifies empty database without _prisma_migrations as NOT_PRESENT', async () => {
    if (!integrationEnabled || !databaseUrl) return;
    const probe = await probePostgresDatabase();
    if (!probe) return;

    const parsed = new URL(databaseUrl.replace(/^postgresql:/, 'postgres:'));
    const emptyDbName = `ph_a_empty_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const admin = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${emptyDbName}"`);
    } catch {
      await admin.$disconnect().catch(() => undefined);
      return;
    }

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

      const attestationTable = outcome.report.checks.filter(
        (c) => c.checkId === 'PHASE_A_TABLE_OWNERSHIP_SNAPSHOT' && c.status === 'NOT_PRESENT',
      );
      expect(attestationTable.length).toBeGreaterThanOrEqual(1);
    } finally {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${emptyDbName}"`);
      await admin.$disconnect().catch(() => undefined);
    }
  });
});
