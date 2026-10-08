import { M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV } from './m3-3-hv-h4-a3-3-o2-r3-issuer-runtime-factory.inert.v1';
import { DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.config.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_DATABASE_URL_ENV,
  M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV,
  M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.isolated-target.v1';
import { assertNoSecretsInReportPayloadV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.redaction.v1';
import {
  assertM3_3HvH4A3PhaseAPreflightReadOnlyRejectsMutationV1,
  runM3_3HvH4A3PhaseAPreflightV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.runner.v1';
import { M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_CONTRACT_V1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.types.v1';

describe('m3-3-hv-h4-a3-o2-r4-1 phase-a runner (unit)', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV] = '1';
    delete process.env.M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV;
    delete process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_DATABASE_URL_ENV];
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('blocks runner entry when isolated target is not approved', async () => {
    process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV] = '0';
    const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
      databaseUrl: 'postgresql://phase_a@127.0.0.1:5432/isolated_phase_a',
      roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe('BLOCKED');
      expect(outcome.reasonCode).toBe('PHASE_A_ISOLATED_TARGET_NOT_APPROVED');
    }
  });

  it('blocks runner reuse of DATABASE_URL at admission boundary', async () => {
    const appUrl = 'postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive?schema=public';
    process.env.DATABASE_URL = appUrl;
    const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
      databaseUrl: 'postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive?connection_limit=3',
      roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe('BLOCKED');
      expect(outcome.reasonCode).toBe('PHASE_A_CANNOT_REUSE_DATABASE_URL');
    }
  });

  it('blocks runner reuse of issuer database URL', async () => {
    const issuerUrl = 'postgresql://issuer@127.0.0.1:5432/issuer_db';
    process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV] = issuerUrl;
    const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
      databaseUrl: issuerUrl,
      roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reasonCode).toBe('PHASE_A_CANNOT_REUSE_ISSUER_DATABASE_URL');
    }
  });

  it('returns sanitized ERROR outcome on connection failure without throwing', async () => {
    const outcome = await runM3_3HvH4A3PhaseAPreflightV1({
      databaseUrl: 'postgresql://nobody@127.0.0.1:9/nonexistent_phase_a_db',
      roleNames: DEFAULT_M3_3_HV_H4_A3_PHASE_A_ROLE_NAMES_V1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe('ERROR');
      expect(outcome.reasonCode).toMatch(/^PHASE_A_/);
      expect(outcome.reasonCode).not.toContain('postgresql://');
    }
  });

  it('read-only probe fails closed on unreachable database', async () => {
    const probe = await assertM3_3HvH4A3PhaseAPreflightReadOnlyRejectsMutationV1(
      'postgresql://nobody@127.0.0.1:9/nonexistent_phase_a_db',
    );
    expect(probe.ok).toBe(false);
    expect(probe.enforced).toBe(false);
  });

  it('report redaction guard rejects embedded credentials', () => {
    expect(() =>
      assertNoSecretsInReportPayloadV1({
        leak: 'postgresql://secret:password@127.0.0.1:5432/db',
      }),
    ).toThrow('PHASE_A_REPORT_CREDENTIAL_LEAK');
  });

  it('contract version is stable for deterministic JSON consumers', () => {
    expect(M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_CONTRACT_V1).toBe('M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_V1');
  });
});
