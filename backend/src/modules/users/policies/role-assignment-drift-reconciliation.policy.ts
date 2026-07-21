/**
 * Role assignment drift reconciliation policy (Prompt 12/22).
 * Pure domain — no Nest/Prisma imports.
 */
import { createHash } from 'crypto';
import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import { PERMISSION_MODULE_KEYS } from '@shared/auth/permission.constants';
import {
  diffPermissionGrants,
  membershipHasEffectiveAdminPrivileges,
  parseStationIds,
} from './role-change-impact.policy';

export const DRIFT_CLASSIFICATIONS = [
  'EXACT_ROLE_MATCH',
  'INTENTIONAL_OVERRIDE',
  'STALE_ROLE_SNAPSHOT',
  'UNKNOWN_ROLE_SOURCE',
  'DISABLED_ROLE_ASSIGNMENT',
  'PRIVILEGED_DRIFT',
  'INVALID_PERMISSION_KEY',
  'NO_ROLE_ASSIGNMENT',
] as const;

export type DriftClassification = (typeof DRIFT_CLASSIFICATIONS)[number];

export const DRIFT_ASSIGNMENT_MODES = [
  'FOLLOW_LATEST_APPROVED_VERSION',
  'PINNED_VERSION',
  'MIGRATION_LEGACY_SNAPSHOT',
] as const;

export type DriftRecommendedAssignmentMode =
  (typeof DRIFT_ASSIGNMENT_MODES)[number];

export type DriftPermissionMap = Record<
  string,
  { read?: boolean; write?: boolean; manage?: boolean }
>;

export type DriftRoleVersionSnapshot = {
  id: string;
  version: number;
  status: string;
  permissions?: unknown;
  defaultStationScope?: string | null;
  defaultStationIds?: unknown;
  fieldAgentAccess: boolean;
  createdAt: string;
};

export type DriftRoleTemplate = {
  id: string;
  organizationId: string;
  name: string;
  isActive: boolean;
  membershipRole: string;
  permissions?: unknown;
  stationScopeDefault?: string | null;
  defaultStationIds?: unknown;
  fieldAgentAccessDefault: boolean;
};

export type DriftAssignmentRecord = {
  id: string;
  organizationId: string;
  membershipId: string;
  organizationRoleId?: string | null;
  assignedRoleVersionId?: string | null;
  assignmentMode: string;
  isCurrent: boolean;
  endedAt?: string | null;
};

export type DriftMembershipInput = {
  id: string;
  organizationId: string;
  userId: string;
  status: string;
  role: string;
  organizationRoleId?: string | null;
  permissions?: unknown;
  stationScope?: string | null;
  stationIds?: unknown;
  fieldAgentAccess: boolean;
  membershipVersion: number;
};

export type DriftPermissionOverrideRecord = {
  id: string;
  moduleKey: string;
  permissionLevel: PermissionLevel;
  effect: 'ALLOW' | 'DENY';
  reason?: string | null;
  revokedAt?: string | null;
  expiresAt?: string | null;
};

export type DriftAuditHistoryEntry = {
  id: string;
  action: string;
  description: string;
  createdAt: string;
  auditAction?: string | null;
};

export type DriftSessionSummary = {
  activeSessionCount: number;
  orgBoundSessionCount: number;
};

export type DriftScopeDiff = {
  stationScopeBefore: string | null;
  stationScopeAfter: string | null;
  stationIdsBefore: string[];
  stationIdsAfter: string[];
  fieldAgentAccessBefore: boolean;
  fieldAgentAccessAfter: boolean;
  differs: boolean;
};

export type DerivedPermissionOverride = {
  moduleKey: string;
  permissionLevel: PermissionLevel;
  effect: 'ALLOW' | 'DENY';
};

