import {
  parsePhaseAProductionTargetSpecFromEnvV1,
  validatePhaseAProductionDatabaseUrlAgainstTargetSpecV1,
  validatePhaseAProductionTlsUrlPolicyV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-target.v1';
import { M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.types.v1';
import { M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON_ENV } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.v1';

const spec = {
  contractVersion: M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_CONTRACT_V1,
  hostname: '127.0.0.1',
  port: 5432,
  database: 'synqdrive_test',
  expectedAuditLogin: 'audit_ro',
  forbidSuperuserSession: true,
};

const verifyFullUrl =
  'postgresql://audit_ro@127.0.0.1:5432/synqdrive_test?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca.pem';

describe('validatePhaseAProductionTlsUrlPolicyV1', () => {
  it('requires verify-full and sslrootcert', () => {
    expect(validatePhaseAProductionTlsUrlPolicyV1(verifyFullUrl).ok).toBe(true);
    expect(
      validatePhaseAProductionTlsUrlPolicyV1('postgresql://u@127.0.0.1:5432/db').ok,
    ).toBe(false);
    expect(
      validatePhaseAProductionTlsUrlPolicyV1('postgresql://u@127.0.0.1:5432/db?sslmode=disable').ok,
    ).toBe(false);
    expect(
      validatePhaseAProductionTlsUrlPolicyV1('postgresql://u@127.0.0.1:5432/db?sslmode=require').ok,
    ).toBe(false);
    expect(
      validatePhaseAProductionTlsUrlPolicyV1('postgresql://u@127.0.0.1:5432/db?sslmode=verify-ca').ok,
    ).toBe(false);
    expect(
      validatePhaseAProductionTlsUrlPolicyV1(
        'postgresql://u@127.0.0.1:5432/db?sslmode=verify-full',
      ).ok,
    ).toBe(false);
  });
});

describe('parsePhaseAProductionTargetSpecFromEnvV1', () => {
  it('rejects forbidSuperuserSession not true', () => {
    const env = {
      [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON_ENV]: JSON.stringify({
        ...spec,
        forbidSuperuserSession: false,
      }),
    };
    expect(parsePhaseAProductionTargetSpecFromEnvV1(env).ok).toBe(false);
  });
});

describe('validatePhaseAProductionDatabaseUrlAgainstTargetSpecV1', () => {
  it('rejects wrong audit login', () => {
    const result = validatePhaseAProductionDatabaseUrlAgainstTargetSpecV1(
      'postgresql://wrong@127.0.0.1:5432/synqdrive_test?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca.pem',
      spec,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_PRODUCTION_AUDIT_LOGIN_MISMATCH');
  });
});
