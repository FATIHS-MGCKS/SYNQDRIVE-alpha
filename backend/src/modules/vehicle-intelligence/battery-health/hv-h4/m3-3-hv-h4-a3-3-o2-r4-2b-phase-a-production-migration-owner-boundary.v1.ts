import {
  canonicalPostgresTargetKeyV1,
  parsePostgresUrlLoginV1,
} from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';

/** Reference URL for migration-owner credentials (secret); used for fail-closed isolation checks only. */
export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_DATABASE_URL_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_DATABASE_URL' as const;

function urlsRepresentSameTargetV1(a: string, b: string): boolean {
  if (a === b) return true;
  const keyA = canonicalPostgresTargetKeyV1(a);
  const keyB = canonicalPostgresTargetKeyV1(b);
  return Boolean(keyA && keyB && keyA === keyB);
}

/**
 * Fail-closed: production Phase-A audit URL must not match migration-owner reference URL or login.
 * Does not prove live production provisioning — configuration isolation only.
 */
export function validatePhaseAProductionMigrationOwnerCredentialIsolationV1(
  auditDatabaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; reasonCode: string } {
  const migrationUrl = env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_MIGRATION_OWNER_DATABASE_URL_ENV]?.trim();
  if (!migrationUrl) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_MIGRATION_OWNER_REFERENCE_REQUIRED' };
  }

  if (urlsRepresentSameTargetV1(auditDatabaseUrl, migrationUrl)) {
    return { ok: false, reasonCode: 'PHASE_A_CANNOT_REUSE_MIGRATION_OWNER_DATABASE_URL' };
  }

  const auditLogin = parsePostgresUrlLoginV1(auditDatabaseUrl);
  const migrationLogin = parsePostgresUrlLoginV1(migrationUrl);
  if (auditLogin && migrationLogin && auditLogin === migrationLogin) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_AUDIT_LOGIN_MATCHES_MIGRATION_OWNER' };
  }

  return { ok: true };
}
