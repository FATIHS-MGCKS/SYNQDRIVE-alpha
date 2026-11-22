import { UI_AUDIT_JWT_PERMISSIONS } from './ui-audit.constants';

export type UiAuditProductScope = 'master' | 'rental' | 'operator' | 'shared';

export type UiAuditReadRule = {
  scope: UiAuditProductScope;
  methods: ReadonlySet<string>;
  /** Exact path (no query) or RegExp tested against full API path. */
  match: string | RegExp;
  id: string;
};

/** Shared reads for any audit-bound identity in an active session. */
const SHARED_READ_RULES: UiAuditReadRule[] = [
  {
    id: 'shared-health',
    scope: 'shared',
    methods: new Set(['GET', 'HEAD']),
    match: '/api/v1/health',
  },
  {
    id: 'shared-account-me',
    scope: 'shared',
    methods: new Set(['GET', 'HEAD']),
    match: '/api/v1/account/me',
  },
];

const MASTER_READ_PATHS: ReadonlyArray<{ id: string; path: string }> = [
  { id: 'A-dashboard', path: '/api/v1/admin/dashboard/operational' },
  { id: 'A-organizations', path: '/api/v1/admin/organizations' },
  { id: 'B-billing-overview', path: '/api/v1/admin/billing/overview/operational' },
  { id: 'C-vehicles-overview', path: '/api/v1/admin/vehicles/operational/overview' },
  { id: 'C-connectivity', path: '/api/v1/admin/connectivity/platform-summary' },
  { id: 'D-ops-overview', path: '/api/v1/admin/ops/overview' },
  { id: 'D-ops-incidents', path: '/api/v1/admin/ops/incidents' },
  { id: 'E-security-attention', path: '/api/v1/admin/security/attention-summary' },
  { id: 'E-security-users', path: '/api/v1/admin/security/users' },
  { id: 'F-integrations-directory', path: '/api/v1/admin/platform-integrations/directory' },
  { id: 'F-integrations-attention', path: '/api/v1/admin/platform-integrations/attention-summary' },
];

/** Master read surfaces — aligned with master-admin-smoke-readonly.runner (explicit only). */
const MASTER_READ_RULES: UiAuditReadRule[] = MASTER_READ_PATHS.map(({ id, path }) => ({
  id,
  scope: 'master' as const,
  methods: new Set(['GET', 'HEAD']),
  match: path,
}));

/** Rental org-scoped read prefixes (fail-closed: unlisted org routes denied). */
const RENTAL_READ_RULES: UiAuditReadRule[] = [
  {
    id: 'rental-org-reads',
    scope: 'rental',
    methods: new Set(['GET', 'HEAD']),
    match:
      /^\/api\/v1\/organizations\/[^/]+\/(dashboard|bookings|customers|vehicles|stations|tasks|invoices|fines|settings|fleet|evaluations|data-analyse)(\/|$)/,
  },
];

/** Operator field reads (worker context — narrower than rental). */
const OPERATOR_READ_RULES: UiAuditReadRule[] = [
  {
    id: 'operator-org-reads',
    scope: 'operator',
    methods: new Set(['GET', 'HEAD']),
    match:
      /^\/api\/v1\/organizations\/[^/]+\/(bookings\/today|vehicles|tasks|damages|stations)(\/|$)/,
  },
];

export const UI_AUDIT_READ_ALLOWLIST: readonly UiAuditReadRule[] = [
  ...SHARED_READ_RULES,
  ...MASTER_READ_RULES,
  ...RENTAL_READ_RULES,
  ...OPERATOR_READ_RULES,
];

export function matchUiAuditReadRule(
  method: string,
  normalizedPath: string,
): UiAuditReadRule | null {
  const m = method.toUpperCase();
  for (const rule of UI_AUDIT_READ_ALLOWLIST) {
    if (!rule.methods.has(m)) continue;
    if (typeof rule.match === 'string') {
      if (rule.match === normalizedPath) return rule;
    } else if (rule.match.test(normalizedPath)) {
      return rule;
    }
  }
  return null;
}

export function requiredJwtGrantForScope(scope: UiAuditProductScope): string | null {
  switch (scope) {
    case 'master':
      return UI_AUDIT_JWT_PERMISSIONS.MASTER;
    case 'rental':
      return UI_AUDIT_JWT_PERMISSIONS.RENTAL;
    case 'operator':
      return UI_AUDIT_JWT_PERMISSIONS.OPERATOR;
    case 'shared':
      return null;
    default:
      return null;
  }
}

export function isUiAuditMasterReadAllowed(method: string, normalizedPath: string): boolean {
  const rule = matchUiAuditReadRule(method, normalizedPath);
  return rule?.scope === 'master';
}