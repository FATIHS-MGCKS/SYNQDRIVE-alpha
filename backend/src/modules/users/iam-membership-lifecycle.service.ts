import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { assertNotLastActiveOrgAdmin } from './org-admin-protection.util';
import { IamAuditService } from './iam-audit.service';
import { UserAccessAuditAction } from './user-access-audit.service';
import {
  canJoinMembershipStatus,
  canMoveMembershipStatus,
  canReactivateMembershipStatus,
  canRemoveMembershipStatus,
  canSuspendMembershipStatus,
  diffMembershipPermissions,
  requiresMfaForRole,
  scopeReduced,
} from './iam-membership-lifecycle.policy';
import {
  clearMembershipOverrides,
  detectOwnershipConflicts,
  revokePendingInvitesForEmail,
  revokeUserRefreshTokens,
} from './iam-membership-lifecycle.side-effects';
import { IamMembershipLifecycleNotificationService } from './iam-membership-lifecycle-notification.service';
import type {
  JoinMembershipInput,
  LifecycleMutationResult,
  MembershipRecord,
  MoveMembershipInput,
  MoveMembershipPreview,
  ReactivateMembershipInput,
  RemoveMembershipInput,
  SuspendMembershipInput,
} from './iam-membership-lifecycle.types';

function stationIdsToJson(ids: string[] | null | undefined) {
  if (!ids || ids.length === 0) return Prisma.JsonNull;
  return ids;
}

