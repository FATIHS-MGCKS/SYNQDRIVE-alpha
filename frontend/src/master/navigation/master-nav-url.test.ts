import { describe, expect, it } from 'vitest';
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

  it('redirects settings monitoring tab to platform-health', () => {
    const loc = normalizeMasterNavLocation('?view=settings&settingsTab=monitoring');
    expect(loc.view).toBe('platform-health');
  });

  it('builds canonical view search string', () => {
    const qs = buildMasterNavSearch({ view: 'organizations', orgId: 'org-1' }, false);
    expect(qs).toContain('view=organizations');
    expect(qs).toContain('orgId=org-1');
  });
});