export type RoleAssignmentDriftEvidencePackage = {
  evidenceVersion: number;
  organizationId: string;
  membershipAlias: string;
  membershipId: string;
  userAlias: string;
  userId: string;
  membership: {
    status: string;
    role: string;
    membershipVersion: number;
    organizationRoleId: string | null;
  };
  currentMembershipPermissions: DriftPermissionMap | null;
  currentRole: {
    id: string | null;
    name: string | null;
    isActive: boolean | null;
    membershipRole: string | null;
    permissions: DriftPermissionMap | null;
  };
  historicalRoleVersions: DriftRoleVersionSnapshot[];
  matchedHistoricalVersion: DriftRoleVersionSnapshot | null;
  currentAssignment: DriftAssignmentRecord | null;
  existingOverrides: DriftPermissionOverrideRecord[];
  permissionDiff: {
    gained: Array<{ module: string; level: PermissionLevel }>;
    lost: Array<{ module: string; level: PermissionLevel }>;
  };
  scopeDiff: DriftScopeDiff;
  auditHistory: DriftAuditHistoryEntry[];
  sessions: DriftSessionSummary;
  classification: DriftClassification;
  recommendedAssignmentMode: DriftRecommendedAssignmentMode | null;
  derivedOverrides: DerivedPermissionOverride[];
  applyEligible: boolean;
  reviewRequired: boolean;
  classificationReason: string;
  evidenceHash: string;
};

export type RoleAssignmentDriftAuditReport = {
  auditId: string;
  phase: number;
  mode: 'read-only' | 'apply';
  writesPerformed: boolean;
  organizationId: string | null;
  organizationAlias: string | null;
  gitCommit: string | null;
  completedAt: string;
  summary: {
    totalMemberships: number;
    applyEligibleCount: number;
    reviewRequiredCount: number;
    byClassification: Record<DriftClassification, number>;
  };
  evidencePackages: RoleAssignmentDriftEvidencePackage[];
  reportHash: string;
};

const EVIDENCE_VERSION = 1;
const LEVELS: PermissionLevel[] = ['read', 'write', 'manage'];

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export function hashEvidencePackage(
  pkg: Omit<RoleAssignmentDriftEvidencePackage, 'evidenceHash'> | RoleAssignmentDriftEvidencePackage,
): string {
  const { evidenceHash: _ignored, ...body } = pkg as RoleAssignmentDriftEvidencePackage;
  return createHash('sha256').update(stableStringify(body)).digest('hex');
}

export function hashDriftAuditReport(
  report: Omit<RoleAssignmentDriftAuditReport, 'reportHash'> | RoleAssignmentDriftAuditReport,
): string {
  const { reportHash: _ignored, ...body } = report as RoleAssignmentDriftAuditReport;
  return createHash('sha256').update(stableStringify(body)).digest('hex');
}

export function normalizeDriftPermissions(raw: unknown): DriftPermissionMap | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: DriftPermissionMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!PERMISSION_MODULE_KEYS.includes(key as never)) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const flags = value as Record<string, unknown>;
    out[key] = {
      read: flags.read === true,
      write: flags.write === true,
      manage: flags.manage === true,
    };
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function findInvalidPermissionKeys(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (typeof raw !== 'object' || Array.isArray(raw)) return ['__invalid_shape__'];
  const allowed = new Set<string>(PERMISSION_MODULE_KEYS);
  return Object.keys(raw as Record<string, unknown>).filter((key) => !allowed.has(key));
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

function permissionsEqual(
  a: DriftPermissionMap | null,
  b: DriftPermissionMap | null,
): boolean {
  const modules = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const module of modules) {
    for (const level of LEVELS) {
      if (hasLevel(a?.[module], level) !== hasLevel(b?.[module], level)) {
        return false;
      }
    }
  }
  return true;
}

