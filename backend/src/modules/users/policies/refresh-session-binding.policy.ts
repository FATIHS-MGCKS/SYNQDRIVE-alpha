/**
 * Org/membership-bound refresh session policy (Prompt 7/22).
 * Pure domain — no Nest/Prisma imports.
 */

import { MembershipStatus } from '@prisma/client';

export const REFRESH_TOKEN_SCOPES = ['ORG_MEMBERSHIP_BOUND', 'LEGACY_UNSCOPED'] as const;
export type RefreshTokenScopeKind = (typeof REFRESH_TOKEN_SCOPES)[number];

export const SESSION_ASSURANCE_LEVELS = ['PASSWORD', 'MFA'] as const;
export type SessionAssuranceLevelKind = (typeof SESSION_ASSURANCE_LEVELS)[number];

export type LoginMembershipCandidate = {
  id: string;
  userId?: string;
  organizationId: string;
  role: string;
  status: MembershipStatus;
  membershipVersion: number;
  permissions?: unknown;
  organizationRoleId?: string | null;
  organization?: { companyName?: string | null; logoUrl?: string | null } | null;
};

export type LoginMembershipResolution =
  | { ok: true; membership: LoginMembershipCandidate | null }
  | {
      ok: false;
      code: 'ORGANIZATION_SELECTION_REQUIRED' | 'ORGANIZATION_NOT_ACCESSIBLE';
      message: string;
    };

export type RefreshBindingFailureCode =
  | 'MEMBERSHIP_NOT_FOUND'
  | 'MEMBERSHIP_INACTIVE'
  | 'MEMBERSHIP_REMOVED'
  | 'CROSS_TENANT_BINDING'
  | 'VERSION_MISMATCH'
  | 'LEGACY_UNSCOPED_REJECTED'
  | 'LEGACY_MULTI_ORG_AMBIGUOUS';

export type RefreshBindingResolution =
  | {
      ok: true;
      membership: LoginMembershipCandidate | null;
      scope: RefreshTokenScopeKind;
      upgradedFromLegacy: boolean;
    }
  | { ok: false; code: RefreshBindingFailureCode; message: string; auditEvent?: string };

export type StoredRefreshBinding = {
  scope?: RefreshTokenScopeKind | null;
  organizationId?: string | null;
  membershipId?: string | null;
  sessionVersion?: number | null;
  membershipVersion?: number | null;
  permissionVersion?: number | null;
  roleVersion?: number | null;
  userId: string;
};

export type VersionSnapshot = {
  sessionVersion: number;
  membershipVersion: number | null;
  permissionVersion: number | null;
  roleVersion: number | null;
};

