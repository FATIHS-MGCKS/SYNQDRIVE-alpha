import { matchUiAuditReadRule, UI_AUDIT_READ_ALLOWLIST } from './ui-audit-read-allowlist';

describe('UI audit read allowlist', () => {
  it('is non-empty and uses unique ids', () => {
    const ids = UI_AUDIT_READ_ALLOWLIST.map((r) => r.id);
    expect(ids.length).toBeGreaterThan(5);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('allows only connectivity master aggregate read', () => {
    const rule = matchUiAuditReadRule(
      'GET',
      '/api/v1/admin/connectivity/platform-summary',
    );
    expect(rule?.scope).toBe('master');
    expect(
      matchUiAuditReadRule('GET', '/api/v1/admin/dashboard/operational'),
    ).toBeNull();
  });

  it('classifies rental org reads', () => {
    const rule = matchUiAuditReadRule(
      'GET',
      '/api/v1/organizations/org-1/bookings/123',
    );
    expect(rule?.scope).toBe('rental');
  });

  it('denies unclassified admin reads (fail-closed)', () => {
    expect(
      matchUiAuditReadRule('GET', '/api/v1/admin/users/search'),
    ).toBeNull();
  });

  it('denies blocked master organizations directory', () => {
    expect(
      matchUiAuditReadRule('GET', '/api/v1/admin/organizations'),
    ).toBeNull();
  });
});