/**
 * Versioned organization role policy (Prompt 10/22).
 * Pure domain — no Nest/Prisma imports.
 */
import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';

export const ROLE_ASSIGNMENT_MODES = [
  'FOLLOW_LATEST_APPROVED_VERSION',
  'PINNED_VERSION',
  'MIGRATION_LEGACY_SNAPSHOT',
] as const;

export type RoleAssignmentMode = (typeof ROLE_ASSIGNMENT_MODES)[number];

export const ROLE_VERSION_STATUSES = [
  'DRAFT',
  'APPROVED',
  'SUPERSEDED',
  'RETIRED',
] as const;

export type RoleVersionStatus = (typeof ROLE_VERSION_STATUSES)[number];

export const OVERRIDE_EFFECTS = ['ALLOW', 'DENY'] as const;
export type OverrideEffect = (typeof OVERRIDE_EFFECTS)[number];

export type RoleVersionSnapshot = {
  id: string;
  organizationRoleId: string;
  organizationId: string;
  version: number;
  nameSnapshot: string;
  descriptionSnapshot?: string | null;
  permissions?: unknown;
  defaultStationScope?: string | null;
  defaultStationIds?: unknown;
  fieldAgentAccess: boolean;
  riskClassification: string;
  status: RoleVersionStatus;
  changeReason?: string | null;
  createdAt: string;
};

export type RoleAssignmentRecord = {
  id: string;
  organizationId: string;
  membershipId: string;
  organizationRoleId?: string | null;
  assignedRoleVersionId?: string | null;
  assignmentMode: RoleAssignmentMode;
  assignedByUserId?: string | null;
  assignedAt: string;
  effectiveFrom: string;
  endedAt?: string | null;
  isCurrent: boolean;
};

