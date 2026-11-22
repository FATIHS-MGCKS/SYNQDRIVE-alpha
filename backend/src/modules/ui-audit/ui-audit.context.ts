import { UI_AUDIT_JWT_VALUES } from './ui-audit.constants';

export type RequestUserLike = {
  id?: string;
  platformRole?: string;
  platformPermissions?: string[];
};

export function resolveUiAuditJwtPermissions(user: RequestUserLike | undefined): string[] {
  const raw = user?.platformPermissions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === 'string' && UI_AUDIT_JWT_VALUES.includes(p));
}

/** Active UI audit grant present — requires USER role (never MASTER_ADMIN). */
export function isUiAuditBoundUser(user: RequestUserLike | undefined): boolean {
  if (!user?.id) return false;
  if (user.platformRole === 'MASTER_ADMIN') return false;
  return resolveUiAuditJwtPermissions(user).length > 0;
}