export function hashSnapshotValue(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function computePermissionVersionSnapshot(permissions: unknown): number {
  return hashSnapshotValue(JSON.stringify(permissions ?? {}));
}

export function computeRoleVersionSnapshot(
  role: string,
  organizationRoleId?: string | null,
): number {
  return hashSnapshotValue(`${role}:${organizationRoleId ?? ''}`);
}

export function buildVersionSnapshot(input: {
  sessionVersion: number;
  membership: LoginMembershipCandidate | null;
}): VersionSnapshot {
  if (!input.membership) {
    return {
      sessionVersion: input.sessionVersion,
      membershipVersion: null,
      permissionVersion: null,
      roleVersion: null,
    };
  }
  return {
    sessionVersion: input.sessionVersion,
    membershipVersion: input.membership.membershipVersion,
    permissionVersion: computePermissionVersionSnapshot(input.membership.permissions),
    roleVersion: computeRoleVersionSnapshot(
      input.membership.role,
      input.membership.organizationRoleId,
    ),
  };
}

export function resolveLoginMembership(
  activeMemberships: LoginMembershipCandidate[],
  options: {
    requestedOrganizationId?: string | null;
  } = {},
): LoginMembershipResolution {
  if (activeMemberships.length === 0) {
    return { ok: true, membership: null };
  }

  if (activeMemberships.length === 1) {
    return { ok: true, membership: activeMemberships[0]! };
  }

  if (!options.requestedOrganizationId) {
    return {
      ok: false,
      code: 'ORGANIZATION_SELECTION_REQUIRED',
      message:
        'Multiple organizations available — organizationId is required at login',
    };
  }

  const match = activeMemberships.find(
    (m) => m.organizationId === options.requestedOrganizationId,
  );
  if (!match) {
    return {
      ok: false,
      code: 'ORGANIZATION_NOT_ACCESSIBLE',
      message: 'You do not have access to the requested organization',
    };
  }
  return { ok: true, membership: match };
}

export function isOrgMembershipBoundScope(
  stored: Pick<StoredRefreshBinding, 'scope' | 'organizationId' | 'membershipId'>,
): boolean {
  if (stored.scope === 'ORG_MEMBERSHIP_BOUND') return true;
  return !!(stored.organizationId && stored.membershipId);
}

export function classifyRefreshTokenScope(
  membership: LoginMembershipCandidate | null,
): RefreshTokenScopeKind {
  return membership ? 'ORG_MEMBERSHIP_BOUND' : 'LEGACY_UNSCOPED';
}

export function assertMembershipOrgConsistency(
  stored: StoredRefreshBinding,
  membership: LoginMembershipCandidate,
): RefreshBindingResolution | { ok: true } {
  if (membership.userId && membership.userId !== stored.userId) {
    return {
      ok: false,
      code: 'CROSS_TENANT_BINDING',
      message: 'Membership does not belong to session user',
      auditEvent: 'REFRESH_CROSS_TENANT_REJECTED',
    };
  }
  if (
    stored.organizationId &&
    membership.organizationId !== stored.organizationId
  ) {
    return {
      ok: false,
      code: 'CROSS_TENANT_BINDING',
      message: 'Refresh token organization does not match membership',
      auditEvent: 'REFRESH_CROSS_TENANT_REJECTED',
    };
  }
  if (stored.membershipId && membership.id !== stored.membershipId) {
    return {
      ok: false,
      code: 'CROSS_TENANT_BINDING',
      message: 'Refresh token membership does not match resolved membership',
      auditEvent: 'REFRESH_CROSS_TENANT_REJECTED',
    };
  }
  return { ok: true };
}

export function resolveLegacyUnscopedRefreshBinding(
  stored: StoredRefreshBinding,
  activeMemberships: LoginMembershipCandidate[],
  options: {
    lastSelectedOrganizationId?: string | null;
    graceEnabled: boolean;
  },
): RefreshBindingResolution {
  if (!options.graceEnabled) {
    return {
      ok: false,
      code: 'LEGACY_UNSCOPED_REJECTED',
      message: 'Legacy unscoped session — please sign in again',
      auditEvent: 'REFRESH_LEGACY_UNSCOPED_REJECTED',
    };
  }

  if (activeMemberships.length === 1) {
    return {
      ok: true,
      membership: activeMemberships[0]!,
      scope: 'ORG_MEMBERSHIP_BOUND',
      upgradedFromLegacy: true,
    };
  }

  if (options.lastSelectedOrganizationId) {
    const last = activeMemberships.find(
      (m) => m.organizationId === options.lastSelectedOrganizationId,
    );
    if (last) {
      return {
        ok: true,
        membership: last,
        scope: 'ORG_MEMBERSHIP_BOUND',
        upgradedFromLegacy: true,
      };
    }
  }

  return {
    ok: false,
    code: 'LEGACY_MULTI_ORG_AMBIGUOUS',
    message:
      'Legacy session cannot be upgraded — sign in and select an organization',
    auditEvent: 'REFRESH_LEGACY_MULTI_ORG_REJECTED',
  };
}

export function resolveRefreshBinding(
  stored: StoredRefreshBinding,
  membership: LoginMembershipCandidate | null,
  activeMemberships: LoginMembershipCandidate[],
  options: {
    lastSelectedOrganizationId?: string | null;
    graceEnabled: boolean;
    orgBoundEnforced: boolean;
  },
): RefreshBindingResolution {
  if (!options.orgBoundEnforced) {
    const fallback = membership ?? activeMemberships[0] ?? null;
    return {
      ok: true,
      membership: fallback,
      scope: classifyRefreshTokenScope(fallback),
      upgradedFromLegacy: false,
    };
  }

  if (isOrgMembershipBoundScope(stored)) {
    if (!stored.membershipId || !stored.organizationId) {
      return {
        ok: false,
        code: 'LEGACY_UNSCOPED_REJECTED',
        message: 'Session is missing organization binding',
        auditEvent: 'REFRESH_BINDING_INCOMPLETE',
      };
    }
    if (!membership) {
      return {
        ok: false,
        code: 'MEMBERSHIP_NOT_FOUND',
        message: 'Organization membership no longer exists',
        auditEvent: 'REFRESH_MEMBERSHIP_NOT_FOUND',
      };
    }
    const consistency = assertMembershipOrgConsistency(stored, membership);
    if (!('ok' in consistency && consistency.ok)) {
      return consistency as RefreshBindingResolution;
    }
    if (membership.status !== MembershipStatus.ACTIVE) {
      const code =
        membership.status === MembershipStatus.REMOVED
          ? 'MEMBERSHIP_REMOVED'
          : 'MEMBERSHIP_INACTIVE';
      return {
        ok: false,
        code,
        message: 'Organization membership is no longer active',
        auditEvent:
          code === 'MEMBERSHIP_REMOVED'
            ? 'REFRESH_MEMBERSHIP_REMOVED'
            : 'REFRESH_MEMBERSHIP_SUSPENDED',
      };
    }
    return {
      ok: true,
      membership,
      scope: 'ORG_MEMBERSHIP_BOUND',
      upgradedFromLegacy: false,
    };
  }

  return resolveLegacyUnscopedRefreshBinding(stored, activeMemberships, {
    lastSelectedOrganizationId: options.lastSelectedOrganizationId,
    graceEnabled: options.graceEnabled,
  });
}

export function validateVersionSnapshots(
  stored: StoredRefreshBinding,
  current: VersionSnapshot,
): RefreshBindingResolution | { ok: true } {
  if (
    stored.sessionVersion != null &&
    stored.sessionVersion !== current.sessionVersion
  ) {
    return {
      ok: false,
      code: 'VERSION_MISMATCH',
      message: 'Session version mismatch — please sign in again',
      auditEvent: 'REFRESH_SESSION_VERSION_MISMATCH',
    };
  }
  if (
    stored.membershipVersion != null &&
    current.membershipVersion != null &&
    stored.membershipVersion !== current.membershipVersion
  ) {
    return {
      ok: false,
      code: 'VERSION_MISMATCH',
      message: 'Membership version mismatch — please sign in again',
      auditEvent: 'REFRESH_MEMBERSHIP_VERSION_MISMATCH',
    };
  }
  if (
    stored.permissionVersion != null &&
    current.permissionVersion != null &&
    stored.permissionVersion !== current.permissionVersion
  ) {
    return {
      ok: false,
      code: 'VERSION_MISMATCH',
      message: 'Permission version mismatch — please sign in again',
      auditEvent: 'REFRESH_PERMISSION_VERSION_MISMATCH',
    };
  }
  if (
    stored.roleVersion != null &&
    current.roleVersion != null &&
    stored.roleVersion !== current.roleVersion
  ) {
    return {
      ok: false,
      code: 'VERSION_MISMATCH',
      message: 'Role version mismatch — please sign in again',
      auditEvent: 'REFRESH_ROLE_VERSION_MISMATCH',
    };
  }
  return { ok: true };
}