function scopeEqual(input: {
  stationScopeA: string | null | undefined;
  stationIdsA: unknown;
  fieldAgentA: boolean;
  stationScopeB: string | null | undefined;
  stationIdsB: unknown;
  fieldAgentB: boolean;
}): boolean {
  const idsA = [...parseStationIds(input.stationIdsA)].sort();
  const idsB = [...parseStationIds(input.stationIdsB)].sort();
  return (
    (input.stationScopeA ?? null) === (input.stationScopeB ?? null) &&
    idsA.join(',') === idsB.join(',') &&
    input.fieldAgentA === input.fieldAgentB
  );
}

export function buildScopeDiff(input: {
  membership: DriftMembershipInput;
  role: DriftRoleTemplate | null;
}): DriftScopeDiff {
  const stationScopeBefore = input.membership.stationScope ?? null;
  const stationScopeAfter = input.role?.stationScopeDefault ?? null;
  const stationIdsBefore = parseStationIds(input.membership.stationIds);
  const stationIdsAfter = parseStationIds(input.role?.defaultStationIds);
  const fieldAgentAccessBefore = input.membership.fieldAgentAccess;
  const fieldAgentAccessAfter = input.role?.fieldAgentAccessDefault ?? false;
  const differs = !scopeEqual({
    stationScopeA: stationScopeBefore,
    stationIdsA: input.membership.stationIds,
    fieldAgentA: fieldAgentAccessBefore,
    stationScopeB: stationScopeAfter,
    stationIdsB: input.role?.defaultStationIds,
    fieldAgentB: fieldAgentAccessAfter,
  });
  return {
    stationScopeBefore,
    stationScopeAfter,
    stationIdsBefore,
    stationIdsAfter,
    fieldAgentAccessBefore,
    fieldAgentAccessAfter,
    differs,
  };
}

export function deriveExplicitOverrides(input: {
  rolePermissions: DriftPermissionMap | null;
  membershipPermissions: DriftPermissionMap | null;
}): DerivedPermissionOverride[] | null {
  const rolePerms = input.rolePermissions ?? {};
  const membershipPerms = input.membershipPermissions ?? {};
  const modules = new Set([
    ...Object.keys(rolePerms),
    ...Object.keys(membershipPerms),
  ]);
  const overrides: DerivedPermissionOverride[] = [];

  for (const moduleKey of modules) {
    const roleFlags = rolePerms[moduleKey];
    const memberFlags = membershipPerms[moduleKey];
    for (const level of LEVELS) {
      const roleHas = hasLevel(roleFlags, level);
      const memberHas = hasLevel(memberFlags, level);
      if (roleHas === memberHas) continue;
      overrides.push({
        moduleKey,
        permissionLevel: level,
        effect: memberHas ? 'ALLOW' : 'DENY',
      });
    }
  }

  const recomposed = applyDerivedOverrides(rolePerms, overrides);
  if (!permissionsEqual(recomposed, membershipPerms)) {
    return null;
  }
  return overrides;
}

