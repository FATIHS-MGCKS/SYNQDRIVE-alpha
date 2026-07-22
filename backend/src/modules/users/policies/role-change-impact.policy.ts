/**
 * Role change impact preview policy (Prompt 11/22).
 * Pure domain — no Nest/Prisma imports.
 */
import { createHash } from 'crypto';
import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import {
  permissionsWereReduced,
  stationScopeWasReduced,
  type IamSessionInvalidationTrigger,
} from './iam-session-invalidation.policy';

export type PermissionGrant = {
  module: string;
  level: PermissionLevel;
};

export type StationScopeImpact = {
  membershipId: string;
  beforeStationIds: string[];
  afterStationIds: string[];
  reduced: boolean;
};

export type AffectedMembershipImpact = {
  membershipId: string;
  userId: string;
  assignmentMode: string;
  assignmentId: string;
  followsLatest: boolean;
  pinnedVersionId: string | null;
  pinnedVersionNumber: number | null;
  willReceiveUpdate: boolean;
  sessionInvalidationTriggers: IamSessionInvalidationTrigger[];
  gainedPermissions: PermissionGrant[];
  lostPermissions: PermissionGrant[];
  gainedPrivilegedCapabilities: string[];
  lostPrivilegedCapabilities: string[];
  stationScopeImpact: StationScopeImpact | null;
  effectiveAdminBefore: boolean;
  effectiveAdminAfter: boolean;
};

export type SegregationOfDutiesConflict = {
  code: string;
  message: string;
  modules: string[];
};

export type StepUpRequirement = {
  required: boolean;
  reasons: string[];
};

export type RoleChangeImpactPreview = {
  organizationRoleId: string;
  currentVersionNumber: number;
  proposedVersionNumber: number;
  previewHash: string;
  affectedMembershipCount: number;
  followLatestCount: number;
  pinnedCount: number;
  gainedPermissions: PermissionGrant[];
  lostPermissions: PermissionGrant[];
  gainedPrivilegedCapabilities: string[];
  lostPrivilegedCapabilities: string[];
  stationScopeChanges: StationScopeImpact[];
  affectedSessionsCount: number;
  lastAdminRisk: {
    atRisk: boolean;
    remainingEffectiveAdminsAfter: number;
    affectedAdminMembershipIds: string[];
  };
  segregationOfDutiesConflicts: SegregationOfDutiesConflict[];
  stepUp: StepUpRequirement;
  memberships: AffectedMembershipImpact[];
};

const PRIVILEGED_CAPABILITIES = [
  { module: 'users-roles', level: 'manage' as PermissionLevel, capability: 'users-roles.manage' },
  { module: 'billing', level: 'manage' as PermissionLevel, capability: 'billing.manage' },
] as const;

const LEVELS: PermissionLevel[] = ['read', 'write', 'manage'];

export function membershipHasEffectiveAdminPrivileges(input: {
  membershipRole: string;
  permissions?: Record<string, { read?: boolean; write?: boolean; manage?: boolean }> | null;
}): boolean {
  if (input.membershipRole === 'ORG_ADMIN') return true;
  const perms = input.permissions ?? {};
  for (const entry of PRIVILEGED_CAPABILITIES) {
    const flags = perms[entry.module];
    if (!flags) continue;
    if (entry.level === 'manage' && flags.manage) return true;
    if (entry.level === 'write' && (flags.write || flags.manage)) return true;
    if (entry.level === 'read' && (flags.read || flags.write || flags.manage)) return true;
  }
  return false;
}

function hasLevel(
  flags: { read?: boolean; write?: boolean; manage?: boolean } | undefined,
  level: PermissionLevel,
): boolean {
  if (!flags) return false;
  if (level === 'read') return !!(flags.read || flags.write || flags.manage);
  if (level === 'write') return !!(flags.write || flags.manage);
  return !!flags.manage;
}

export function diffPermissionGrants(
  before: Record<string, { read?: boolean; write?: boolean; manage?: boolean }> | null,
  after: Record<string, { read?: boolean; write?: boolean; manage?: boolean }> | null,
): { gained: PermissionGrant[]; lost: PermissionGrant[] } {
  const gained: PermissionGrant[] = [];
  const lost: PermissionGrant[] = [];
  const modules = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);

  for (const module of modules) {
    const b = before?.[module];
    const a = after?.[module];
    for (const level of LEVELS) {
      const had = hasLevel(b, level);
      const has = hasLevel(a, level);
      if (!had && has) gained.push({ module, level });
      if (had && !has) lost.push({ module, level });
    }
  }

  return { gained, lost };
}

