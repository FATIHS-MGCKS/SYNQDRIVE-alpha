import {
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_DATABASE_URL_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_ROLE_IDENTITY_REFERENCE_ENV,
  PHASE_A_MIGRATION_OWNER_CREDENTIAL_MATERIAL_FORBIDDEN_IN_AUDIT_CONTEXT,
  rejectPhaseAProductionMigrationOwnerCredentialMaterialInAuditEnvV1,
  validatePhaseAProductionMigrationOwnerDeclarativeBoundaryV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-migration-owner-boundary.v1';

const AUDIT_URL =
  'postgresql://audit_ro@prod-db.example.com:5432/synqdrive?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca.pem';

describe('migration-owner declarative boundary (no credential material in audit env)', () => {
  it('rejects legacy migration-owner database URL env var', () => {
    const env = {
      [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_DATABASE_URL_ENV]:
        'postgresql://migration_owner:topsecret@prod-db.example.com:5432/synqdrive',
      [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_ROLE_IDENTITY_REFERENCE_ENV]: 'migration_owner',
    };
    const reject = rejectPhaseAProductionMigrationOwnerCredentialMaterialInAuditEnvV1(env);
    expect(reject.ok).toBe(false);
    if (!reject.ok) {
      expect(reject.reasonCode).toBe(PHASE_A_MIGRATION_OWNER_CREDENTIAL_MATERIAL_FORBIDDEN_IN_AUDIT_CONTEXT);
      expect(reject.reasonCode).not.toMatch(/topsecret/);
    }
  });

  it('rejects postgres URL supplied as role identity reference', () => {
    const env = {
      [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_ROLE_IDENTITY_REFERENCE_ENV]:
        'postgresql://migration_owner@host/db',
    };
    const boundary = validatePhaseAProductionMigrationOwnerDeclarativeBoundaryV1(AUDIT_URL, env);
    expect(boundary.ok).toBe(false);
    if (!boundary.ok) {
      expect(boundary.reasonCode).toBe(PHASE_A_MIGRATION_OWNER_CREDENTIAL_MATERIAL_FORBIDDEN_IN_AUDIT_CONTEXT);
    }
  });

  it('requires non-secret role identity reference', () => {
    const boundary = validatePhaseAProductionMigrationOwnerDeclarativeBoundaryV1(AUDIT_URL, {});
    expect(boundary.ok).toBe(false);
    if (!boundary.ok) {
      expect(boundary.reasonCode).toBe('PHASE_A_PRODUCTION_MIGRATION_OWNER_ROLE_IDENTITY_REFERENCE_REQUIRED');
    }
  });

  it('blocks audit login matching migration owner role identity', () => {
    const env = {
      [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_ROLE_IDENTITY_REFERENCE_ENV]: 'audit_ro',
    };
    const boundary = validatePhaseAProductionMigrationOwnerDeclarativeBoundaryV1(AUDIT_URL, env);
    expect(boundary.ok).toBe(false);
    if (!boundary.ok) {
      expect(boundary.reasonCode).toBe('PHASE_A_PRODUCTION_AUDIT_LOGIN_MATCHES_MIGRATION_OWNER');
    }
  });

  it('accepts declarative role reference distinct from audit login', () => {
    const env = {
      [M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_ROLE_IDENTITY_REFERENCE_ENV]: 'migration_owner',
    };
    expect(validatePhaseAProductionMigrationOwnerDeclarativeBoundaryV1(AUDIT_URL, env).ok).toBe(true);
  });
});
