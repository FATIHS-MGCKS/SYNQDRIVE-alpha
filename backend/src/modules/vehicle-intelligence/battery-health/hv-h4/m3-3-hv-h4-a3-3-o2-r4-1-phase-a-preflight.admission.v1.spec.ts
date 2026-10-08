import { M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV } from './m3-3-hv-h4-a3-3-o2-r3-issuer-runtime-factory.inert.v1';
import { evaluatePhaseAPreflightDatabaseAdmissionV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.admission.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_DATABASE_URL_ENV,
  M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV,
  M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.isolated-target.v1';

describe('m3-3-hv-h4-a3-o2-r4-1 phase-a admission boundary', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  function approveIsolated(): void {
    process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV] = '1';
  }

  it('blocks direct runner reuse of DATABASE_URL canonical target', () => {
    approveIsolated();
    const appUrl = 'postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive?schema=public';
    const aliasUrl = 'postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive?connection_limit=9';
    process.env.DATABASE_URL = appUrl;
    const result = evaluatePhaseAPreflightDatabaseAdmissionV1(aliasUrl, process.env);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('PHASE_A_CANNOT_REUSE_DATABASE_URL');
    }
  });

  it('blocks issuer database URL reuse', () => {
    approveIsolated();
    const issuerUrl = 'postgresql://issuer@127.0.0.1:5432/issuer_db';
    process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV] = issuerUrl;
    const result = evaluatePhaseAPreflightDatabaseAdmissionV1(issuerUrl, process.env);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('PHASE_A_CANNOT_REUSE_ISSUER_DATABASE_URL');
    }
  });

  it('allows integration harness URL match only when harness env is active', () => {
    approveIsolated();
    const integrationUrl = 'postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive?schema=public';
    process.env.DATABASE_URL = integrationUrl;
    process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_DATABASE_URL_ENV] = integrationUrl;

    expect(evaluatePhaseAPreflightDatabaseAdmissionV1(integrationUrl, process.env).ok).toBe(false);

    process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV] = '1';
    expect(evaluatePhaseAPreflightDatabaseAdmissionV1(integrationUrl, process.env).ok).toBe(true);
  });
});
