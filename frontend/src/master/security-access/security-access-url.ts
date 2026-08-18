import type { OwnSecurityTab, RoleScope, SecurityAccessSection } from './types';

export interface SecurityAccessLocation {
  section: SecurityAccessSection;
  ownSecurityTab: OwnSecurityTab;
  userId: string | null;
  roleId: string | null;
  roleScope: RoleScope | null;
  orgId: string | null;
  auditId: string | null;
  eventId: string | null;
  organizationId: string | null;
}

const DEFAULT: SecurityAccessLocation = {
  section: 'overview',
  ownSecurityTab: 'mfa',
  userId: null,
  roleId: null,
  roleScope: null,
  orgId: null,
  auditId: null,
  eventId: null,
  organizationId: null,
};

const VALID_SECTIONS: SecurityAccessSection[] = [
  'overview',
  'users',
  'master-admins',
  'roles',
  'audit',
  'security-events',
  'own-security',
];

const VALID_OWN_TABS: OwnSecurityTab[] = ['mfa', 'sessions', 'recovery'];

export function readSecurityAccessLocation(search: string): SecurityAccessLocation {
  const p = new URLSearchParams(search);
  const section = (p.get('securityAccess') as SecurityAccessSection) ?? DEFAULT.section;
  const ownSecurityTab = (p.get('ownSecurityTab') as OwnSecurityTab) ?? DEFAULT.ownSecurityTab;
  const roleScopeRaw = p.get('roleScope');

  return {
    section: VALID_SECTIONS.includes(section) ? section : 'overview',
    ownSecurityTab: VALID_OWN_TABS.includes(ownSecurityTab) ? ownSecurityTab : 'mfa',
    userId: p.get('userId'),
    roleId: p.get('roleId'),
    roleScope: roleScopeRaw === 'platform' || roleScopeRaw === 'organization' ? roleScopeRaw : null,
    orgId: p.get('orgId'),
    auditId: p.get('auditId'),
    eventId: p.get('eventId'),
    organizationId: p.get('organizationId'),
  };
}

export function syncSecurityAccessUrl(
  loc: Partial<SecurityAccessLocation>,
  opts?: { replace?: boolean },
) {
  if (typeof window === 'undefined') return;
  const current = readSecurityAccessLocation(window.location.search);
  const next: SecurityAccessLocation = { ...current, ...loc };
  const params = new URLSearchParams(window.location.search);

  params.set('view', 'security-access');
  params.set('securityAccess', next.section);

  if (next.section === 'own-security') {
    params.set('ownSecurityTab', next.ownSecurityTab);
  } else {
    params.delete('ownSecurityTab');
  }

  if (next.userId) params.set('userId', next.userId);
  else params.delete('userId');

  if (next.roleId) params.set('roleId', next.roleId);
  else params.delete('roleId');

  if (next.roleScope) params.set('roleScope', next.roleScope);
  else params.delete('roleScope');

  if (next.orgId) params.set('orgId', next.orgId);
  else params.delete('orgId');

  if (next.auditId) params.set('auditId', next.auditId);
  else params.delete('auditId');

  if (next.eventId) params.set('eventId', next.eventId);
  else params.delete('eventId');

  if (next.organizationId) params.set('organizationId', next.organizationId);
  else params.delete('organizationId');

  const qs = params.toString();
  const url = `${window.location.pathname}?${qs}`;
  if (opts?.replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}

/** Legacy users / activity-log URLs → security-access hub */
export function migrateSecurityAccessParams(search: string): string {
  const p = new URLSearchParams(search);
  const view = p.get('view');

  if (view === 'users') {
    p.set('view', 'security-access');
    p.set('securityAccess', 'users');
  }

  if (view === 'activity-log') {
    p.set('view', 'security-access');
    p.set('securityAccess', 'audit');
  }

  return `?${p.toString()}`;
}
