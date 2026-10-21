import { parsePostgresUrlLoginV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';

/**
 * Non-secret PostgreSQL role identity for migration-owner separation declarations.
 * Declarative only — does not prove live production credential isolation.
 */
export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_ROLE_IDENTITY_REFERENCE_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_ROLE_IDENTITY_REFERENCE' as const;

/**
 * @deprecated Must not be supplied to audit execution processes — credential material forbidden.
 */
export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_DATABASE_URL_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_DATABASE_URL' as const;

export const PHASE_A_MIGRATION_OWNER_CREDENTIAL_MATERIAL_FORBIDDEN_IN_AUDIT_CONTEXT =
  'PHASE_A_MIGRATION_OWNER_CREDENTIAL_MATERIAL_FORBIDDEN_IN_AUDIT_CONTEXT' as const;

function isPostgresCredentialMaterialV1(value: string): boolean {
  const trimmed = value.trim();
  if (/^postgres(ql)?:\/\//i.test(trimmed)) return true;
  if (trimmed.includes('@') && trimmed.includes(':')) return true;
  return false;
}

function assertSafeRoleIdentityReferenceV1(reference: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(reference);
}

/**
 * Fail-closed: audit execution must not receive migration-owner URLs or passwords.
 */
export function rejectPhaseAProductionMigrationOwnerCredentialMaterialInAuditEnvV1(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; reasonCode: string } {
  const legacyUrl = env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_DATABASE_URL_ENV]?.trim();
  if (legacyUrl) {
    return { ok: false, reasonCode: PHASE_A_MIGRATION_OWNER_CREDENTIAL_MATERIAL_FORBIDDEN_IN_AUDIT_CONTEXT };
  }

  const reference =
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_ROLE_IDENTITY_REFERENCE_ENV]?.trim();
  if (reference && isPostgresCredentialMaterialV1(reference)) {
    return { ok: false, reasonCode: PHASE_A_MIGRATION_OWNER_CREDENTIAL_MATERIAL_FORBIDDEN_IN_AUDIT_CONTEXT };
  }

  return { ok: true };
}

/**
 * Declarative boundary: audit login must differ from documented migration-owner role identity.
 * Configuration consistency only — not proof of production credential separation.
 */
export function validatePhaseAProductionMigrationOwnerDeclarativeBoundaryV1(
  auditDatabaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; reasonCode: string } {
  const credentialReject = rejectPhaseAProductionMigrationOwnerCredentialMaterialInAuditEnvV1(env);
  if (!credentialReject.ok) {
    return credentialReject;
  }

  const reference =
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_ROLE_IDENTITY_REFERENCE_ENV]?.trim();
  if (!reference) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_MIGRATION_OWNER_ROLE_IDENTITY_REFERENCE_REQUIRED' };
  }

  if (!assertSafeRoleIdentityReferenceV1(reference)) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_MIGRATION_OWNER_ROLE_IDENTITY_REFERENCE_INVALID' };
  }

  const auditLogin = parsePostgresUrlLoginV1(auditDatabaseUrl);
  if (auditLogin && auditLogin === reference) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_AUDIT_LOGIN_MATCHES_MIGRATION_OWNER' };
  }

  return { ok: true };
}

/** @deprecated Use validatePhaseAProductionMigrationOwnerDeclarativeBoundaryV1 */
export function validatePhaseAProductionMigrationOwnerCredentialIsolationV1(
  auditDatabaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; reasonCode: string } {
  return validatePhaseAProductionMigrationOwnerDeclarativeBoundaryV1(auditDatabaseUrl, env);
}
