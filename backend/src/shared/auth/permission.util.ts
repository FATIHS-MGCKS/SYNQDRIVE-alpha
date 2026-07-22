import { ForbiddenException } from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import {
  computeEffectiveAccess,
  isModuleAccessAllowed,
} from '@modules/users/policies/effective-access-engine';
import {
  PERMISSION_MODULE_KEYS,
  type PermissionModuleKey,
} from './permission.constants';
import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';

export interface ModulePermissionFlags {
  read: boolean;
  write: boolean;
  manage?: boolean;
}

export type MembershipPermissionsMap = Partial<
  Record<PermissionModuleKey, ModulePermissionFlags>
>;

const MODULE_KEY_SET = new Set<string>(PERMISSION_MODULE_KEYS);

export function isKnownPermissionModule(key: string): key is PermissionModuleKey {
  return MODULE_KEY_SET.has(key);
}

/**
 * Strips unknown modules and coerces flags to booleans.
 * Unknown keys are dropped — never open-by-default.
 */
export function normalizeMembershipPermissions(
  raw: unknown,
): MembershipPermissionsMap | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;

  const out: MembershipPermissionsMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isKnownPermissionModule(key)) continue;
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

export function evaluateModulePermission(
  permissions: MembershipPermissionsMap | null,
  module: string,
  level: PermissionLevel,
  options: {
    membershipRole?: MembershipRole;
    platformRole?: string | null;
    membershipStatus?: MembershipStatus;
  } = {},
): boolean {
  const result = computeEffectiveAccess({
    platformRole: options.platformRole,
    membership: {
      role: options.membershipRole ?? MembershipRole.WORKER,
      status: options.membershipStatus ?? MembershipStatus.ACTIVE,
      permissions,
    },
  });
  return isModuleAccessAllowed(result, module, level);
}

export interface PermissionActor {
  id?: string;
  platformRole?: string;
  membershipRole?: string;
  organizationId?: string;
}

export interface PermissionOrgRequest {
  params?: { orgId?: string };
  query?: { orgId?: string | string[] };
}

/**
 * Resolve org id for permission checks on routes without `:orgId` path params
 * (e.g. tenant billing under `/billing/*`).
 *
 * Resolution: path param → query `orgId` → JWT `organizationId`.
 * Non–master-admin users cannot request a different org via param/query.
 */
export function resolvePermissionOrgId(
  request: PermissionOrgRequest,
  user: PermissionActor,
): string | undefined {
  const paramOrgId = request.params?.orgId;
  const rawQueryOrgId = request.query?.orgId;
  const queryOrgId = Array.isArray(rawQueryOrgId)
    ? rawQueryOrgId[0]
    : rawQueryOrgId;
  const jwtOrgId = user.organizationId;

  if (user.platformRole === 'MASTER_ADMIN') {
    return paramOrgId || queryOrgId;
  }

  const requestedOrgId = paramOrgId || queryOrgId;

  if (requestedOrgId) {
    if (jwtOrgId && requestedOrgId !== jwtOrgId) {
      throw new ForbiddenException('You do not have access to this organization');
    }
    return requestedOrgId;
  }

  return jwtOrgId;
}

/**
 * Service-layer check when a single endpoint mixes read/write/manage concerns.
 */
export async function assertMembershipPermission(
  prisma: {
    organizationMembership: {
      findFirst: (args: unknown) => Promise<{
        id: string;
        organizationId: string;
        role: MembershipRole;
        status: MembershipStatus;
        permissions: unknown;
        stationScope: string | null;
        stationIds: unknown;
        fieldAgentAccess: boolean;
        membershipVersion: number;
        organizationRoleId: string | null;
        organizationRole?: {
          id: string;
          permissions: unknown;
          membershipRole: MembershipRole;
          stationScopeDefault: string | null;
          defaultStationIds: unknown;
          fieldAgentAccessDefault: boolean;
        } | null;
      } | null>;
    };
  },
  actor: PermissionActor,
  orgId: string,
  module: string,
  level: PermissionLevel,
): Promise<void> {
  if (actor.platformRole === 'MASTER_ADMIN') return;

  if (!actor.id) {
    throw new ForbiddenException('Authentication required');
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId: actor.id,
      organizationId: orgId,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      organizationId: true,
      role: true,
      status: true,
      permissions: true,
      stationScope: true,
      stationIds: true,
      fieldAgentAccess: true,
      membershipVersion: true,
      organizationRoleId: true,
      organizationRole: {
        select: {
          id: true,
          permissions: true,
          membershipRole: true,
          stationScopeDefault: true,
          defaultStationIds: true,
          fieldAgentAccessDefault: true,
        },
      },
    },
  });

  if (!membership) {
    throw new ForbiddenException('You do not have access to this organization');
  }

  const access = computeEffectiveAccess({
    platformRole: actor.platformRole,
    membership: {
      id: membership.id,
      organizationId: membership.organizationId,
      role: membership.role,
      status: membership.status ?? MembershipStatus.ACTIVE,
      permissions: membership.permissions,
      stationScope: membership.stationScope,
      stationIds: membership.stationIds,
      fieldAgentAccess: membership.fieldAgentAccess,
      membershipVersion: membership.membershipVersion,
      organizationRoleId: membership.organizationRoleId,
    },
    organizationRole: membership.organizationRole
      ? {
          id: membership.organizationRole.id,
          permissions: membership.organizationRole.permissions,
          membershipRole: membership.organizationRole.membershipRole,
          stationScopeDefault: membership.organizationRole.stationScopeDefault,
          defaultStationIds: membership.organizationRole.defaultStationIds,
          fieldAgentAccessDefault:
            membership.organizationRole.fieldAgentAccessDefault,
        }
      : null,
    resourceContext: { organizationId: orgId },
  });

  if (!isModuleAccessAllowed(access, module, level)) {
    throw new ForbiddenException(`Missing permission: ${module}.${level}`);
  }
}
