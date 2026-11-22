// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearAuth,
  hasUiAuditMasterShellAccess,
  resolveUiAuditProductLandingPath,
  setAuth,
} from './auth';

describe('UI audit shell routing', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAuth();
  });

  it('permits master shell for ui-audit-master without MASTER_ADMIN role', () => {
    setAuth('token', {
      id: 'u1',
      email: 'audit@example.com',
      name: 'Audit',
      platformRole: 'USER',
      platformPermissions: ['ui-audit-master'],
      membershipRole: null,
      organizationId: null,
      organizationName: null,
      permissions: null,
    });
    expect(hasUiAuditMasterShellAccess()).toBe(true);
    expect(resolveUiAuditProductLandingPath()).toBe('/master');
  });

  it('routes operator audit grant to operator shell', () => {
    setAuth('token', {
      id: 'u2',
      email: 'op@example.com',
      name: 'Op Audit',
      platformRole: 'USER',
      platformPermissions: ['ui-audit-operator'],
      membershipRole: 'WORKER',
      organizationId: 'org-1',
      organizationName: 'Org',
      permissions: null,
    });
    expect(resolveUiAuditProductLandingPath()).toBe('/operator');
  });
});