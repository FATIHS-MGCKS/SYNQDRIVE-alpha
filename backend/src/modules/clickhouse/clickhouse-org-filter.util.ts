/**
 * Tenant isolation predicate for legacy mirror tables with additive org_id (migration 007).
 *
 * During backfill transition, rows may still have org_id = ''. The OR branch keeps
 * those rows visible for the owning org until backfill completes.
 */
export function buildOrgIdSqlPredicate(
  columnRef: string,
  orgId: string | null | undefined,
): string {
  if (!orgId) {
    return '';
  }
  return ` AND (${columnRef} = {orgId: String} OR ${columnRef} = '')`;
}

export function orgIdQueryParams(
  orgId: string | null | undefined,
): { orgId: string } | Record<string, never> {
  if (!orgId) {
    return {};
  }
  return { orgId };
}
