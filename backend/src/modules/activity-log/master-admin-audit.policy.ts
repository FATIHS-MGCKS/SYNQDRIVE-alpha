import { MasterAdminAuditAction, MasterAdminAuditActionCode } from './master-admin-audit.contract';

/** Routes/methods where a human-readable reason is mandatory before execution. */
export const MASTER_ADMIN_REASON_REQUIRED_PATTERNS: Array<{
  method: string;
  pathRegex: RegExp;
}> = [
  { method: 'DELETE', pathRegex: /^\/api\/v1\/admin\/organizations\/[^/]+$/ },
  { method: 'DELETE', pathRegex: /^\/api\/v1\/admin\/users\/[^/]+$/ },
  { method: 'POST', pathRegex: /^\/api\/v1\/admin\/prune$/ },
  { method: 'DELETE', pathRegex: /^\/api\/v1\/admin\/high-mobility\/.*\/vehicles\/[^/]+$/ },
  { method: 'DELETE', pathRegex: /^\/api\/v1\/admin\/high-mobility\/vehicles\/[^/]+$/ },
];

export function masterAdminReasonRequired(method: string, path: string): boolean {
  const normalized = path.split('?')[0];
  return MASTER_ADMIN_REASON_REQUIRED_PATTERNS.some(
    (rule) => rule.method === method.toUpperCase() && rule.pathRegex.test(normalized),
  );
}

export function deriveMasterAdminAuditAction(
  method: string,
  path: string,
): MasterAdminAuditActionCode {
  const p = path.split('?')[0].toLowerCase();
  const m = method.toUpperCase();

  if (p.endsWith('/admin/prune') && m === 'POST') {
    return MasterAdminAuditAction.PLATFORM_PRUNE;
  }
  if (p.includes('/admin/organizations') && m === 'POST' && /\/admin\/[^/]+\/admin$/.test(p)) {
    return MasterAdminAuditAction.ORG_ADMIN_CREATED;
  }
  if (p.includes('/admin/organizations') && m === 'DELETE') {
    return MasterAdminAuditAction.ORG_DELETED;
  }
  if (p.includes('/admin/organizations') && (m === 'POST' || m === 'PATCH' || m === 'PUT')) {
    return m === 'POST' ? MasterAdminAuditAction.ORG_CREATED : MasterAdminAuditAction.ORG_UPDATED;
  }
  if (p.includes('/payments-enabled') && m === 'PATCH') {
    return MasterAdminAuditAction.ORG_PAYMENTS_TOGGLED;
  }
  if (p.includes('/admin/users') && m === 'DELETE') {
    return MasterAdminAuditAction.PLATFORM_USER_DELETED;
  }
  if (p.includes('/admin/users') && p.includes('change-password')) {
    return MasterAdminAuditAction.PLATFORM_USER_PASSWORD_RESET;
  }
  if (p.includes('/admin/users') && m === 'POST') {
    return MasterAdminAuditAction.PLATFORM_USER_CREATED;
  }
  if (p.includes('/admin/users') && (m === 'PATCH' || m === 'PUT')) {
    return MasterAdminAuditAction.PLATFORM_USER_UPDATED;
  }
  if (p.includes('/admin/email') || p.includes('/admin/changelogs')) {
    return MasterAdminAuditAction.PLATFORM_SETTINGS_UPDATED;
  }
  if (p.includes('/admin/billing') && p.includes('/subscription')) {
    return MasterAdminAuditAction.SUBSCRIPTION_MUTATION;
  }
  if (p.includes('/admin/billing')) {
    return MasterAdminAuditAction.BILLING_MUTATION;
  }
  if (
    p.includes('/admin/dimo') ||
    p.includes('/admin/high-mobility') ||
    p.includes('/admin/voice-assistant')
  ) {
    return MasterAdminAuditAction.INTEGRATION_MUTATION;
  }
  return MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION;
}
