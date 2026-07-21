import { MembershipStatus } from '@prisma/client';
import {
  normalizeMembershipPermissions,
  type MembershipPermissionsMap,
} from '@shared/auth/permission.util';
import type { PermissionChangePreview } from './iam-membership-lifecycle.types';

const TERMINAL_STATUSES = new Set<MembershipStatus>([
  MembershipStatus.REMOVED,
]);

const LEAVING_STATUSES = new Set<MembershipStatus>([
  MembershipStatus.SUSPENDED,
  MembershipStatus.OFFBOARDING,
  MembershipStatus.REMOVED,
]);

export function isTerminalMembershipStatus(status: MembershipStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isLeavingMembershipStatus(status: MembershipStatus): boolean {
  return LEAVING_STATUSES.has(status);
}

export function canJoinMembershipStatus(
  status: MembershipStatus | null | undefined,
): boolean {
  if (!status) return true;
  return (
    status === MembershipStatus.INVITED ||
    status === MembershipStatus.REACTIVATION_REQUIRED
  );
}

export function canMoveMembershipStatus(status: MembershipStatus): boolean {
  return status === MembershipStatus.ACTIVE;
}

export function canSuspendMembershipStatus(status: MembershipStatus): boolean {
  return status === MembershipStatus.ACTIVE;
}

export function canRemoveMembershipStatus(status: MembershipStatus): boolean {
  return (
    status === MembershipStatus.ACTIVE ||
    status === MembershipStatus.SUSPENDED ||
    status === MembershipStatus.OFFBOARDING ||
    status === MembershipStatus.INVITED
  );
}

export function canReactivateMembershipStatus(status: MembershipStatus): boolean {
  return (
    status === MembershipStatus.REMOVED ||
    status === MembershipStatus.SUSPENDED ||
    status === MembershipStatus.REACTIVATION_REQUIRED
  );
}

function permissionLevelKey(
  module: string,
  flags: { read?: boolean; write?: boolean; manage?: boolean },
): string {
  const parts: string[] = [];
  if (flags.manage) parts.push('manage');
  if (flags.write) parts.push('write');
  if (flags.read) parts.push('read');
  return parts.length > 0 ? `${module}:${parts.join('+')}` : `${module}:none`;
}

export function diffMembershipPermissions(
  beforeRaw: unknown,
  afterRaw: unknown,
): PermissionChangePreview {
  const before = normalizeMembershipPermissions(beforeRaw) ?? {};
  const after = normalizeMembershipPermissions(afterRaw) ?? {};
  const modules = new Set([...Object.keys(before), ...Object.keys(after)]);

  const gained: string[] = [];
  const lost: string[] = [];
  const unchanged: string[] = [];

  for (const module of modules) {
    const beforeKey = permissionLevelKey(
      module,
      (before as Record<string, { read?: boolean; write?: boolean; manage?: boolean }>)[module] ?? {},
    );
    const afterKey = permissionLevelKey(
      module,
      (after as Record<string, { read?: boolean; write?: boolean; manage?: boolean }>)[module] ?? {},
    );
    if (beforeKey === afterKey) {
      unchanged.push(module);
      continue;
    }
    if (beforeKey === `${module}:none` && afterKey !== `${module}:none`) {
      gained.push(module);
    } else if (afterKey === `${module}:none` && beforeKey !== `${module}:none`) {
      lost.push(module);
    } else {
      gained.push(module);
      lost.push(module);
    }
  }

  return { gained, lost, unchanged };
}

export function requiresMfaForRole(input: {
  role: string;
  permissions?: MembershipPermissionsMap | null;
}): boolean {
  if (input.role === 'ORG_ADMIN' || input.role === 'SUB_ADMIN') return true;
  if (!input.permissions) return false;
  return Object.values(input.permissions).some((level) => Boolean(level?.manage));
}

export function scopeReduced(
  beforeScope: string | null | undefined,
  beforeIds: unknown,
  afterScope: string | null | undefined,
  afterIds: unknown,
): boolean {
  if (beforeScope !== afterScope) {
    if (beforeScope === 'ALL' && afterScope !== 'ALL') return true;
    if (beforeScope === 'SELECTED' && afterScope === 'NONE') return true;
  }
  const beforeList = Array.isArray(beforeIds) ? beforeIds : [];
  const afterList = Array.isArray(afterIds) ? afterIds : [];
  if (afterList.length < beforeList.length) return true;
  return false;
}