export function diffPrivilegedCapabilities(
  before: Record<string, { read?: boolean; write?: boolean; manage?: boolean }> | null,
  after: Record<string, { read?: boolean; write?: boolean; manage?: boolean }> | null,
  membershipRoleBefore: string,
  membershipRoleAfter: string,
): { gained: string[]; lost: string[] } {
  const beforeAdmin = membershipHasEffectiveAdminPrivileges({
    membershipRole: membershipRoleBefore,
    permissions: before,
  });
  const afterAdmin = membershipHasEffectiveAdminPrivileges({
    membershipRole: membershipRoleAfter,
    permissions: after,
  });

  const gained: string[] = [];
  const lost: string[] = [];

  if (!beforeAdmin && afterAdmin) gained.push('platform.effective-admin');
  if (beforeAdmin && !afterAdmin) lost.push('platform.effective-admin');

  for (const entry of PRIVILEGED_CAPABILITIES) {
    const had = hasLevel(before?.[entry.module], entry.level);
    const has = hasLevel(after?.[entry.module], entry.level);
    if (!had && has) gained.push(entry.capability);
    if (had && !has) lost.push(entry.capability);
  }

  return { gained, lost };
}

export function parseStationIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export function computeStationScopeImpact(
  membershipId: string,
  beforeIds: unknown,
  afterIds: unknown,
): StationScopeImpact {
  const beforeStationIds = parseStationIds(beforeIds);
  const afterStationIds = parseStationIds(afterIds);
  return {
    membershipId,
    beforeStationIds,
    afterStationIds,
    reduced: stationScopeWasReduced(beforeStationIds, afterStationIds),
  };
}

export function detectSegregationOfDutiesConflicts(
  permissions: Record<string, { read?: boolean; write?: boolean; manage?: boolean }> | null,
): SegregationOfDutiesConflict[] {
  const conflicts: SegregationOfDutiesConflict[] = [];
  const perms = permissions ?? {};
  const hasUsersRolesManage = hasLevel(perms['users-roles'], 'manage');
  const hasBillingManage = hasLevel(perms.billing, 'manage');
  if (hasUsersRolesManage && hasBillingManage) {
    conflicts.push({
      code: 'SOD_USERS_ROLES_BILLING',
      message:
        'Combined users-roles.manage and billing.manage on one role violates segregation of duties',
      modules: ['users-roles', 'billing'],
    });
  }
  return conflicts;
}

export function resolveMembershipSessionTriggers(input: {
  membershipRoleBefore: string;
  membershipRoleAfter: string;
  permissionsBefore: Record<string, { read?: boolean; write?: boolean; manage?: boolean }> | null;
  permissionsAfter: Record<string, { read?: boolean; write?: boolean; manage?: boolean }> | null;
  stationReduced: boolean;
  willReceiveUpdate: boolean;
}): IamSessionInvalidationTrigger[] {
  if (!input.willReceiveUpdate) return [];

  const triggers: IamSessionInvalidationTrigger[] = [];
  const { gained, lost } = diffPermissionGrants(
    input.permissionsBefore,
    input.permissionsAfter,
  );

  if (lost.length > 0 || permissionsWereReduced(input.permissionsBefore, input.permissionsAfter)) {
    triggers.push('PERMISSION_REVOKED');
  } else if (gained.length > 0) {
    triggers.push('ROLE_UPGRADED');
  }

  if (input.stationReduced) {
    triggers.push('STATION_SCOPE_REDUCED');
  }

  if (
    membershipHasEffectiveAdminPrivileges({
      membershipRole: input.membershipRoleBefore,
      permissions: input.permissionsBefore,
    }) &&
    !membershipHasEffectiveAdminPrivileges({
      membershipRole: input.membershipRoleAfter,
      permissions: input.permissionsAfter,
    })
  ) {
    if (!triggers.includes('PERMISSION_REVOKED')) {
      triggers.push('ROLE_DOWNGRADED');
    }
  }

  return [...new Set(triggers)];
}

export function assessLastAdminRisk(input: {
  orgEffectiveAdminsBefore: Array<{ membershipId: string; userId: string }>;
  memberships: AffectedMembershipImpact[];
}): RoleChangeImpactPreview['lastAdminRisk'] {
  const losingAdmin = input.memberships.filter(
    (m) => m.effectiveAdminBefore && !m.effectiveAdminAfter && m.willReceiveUpdate,
  );
  const remaining = input.orgEffectiveAdminsBefore.filter(
    (admin) => !losingAdmin.some((m) => m.membershipId === admin.membershipId),
  );

  return {
    atRisk: losingAdmin.length > 0 && remaining.length === 0,
    remainingEffectiveAdminsAfter: remaining.length,
    affectedAdminMembershipIds: losingAdmin.map((m) => m.membershipId),
  };
}

