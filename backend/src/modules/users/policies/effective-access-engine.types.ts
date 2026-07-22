import { MembershipRole, MembershipStatus } from '@prisma/client';
import type { MembershipPermissionsMap } from '@shared/auth/permission.util';
import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';

/** Canonical access decision — UNKNOWN must never allow. */
export const ACCESS_DECISIONS = [
  'ALLOW',
  'DENY',
  'NOT_APPLICABLE',
  'UNKNOWN_CONFIGURATION',
] as const;

export type AccessDecision = (typeof ACCESS_DECISIONS)[number];

export const ROLE_SOURCES = [
  'MASTER_ADMIN',
  'SERVICE_ACCOUNT',
  'ORG_ADMIN',
  'template',
  'direct',
  'legacy',
  'none',
] as const;

export type RoleSource = (typeof ROLE_SOURCES)[number];

export const STATION_SCOPE_MODES = ['ALL', 'SELECTED', 'SINGLE', 'NONE'] as const;

export type StationScopeMode = (typeof STATION_SCOPE_MODES)[number];

export interface EffectiveAccessMembershipInput {
  id?: string;
  organizationId?: string;
  role: MembershipRole;
  status: MembershipStatus;
  permissions?: unknown;
  stationScope?: string | null;
  stationIds?: unknown;
  fieldAgentAccess?: boolean;
  membershipVersion?: number;
  organizationRoleId?: string | null;
}

export interface EffectiveAccessOrganizationRoleInput {
  id?: string;
  permissions?: unknown;
  membershipRole?: MembershipRole;
  stationScopeDefault?: string | null;
  defaultStationIds?: unknown;
  fieldAgentAccessDefault?: boolean;
}

export interface EffectiveAccessResourceContext {
  organizationId?: string;
  stationId?: string;
  stationsScopeV2Enabled?: boolean;
}

export interface EffectiveAccessInput {
  platformRole?: string | null;
  serviceAccount?: boolean;
  membership?: EffectiveAccessMembershipInput | null;
  organizationRole?: EffectiveAccessOrganizationRoleInput | null;
  /** Explicit permission overrides layered on top of inherited role permissions. */
  directPermissionOverrides?: unknown;
  resourceContext?: EffectiveAccessResourceContext;
}

export interface EffectiveAccessResult {
  effectiveRole: MembershipRole | 'MASTER_ADMIN' | null;
  roleSource: RoleSource;
  roleVersion: number | null;
  permissionVersion: number | null;
  inheritedPermissions: MembershipPermissionsMap | null;
  directOverrides: MembershipPermissionsMap | null;
  effectivePermissions: MembershipPermissionsMap | null;
  stationScope: StationScopeMode;
  effectiveStationIds: string[] | null;
  stationBypass: boolean;
  fieldAgentAccess: boolean;
  privilegedCapabilities: string[];
  deniedCapabilities: string[];
  decisionReasons: string[];
  calculatedAt: string;
  membershipActive: boolean;
}

export interface ModuleAccessEvaluation {
  decision: AccessDecision;
  module: string;
  level: PermissionLevel;
  reasons: string[];
}