@Injectable()
export class IamMembershipLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly iamAudit: IamAuditService,
    private readonly notifications: IamMembershipLifecycleNotificationService,
  ) {}

  async previewMove(
    organizationId: string,
    userId: string,
    input: Omit<MoveMembershipInput, 'idempotencyKey' | 'organizationId' | 'userId'>,
  ): Promise<MoveMembershipPreview> {
    const membership = await this.findMembershipOrThrow(organizationId, userId);
    if (!canMoveMembershipStatus(membership.status)) {
      throw new BadRequestException(`Cannot move membership in status ${membership.status}`);
    }

    const nextPermissions =
      input.permissions !== undefined
        ? input.permissions
        : (normalizeMembershipPermissions(membership.permissions) ?? null);
    const nextRole = input.role ?? membership.role;
    const nextScope = input.stationScope ?? membership.stationScope;
    const nextStationIds =
      input.stationIds !== undefined
        ? input.stationIds
        : Array.isArray(membership.stationIds)
          ? (membership.stationIds as string[])
          : null;

    const permissionChanges = diffMembershipPermissions(
      membership.permissions,
      nextPermissions,
    );

    return {
      membershipId: membership.id,
      currentVersion: membership.membershipVersion,
      nextVersion: membership.membershipVersion + 1,
      permissionChanges,
      scopeChanged:
        membership.stationScope !== nextScope ||
        JSON.stringify(membership.stationIds) !== JSON.stringify(nextStationIds),
      roleChanged: membership.role !== nextRole,
      sessionInvalidationRequired:
        permissionChanges.gained.length > 0 ||
        permissionChanges.lost.length > 0 ||
        membership.role !== nextRole ||
        scopeReduced(
          membership.stationScope,
          membership.stationIds,
          nextScope,
          nextStationIds,
        ),
      mfaRequired: requiresMfaForRole({ role: nextRole, permissions: nextPermissions }),
    };
  }

  async applyJoinInTransaction(
    tx: Prisma.TransactionClient,
    input: JoinMembershipInput,
    existing?: MembershipRecord | null,
  ) {
    const mfaRequired =
      input.mfaRequired ??
      requiresMfaForRole({ role: input.role, permissions: input.permissions ?? null });

    const data = {
      role: input.role,
      organizationRoleId: input.organizationRoleId ?? null,
      roleLabel: input.roleLabel ?? null,
      stationScope: input.stationScope ?? null,
      stationIds: stationIdsToJson(input.stationIds),
      department: input.department ?? null,
      position: input.position ?? null,
      permissions: input.permissions
        ? (input.permissions as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      fieldAgentAccess: input.fieldAgentAccess ?? false,
      status: MembershipStatus.ACTIVE,
      membershipVersion: existing ? { increment: 1 } : 1,
    };

    const row = existing
      ? await tx.organizationMembership.update({
          where: { id: existing.id },
          data,
        })
      : await tx.organizationMembership.create({
          data: {
            userId: input.userId,
            organizationId: input.organizationId,
            ...data,
            membershipVersion: 1,
          },
        });

    const outbox = await this.iamAudit.enqueueInTransaction(tx, {
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      eventType: UserAccessAuditAction.MEMBERSHIP_JOINED,
      actorUserId: input.actor?.userId,
      subjectUserId: input.userId,
      membershipId: row.id,
      description: `Membership joined via ${input.source}`,
      after: {
        status: row.status,
        role: row.role,
        membershipVersion: row.membershipVersion,
        mfaRequired,
        sessionEligible: !mfaRequired,
      },
      metadata: {
        source: input.source,
        inviteId: input.inviteId ?? null,
      },
      reason: input.reason,
      route: input.actor?.route,
      ipAddress: input.actor?.ipAddress,
      userAgent: input.actor?.userAgent,
    });

    return { row, outboxId: outbox.id, mfaRequired };
  }

  async join(input: JoinMembershipInput): Promise<LifecycleMutationResult> {
    const existing = await this.prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: input.userId,
          organizationId: input.organizationId,
        },
      },
    });

    if (existing?.status === MembershipStatus.ACTIVE) {
      return this.idempotentResult(existing, input.idempotencyKey);
    }
    if (existing && !canJoinMembershipStatus(existing.status)) {
      throw new BadRequestException(
        `Membership join blocked for status ${existing.status}`,
      );
    }

    const outboxIds: string[] = [];

    const membership = await this.prisma.$transaction(async (tx) => {
      const applied = await this.applyJoinInTransaction(tx, input, existing);
      outboxIds.push(applied.outboxId);
      return applied.row;
    });

    await this.iamAudit.processOutboxIds(outboxIds);
    const result: LifecycleMutationResult = {
      membershipId: membership.id,
      status: membership.status,
      membershipVersion: membership.membershipVersion,
      outboxIds,
      sessionsRevoked: 0,
      invitesRevoked: 0,
      overridesCleared: 0,
      ownershipConflicts: [],
      idempotent: false,
    };

    await this.notifications.notifyAfterCommit({
      organizationId: input.organizationId,
      userId: input.userId,
      event: 'joined',
      result,
      description: 'Benutzer ist der Organisation beigetreten',
    });

    return result;
  }

  async move(input: MoveMembershipInput): Promise<LifecycleMutationResult> {
    const preview = await this.previewMove(input.organizationId, input.userId, input);
    const membership = await this.findMembershipOrThrow(input.organizationId, input.userId);

    if (input.role !== undefined && input.role !== membership.role) {
      if (membership.role === MembershipRole.ORG_ADMIN) {
        await assertNotLastActiveOrgAdmin(this.prisma, input.organizationId, input.userId);
      }
    }

    const outboxIds: string[] = [];
    let sessionsRevoked = 0;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.organizationMembership.update({
        where: { id: membership.id },
        data: {
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.organizationRoleId !== undefined
            ? { organizationRoleId: input.organizationRoleId }
            : {}),
          ...(input.roleLabel !== undefined ? { roleLabel: input.roleLabel } : {}),
          ...(input.stationScope !== undefined || input.stationIds !== undefined
            ? {
                stationScope: input.stationScope ?? membership.stationScope,
                stationIds: stationIdsToJson(
                  input.stationIds ??
                    (Array.isArray(membership.stationIds)
                      ? (membership.stationIds as string[])
                      : null),
                ),
              }
            : {}),
          ...(input.permissions !== undefined
            ? {
                permissions: input.permissions
                  ? (input.permissions as unknown as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
              }
            : {}),
          ...(input.fieldAgentAccess !== undefined
            ? { fieldAgentAccess: input.fieldAgentAccess }
            : {}),
          membershipVersion: { increment: 1 },
        },
      });

      if (preview.sessionInvalidationRequired) {
        sessionsRevoked = await revokeUserRefreshTokens(tx, input.userId);
      }

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
        eventType: UserAccessAuditAction.MEMBERSHIP_MOVED,
        actorUserId: input.actor?.userId,
        subjectUserId: input.userId,
        membershipId: row.id,
        description: 'Membership access changed (mover)',
        before: {
          role: membership.role,
          permissions: membership.permissions,
          stationScope: membership.stationScope,
          membershipVersion: membership.membershipVersion,
        },
        after: {
          role: row.role,
          permissions: row.permissions,
          stationScope: row.stationScope,
          membershipVersion: row.membershipVersion,
          permissionGain: preview.permissionChanges.gained,
          permissionLoss: preview.permissionChanges.lost,
          sessionsRevoked,
        },
        reason: input.reason,
        route: input.actor?.route,
        ipAddress: input.actor?.ipAddress,
        userAgent: input.actor?.userAgent,
        level: preview.permissionChanges.lost.length > 0 ? 'WARN' : 'INFO',
      });
      outboxIds.push(outbox.id);
      return row;
    });

    await this.iamAudit.processOutboxIds(outboxIds);
    const result: LifecycleMutationResult = {
      membershipId: updated.id,
      status: updated.status,
      membershipVersion: updated.membershipVersion,
      outboxIds,
      sessionsRevoked,
      invitesRevoked: 0,
      overridesCleared: 0,
      ownershipConflicts: [],
      idempotent: false,
    };

    await this.notifications.notifyAfterCommit({
      organizationId: input.organizationId,
      userId: input.userId,
      event: 'moved',
      result,
      description: 'Mitgliedschafts-Zugriff geändert',
      level: preview.permissionChanges.lost.length > 0 ? 'WARN' : 'INFO',
    });

    return result;
  }

  async suspend(input: SuspendMembershipInput): Promise<LifecycleMutationResult> {
    const membership = await this.findMembershipOrThrow(input.organizationId, input.userId);
    if (!canSuspendMembershipStatus(membership.status)) {
      throw new BadRequestException(`Cannot suspend membership in status ${membership.status}`);
    }
    await assertNotLastActiveOrgAdmin(this.prisma, input.organizationId, input.userId);

    return this.executeLeaver({
      ...input,
      targetStatus: MembershipStatus.SUSPENDED,
      auditAction: UserAccessAuditAction.MEMBERSHIP_SUSPENDED,
      event: 'suspended',
      description: 'Mitgliedschaft suspendiert',
    });
  }

  async remove(input: RemoveMembershipInput): Promise<LifecycleMutationResult> {
    const membership = await this.findMembershipOrThrow(input.organizationId, input.userId);
    if (!canRemoveMembershipStatus(membership.status)) {
      throw new BadRequestException(`Cannot remove membership in status ${membership.status}`);
    }
    await assertNotLastActiveOrgAdmin(this.prisma, input.organizationId, input.userId);

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const ownershipConflicts = await detectOwnershipConflicts(
      this.prisma,
      input.organizationId,
      input.userId,
    );
    if (ownershipConflicts.length > 0 && !input.force) {
      throw new BadRequestException({
        code: 'MEMBERSHIP_OWNERSHIP_CONFLICT',
        message: 'Membership cannot be removed while ownership conflicts exist',
        conflicts: ownershipConflicts,
      });
    }

    const outboxIds: string[] = [];
    let sessionsRevoked = 0;
    let invitesRevoked = 0;
    let overridesCleared = 0;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.organizationMembership.update({
        where: { id: membership.id },
        data: {
          status: MembershipStatus.REMOVED,
          membershipVersion: { increment: 1 },
        },
      });

      sessionsRevoked = await revokeUserRefreshTokens(tx, input.userId);
      invitesRevoked = await revokePendingInvitesForEmail(
        tx,
        input.organizationId,
        user.email,
      );
      overridesCleared = await clearMembershipOverrides(
        tx,
        input.organizationId,
        input.userId,
      );

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
        eventType: UserAccessAuditAction.MEMBERSHIP_REMOVED,
        actorUserId: input.actor?.userId,
        subjectUserId: input.userId,
        membershipId: row.id,
        description: 'Mitgliedschaft entfernt (leaver)',
        before: {
          status: membership.status,
          role: membership.role,
          membershipVersion: membership.membershipVersion,
        },
        after: {
          status: row.status,
          membershipVersion: row.membershipVersion,
          sessionsRevoked,
          invitesRevoked,
          overridesCleared,
          ownershipConflicts,
        },
        reason: input.reason,
        route: input.actor?.route,
        ipAddress: input.actor?.ipAddress,
        userAgent: input.actor?.userAgent,
        level: 'WARN',
      });
      outboxIds.push(outbox.id);
      return row;
    });

    await this.iamAudit.processOutboxIds(outboxIds);
    const result: LifecycleMutationResult = {
      membershipId: updated.id,
      status: updated.status,
      membershipVersion: updated.membershipVersion,
      outboxIds,
      sessionsRevoked,
      invitesRevoked,
      overridesCleared,
      ownershipConflicts,
      idempotent: false,
    };

    await this.notifications.notifyAfterCommit({
      organizationId: input.organizationId,
      userId: input.userId,
      event: 'removed',
      result,
      description: 'Mitgliedschaft entfernt',
      level: 'WARN',
    });

    return result;
  }

  async reactivate(input: ReactivateMembershipInput): Promise<LifecycleMutationResult> {
    const membership = await this.findMembershipOrThrow(input.organizationId, input.userId);
    if (!canReactivateMembershipStatus(membership.status)) {
      throw new BadRequestException(
        `Cannot reactivate membership in status ${membership.status}`,
      );
    }

    const outboxIds: string[] = [];
    const mfaRequired =
      input.mfaRequired ??
      requiresMfaForRole({ role: input.role, permissions: input.permissions ?? null });

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.organizationMembership.update({
        where: { id: membership.id },
        data: {
          role: input.role,
          organizationRoleId: input.organizationRoleId ?? null,
          roleLabel: input.roleLabel ?? null,
          stationScope: input.stationScope ?? null,
          stationIds: stationIdsToJson(input.stationIds),
          permissions: input.permissions
            ? (input.permissions as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          fieldAgentAccess: input.fieldAgentAccess ?? false,
          status: MembershipStatus.ACTIVE,
          membershipVersion: { increment: 1 },
        },
      });

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
        eventType: UserAccessAuditAction.MEMBERSHIP_REACTIVATED,
        actorUserId: input.actor?.userId,
        subjectUserId: input.userId,
        membershipId: row.id,
        description: 'Mitgliedschaft explizit reaktiviert',
        before: {
          status: membership.status,
          role: membership.role,
          membershipVersion: membership.membershipVersion,
        },
        after: {
          status: row.status,
          role: row.role,
          membershipVersion: row.membershipVersion,
          mfaRequired,
          explicitRoleAssignment: true,
        },
        reason: input.reason,
        route: input.actor?.route,
        ipAddress: input.actor?.ipAddress,
        userAgent: input.actor?.userAgent,
        level: 'WARN',
      });
      outboxIds.push(outbox.id);
      return row;
    });

    await this.iamAudit.processOutboxIds(outboxIds);
    const result: LifecycleMutationResult = {
      membershipId: updated.id,
      status: updated.status,
      membershipVersion: updated.membershipVersion,
      outboxIds,
      sessionsRevoked: 0,
      invitesRevoked: 0,
      overridesCleared: 0,
      ownershipConflicts: [],
      idempotent: false,
    };

    await this.notifications.notifyAfterCommit({
      organizationId: input.organizationId,
      userId: input.userId,
      event: 'reactivated',
      result,
      description: 'Mitgliedschaft reaktiviert',
      level: 'WARN',
    });

    return result;
  }

  private async executeLeaver(input: {
    organizationId: string;
    userId: string;
    idempotencyKey: string;
    actor?: SuspendMembershipInput['actor'];
    reason?: string;
    targetStatus: MembershipStatus;
    auditAction: (typeof UserAccessAuditAction)[keyof typeof UserAccessAuditAction];
    event: 'suspended' | 'removed';
    description: string;
  }): Promise<LifecycleMutationResult> {
    const membership = await this.findMembershipOrThrow(input.organizationId, input.userId);
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const ownershipConflicts = await detectOwnershipConflicts(
      this.prisma,
      input.organizationId,
      input.userId,
    );

    const outboxIds: string[] = [];
    let sessionsRevoked = 0;
    let invitesRevoked = 0;
    let overridesCleared = 0;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.organizationMembership.update({
        where: { id: membership.id },
        data: {
          status: input.targetStatus,
          membershipVersion: { increment: 1 },
        },
      });

      sessionsRevoked = await revokeUserRefreshTokens(tx, input.userId);
      invitesRevoked = await revokePendingInvitesForEmail(
        tx,
        input.organizationId,
        user.email,
      );
      overridesCleared = await clearMembershipOverrides(
        tx,
        input.organizationId,
        input.userId,
      );

      const outbox = await this.iamAudit.enqueueInTransaction(tx, {
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
        eventType: input.auditAction,
        actorUserId: input.actor?.userId,
        subjectUserId: input.userId,
        membershipId: row.id,
        description: input.description,
        before: {
          status: membership.status,
          membershipVersion: membership.membershipVersion,
        },
        after: {
          status: row.status,
          membershipVersion: row.membershipVersion,
          sessionsRevoked,
          invitesRevoked,
          overridesCleared,
          ownershipConflicts,
        },
        reason: input.reason,
        route: input.actor?.route,
        ipAddress: input.actor?.ipAddress,
        userAgent: input.actor?.userAgent,
        level: 'WARN',
      });
      outboxIds.push(outbox.id);
      return row;
    });

    await this.iamAudit.processOutboxIds(outboxIds);
    const result: LifecycleMutationResult = {
      membershipId: updated.id,
      status: updated.status,
      membershipVersion: updated.membershipVersion,
      outboxIds,
      sessionsRevoked,
      invitesRevoked,
      overridesCleared,
      ownershipConflicts,
      idempotent: false,
    };

    await this.notifications.notifyAfterCommit({
      organizationId: input.organizationId,
      userId: input.userId,
      event: input.event,
      result,
      description: input.description,
      level: 'WARN',
    });

    return result;
  }

  private async findMembershipOrThrow(
    organizationId: string,
    userId: string,
  ): Promise<MembershipRecord> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }
    return membership;
  }

  private async idempotentResult(
    membership: MembershipRecord,
    idempotencyKey: string,
  ): Promise<LifecycleMutationResult> {
    const existingOutbox = await this.prisma.iamAuditOutbox.findUnique({
      where: { idempotencyKey },
    });

    return {
      membershipId: membership.id,
      status: membership.status,
      membershipVersion: membership.membershipVersion,
      outboxIds: existingOutbox ? [existingOutbox.id] : [],
      sessionsRevoked: 0,
      invitesRevoked: 0,
      overridesCleared: 0,
      ownershipConflicts: [],
      idempotent: true,
    };
  }
}
