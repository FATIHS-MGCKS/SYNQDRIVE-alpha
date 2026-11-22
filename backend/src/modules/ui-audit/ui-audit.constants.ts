import { PlatformPermissionJwtValue } from '@modules/users/platform-permissions/platform-permission.constants';

/** JWT claim values emitted for active UI audit grants (never sufficient alone for authorization). */
export const UI_AUDIT_JWT_PERMISSIONS = {
  MASTER: 'ui-audit-master',
  RENTAL: 'ui-audit-rental',
  OPERATOR: 'ui-audit-operator',
} as const satisfies Record<string, PlatformPermissionJwtValue>;

export const UI_AUDIT_JWT_VALUES: readonly string[] = Object.values(UI_AUDIT_JWT_PERMISSIONS);

/**
 * Auth/session maintenance paths allowed for audit-bound identities (not business mutations).
 * Prefix match on pathname (no query).
 */
/**
 * Session maintenance only — no MFA enrollment, password change, or permission mutations.
 */
export const UI_AUDIT_AUTH_SESSION_WRITE_ALLOWLIST: readonly string[] = [
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/login',
  '/api/v1/auth/mfa/challenge',
  '/api/v1/auth/mfa/verify',
];

/** GET paths that must never be served to audit-bound identities (exports, secrets, grants). */
export const UI_AUDIT_SENSITIVE_GET_DENYLIST: readonly RegExp[] = [
  /^\/api\/v1\/admin\/.*\/export/i,
  /^\/api\/v1\/.*\/credentials/i,
  /^\/api\/v1\/.*\/secrets/i,
  /^\/api\/v1\/users\/.*\/platform-permissions/i,
  /^\/api\/v1\/master-admin-smoke/i,
];