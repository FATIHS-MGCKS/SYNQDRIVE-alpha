import {
  M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV,
  validateIsolatedPhaseADatabaseTargetV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.isolated-target.v1';

describe('m3-3-hv-h4-a3-o2-r4-1 isolated target policy', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('requires explicit isolated approval', () => {
    process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV] = '0';
    const result = validateIsolatedPhaseADatabaseTargetV1(
      'postgresql://phase_a@127.0.0.1:5432/isolated_phase_a',
      process.env,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('PHASE_A_ISOLATED_TARGET_NOT_APPROVED');
    }
  });

  it('allows loopback with approval', () => {
    process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV] = '1';
    const result = validateIsolatedPhaseADatabaseTargetV1(
      'postgresql://phase_a@127.0.0.1:5432/isolated_phase_a',
      process.env,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects remote hosts without allowlist bypass', () => {
    process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV] = '1';
    process.env.M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_HOST_ALLOWLIST = 'db.internal';
    const result = validateIsolatedPhaseADatabaseTargetV1(
      'postgresql://audit@db.internal:5432/synqdrive',
      process.env,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('PHASE_A_ISOLATED_TARGET_LOOPBACK_REQUIRED');
    }
  });

  it('rejects production-like loopback alias hostnames that are not loopback', () => {
    process.env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ISOLATED_TARGET_APPROVED_ENV] = '1';
    const result = validateIsolatedPhaseADatabaseTargetV1(
      'postgresql://audit@db.app.synqdrive.eu:5432/synqdrive',
      process.env,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('PHASE_A_ISOLATED_TARGET_LOOPBACK_REQUIRED');
    }
  });
});
