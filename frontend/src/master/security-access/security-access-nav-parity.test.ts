import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  appendSecurityAccessNavParamsFromSearch,
  migrateSecurityAccessParams,
  stripSecurityAccessNavParams,
} from './security-access-url';
import { buildMasterNavSearch, normalizeMasterNavLocation } from '../navigation/master-nav-url';

describe('Security Access navigation URL parity (USR-P1B nav fix)', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.stubGlobal('window', {
      location: { search: '', pathname: '/master' },
    });
  });

  afterEach(() => {
    if (originalWindow) {
      vi.stubGlobal('window', originalWindow);
    } else {
          // @ts-expect-error test cleanup
          delete globalThis.window;
    }
  });

  function withSearch(search: string, fn: () => void) {
    vi.stubGlobal('window', {
      location: { search: search.startsWith('?') ? search : `?${search}`, pathname: '/master' },
    });
    fn();
  }

  it('preserves users section and userId through buildMasterNavSearch normalization', () => {
    withSearch('?view=security-access&securityAccess=users&userId=user-deep-1', () => {
      const qs = buildMasterNavSearch({ view: 'security-access' }, true);
      expect(qs).toContain('view=security-access');
      expect(qs).toContain('securityAccess=users');
      expect(qs).toContain('userId=user-deep-1');
    });
  });

  it('preserves role and audit deep links', () => {
    withSearch(
      '?view=security-access&securityAccess=roles&roleId=role-1&roleScope=platform&auditId=aud-1',
      () => {
        const qs = buildMasterNavSearch({ view: 'security-access' }, true);
        expect(qs).toContain('securityAccess=roles');
        expect(qs).toContain('roleId=role-1');
        expect(qs).toContain('roleScope=platform');
      },
    );
    withSearch('?view=security-access&securityAccess=audit&auditId=aud-99', () => {
      const qs = buildMasterNavSearch({ view: 'security-access' }, true);
      expect(qs).toContain('securityAccess=audit');
      expect(qs).toContain('auditId=aud-99');
    });
  });

  it('preserves organization filter and own-security tab', () => {
    withSearch(
      '?view=security-access&securityAccess=users&organizationId=org-filter-1',
      () => {
        const qs = buildMasterNavSearch({ view: 'security-access' }, true);
        expect(qs).toContain('organizationId=org-filter-1');
      },
    );
    withSearch('?view=security-access&securityAccess=own-security&ownSecurityTab=sessions', () => {
      const qs = buildMasterNavSearch({ view: 'security-access' }, true);
      expect(qs).toContain('securityAccess=own-security');
      expect(qs).toContain('ownSecurityTab=sessions');
    });
  });

  it('legacy view=users migration survives master nav search rebuild', () => {
    const migrated = migrateSecurityAccessParams('?view=users&userId=legacy-u');
    withSearch(migrated, () => {
      const qs = buildMasterNavSearch(normalizeMasterNavLocation(migrated), true);
      expect(qs).toContain('view=security-access');
      expect(qs).toContain('securityAccess=users');
      expect(qs).toContain('userId=legacy-u');
    });
  });

  it('legacy view=activity-log migration survives master nav search rebuild', () => {
    const migrated = migrateSecurityAccessParams('?view=activity-log&auditId=legacy-a');
    withSearch(migrated, () => {
      const qs = buildMasterNavSearch(normalizeMasterNavLocation(migrated), true);
      expect(qs).toContain('securityAccess=audit');
      expect(qs).toContain('auditId=legacy-a');
    });
  });

  it('strips security-access params when leaving the hub', () => {
    withSearch('?view=security-access&securityAccess=users&userId=u-1', () => {
      const qs = buildMasterNavSearch({ view: 'dashboard' }, true);
      expect(qs).toContain('view=dashboard');
      expect(qs).not.toContain('securityAccess=');
      expect(qs).not.toContain('userId=');
    });
  });

  it('does not change unrelated master navigation query keys', () => {
    withSearch('?view=security-access&securityAccess=users', () => {
      const qs = buildMasterNavSearch({ view: 'organizations', orgId: 'org-77' }, false);
      expect(qs).toContain('view=organizations');
      expect(qs).toContain('orgId=org-77');
      expect(qs).not.toContain('securityAccess=');
    });
    const hmQs = buildMasterNavSearch({ view: 'high-mobility', hmTab: 'eligibility' }, false);
    expect(hmQs).toContain('hmTab=eligibility');
    expect(hmQs).not.toContain('securityAccess=');
  });

  it('appendSecurityAccessNavParamsFromSearch omits ownSecurityTab outside own-security', () => {
    const params = new URLSearchParams();
    appendSecurityAccessNavParamsFromSearch(
      params,
      '?view=security-access&securityAccess=users&ownSecurityTab=sessions',
    );
    expect(params.get('securityAccess')).toBe('users');
    expect(params.get('ownSecurityTab')).toBeNull();
  });

  it('stripSecurityAccessNavParams clears scoped keys only', () => {
    const params = new URLSearchParams(
      'view=dashboard&securityAccess=users&userId=x&masterBilling=1',
    );
    stripSecurityAccessNavParams(params);
    expect(params.get('view')).toBe('dashboard');
    expect(params.get('masterBilling')).toBe('1');
    expect(params.get('securityAccess')).toBeNull();
    expect(params.get('userId')).toBeNull();
  });
});