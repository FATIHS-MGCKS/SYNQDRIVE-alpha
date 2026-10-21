import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { canonicalPostgresTargetKeyV1, parsePostgresUrlLoginV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';
import { DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.config.v1';
import { runM3_3HvH4A3PhaseAPreflightV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.runner.v1';
import { evaluatePhaseAPreflightProductionAdmissionV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-admission.v1';
import {
  provisionPhaseAProductionAuditFixtureUrlV1,
  teardownPhaseAProductionAuditFixtureV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-audit.fixture.v1';
import { provisionPhaseAProductionConsumptionStoreFixtureV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-consumption-store.v1';
import { buildPhaseAProductionP1IntegrationEnvV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-integration-env.fixture.v1';
import {
  evaluatePhaseAProductionP1ExecutionGateV1,
  PHASE_A_P1_EXTERNAL_AUTHORIZATION_UNVERIFIED,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-p1-execution-gate.v1';
import { M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.isolated-target.v1';
import {
  assertPrismaConnectOutcomeV1,
  buildPhaseAProductionVerifyFullDatabaseUrlV1,
  isPhaseAProductionTlsFixtureJobV1,
  resolvePhaseAProductionTlsFixtureDatabaseUrlV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-tls-fixture.v1';
import { validatePhaseAProductionTlsUrlPolicyV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-target.v1';

const tlsFixtureActive = isPhaseAProductionTlsFixtureJobV1();

function reloadTlsServerCert(certSubdir: string): void {
  const container = process.env.M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_CONTAINER ?? 'phase_a_tls_postgres_ci';
  execSync(
    `docker exec -u root ${container} sh -c "cp /tls-mount/${certSubdir}/server.crt /var/lib/postgresql/ssl/server.crt && cp /tls-mount/${certSubdir}/server.key /var/lib/postgresql/ssl/server.key && chown postgres:postgres /var/lib/postgresql/ssl/server.crt /var/lib/postgresql/ssl/server.key && chmod 600 /var/lib/postgresql/ssl/server.key && kill -HUP 1"`,
    { stdio: 'pipe' },
  );
}

(tlsFixtureActive ? describe : describe.skip)(
  'M3.3-HV-H4-A3.3-O2-R4.2A-H2 TLS identity (PostgreSQL TLS fixture)',
  () => {
    const trustedCa = process.env.M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_TRUSTED_CA!;
    const wrongCa = process.env.M3_3_HV_H4_A3_PHASE_A_TLS_FIXTURE_WRONG_CA!;
    let tlsAdminUrl: string;

    beforeAll(() => {
      tlsAdminUrl = resolvePhaseAProductionTlsFixtureDatabaseUrlV1();
    });

    it('trusted CA + matching hostname + verify-full connects via Prisma', async () => {
      const outcome = await assertPrismaConnectOutcomeV1(tlsAdminUrl);
      expect(outcome.ok).toBe(true);
    });

    it('rejects untrusted CA at Prisma connect', async () => {
      const parsed = new URL(tlsAdminUrl.replace(/^postgresql:/, 'postgres:'));
      const badUrl = buildPhaseAProductionVerifyFullDatabaseUrlV1({
        host: parsed.hostname,
        port: Number(parsed.port || '5433'),
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, ''),
        sslrootcertPath: wrongCa,
      });
      const outcome = await assertPrismaConnectOutcomeV1(badUrl);
      expect(outcome.ok).toBe(false);
    });

    it('rejects hostname/SAN mismatch at Prisma connect', async () => {
      reloadTlsServerCert('server-bad-host');
      const parsed = new URL(tlsAdminUrl.replace(/^postgresql:/, 'postgres:'));
      const badHostUrl = buildPhaseAProductionVerifyFullDatabaseUrlV1({
        host: '127.0.0.1',
        port: Number(parsed.port || '5433'),
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, ''),
        sslrootcertPath: trustedCa,
      });
      const outcome = await assertPrismaConnectOutcomeV1(badHostUrl);
      expect(outcome.ok).toBe(false);
      reloadTlsServerCert('server-valid');
    });

    it('rejects missing CA file at Prisma connect', async () => {
      const parsed = new URL(tlsAdminUrl.replace(/^postgresql:/, 'postgres:'));
      const missingCaUrl = buildPhaseAProductionVerifyFullDatabaseUrlV1({
        host: parsed.hostname,
        port: Number(parsed.port || '5433'),
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, ''),
        sslrootcertPath: '/nonexistent/phase-a-ca.crt',
      });
      const outcome = await assertPrismaConnectOutcomeV1(missingCaUrl);
      expect(outcome.ok).toBe(false);
    });

    it('rejects non-TLS downgrade when verify-full URL targets plain PostgreSQL', async () => {
      const plain =
        process.env.DATABASE_URL ??
        'postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive?schema=public';
      const parsed = new URL(plain.replace(/^postgresql:/, 'postgres:'));
      const downgradeUrl = buildPhaseAProductionVerifyFullDatabaseUrlV1({
        host: parsed.hostname,
        port: Number(parsed.port || '5432'),
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, '').split('?')[0],
        sslrootcertPath: trustedCa,
      });
      const outcome = await assertPrismaConnectOutcomeV1(downgradeUrl);
      expect(outcome.ok).toBe(false);
    });

    it('rejects weak sslmodes at production admission (no connect)', () => {
      const parsed = new URL(tlsAdminUrl.replace(/^postgresql:/, 'postgres:'));
      const base = `postgresql://${parsed.username}:${parsed.password}@${parsed.hostname}:${parsed.port || '5433'}/${parsed.pathname.replace(/^\//, '')}`;
      for (const mode of ['disable', 'allow', 'prefer', 'require', 'verify-ca']) {
        const url = `${base}?sslmode=${mode}`;
        expect(validatePhaseAProductionTlsUrlPolicyV1(url).ok).toBe(false);
      }
    });

    it('rejects expired server certificate at Prisma connect', async () => {
      reloadTlsServerCert('server-expired');
      const outcome = await assertPrismaConnectOutcomeV1(tlsAdminUrl);
      expect(outcome.ok).toBe(false);
      reloadTlsServerCert('server-valid');
    });

    it('production runner blocks before connect when P1 authorization is NO_GO (TLS path not reached)', async () => {
      const { databaseUrl: auditUrl } = await provisionPhaseAProductionAuditFixtureUrlV1(tlsAdminUrl);
      const parsed = new URL(auditUrl.replace(/^postgresql:/, 'postgres:'));
      const login = parsePostgresUrlLoginV1(auditUrl)!;
      const verifyFullAuditUrl = buildPhaseAProductionVerifyFullDatabaseUrlV1({
        host: parsed.hostname,
        port: Number(parsed.port || '5433'),
        user: login,
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, ''),
        sslrootcertPath: trustedCa,
      });
      const consumptionDir = join(process.cwd(), `.phase-a-tls-prod-run-${Date.now()}`);
      provisionPhaseAProductionConsumptionStoreFixtureV1(consumptionDir);
      const env = buildPhaseAProductionP1IntegrationEnvV1({
        productionDatabaseUrl: verifyFullAuditUrl,
        migrationOwnerRoleIdentityReference: 'phase_a_tls_migration_owner_fixture',
        consumptionDir,
      });
      const prev: Record<string, string | undefined> = {};
      for (const k of Object.keys(env)) prev[k] = process.env[k];
      const prevHarness = process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV];
      Object.assign(process.env, env);
      delete process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV];

      try {
        const gate = evaluatePhaseAProductionP1ExecutionGateV1(verifyFullAuditUrl, env);
        expect(gate.ok).toBe(false);
        if (!gate.ok) {
          expect(gate.reasonCode).toBe(PHASE_A_P1_EXTERNAL_AUTHORIZATION_UNVERIFIED);
        }
        const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
          databaseUrl: verifyFullAuditUrl,
          roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
          admissionPolicy: 'PRODUCTION_AUTHORIZED_R4_2A',
        });
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) {
          expect(outcome.reasonCode).toBe(PHASE_A_P1_EXTERNAL_AUTHORIZATION_UNVERIFIED);
        }
      } finally {
        await teardownPhaseAProductionAuditFixtureV1(tlsAdminUrl);
        for (const k of Object.keys(env)) {
          if (prev[k] === undefined) delete process.env[k];
          else process.env[k] = prev[k];
        }
        if (prevHarness === undefined) {
          delete process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV];
        } else {
          process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV] = prevHarness;
        }
        rmSync(consumptionDir, { recursive: true, force: true });
      }
    });
  },
);
