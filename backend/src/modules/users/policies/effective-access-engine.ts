/**
 * Canonical EffectiveAccessEngine (Prompt 9/22).
 *
 * Single server-side source of truth for module permissions, admin bypass,
 * station scope, and privileged capability derivation.
 *
 * Admin bypass (central — do not duplicate in controllers):
 *   1. MASTER_ADMIN → all modules, all stations, cross-org when explicitly targeted
 *   2. SERVICE_ACCOUNT → same module/station bypass when flagged in input context
 *   3. ACTIVE ORG_ADMIN membership → all modules in org, station bypass
 *
 * Permission semantics:
 *   - manage implies write and read
 *   - write implies read
 *   - unknown module keys → deny
 *   - missing permission value → deny
 *   - no wildcards
 */
import { MembershipRole, MembershipStatus } from '@prisma/client';
import {
  PERMISSION_MODULE_KEYS,
  type PermissionModuleKey,
} from '@shared/auth/permission.constants';
import {
  isKnownPermissionModule,
  normalizeMembershipPermissions,
  type MembershipPermissionsMap,
  type ModulePermissionFlags,
} from '@shared/auth/permission.util';
import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import {
  computePermissionVersionSnapshot,
  computeRoleVersionSnapshot,
} from './refresh-session-binding.policy';
import type {
  AccessDecision,
  EffectiveAccessInput,
  EffectiveAccessResult,
  ModuleAccessEvaluation,
  RoleSource,
  StationScopeMode,
} from './effective-access-engine.types';

export {
  ACCESS_DECISIONS,
  ROLE_SOURCES,
  STATION_SCOPE_MODES,
} from './effective-access-engine.types';
export type {
  AccessDecision,
  EffectiveAccessInput,
  EffectiveAccessMembershipInput,
  EffectiveAccessOrganizationRoleInput,
  EffectiveAccessResourceContext,
  EffectiveAccessResult,
  ModuleAccessEvaluation,
  RoleSource,
  StationScopeMode,
} from './effective-access-engine.types';

const PRIVILEGED_MODULE_CAPABILITIES: Array<{
  module: PermissionModuleKey;
  level: PermissionLevel;
  capability: string;
}> = [
  { module: 'users-roles', level: 'manage', capability: 'users-roles.manage' },
  { module: 'billing', level: 'manage', capability: 'billing.manage' },
];

function parseStationIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function emptyFlags(): ModulePermissionFlags {
  return { read: false, write: false, manage: false };
}

function allModulesManage(): MembershipPermissionsMap {
  const out: MembershipPermissionsMap = {};
  for (const key of PERMISSION_MODULE_KEYS) {
    out[key] = { read: true, write: true, manage: true };
  }
  return out;
}

