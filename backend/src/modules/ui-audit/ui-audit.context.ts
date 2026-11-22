import { UI_AUDIT_JWT_VALUES, UI_AUDIT_JWT_PERMISSIONS } from './ui-audit.constants';

export type RequestUserLike = {
  id?: string;
  platformRole?: string;
  platformPermissions?: string[];
  status?: string;
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

export function hasUiAuditMasterGrant(user: RequestUserLike | undefined): boolean {
  return resolveUiAuditJwtPermissions(user).includes(UI_AUDIT_JWT_PERMISSIONS.MASTER);
}

export function hasUiAuditRentalGrant(user: RequestUserLike | undefined): boolean {
  return resolveUiAuditJwtPermissions(user).includes(UI_AUDIT_JWT_PERMISSIONS.RENTAL);
}

export function hasUiAuditOperatorGrant(user: RequestUserLike | undefined): boolean {
  return resolveUiAuditJwtPermissions(user).includes(UI_AUDIT_JWT_PERMISSIONS.OPERATOR);
}

export function userHasJwtGrant(user: RequestUserLike | undefined, jwtPermission: string): boolean {
  return resolveUiAuditJwtPermissions(user).includes(jwtPermission);
}