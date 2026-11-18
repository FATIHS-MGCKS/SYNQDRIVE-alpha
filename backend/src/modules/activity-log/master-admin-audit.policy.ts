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

/** Routes that emit dedicated semantic MasterAdminAuditService records (skip generic HTTP success audit). */
const SEMANTIC_PRIVILEGED_SUCCESS_SKIP: Array<{ methods: string[]; pathRegex: RegExp }> = [
  {
    methods: ['POST'],
    pathRegex: /^\/api\/v1\/admin\/security\/users\/[^/]+\/sessions\/[^/]+\/revoke$/,
  },
  {
    methods: ['POST'],
    pathRegex: /^\/api\/v1\/admin\/security\/users\/[^/]+\/sessions\/revoke-all$/,
  },
  {
    methods: ['POST'],
    pathRegex: /^\/api\/v1\/admin\/business-insights\/run-all$/,
  },
  {
    methods: ['POST'],
    pathRegex: /^\/api\/v1\/admin\/business-insights\/run\/[^/]+$/,
  },
  {
    methods: ['POST'],
    pathRegex: /^\/api\/v1\/admin\/business-insights\/trigger\/[^/]+$/,
  },
  {
    methods: ['PATCH'],
    pathRegex: /^\/api\/v1\/admin\/business-insights\/policy\/[^/]+$/,
  },
  { methods: ['POST'], pathRegex: /^\/api\/v1\/admin\/prospects$/ },
  { methods: ['POST'], pathRegex: /^\/api\/v1\/admin\/prospects\/import$/ },
  {
    methods: ['POST'],
    pathRegex: /^\/api\/v1\/admin\/prospects\/[^/]+\/convert$/,
  },
  { methods: ['PATCH'], pathRegex: /^\/api\/v1\/admin\/prospects\/[^/]+$/ },
  { methods: ['DELETE'], pathRegex: /^\/api\/v1\/admin\/prospects\/[^/]+$/ },
  { methods: ['POST'], pathRegex: /^\/api\/v1\/admin\/insurances\/partners$/ },
  {
    methods: ['PATCH'],
    pathRegex: /^\/api\/v1\/admin\/insurances\/partners\/[^/]+$/,
  },
  {
    methods: ['POST'],
    pathRegex: /^\/api\/v1\/admin\/insurances\/partners\/[^/]+\/test$/,
  },
  { methods: ['POST'], pathRegex: /^\/api\/v1\/admin\/insurances\/partner-contacts$/ },
  {
    methods: ['PATCH'],
    pathRegex: /^\/api\/v1\/admin\/insurances\/partner-contacts\/[^/]+$/,
  },
  {
    methods: ['POST'],
    pathRegex: /^\/api\/v1\/admin\/insurances\/disclosure-templates$/,
  },
  {
    methods: ['PATCH'],
    pathRegex: /^\/api\/v1\/admin\/insurances\/disclosure-templates\/[^/]+$/,
  },
  {
    methods: ['POST'],
    pathRegex: /^\/api\/v1\/admin\/insurances\/inquiry-templates$/,
  },
  {
    methods: ['PATCH'],
    pathRegex: /^\/api\/v1\/admin\/insurances\/inquiry-templates\/[^/]+$/,
  },
  {
    methods: ['POST'],
    pathRegex: /^\/api\/v1\/admin\/parts-accessories\/providers$/,
  },
  {
    methods: ['PATCH'],
    pathRegex: /^\/api\/v1\/admin\/parts-accessories\/providers\/[^/]+$/,
  },
  {
    methods: ['POST'],
    pathRegex: /^\/api\/v1\/admin\/parts-accessories\/providers\/[^/]+\/test$/,
  },
  {
    methods: ['POST'],
    pathRegex: /^\/api\/v1\/admin\/parts-accessories\/disclosures$/,
  },
  {
    methods: ['PATCH'],
    pathRegex: /^\/api\/v1\/admin\/parts-accessories\/disclosures\/[^/]+$/,
  },
  {
    methods: ['POST'],
    pathRegex:
      /^\/api\/v1\/admin\/voice-assistant\/organizations\/[^/]+\/twilio\/subaccount\/provision$/,
  },
  {
    methods: ['POST'],
    pathRegex:
      /^\/api\/v1\/admin\/voice-assistant\/organizations\/[^/]+\/twilio\/credentials\/register$/,
  },
  {
    methods: ['POST'],
    pathRegex:
      /^\/api\/v1\/admin\/voice-assistant\/organizations\/[^/]+\/twilio\/phone-numbers\/purchase$/,
  },
  {
    methods: ['POST'],
    pathRegex:
      /^\/api\/v1\/admin\/voice-assistant\/organizations\/[^/]+\/elevenlabs\/phone-numbers\/[^/]+\/import-and-assign$/,
  },
  {
    methods: ['POST'],
    pathRegex:
      /^\/api\/v1\/admin\/voice-assistant\/organizations\/[^/]+\/elevenlabs\/phone-numbers\/[^/]+\/deactivate$/,
  },
  {
    methods: ['POST'],
    pathRegex: /^\/api\/v1\/admin\/voice-assistant\/organizations\/[^/]+\/sync$/,
  },
];

export function shouldSkipGenericPrivilegedSuccessAudit(method: string, path: string): boolean {
  const normalized = path.split('?')[0];
  const verb = method.toUpperCase();
  return SEMANTIC_PRIVILEGED_SUCCESS_SKIP.some(
    (rule) => rule.methods.includes(verb) && rule.pathRegex.test(normalized),
  );
}

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