export function resolveStepUpRequirement(input: {
  gainedPrivilegedCapabilities: string[];
  lastAdminRisk: RoleChangeImpactPreview['lastAdminRisk'];
  segregationConflicts: SegregationOfDutiesConflict[];
}): StepUpRequirement {
  const reasons: string[] = [];
  if (input.gainedPrivilegedCapabilities.length > 0) {
    reasons.push('privileged-capability-gain');
  }
  if (input.lastAdminRisk.atRisk) {
    reasons.push('last-effective-admin-risk');
  }
  if (input.segregationConflicts.length > 0) {
    reasons.push('segregation-of-duties-conflict');
  }
  return { required: reasons.length > 0, reasons };
}

export function buildRoleChangePreviewHash(payload: {
  organizationRoleId: string;
  currentVersionNumber: number;
  proposedChanges: Record<string, unknown>;
}): string {
  const stable = JSON.stringify({
    organizationRoleId: payload.organizationRoleId,
    currentVersionNumber: payload.currentVersionNumber,
    proposedChanges: payload.proposedChanges,
  });
  return createHash('sha256').update(stable).digest('hex');
}

export function aggregatePermissionDiffs(
  memberships: AffectedMembershipImpact[],
): { gained: PermissionGrant[]; lost: PermissionGrant[] } {
  const gained = new Map<string, PermissionGrant>();
  const lost = new Map<string, PermissionGrant>();
  for (const m of memberships) {
    if (!m.willReceiveUpdate) continue;
    for (const g of m.gainedPermissions) {
      gained.set(`${g.module}:${g.level}`, g);
    }
    for (const l of m.lostPermissions) {
      lost.set(`${l.module}:${l.level}`, l);
    }
  }
  return {
    gained: [...gained.values()],
    lost: [...lost.values()],
  };
}

export function aggregatePrivilegedDiffs(memberships: AffectedMembershipImpact[]): {
  gained: string[];
  lost: string[];
} {
  const gained = new Set<string>();
  const lost = new Set<string>();
  for (const m of memberships) {
    if (!m.willReceiveUpdate) continue;
    for (const g of m.gainedPrivilegedCapabilities) gained.add(g);
    for (const l of m.lostPrivilegedCapabilities) lost.add(l);
  }
  return { gained: [...gained], lost: [...lost] };
}

export function buildRoleChangeImpactPreview(input: {
  organizationRoleId: string;
  currentVersionNumber: number;
  proposedChanges: Record<string, unknown>;
  memberships: AffectedMembershipImpact[];
  orgEffectiveAdminsBefore: Array<{ membershipId: string; userId: string }>;
  affectedSessionsCount: number;
  proposedPermissions: Record<string, { read?: boolean; write?: boolean; manage?: boolean }> | null;
}): RoleChangeImpactPreview {
  const { gained, lost } = aggregatePermissionDiffs(input.memberships);
  const priv = aggregatePrivilegedDiffs(input.memberships);
  const stationScopeChanges = input.memberships
    .map((m) => m.stationScopeImpact)
    .filter((s): s is StationScopeImpact => s !== null && s.reduced);
  const segregationOfDutiesConflicts = detectSegregationOfDutiesConflicts(
    input.proposedPermissions,
  );
  const lastAdminRisk = assessLastAdminRisk({
    orgEffectiveAdminsBefore: input.orgEffectiveAdminsBefore,
    memberships: input.memberships,
  });
  const stepUp = resolveStepUpRequirement({
    gainedPrivilegedCapabilities: priv.gained,
    lastAdminRisk,
    segregationConflicts: segregationOfDutiesConflicts,
  });

  const previewHash = buildRoleChangePreviewHash({
    organizationRoleId: input.organizationRoleId,
    currentVersionNumber: input.currentVersionNumber,
    proposedChanges: input.proposedChanges,
  });

  return {
    organizationRoleId: input.organizationRoleId,
    currentVersionNumber: input.currentVersionNumber,
    proposedVersionNumber: input.currentVersionNumber + 1,
    previewHash,
    affectedMembershipCount: input.memberships.length,
    followLatestCount: input.memberships.filter((m) => m.followsLatest).length,
    pinnedCount: input.memberships.filter((m) => !m.followsLatest).length,
    gainedPermissions: gained,
    lostPermissions: lost,
    gainedPrivilegedCapabilities: priv.gained,
    lostPrivilegedCapabilities: priv.lost,
    stationScopeChanges,
    affectedSessionsCount: input.affectedSessionsCount,
    lastAdminRisk,
    segregationOfDutiesConflicts,
    stepUp,
    memberships: input.memberships,
  };
}

export function hasStructuralRoleChanges(changes: {
  permissions?: unknown;
  membershipRole?: string;
  stationScopeDefault?: string | null;
  defaultStationIds?: unknown;
  fieldAgentAccessDefault?: boolean;
}): boolean {
  return (
    changes.permissions !== undefined ||
    changes.membershipRole !== undefined ||
    changes.stationScopeDefault !== undefined ||
    changes.defaultStationIds !== undefined ||
    changes.fieldAgentAccessDefault !== undefined
  );
}