export type PermissionOverrideRecord = {
  id: string;
  organizationId: string;
  membershipId: string;
  moduleKey: string;
  permissionLevel: PermissionLevel;
  effect: OverrideEffect;
  actorUserId?: string | null;
  reason?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

export type RoleTemplateRecord = {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  isSystemTemplate: boolean;
  membershipRole: string;
  permissions?: unknown;
  stationScopeDefault?: string | null;
  defaultStationIds?: unknown;
  fieldAgentAccessDefault: boolean;
};

export function assertSameOrganization(
  expectedOrgId: string,
  actualOrgId: string,
  context: string,
): void {
  if (expectedOrgId !== actualOrgId) {
    throw new Error(`Cross-tenant ${context}: expected ${expectedOrgId}, got ${actualOrgId}`);
  }
}

export function assertSystemRoleMutationAllowed(
  role: Pick<RoleTemplateRecord, 'isSystemTemplate'>,
  mutation: 'delete' | 'permissions' | 'rename' | 'membershipRole',
): void {
  if (!role.isSystemTemplate) return;
  if (mutation === 'delete') {
    throw new Error('System role templates cannot be deleted');
  }
  if (mutation === 'permissions' || mutation === 'membershipRole') {
    throw new Error('System role templates cannot change permissions or membership role directly');
  }
}

export function nextRoleVersionNumber(existingVersions: Array<{ version: number }>): number {
  if (existingVersions.length === 0) return 1;
  return Math.max(...existingVersions.map((v) => v.version)) + 1;
}

export function resolveEffectiveRoleVersion(input: {
  assignment: RoleAssignmentRecord;
  latestApprovedVersion?: RoleVersionSnapshot | null;
  pinnedVersion?: RoleVersionSnapshot | null;
}): RoleVersionSnapshot | null {
  const { assignment, latestApprovedVersion, pinnedVersion } = input;

  switch (assignment.assignmentMode) {
    case 'PINNED_VERSION':
      return pinnedVersion ?? null;
    case 'FOLLOW_LATEST_APPROVED_VERSION':
      return latestApprovedVersion ?? null;
    case 'MIGRATION_LEGACY_SNAPSHOT':
      return pinnedVersion ?? latestApprovedVersion ?? null;
    default:
      return null;
  }
}

export function isRoleVersionUsable(version: RoleVersionSnapshot | null): boolean {
  if (!version) return false;
  return version.status === 'APPROVED';
}

export function isOverrideActive(
  override: PermissionOverrideRecord,
  now: Date = new Date(),
): boolean {
  if (override.revokedAt) return false;
  if (override.expiresAt && new Date(override.expiresAt) <= now) return false;
  return true;
}

export function applyPermissionOverrides(
  basePermissions: Record<string, { read: boolean; write: boolean; manage?: boolean }> | null,
  overrides: PermissionOverrideRecord[],
  now: Date = new Date(),
): Record<string, { read: boolean; write: boolean; manage?: boolean }> | null {
  const active = overrides.filter((o) => isOverrideActive(o, now));
  if (active.length === 0) return basePermissions;

  const out: Record<string, { read: boolean; write: boolean; manage?: boolean }> = {
    ...(basePermissions ?? {}),
  };

  for (const override of active) {
    const current = out[override.moduleKey] ?? { read: false, write: false, manage: false };
    if (override.effect === 'ALLOW') {
      if (override.permissionLevel === 'read') current.read = true;
      if (override.permissionLevel === 'write') {
        current.read = true;
        current.write = true;
      }
      if (override.permissionLevel === 'manage') {
        current.read = true;
        current.write = true;
        current.manage = true;
      }
    } else {
      if (override.permissionLevel === 'read') current.read = false;
      if (override.permissionLevel === 'write') current.write = false;
      if (override.permissionLevel === 'manage') current.manage = false;
    }
    out[override.moduleKey] = current;
  }

  return out;
}

export function buildVersionSnapshotFromRole(
  role: RoleTemplateRecord,
  version: number,
  options: {
    changeReason?: string;
    riskClassification?: string;
    status?: RoleVersionStatus;
  } = {},
): Omit<RoleVersionSnapshot, 'id' | 'createdAt' | 'organizationId'> & {
  organizationId: string;
} {
  return {
    organizationRoleId: role.id,
    organizationId: role.organizationId,
    version,
    nameSnapshot: role.name,
    descriptionSnapshot: role.description ?? null,
    permissions: role.permissions ?? null,
    defaultStationScope: role.stationScopeDefault ?? null,
    defaultStationIds: role.defaultStationIds ?? null,
    fieldAgentAccess: role.fieldAgentAccessDefault,
    riskClassification: options.riskClassification ?? inferRiskClassification(role),
    status: options.status ?? 'APPROVED',
    changeReason: options.changeReason ?? null,
  };
}

export function inferRiskClassification(
  role: Pick<RoleTemplateRecord, 'membershipRole' | 'isSystemTemplate'>,
): string {
  if (role.membershipRole === 'ORG_ADMIN') return 'CRITICAL';
  if (role.isSystemTemplate) return 'PRIVILEGED';
  return 'STANDARD';
}

export function shouldCreateNewVersionOnUpdate(
  role: Pick<RoleTemplateRecord, 'isSystemTemplate'>,
  changes: {
    permissions?: unknown;
    membershipRole?: string;
    stationScopeDefault?: string | null;
    defaultStationIds?: unknown;
    fieldAgentAccessDefault?: boolean;
  },
): boolean {
  if (role.isSystemTemplate) {
    assertSystemRoleMutationAllowed(role, 'permissions');
    return false;
  }
  return (
    changes.permissions !== undefined ||
    changes.membershipRole !== undefined ||
    changes.stationScopeDefault !== undefined ||
    changes.defaultStationIds !== undefined ||
    changes.fieldAgentAccessDefault !== undefined
  );
}

export function mapAssignmentHistory(
  assignments: RoleAssignmentRecord[],
): RoleAssignmentRecord[] {
  return [...assignments].sort(
    (a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime(),
  );
}
