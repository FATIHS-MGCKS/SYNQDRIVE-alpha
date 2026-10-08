/**
 * Approved Phase-A query manifest — runner executes only these statements (parameterized).
 * Must remain SELECT-only; validated at module load.
 */
import { assertM3_3HvH4A3PreflightSqlReadOnlyV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-production-role-preflight.spec-validator.v1';

export const M3_3_HV_H4_A3_PHASE_A_QUERY_MANIFEST_V1 = {
  SESSION_CONTEXT:
    'SELECT session_user::text AS session_user, current_user::text AS current_user',
  PGCRYPTO_STATUS:
    "SELECT extname::text AS extname, extversion::text AS extversion, pg_get_userbyid(e.extowner)::text AS extension_owner FROM pg_extension e WHERE extname = 'pgcrypto'",
  REGCLASS_PRISMA_MIGRATIONS:
    "SELECT to_regclass('public._prisma_migrations')::text AS regclass_name",
  REGCLASS_ATTESTATION_TABLE:
    "SELECT to_regclass('public.battery_hv_charge_session_evidence_integrity_attestations')::text AS regclass_name",
  REGCLASS_REVISION_TABLE:
    "SELECT to_regclass('public.battery_hv_charge_session_evidence_revisions')::text AS regclass_name",
  REGCLASS_ACK_TABLE:
    "SELECT to_regclass('public.battery_hv_charge_session_evidence_acks')::text AS regclass_name",
  ROLE_BY_NAME:
    'SELECT rolname::text, rolcanlogin, rolsuper, rolcreaterole FROM pg_roles WHERE rolname = $1',
  MIGRATION_HISTORY_ATTESTATION:
    "SELECT migration_name::text, (finished_at IS NOT NULL) AS applied FROM public._prisma_migrations WHERE migration_name LIKE '%battery_hv_h4_a3_integrity_attestation%' ORDER BY migration_name",
  TABLE_OWNER:
    "SELECT c.relname::text AS table_name, pg_get_userbyid(c.relowner)::text AS owner FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'r'",
  FUNCTION_OWNER_BY_REGPROC:
    'SELECT $1::text AS regproc_signature, pg_get_userbyid(p.proowner)::text AS owner FROM pg_proc p WHERE p.oid = to_regprocedure($1::text)',
  FUNCTION_EXISTS:
    'SELECT to_regprocedure($1::text) IS NOT NULL AS function_exists',
  HAS_TABLE_PRIVILEGE:
    'SELECT has_table_privilege($1::name, $2::regclass, $3::text) AS allowed',
  HAS_FUNCTION_PRIVILEGE:
    'SELECT has_function_privilege($1::name, $2::regprocedure, $3::text) AS allowed',
} as const;

export type M3_3HvH4A3PhaseAQueryManifestIdV1 = keyof typeof M3_3_HV_H4_A3_PHASE_A_QUERY_MANIFEST_V1;

for (const sql of Object.values(M3_3_HV_H4_A3_PHASE_A_QUERY_MANIFEST_V1)) {
  assertM3_3HvH4A3PreflightSqlReadOnlyV1(sql);
}

export function getApprovedPhaseAQuerySqlV1(id: M3_3HvH4A3PhaseAQueryManifestIdV1): string {
  return M3_3_HV_H4_A3_PHASE_A_QUERY_MANIFEST_V1[id];
}

const MULTI_STATEMENT_PATTERN = /;/;

export function assertSingleApprovedStatementV1(sql: string): void {
  const trimmed = sql.trim();
  const withoutTrailing = trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed;
  if (MULTI_STATEMENT_PATTERN.test(withoutTrailing)) {
    throw new Error('PHASE_A_QUERY_MULTI_STATEMENT_REJECTED');
  }
}
