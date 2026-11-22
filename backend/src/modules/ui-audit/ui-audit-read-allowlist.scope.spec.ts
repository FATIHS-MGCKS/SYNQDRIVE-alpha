import { userSatisfiesUiAuditReadRules, findAllUiAuditReadRules } from './ui-audit-read-allowlist';

describe('UI audit read allowlist — product scope overlap', () => {
  const rentalOnly = { platformPermissions: ['ui-audit-rental'] };
  const operatorOnly = { platformPermissions: ['ui-audit-operator'] };
  const both = { platformPermissions: ['ui-audit-rental', 'ui-audit-operator'] };
  const neither = { platformPermissions: [] as string[] };

  it('bookings/today matches rental and operator rules', () => {
    const rules = findAllUiAuditReadRules(
      'GET',
      '/api/v1/organizations/org-a/bookings/today/pickups',
    );
    expect(rules.map((r) => r.scope).sort()).toEqual(['operator', 'rental']);
  });

  it('allows rental OR operator grant on overlapping today path', () => {
    const path = '/api/v1/organizations/org-a/bookings/today/pickups';
    const rules = findAllUiAuditReadRules('GET', path);
    expect(userSatisfiesUiAuditReadRules(rentalOnly, rules)).toBe(true);
    expect(userSatisfiesUiAuditReadRules(operatorOnly, rules)).toBe(true);
    expect(userSatisfiesUiAuditReadRules(both, rules)).toBe(true);
    expect(userSatisfiesUiAuditReadRules(neither, rules)).toBe(false);
  });

  it('denies operator-only grant on rental dashboard', () => {
    const rules = findAllUiAuditReadRules('GET', '/api/v1/organizations/org-a/dashboard');
    expect(userSatisfiesUiAuditReadRules(operatorOnly, rules)).toBe(false);
    expect(userSatisfiesUiAuditReadRules(rentalOnly, rules)).toBe(true);
  });
});