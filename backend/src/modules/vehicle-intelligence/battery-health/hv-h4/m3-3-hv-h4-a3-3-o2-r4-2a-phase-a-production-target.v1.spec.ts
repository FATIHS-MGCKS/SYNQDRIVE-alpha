import {
  validatePhaseAProductionDatabaseUrlAgainstTargetSpecV1,
  validatePhaseAProductionTlsPolicyV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-target.v1';
import { M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.types.v1';

const spec = {
  contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1,
  hostname: '127.0.0.1',
  port: 5432,
  database: 'synqdrive_test',
  expectedAuditLogin: 'audit_ro',
  requireTlsIdentityVerification: true,
  forbidSuperuserSession: true,
};

describe('validatePhaseAProductionTlsPolicyV1', () => {
  it('rejects missing or insecure sslmode when verification required', () => {
    expect(
      validatePhaseAProductionTlsPolicyV1('postgresql://u@127.0.0.1:5432/db', spec).ok,
    ).toBe(false);
    expect(
      validatePhaseAProductionTlsPolicyV1('postgresql://u@127.0.0.1:5432/db?sslmode=disable', spec).ok,
    ).toBe(false);
    expect(
      validatePhaseAProductionTlsPolicyV1('postgresql://u@127.0.0.1:5432/db?sslmode=require', spec).ok,
    ).toBe(false);
  });

  it('accepts verify-full', () => {
    expect(
      validatePhaseAProductionTlsPolicyV1(
        'postgresql://u@127.0.0.1:5432/db?sslmode=verify-full',
        spec,
      ).ok,
    ).toBe(true);
  });
});

describe('validatePhaseAProductionDatabaseUrlAgainstTargetSpecV1', () => {
  it('rejects wrong audit login', () => {
    const result = validatePhaseAProductionDatabaseUrlAgainstTargetSpecV1(
      'postgresql://wrong@127.0.0.1:5432/synqdrive_test',
      { ...spec, requireTlsIdentityVerification: false },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_PRODUCTION_AUDIT_LOGIN_MISMATCH');
  });
});
