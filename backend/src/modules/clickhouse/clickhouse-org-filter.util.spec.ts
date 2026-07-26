import {
  buildOrgIdSqlPredicate,
  orgIdQueryParams,
} from './clickhouse-org-filter.util';

describe('clickhouse-org-filter.util', () => {
  it('returns empty predicate when orgId missing', () => {
    expect(buildOrgIdSqlPredicate('org_id', undefined)).toBe('');
    expect(orgIdQueryParams(undefined)).toEqual({});
  });

  it('scopes queries to org_id with legacy empty fallback', () => {
    expect(buildOrgIdSqlPredicate('org_id', 'org-1')).toBe(
      " AND (org_id = {orgId: String} OR org_id = '')",
    );
    expect(orgIdQueryParams('org-1')).toEqual({ orgId: 'org-1' });
  });
});