function diffPermissionOverrides(
  inherited: MembershipPermissionsMap | null,
  effective: MembershipPermissionsMap | null,
): MembershipPermissionsMap | null {
  if (!effective) return null;
  const out: MembershipPermissionsMap = {};
  for (const [key, flags] of Object.entries(effective)) {
    if (!isKnownPermissionModule(key)) continue;
    const base = inherited?.[key] ?? emptyFlags();
    if (
      flags.read !== base.read ||
      flags.write !== base.write ||
      (flags.manage ?? false) !== (base.manage ?? false)
    ) {
      out[key] = { ...flags };
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function mergePermissionMaps(
  inherited: MembershipPermissionsMap | null,
  overrides: MembershipPermissionsMap | null,
): MembershipPermissionsMap | null {
  if (!inherited && !overrides) return null;
  const out: MembershipPermissionsMap = { ...(inherited ?? {}) };
  if (overrides) {
    for (const [key, flags] of Object.entries(overrides)) {
      if (!isKnownPermissionModule(key)) continue;
      out[key] = { ...flags };
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function hasExplicitLevel(
  flags: ModulePermissionFlags | undefined,
  level: PermissionLevel,
): boolean {
  if (!flags) return false;
  switch (level) {
    case 'read':
      return flags.read === true || flags.write === true || flags.manage === true;
    case 'write':
      return flags.write === true || flags.manage === true;
    case 'manage':
      return flags.manage === true;
    default:
      return false;
  }
}

function derivePrivilegedCapabilities(
  effectiveRole: MembershipRole | 'MASTER_ADMIN' | null,
  permissions: MembershipPermissionsMap | null,
): { privileged: string[]; denied: string[] } {
  const privileged: string[] = [];
  const denied: string[] = [];

  if (effectiveRole === 'MASTER_ADMIN' || effectiveRole === MembershipRole.ORG_ADMIN) {
    privileged.push('platform.admin-bypass');
    for (const entry of PRIVILEGED_MODULE_CAPABILITIES) {
      privileged.push(entry.capability);
    }
    return { privileged, denied };
  }

  for (const entry of PRIVILEGED_MODULE_CAPABILITIES) {
    if (hasExplicitLevel(permissions?.[entry.module], entry.level)) {
      privileged.push(entry.capability);
    } else {
      denied.push(entry.capability);
    }
  }

  return { privileged, denied };
}

function resolveStationScope(input: EffectiveAccessInput): {
  stationScope: StationScopeMode;
  effectiveStationIds: string[] | null;
  stationBypass: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const stationsV2 = input.resourceContext?.stationsScopeV2Enabled;

  if (input.platformRole === 'MASTER_ADMIN' || input.serviceAccount) {
    reasons.push('station:bypass:platform-privileged');
    return {
      stationScope: 'ALL',
      effectiveStationIds: null,
      stationBypass: true,
      reasons,
    };
  }

  const membership = input.membership;
  if (!membership || membership.status !== MembershipStatus.ACTIVE) {
    reasons.push('station:deny:membership-inactive');
    return {
      stationScope: 'NONE',
      effectiveStationIds: [],
      stationBypass: false,
      reasons,
    };
  }

  if (membership.role === MembershipRole.ORG_ADMIN) {
    reasons.push('station:bypass:ORG_ADMIN');
    return {
      stationScope: 'ALL',
      effectiveStationIds: null,
      stationBypass: true,
      reasons,
    };
  }

  if (stationsV2 === false) {
    reasons.push('station:bypass:stationsScopeV2-disabled');
    return {
      stationScope: 'ALL',
      effectiveStationIds: null,
      stationBypass: true,
      reasons,
    };
  }

  const stationIds = parseStationIds(membership.stationIds);
  if (stationIds.length > 0) {
    reasons.push('station:scope:SELECTED');
    return {
      stationScope: 'SELECTED',
      effectiveStationIds: stationIds,
      stationBypass: false,
      reasons,
    };
  }

  const scope = membership.stationScope?.trim();
  if (!scope || scope === 'ALL') {
    reasons.push('station:scope:ALL');
    return {
      stationScope: 'ALL',
      effectiveStationIds: null,
      stationBypass: true,
      reasons,
    };
  }

  if (
    membership.role === MembershipRole.SUB_ADMIN ||
    membership.role === MembershipRole.WORKER
  ) {
    reasons.push('station:scope:SINGLE');
    return {
      stationScope: 'SINGLE',
      effectiveStationIds: [scope],
      stationBypass: false,
      reasons,
    };
  }

  reasons.push('station:scope:ALL-fallback');
  return {
    stationScope: 'ALL',
    effectiveStationIds: null,
    stationBypass: true,
    reasons,
  };
}

function resolveRoleSource(input: EffectiveAccessInput): RoleSource {
  if (input.platformRole === 'MASTER_ADMIN') return 'MASTER_ADMIN';
  if (input.serviceAccount) return 'SERVICE_ACCOUNT';
  if (!input.membership) return 'none';
  if (input.membership.role === MembershipRole.ORG_ADMIN) return 'ORG_ADMIN';
  if (input.membership.organizationRoleId || input.organizationRole?.id) return 'template';
  if (input.membership.permissions != null) return 'direct';
  return 'legacy';
}

function isCrossTenantDenied(input: EffectiveAccessInput): boolean {
  const resourceOrgId = input.resourceContext?.organizationId;
  const membershipOrgId = input.membership?.organizationId;
  if (!resourceOrgId || !membershipOrgId) return false;
  if (input.platformRole === 'MASTER_ADMIN' || input.serviceAccount) return false;
  return resourceOrgId !== membershipOrgId;
}

/**
 * Compute the full effective access snapshot for a principal in org context.
 */
export function computeEffectiveAccess(
  input: EffectiveAccessInput,
): EffectiveAccessResult {
  const calculatedAt = new Date().toISOString();
  const decisionReasons: string[] = [];
  const membership = input.membership ?? null;
  const membershipActive =
    membership?.status === MembershipStatus.ACTIVE;

  if (input.platformRole === 'MASTER_ADMIN') {
    decisionReasons.push('bypass:MASTER_ADMIN');
    const station = resolveStationScope(input);
    const caps = derivePrivilegedCapabilities('MASTER_ADMIN', null);
    return {
      effectiveRole: 'MASTER_ADMIN',
      roleSource: 'MASTER_ADMIN',
      roleVersion: null,
      permissionVersion: null,
      inheritedPermissions: null,
      directOverrides: null,
      effectivePermissions: allModulesManage(),
      stationScope: station.stationScope,
      effectiveStationIds: station.effectiveStationIds,
      stationBypass: station.stationBypass,
      fieldAgentAccess: true,
      privilegedCapabilities: caps.privileged,
      deniedCapabilities: caps.denied,
      decisionReasons: [...decisionReasons, ...station.reasons],
      calculatedAt,
      membershipActive: true,
    };
  }

  if (input.serviceAccount) {
    decisionReasons.push('bypass:SERVICE_ACCOUNT');
    const station = resolveStationScope(input);
    const caps = derivePrivilegedCapabilities('MASTER_ADMIN', null);
    return {
      effectiveRole: membership?.role ?? null,
      roleSource: 'SERVICE_ACCOUNT',
      roleVersion: null,
      permissionVersion: null,
      inheritedPermissions: null,
      directOverrides: null,
      effectivePermissions: allModulesManage(),
      stationScope: station.stationScope,
      effectiveStationIds: station.effectiveStationIds,
      stationBypass: station.stationBypass,
      fieldAgentAccess: true,
      privilegedCapabilities: caps.privileged,
      deniedCapabilities: caps.denied,
      decisionReasons: [...decisionReasons, ...station.reasons],
      calculatedAt,
      membershipActive: membershipActive,
    };
  }

  if (!membership) {
    decisionReasons.push('deny:no-membership');
    return {
      effectiveRole: null,
      roleSource: 'none',
      roleVersion: null,
      permissionVersion: null,
      inheritedPermissions: null,
      directOverrides: null,
      effectivePermissions: null,
      stationScope: 'NONE',
      effectiveStationIds: [],
      stationBypass: false,
      fieldAgentAccess: false,
      privilegedCapabilities: [],
      deniedCapabilities: PRIVILEGED_MODULE_CAPABILITIES.map((c) => c.capability),
      decisionReasons,
      calculatedAt,
      membershipActive: false,
    };
  }

  if (isCrossTenantDenied(input)) {
    decisionReasons.push('deny:cross-tenant-resource');
  }

  if (!membershipActive) {
    decisionReasons.push(`deny:membership-status:${membership.status}`);
  }

  const roleSource = resolveRoleSource(input);
  const inheritedPermissions = normalizeMembershipPermissions(
    input.organizationRole?.permissions ?? null,
  );
  const membershipPermissions = normalizeMembershipPermissions(
    membership.permissions,
  );
  const explicitOverrides = normalizeMembershipPermissions(
    input.directPermissionOverrides ?? null,
  );

  let directOverrides: MembershipPermissionsMap | null = explicitOverrides;
  if (!directOverrides && inheritedPermissions && membershipPermissions) {
    directOverrides = diffPermissionOverrides(
      inheritedPermissions,
      membershipPermissions,
    );
  } else if (!directOverrides && membershipPermissions && !inheritedPermissions) {
    directOverrides = membershipPermissions;
  }

  const roleVersion = computeRoleVersionSnapshot(
    membership.role,
    membership.organizationRoleId,
  );
  const permissionVersion = computePermissionVersionSnapshot(
    membership.permissions,
  );

  const station = resolveStationScope(input);
  const fieldAgentAccess =
    membership.fieldAgentAccess ??
    input.organizationRole?.fieldAgentAccessDefault ??
    false;

  if (membership.role === MembershipRole.ORG_ADMIN && membershipActive) {
    decisionReasons.push('bypass:ORG_ADMIN');
    const caps = derivePrivilegedCapabilities(MembershipRole.ORG_ADMIN, null);
    return {
      effectiveRole: MembershipRole.ORG_ADMIN,
      roleSource: 'ORG_ADMIN',
      roleVersion,
      permissionVersion,
      inheritedPermissions,
      directOverrides,
      effectivePermissions: allModulesManage(),
      stationScope: station.stationScope,
      effectiveStationIds: station.effectiveStationIds,
      stationBypass: station.stationBypass,
      fieldAgentAccess,
      privilegedCapabilities: caps.privileged,
      deniedCapabilities: caps.denied,
      decisionReasons: [...decisionReasons, ...station.reasons],
      calculatedAt,
      membershipActive,
    };
  }

  const effectivePermissions =
    membershipPermissions ??
    mergePermissionMaps(inheritedPermissions, explicitOverrides);

  const caps = derivePrivilegedCapabilities(membership.role, effectivePermissions);

  return {
    effectiveRole: membership.role,
    roleSource,
    roleVersion,
    permissionVersion,
    inheritedPermissions,
    directOverrides,
    effectivePermissions,
    stationScope: station.stationScope,
    effectiveStationIds: station.effectiveStationIds,
    stationBypass: station.stationBypass,
    fieldAgentAccess,
    privilegedCapabilities: caps.privileged,
    deniedCapabilities: caps.denied,
    decisionReasons: [...decisionReasons, ...station.reasons],
    calculatedAt,
    membershipActive,
  };
}

export function evaluateModuleAccessDecision(
  access: EffectiveAccessResult,
  module: string,
  level: PermissionLevel,
): ModuleAccessEvaluation {
  const reasons: string[] = [];

  if (!access.membershipActive && access.effectiveRole !== 'MASTER_ADMIN') {
    reasons.push('deny:membership-inactive');
    return { decision: 'DENY', module, level, reasons };
  }

  if (access.effectiveRole === 'MASTER_ADMIN' || access.roleSource === 'SERVICE_ACCOUNT') {
    reasons.push(`bypass:${access.roleSource}`);
    return { decision: 'ALLOW', module, level, reasons };
  }

  if (access.roleSource === 'ORG_ADMIN') {
    reasons.push('bypass:ORG_ADMIN');
    return { decision: 'ALLOW', module, level, reasons };
  }

  if (!isKnownPermissionModule(module)) {
    reasons.push(`deny:unknown-module:${module}`);
    return { decision: 'UNKNOWN_CONFIGURATION', module, level, reasons };
  }

  const flags = access.effectivePermissions?.[module];
  if (!flags) {
    reasons.push(`deny:missing-module:${module}`);
    return { decision: 'DENY', module, level, reasons };
  }

  if (hasExplicitLevel(flags, level)) {
    reasons.push(`allow:${module}.${level}`);
    return { decision: 'ALLOW', module, level, reasons };
  }

  reasons.push(`deny:insufficient-level:${module}.${level}`);
  return { decision: 'DENY', module, level, reasons };
}

export function isModuleAccessAllowed(
  access: EffectiveAccessResult,
  module: string,
  level: PermissionLevel,
): boolean {
  const evaluation = evaluateModuleAccessDecision(access, module, level);
  return evaluation.decision === 'ALLOW';
}

export function evaluateStationAccessDecision(
  access: EffectiveAccessResult,
  stationId?: string,
): AccessDecision {
  if (!stationId) return 'NOT_APPLICABLE';
  if (access.stationBypass || access.effectiveStationIds === null) return 'ALLOW';
  if (!access.membershipActive && access.effectiveRole !== 'MASTER_ADMIN') {
    return 'DENY';
  }
  if (access.effectiveStationIds.includes(stationId)) return 'ALLOW';
  return 'DENY';
}

export function isStationAccessAllowed(
  access: EffectiveAccessResult,
  stationId?: string,
): boolean {
  const decision = evaluateStationAccessDecision(access, stationId);
  return decision === 'ALLOW' || decision === 'NOT_APPLICABLE';
}
