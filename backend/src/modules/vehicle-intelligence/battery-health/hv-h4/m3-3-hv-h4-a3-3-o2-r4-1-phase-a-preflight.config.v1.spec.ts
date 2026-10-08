import {
  M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_DATABASE_URL_ENV,
  M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ENABLED_ENV,
  M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV,
  parseM3_3HvH4A3PhaseAPreflightConfigFromEnvV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.config.v1';
import { M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV } from './m3-3-hv-h4-a3-3-o2-r3-issuer-runtime-factory.inert.v1';

describe('m3-3-hv-h4-a3-o2-r4-1 phase-a preflight config', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  function enableIsolatedPhaseA(url: string): void {
    process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ENABLED_ENV] = '1';
    process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_DATABASE_URL_ENV] = url;
    process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV] = '1';
  }

  it('blocks when disabled', () => {
    delete process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ENABLED_ENV];
    expect(parseM3_3HvH4A3PhaseAPreflightConfigFromEnvV1(process.env).ok).toBe(false);
  });

  it('rejects implicit DATABASE_URL reuse', () => {
    const url = 'postgresql://phase_a@127.0.0.1:5432/isolated?schema=public';
    enableIsolatedPhaseA(url);
    process.env.DATABASE_URL = url;
    const parsed = parseM3_3HvH4A3PhaseAPreflightConfigFromEnvV1(process.env);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reasonCode).toBe('PHASE_A_CANNOT_REUSE_DATABASE_URL');
    }
  });

  it('rejects issuer database URL reuse', () => {
    const url = 'postgresql://issuer@127.0.0.1:5432/isolated?schema=public';
    enableIsolatedPhaseA(url);
    process.env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV] = url;
    delete process.env.DATABASE_URL;
    const parsed = parseM3_3HvH4A3PhaseAPreflightConfigFromEnvV1(process.env);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reasonCode).toBe('PHASE_A_CANNOT_REUSE_ISSUER_DATABASE_URL');
    }
  });

  it('rejects non-isolated remote targets', () => {
    enableIsolatedPhaseA('postgresql://audit@db.app.synqdrive.eu:5432/synqdrive');
    delete process.env.DATABASE_URL;
    const parsed = parseM3_3HvH4A3PhaseAPreflightConfigFromEnvV1(process.env);
    expect(parsed.ok).toBe(false);
  });

  it('accepts approved loopback isolated target', () => {
    enableIsolatedPhaseA('postgresql://phase_a@127.0.0.1:5432/isolated_phase_a');
    delete process.env.DATABASE_URL;
    const parsed = parseM3_3HvH4A3PhaseAPreflightConfigFromEnvV1(process.env);
    expect(parsed.ok).toBe(true);
  });
});
