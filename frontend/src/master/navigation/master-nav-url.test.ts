import { describe, expect, it, vi } from 'vitest';
import { normalizeMasterNavLocation, buildMasterNavSearch, readViewParam } from './master-nav-url';

describe('master-nav-url', () => {
  it('reads view or legacy masterView param', () => {
    expect(readViewParam('?view=dashboard')).toBe('dashboard');
    expect(readViewParam('?masterView=support')).toBe('support');
  });

  it('redirects legacy hm-compatibility to high-mobility eligibility tab', () => {
    const loc = normalizeMasterNavLocation('?view=hm-compatibility');
    expect(loc.view).toBe('high-mobility');
    expect(loc.hmTab).toBe('eligibility');
  });

  it('redirects health-tracking to architektur health category', () => {
    const loc = normalizeMasterNavLocation('?view=health-tracking');
    expect(loc.view).toBe('architektur');
    expect(loc.archCategory).toBe('health');
  });

  it('redirects settings monitoring tab to platform-ops', () => {
    const loc = normalizeMasterNavLocation('?view=settings&settingsTab=monitoring');
    expect(loc.view).toBe('platform-ops');
  });

  it('redirects legacy platform-health to platform-ops', () => {
    const loc = normalizeMasterNavLocation('?view=platform-health');
    expect(loc.view).toBe('platform-ops');
  });

  it('builds canonical view search string', () => {
    const qs = buildMasterNavSearch({ view: 'organizations', orgId: 'org-1' }, false);
    expect(qs).toContain('view=organizations');
    expect(qs).toContain('orgId=org-1');
  });

  it('includes orgTab in a single organizations navigation query', () => {
    const qs = buildMasterNavSearch(
      { view: 'organizations', orgId: 'org-99', orgTab: 'products' },
      false,
    );
    expect(qs).toContain('view=organizations');
    expect(qs).toContain('orgId=org-99');
    expect(qs).toContain('orgTab=products');
  });

  it('clears orgTab when leaving organizations view', () => {
    const qs = buildMasterNavSearch({ view: 'product-management' }, false);
    expect(qs).toContain('view=product-management');
    expect(qs).not.toContain('orgTab=');
  });

  it('preserves securityAccess deep link when window search is set', () => {
    vi.stubGlobal('window', {
      location: {
        search: '?view=security-access&securityAccess=users&userId=nav-test-user',
        pathname: '/master',
      },
    });
    const qs = buildMasterNavSearch({ view: 'security-access' }, true);
    expect(qs).toContain('securityAccess=users');
    expect(qs).toContain('userId=nav-test-user');
    vi.unstubAllGlobals();
  });
});
