// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearAuth,
  getRefreshToken,
  getToken,
  setAuth,
  type AuthUser,
} from './auth';

const sampleUser: AuthUser = {
  id: 'u1',
  email: 'u@example.test',
  name: 'User',
  platformRole: 'USER',
  membershipRole: 'WORKER',
  organizationId: 'org-1',
  organizationName: 'Org',
  permissions: null,
};

describe('auth session storage behavior (USR-P2 GATE-5)', () => {
  afterEach(() => {
    clearAuth();
  });

  it('failed refresh safe logout clears tokens', () => {
    setAuth('access', sampleUser, 'refresh');
    clearAuth();
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('legacy storage upgrade preserves refresh after setAuth', () => {
    localStorage.setItem('synqdrive_token', 'legacy-access');
    localStorage.setItem('synqdrive_user', JSON.stringify(sampleUser));
    setAuth('bound-access', sampleUser, 'new-refresh');
    expect(getToken()).toBe('bound-access');
    expect(getRefreshToken()).toBe('new-refresh');
  });

  it('organization switch patch updates stored org context', () => {
    setAuth('access', sampleUser, 'refresh');
    const patched = {
      ...sampleUser,
      organizationId: 'org-2',
      organizationName: 'Other Org',
    };
    setAuth('access', patched, 'refresh');
    const raw = localStorage.getItem('synqdrive_user');
    expect(raw).toContain('org-2');
  });
});