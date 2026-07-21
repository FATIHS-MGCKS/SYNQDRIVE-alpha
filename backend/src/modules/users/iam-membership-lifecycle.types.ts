import {
  MembershipRole,
  MembershipStatus,
  Prisma,
} from '@prisma/client';
import type { MembershipPermissionsMap } from '@shared/auth/permission.util';

export interface MembershipLifecycleActor {
  userId?: string;
  route?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface JoinMembershipInput {
  organizationId: string;
  userId: string;
  idempotencyKey: string;
  actor?: MembershipLifecycleActor;
  role: MembershipRole;
  organizationRoleId?: string | null;
  roleLabel?: string | null;
  stationScope?: string | null;
  stationIds?: string[] | null;
  department?: string | null;
  position?: string | null;
  permissions?: MembershipPermissionsMap | null;
  fieldAgentAccess?: boolean;
  mfaRequired?: boolean;
  source: 'invite' | 'provisioning';
  inviteId?: string;
  reason?: string;
}

export interface MoveMembershipInput {
  organizationId: string;
  userId: string;
  idempotencyKey: string;
  actor?: MembershipLifecycleActor;
  role?: MembershipRole;
  organizationRoleId?: string | null;
  roleLabel?: string | null;
  stationScope?: string | null;
  stationIds?: string[] | null;
  permissions?: MembershipPermissionsMap | null;
  fieldAgentAccess?: boolean;
  reason?: string;
}

export interface SuspendMembershipInput {
  organizationId: string;
  userId: string;
  idempotencyKey: string;
  actor?: MembershipLifecycleActor;
  reason?: string;
}

export interface RemoveMembershipInput {
  organizationId: string;
  userId: string;
  idempotencyKey: string;
  actor?: MembershipLifecycleActor;
  reason?: string;
  force?: boolean;
}

export interface ReactivateMembershipInput {
  organizationId: string;
  userId: string;
  idempotencyKey: string;
  actor?: MembershipLifecycleActor;
  role: MembershipRole;
  organizationRoleId?: string | null;
  roleLabel?: string | null;
  stationScope?: string | null;
  stationIds?: string[] | null;
  permissions?: MembershipPermissionsMap | null;
  fieldAgentAccess?: boolean;
  mfaRequired?: boolean;
  reason?: string;
}

export interface PermissionChangePreview {
  gained: string[];
  lost: string[];
  unchanged: string[];
}

export interface MoveMembershipPreview {
  membershipId: string;
  currentVersion: number;
  nextVersion: number;
  permissionChanges: PermissionChangePreview;
  scopeChanged: boolean;
  roleChanged: boolean;
  sessionInvalidationRequired: boolean;
  mfaRequired: boolean;
}

export interface OwnershipConflict {
  type: 'open_tasks' | 'automation_override';
  count: number;
  message: string;
}

export interface LifecycleMutationResult {
  membershipId: string;
  status: MembershipStatus;
  membershipVersion: number;
  outboxIds: string[];
  sessionsRevoked: number;
  invitesRevoked: number;
  overridesCleared: number;
  ownershipConflicts: OwnershipConflict[];
  idempotent: boolean;
}

export type MembershipRecord = {
  id: string;
  userId: string;
  organizationId: string;
  role: MembershipRole;
  organizationRoleId: string | null;
  roleLabel: string | null;
  stationScope: string | null;
  stationIds: Prisma.JsonValue;
  permissions: Prisma.JsonValue;
  fieldAgentAccess: boolean;
  status: MembershipStatus;
  membershipVersion: number;
};