function applyDerivedOverrides(
  base: DriftPermissionMap,
  overrides: DerivedPermissionOverride[],
): DriftPermissionMap {
  const out: DriftPermissionMap = {};
  for (const [key, flags] of Object.entries(base)) {
    out[key] = { ...flags };
  }
  for (const override of overrides) {
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

function findMatchingHistoricalVersion(input: {
  membershipPermissions: DriftPermissionMap | null;
  membership: DriftMembershipInput;
  role: DriftRoleTemplate | null;
  versions: DriftRoleVersionSnapshot[];
}): DriftRoleVersionSnapshot | null {
  for (const version of [...input.versions].sort((a, b) => b.version - a.version)) {
    const versionPerms = normalizeDriftPermissions(version.permissions);
    const scopeMatches = scopeEqual({
      stationScopeA: input.membership.stationScope,
      stationIdsA: input.membership.stationIds,
      fieldAgentA: input.membership.fieldAgentAccess,
      stationScopeB: version.defaultStationScope,
      stationIdsB: version.defaultStationIds,
      fieldAgentB: version.fieldAgentAccess,
    });
    if (
      permissionsEqual(versionPerms, input.membershipPermissions) &&
      scopeMatches
    ) {
      return version;
    }
  }
  return null;
}

export function isAutoApplicableClassification(
  classification: DriftClassification,
): boolean {
  return (
    classification === 'EXACT_ROLE_MATCH' ||
    classification === 'STALE_ROLE_SNAPSHOT' ||
    classification === 'INTENTIONAL_OVERRIDE'
  );
}

export function classifyMembershipDrift(input: {
  membership: DriftMembershipInput;
  assignment: DriftAssignmentRecord | null;
  role: DriftRoleTemplate | null;
  roleVersions: DriftRoleVersionSnapshot[];
  latestApprovedVersion: DriftRoleVersionSnapshot | null;
}): {
  classification: DriftClassification;
  recommendedAssignmentMode: DriftRecommendedAssignmentMode | null;
  derivedOverrides: DerivedPermissionOverride[];
  applyEligible: boolean;
  reviewRequired: boolean;
  classificationReason: string;
  matchedHistoricalVersion: DriftRoleVersionSnapshot | null;
} {
  const { membership, assignment, role, roleVersions, latestApprovedVersion } = input;
  const membershipPermissions = normalizeDriftPermissions(membership.permissions);
  const rolePermissions = normalizeDriftPermissions(role?.permissions);
  const invalidKeys = findInvalidPermissionKeys(membership.permissions);

  if (!assignment || !assignment.isCurrent) {
    return {
      classification: 'NO_ROLE_ASSIGNMENT',
      recommendedAssignmentMode: null,
      derivedOverrides: [],
      applyEligible: false,
      reviewRequired: true,
      classificationReason: 'No current organization role assignment record',
      matchedHistoricalVersion: null,
    };
  }

  if (membership.status !== 'ACTIVE' || role?.isActive === false) {
    return {
      classification: 'DISABLED_ROLE_ASSIGNMENT',
      recommendedAssignmentMode: null,
      derivedOverrides: [],
      applyEligible: false,
      reviewRequired: true,
      classificationReason:
        membership.status !== 'ACTIVE'
          ? `Membership status is ${membership.status}`
          : 'Linked organization role template is inactive',
      matchedHistoricalVersion: null,
    };
  }

  if (invalidKeys.length > 0) {
    return {
      classification: 'INVALID_PERMISSION_KEY',
      recommendedAssignmentMode: null,
      derivedOverrides: [],
      applyEligible: false,
      reviewRequired: true,
      classificationReason: `Unknown permission module keys: ${invalidKeys.join(', ')}`,
      matchedHistoricalVersion: null,
    };
  }

  if (!membership.organizationRoleId && !assignment.organizationRoleId) {
    return {
      classification: 'UNKNOWN_ROLE_SOURCE',
      recommendedAssignmentMode: null,
      derivedOverrides: [],
      applyEligible: false,
      reviewRequired: true,
      classificationReason: 'Membership has no linked organization role template',
      matchedHistoricalVersion: null,
    };
  }

  if (!role) {
    return {
      classification: 'UNKNOWN_ROLE_SOURCE',
      recommendedAssignmentMode: null,
      derivedOverrides: [],
      applyEligible: false,
      reviewRequired: true,
      classificationReason: 'Assignment references a missing organization role template',
      matchedHistoricalVersion: null,
    };
  }

  const scopeDiff = buildScopeDiff({ membership, role });
  const permissionsMatchRole =
    permissionsEqual(membershipPermissions, rolePermissions) && !scopeDiff.differs;

  if (permissionsMatchRole) {
    return {
      classification: 'EXACT_ROLE_MATCH',
      recommendedAssignmentMode: 'FOLLOW_LATEST_APPROVED_VERSION',
      derivedOverrides: [],
      applyEligible: true,
      reviewRequired: false,
      classificationReason: 'Membership snapshot matches current role template exactly',
      matchedHistoricalVersion: latestApprovedVersion,
    };
  }

  const membershipPrivileged = membershipHasEffectiveAdminPrivileges({
    membershipRole: membership.role,
    permissions: membershipPermissions,
  });
  const rolePrivileged = membershipHasEffectiveAdminPrivileges({
    membershipRole: role.membershipRole,
    permissions: rolePermissions,
  });
  if (membershipPrivileged !== rolePrivileged) {
    return {
      classification: 'PRIVILEGED_DRIFT',
      recommendedAssignmentMode: null,
      derivedOverrides: [],
      applyEligible: false,
      reviewRequired: true,
      classificationReason: 'Effective privileged capabilities differ from role template',
      matchedHistoricalVersion: null,
    };
  }

  const matchedHistoricalVersion = findMatchingHistoricalVersion({
    membershipPermissions,
    membership,
    role,
    versions: roleVersions,
  });

  if (
    matchedHistoricalVersion &&
    latestApprovedVersion &&
    matchedHistoricalVersion.version < latestApprovedVersion.version
  ) {
    return {
      classification: 'STALE_ROLE_SNAPSHOT',
      recommendedAssignmentMode: 'FOLLOW_LATEST_APPROVED_VERSION',
      derivedOverrides: [],
      applyEligible: true,
      reviewRequired: false,
      classificationReason: `Membership snapshot matches historical role version ${matchedHistoricalVersion.version}`,
      matchedHistoricalVersion,
    };
  }

  const derivedOverrides = deriveExplicitOverrides({
    rolePermissions,
    membershipPermissions,
  });

  if (derivedOverrides && derivedOverrides.length > 0) {
    return {
      classification: 'INTENTIONAL_OVERRIDE',
      recommendedAssignmentMode: 'FOLLOW_LATEST_APPROVED_VERSION',
      derivedOverrides,
      applyEligible: true,
      reviewRequired: false,
      classificationReason: 'Membership delta is fully expressible as explicit permission overrides',
      matchedHistoricalVersion: null,
    };
  }

  if (derivedOverrides && derivedOverrides.length === 0 && !permissionsMatchRole) {
    return {
      classification: 'UNKNOWN_ROLE_SOURCE',
      recommendedAssignmentMode: null,
      derivedOverrides: [],
      applyEligible: false,
      reviewRequired: true,
      classificationReason: 'Permission delta cannot be expressed without guessing',
      matchedHistoricalVersion: null,
    };
  }

  return {
    classification: 'PRIVILEGED_DRIFT',
    recommendedAssignmentMode: null,
    derivedOverrides: [],
    applyEligible: false,
    reviewRequired: true,
    classificationReason: 'Unexplained permission drift requires manual review',
    matchedHistoricalVersion: null,
  };
}

export function buildRoleAssignmentDriftEvidencePackage(input: {
  organizationId: string;
  membership: DriftMembershipInput;
  assignment: DriftAssignmentRecord | null;
  role: DriftRoleTemplate | null;
  roleVersions: DriftRoleVersionSnapshot[];
  latestApprovedVersion: DriftRoleVersionSnapshot | null;
  existingOverrides: DriftPermissionOverrideRecord[];
  auditHistory: DriftAuditHistoryEntry[];
  sessions: DriftSessionSummary;
  membershipAlias: string;
  userAlias: string;
}): RoleAssignmentDriftEvidencePackage {
  const membershipPermissions = normalizeDriftPermissions(input.membership.permissions);
  const rolePermissions = normalizeDriftPermissions(input.role?.permissions);
  const classificationResult = classifyMembershipDrift({
    membership: input.membership,
    assignment: input.assignment,
    role: input.role,
    roleVersions: input.roleVersions,
    latestApprovedVersion: input.latestApprovedVersion,
  });
  const permissionDiff = diffPermissionGrants(rolePermissions, membershipPermissions);
  const scopeDiff = buildScopeDiff({
    membership: input.membership,
    role: input.role,
  });

  const body: Omit<RoleAssignmentDriftEvidencePackage, 'evidenceHash'> = {
    evidenceVersion: EVIDENCE_VERSION,
    organizationId: input.organizationId,
    membershipAlias: input.membershipAlias,
    membershipId: input.membership.id,
    userAlias: input.userAlias,
    userId: input.membership.userId,
    membership: {
      status: input.membership.status,
      role: input.membership.role,
      membershipVersion: input.membership.membershipVersion,
      organizationRoleId: input.membership.organizationRoleId ?? null,
    },
    currentMembershipPermissions: membershipPermissions,
    currentRole: {
      id: input.role?.id ?? null,
      name: input.role?.name ?? null,
      isActive: input.role?.isActive ?? null,
      membershipRole: input.role?.membershipRole ?? null,
      permissions: rolePermissions,
    },
    historicalRoleVersions: input.roleVersions,
    matchedHistoricalVersion: classificationResult.matchedHistoricalVersion,
    currentAssignment: input.assignment,
    existingOverrides: input.existingOverrides,
    permissionDiff,
    scopeDiff,
    auditHistory: input.auditHistory,
    sessions: input.sessions,
    classification: classificationResult.classification,
    recommendedAssignmentMode: classificationResult.recommendedAssignmentMode,
    derivedOverrides: classificationResult.derivedOverrides,
    applyEligible: classificationResult.applyEligible,
    reviewRequired: classificationResult.reviewRequired,
    classificationReason: classificationResult.classificationReason,
  };

  return {
    ...body,
    evidenceHash: hashEvidencePackage(body),
  };
}

export function buildDriftAuditReport(input: {
  organizationId: string | null;
  organizationAlias: string | null;
  gitCommit: string | null;
  mode: 'read-only' | 'apply';
  writesPerformed: boolean;
  evidencePackages: RoleAssignmentDriftEvidencePackage[];
}): RoleAssignmentDriftAuditReport {
  const byClassification = Object.fromEntries(
    DRIFT_CLASSIFICATIONS.map((c) => [c, 0]),
  ) as Record<DriftClassification, number>;

  for (const pkg of input.evidencePackages) {
    byClassification[pkg.classification] += 1;
  }

  const body: Omit<RoleAssignmentDriftAuditReport, 'reportHash'> = {
    auditId: 'users-roles-production-readiness-2026-07',
    phase: 12,
    mode: input.mode,
    writesPerformed: input.writesPerformed,
    organizationId: input.organizationId,
    organizationAlias: input.organizationAlias,
    gitCommit: input.gitCommit,
    completedAt: new Date().toISOString(),
    summary: {
      totalMemberships: input.evidencePackages.length,
      applyEligibleCount: input.evidencePackages.filter((p) => p.applyEligible).length,
      reviewRequiredCount: input.evidencePackages.filter((p) => p.reviewRequired).length,
      byClassification,
    },
    evidencePackages: input.evidencePackages,
  };

  return {
    ...body,
    reportHash: hashDriftAuditReport(body),
  };
}

export function validateEvidencePackageAgainstInput(
  stored: RoleAssignmentDriftEvidencePackage,
  current: RoleAssignmentDriftEvidencePackage,
): { valid: boolean; reason?: string } {
  if (stored.evidenceVersion !== current.evidenceVersion) {
    return { valid: false, reason: 'evidence_version_mismatch' };
  }
  if (stored.organizationId !== current.organizationId) {
    return { valid: false, reason: 'cross_tenant' };
  }
  if (stored.membershipId !== current.membershipId) {
    return { valid: false, reason: 'membership_mismatch' };
  }
  if (stored.classification !== current.classification) {
    return { valid: false, reason: 'classification_changed' };
  }
  if (stored.evidenceHash !== hashEvidencePackage(current)) {
    return { valid: false, reason: 'stale_evidence_hash' };
  }
  return { valid: true };
}
