import { UI_AUDIT_JWT_PERMISSIONS } from './ui-audit.constants';
import { UI_AUDIT_MASTER_ALLOWED_PATHS } from './ui-audit-master-endpoint.policy';

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

const MASTER_READ_PATHS: ReadonlyArray<{ id: string; path: string }> =
  UI_AUDIT_MASTER_ALLOWED_PATHS.map((path) => ({
    id: `master-${path.split('/').slice(-2).join('-')}`,
    path,
  }));

/** Master read surfaces — explicit operational aggregates only (see master endpoint policy). */
const MASTER_READ_RULES: UiAuditReadRule[] = MASTER_READ_PATHS.map(({ id, path }) => ({
  id,
  scope: 'master' as const,
  methods: new Set(['GET', 'HEAD']),
  match: path,
}));

/** Rental org-scoped reads — explicit segments (no `settings` subtree). */
const RENTAL_READ_RULES: UiAuditReadRule[] = [
  'dashboard',
  'bookings',
  'customers',
  'vehicles',
  'stations',
  'tasks',
  'invoices',
  'fines',
  'fleet',
  'evaluations',
  'data-analyse',
].map((segment) => ({
  id: `rental-${segment}`,
  scope: 'rental' as const,
  methods: new Set(['GET', 'HEAD']),
  match: new RegExp(
    `^/api/v1/organizations/[^/]+/${segment.replace(/-/g, '\\-')}(\\/|$)`,
  ),
}));

/** Operator field reads (worker context — narrower than rental). */
const OPERATOR_READ_RULES: UiAuditReadRule[] = [
  {
    id: 'operator-today-bookings',
    scope: 'operator',
    methods: new Set(['GET', 'HEAD']),
    match: /^\/api\/v1\/organizations\/[^/]+\/bookings\/today(\/|$)/,
  },
  {
    id: 'operator-tasks',
    scope: 'operator',
    methods: new Set(['GET', 'HEAD']),
    match: /^\/api\/v1\/organizations\/[^/]+\/tasks(\/|$)/,
  },
  {
    id: 'operator-damages',
    scope: 'operator',
    methods: new Set(['GET', 'HEAD']),
    match: /^\/api\/v1\/organizations\/[^/]+\/damages(\/|$)/,
  },
];

export const UI_AUDIT_READ_ALLOWLIST: readonly UiAuditReadRule[] = [
  ...SHARED_READ_RULES,
  ...MASTER_READ_RULES,
  ...OPERATOR_READ_RULES,
  ...RENTAL_READ_RULES,
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