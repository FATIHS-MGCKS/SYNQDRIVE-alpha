import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  CommunicationActorType,
  CommunicationConversationStatus,
  CommunicationDirection,
  CommunicationEventType,
  Prisma,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { computeEffectiveAccess } from '@modules/users/policies/effective-access-engine';
import { isCommunicationPermissionGranted } from '@shared/auth/communication-permission.compat';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationEventRepository } from '../communication-event.repository';
import {
  mapConversationDetail,
  type CommunicationConversationListRow,
} from '../read/communication-read.mapper';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import type { CommunicationMutationResponseDto } from './dto/communication-write-response.dto';
import {
  assertOperatorStatusTransition,
  isClaimEligibleStatus,
  isHumanTakeoverEligibleStatus,
  isResolveEligibleStatus,
  resolveReopenTargetStatus,
  resolveUnassignTargetStatus,
} from './communication-conversation-state-machine';
import { CommunicationWriteError } from './communication-write.errors';
import { CommunicationWriteScopeService } from './communication-write-scope.service';
import { CommunicationHumanTakeoverService } from './communication-human-takeover.service';

export interface CommunicationWriteActor {
  userId: string;
}

interface MutationResult {
  conversation: CommunicationMutationResponseDto['conversation'];
  changed: boolean;
  auditAction?: string;
  previousStatus?: CommunicationConversationStatus;
  newStatus?: CommunicationConversationStatus;
  assigneeUserId?: string | null;
}

const TERMINAL_ASSIGNMENT_STATUSES: CommunicationConversationStatus[] = [
  CommunicationConversationStatus.RESOLVED,
  CommunicationConversationStatus.FAILED,
];

/** Inclusive optimistic re-evaluation budget after the initial conditional write (total attempts = value + 1). */
export const MAX_OPTIMISTIC_MUTATION_RETRIES = 2;

@Injectable()
export class CommunicationWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readRepository: CommunicationReadRepository,
    private readonly events: CommunicationEventRepository,
    private readonly scope: CommunicationWriteScopeService,
    private readonly audit: AuditService,
    private readonly humanTakeover: CommunicationHumanTakeoverService,
  ) {}

  async claimConversation(
    organizationId: string,
    conversationId: string,
    actor: CommunicationWriteActor,
  ): Promise<CommunicationMutationResponseDto> {
    const canManage = await this.actorCanManage(organizationId, actor.userId);
    const result = await this.prisma.$transaction(async (tx) => {
      const row = await this.requireConversationRow(tx, organizationId, conversationId);
      await this.scope.assertConversationMutable(actor.userId, organizationId, row);

      if (row.assignedUserId && row.assignedUserId !== actor.userId && !canManage) {
        throw CommunicationWriteError.alreadyClaimed();
      }

      if (
        row.assignedUserId === actor.userId
        && row.status === CommunicationConversationStatus.HUMAN_ACTIVE
      ) {
        return this.noOpResult(row);
      }

      if (isHumanTakeoverEligibleStatus(row.status) && !row.assignedUserId) {
        const takeover = await this.humanTakeover.performHumanTakeover(tx, {
          organizationId,
          conversationId,
          actorUserId: actor.userId,
          row,
          lifecycleEventKey: this.lifecycleEventKey.bind(this),
        });
        const updated = await this.requireConversationRow(tx, organizationId, conversationId);
        return {
          conversation: mapConversationDetail(updated),
          changed: takeover.changed,
          auditAction: takeover.changed ? 'communication.takeover' : undefined,
          previousStatus: takeover.previousStatus,
          newStatus: takeover.newStatus,
          assigneeUserId: actor.userId,
        } satisfies MutationResult;
      }

      if (!isClaimEligibleStatus(row.status)) {
        throw CommunicationWriteError.invalidTransition(
          row.status,
          CommunicationConversationStatus.HUMAN_ACTIVE,
        );
      }

      const previousStatus = row.status;
      const claimResult = await tx.communicationConversation.updateMany({
        where: {
          id: conversationId,
          organizationId,
          assignedUserId: null,
          status: CommunicationConversationStatus.HUMAN_REQUIRED,
        },
        data: {
          assignedUserId: actor.userId,
          status: CommunicationConversationStatus.HUMAN_ACTIVE,
        },
      });

      if (claimResult.count === 0) {
        const current = await this.requireConversationRow(tx, organizationId, conversationId);
        if (
          current.assignedUserId === actor.userId
          && current.status === CommunicationConversationStatus.HUMAN_ACTIVE
        ) {
          return this.noOpResult(current);
        }
        throw CommunicationWriteError.alreadyClaimed();
      }

      assertOperatorStatusTransition(
        previousStatus,
        CommunicationConversationStatus.HUMAN_ACTIVE,
      );

      await this.appendOperatorEvent(tx, {
        organizationId,
        conversationId,
        channel: row.channel,
        eventType: CommunicationEventType.HUMAN_ASSIGNED,
        actorUserId: actor.userId,
        idempotencyKey: this.lifecycleEventKey('claim', conversationId, row.updatedAt),
        metadata: {
          previousStatus,
          newStatus: CommunicationConversationStatus.HUMAN_ACTIVE,
        },
      });

      const updated = await this.requireConversationRow(tx, organizationId, conversationId);
      return {
        conversation: mapConversationDetail(updated),
        changed: true,
        auditAction: 'communication.claim',
        previousStatus,
        newStatus: CommunicationConversationStatus.HUMAN_ACTIVE,
        assigneeUserId: actor.userId,
      } satisfies MutationResult;
    });

    this.recordAudit(organizationId, conversationId, actor.userId, result);
    return { conversation: result.conversation };
  }

  async assignConversation(
    organizationId: string,
    conversationId: string,
    assignedUserId: string | null,
    actor: CommunicationWriteActor,
  ): Promise<CommunicationMutationResponseDto> {
    if (assignedUserId === null) {
      return this.unassignConversation(organizationId, conversationId, actor);
    }

    const canManage = await this.actorCanManage(organizationId, actor.userId);
    if (assignedUserId !== actor.userId && !canManage) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Assigning to another user requires communication.manage',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await this.assertActiveOrgMember(tx, organizationId, assignedUserId);
      const row = await this.requireConversationRow(tx, organizationId, conversationId);
      await this.scope.assertConversationMutable(actor.userId, organizationId, row);

      this.assertAssignmentAllowedOnStatus(row.status);

      if (row.assignedUserId === assignedUserId) {
        return this.noOpResult(row);
      }

      if (
        row.assignedUserId
        && row.assignedUserId !== assignedUserId
        && row.assignedUserId !== actor.userId
        && !canManage
      ) {
        throw CommunicationWriteError.alreadyClaimed();
      }

      const previousStatus = row.status;
      const targetStatus =
        row.status === CommunicationConversationStatus.HUMAN_REQUIRED
          ? CommunicationConversationStatus.HUMAN_ACTIVE
          : row.status;

      if (targetStatus !== previousStatus) {
        assertOperatorStatusTransition(previousStatus, targetStatus);
      }

      const where: Prisma.CommunicationConversationWhereInput = {
        id: conversationId,
        organizationId,
        updatedAt: row.updatedAt,
      };

      if (!canManage) {
        where.OR = [{ assignedUserId: null }, { assignedUserId: actor.userId }];
      }

      const updatedCount = await tx.communicationConversation.updateMany({
        where,
        data: {
          assignedUserId,
          status: targetStatus,
        },
      });

      if (updatedCount.count === 0) {
        const current = await this.requireConversationRow(tx, organizationId, conversationId);
        if (current.assignedUserId === assignedUserId) {
          return this.noOpResult(current);
        }
        throw CommunicationWriteError.staleState();
      }

      await this.appendOperatorEvent(tx, {
        organizationId,
        conversationId,
        channel: row.channel,
        eventType: CommunicationEventType.HUMAN_ASSIGNED,
        actorUserId: actor.userId,
        idempotencyKey: this.lifecycleEventKey('assign', conversationId, row.updatedAt),
        metadata: {
          previousStatus,
          newStatus: targetStatus,
          assigneeUserId: assignedUserId,
        },
      });

      const updated = await this.requireConversationRow(tx, organizationId, conversationId);
      return {
        conversation: mapConversationDetail(updated),
        changed: true,
        auditAction: 'communication.assign',
        previousStatus,
        newStatus: targetStatus,
        assigneeUserId: assignedUserId,
      } satisfies MutationResult;
    });

    this.recordAudit(organizationId, conversationId, actor.userId, result);
    return { conversation: result.conversation };
  }

  async unassignConversation(
    organizationId: string,
    conversationId: string,
    actor: CommunicationWriteActor,
  ): Promise<CommunicationMutationResponseDto> {
    const canManage = await this.actorCanManage(organizationId, actor.userId);
    const result = await this.prisma.$transaction(async (tx) => {
      const row = await this.requireConversationRow(tx, organizationId, conversationId);
      await this.scope.assertConversationMutable(actor.userId, organizationId, row);

      if (!row.assignedUserId) {
        return this.noOpResult(row);
      }

      if (row.assignedUserId !== actor.userId && !canManage) {
        throw CommunicationWriteError.forbidden();
      }

      const previousStatus = row.status;
      const targetStatus = resolveUnassignTargetStatus();
      if (previousStatus !== targetStatus) {
        assertOperatorStatusTransition(previousStatus, targetStatus);
      }

      const where: Prisma.CommunicationConversationWhereInput = {
        id: conversationId,
        organizationId,
        updatedAt: row.updatedAt,
      };

      if (canManage) {
        where.assignedUserId = { not: null };
      } else {
        where.assignedUserId = actor.userId;
      }

      const updatedCount = await tx.communicationConversation.updateMany({
        where,
        data: {
          assignedUserId: null,
          status: targetStatus,
        },
      });

      if (updatedCount.count === 0) {
        const current = await this.requireConversationRow(tx, organizationId, conversationId);
        if (!current.assignedUserId) {
          return this.noOpResult(current);
        }
        throw CommunicationWriteError.staleState();
      }

      await this.appendOperatorEvent(tx, {
        organizationId,
        conversationId,
        channel: row.channel,
        eventType: CommunicationEventType.HUMAN_REQUIRED,
        actorUserId: actor.userId,
        idempotencyKey: this.lifecycleEventKey('unassign', conversationId, row.updatedAt),
        metadata: {
          previousStatus,
          newStatus: targetStatus,
        },
      });

      const updated = await this.requireConversationRow(tx, organizationId, conversationId);
      return {
        conversation: mapConversationDetail(updated),
        changed: true,
        auditAction: 'communication.unassign',
        previousStatus,
        newStatus: targetStatus,
        assigneeUserId: null,
      } satisfies MutationResult;
    });

    this.recordAudit(organizationId, conversationId, actor.userId, result);
    return { conversation: result.conversation };
  }

  async resolveConversation(
    organizationId: string,
    conversationId: string,
    actor: CommunicationWriteActor,
  ): Promise<CommunicationMutationResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const row = await this.requireConversationRow(tx, organizationId, conversationId);
      await this.scope.assertConversationMutable(actor.userId, organizationId, row);

      if (row.status === CommunicationConversationStatus.RESOLVED) {
        return this.noOpResult(row);
      }

      const resolved = await this.resolveWithOptimisticConcurrency(
        tx,
        organizationId,
        conversationId,
        row,
        actor.userId,
      );
      return resolved;
    });

    this.recordAudit(organizationId, conversationId, actor.userId, result);
    return { conversation: result.conversation };
  }

  async reopenConversation(
    organizationId: string,
    conversationId: string,
    actor: CommunicationWriteActor,
  ): Promise<CommunicationMutationResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const row = await this.requireConversationRow(tx, organizationId, conversationId);
      await this.scope.assertConversationMutable(actor.userId, organizationId, row);

      if (
        row.status !== CommunicationConversationStatus.RESOLVED
        && row.status !== CommunicationConversationStatus.FAILED
      ) {
        throw CommunicationWriteError.invalidTransition(
          row.status,
          resolveReopenTargetStatus(row.assignedUserId, row.status),
        );
      }

      const previousStatus = row.status;
      const targetStatus = resolveReopenTargetStatus(row.assignedUserId, previousStatus);
      assertOperatorStatusTransition(previousStatus, targetStatus);

      const updatedCount = await tx.communicationConversation.updateMany({
        where: {
          id: conversationId,
          organizationId,
          status: previousStatus,
          updatedAt: row.updatedAt,
        },
        data: { status: targetStatus },
      });

      if (updatedCount.count === 0) {
        const current = await this.requireConversationRow(tx, organizationId, conversationId);
        if (
          current.status === targetStatus
          && (previousStatus === CommunicationConversationStatus.RESOLVED
            || previousStatus === CommunicationConversationStatus.FAILED)
        ) {
          return this.noOpResult(current);
        }
        throw CommunicationWriteError.staleState();
      }

      await this.appendOperatorEvent(tx, {
        organizationId,
        conversationId,
        channel: row.channel,
        eventType: CommunicationEventType.CONVERSATION_REOPENED,
        actorUserId: actor.userId,
        idempotencyKey: this.lifecycleEventKey('reopen', conversationId, row.updatedAt),
        metadata: {
          previousStatus,
          newStatus: targetStatus,
        },
      });

      const updated = await this.requireConversationRow(tx, organizationId, conversationId);
      return {
        conversation: mapConversationDetail(updated),
        changed: true,
        auditAction: 'communication.reopen',
        previousStatus,
        newStatus: targetStatus,
        assigneeUserId: updated.assignedUserId,
      } satisfies MutationResult;
    });

    this.recordAudit(organizationId, conversationId, actor.userId, result);
    return { conversation: result.conversation };
  }

  async markConversationRead(
    organizationId: string,
    conversationId: string,
    actor: CommunicationWriteActor,
  ): Promise<CommunicationMutationResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const row = await this.requireConversationRow(tx, organizationId, conversationId);
      await this.scope.assertConversationMutable(actor.userId, organizationId, row);

      if (row.unreadCount <= 0) {
        return this.noOpResult(row);
      }

      const snapshotContentAt = row.lastContentAt;
      const updateResult = await tx.communicationConversation.updateMany({
        where: {
          id: conversationId,
          organizationId,
          unreadCount: { gt: 0 },
          lastContentAt: snapshotContentAt,
        },
        data: { unreadCount: 0 },
      });

      if (updateResult.count === 0) {
        const current = await this.requireConversationRow(tx, organizationId, conversationId);
        return {
          conversation: mapConversationDetail(current),
          changed: false,
        } satisfies MutationResult;
      }

      const updated = await this.requireConversationRow(tx, organizationId, conversationId);
      return {
        conversation: mapConversationDetail(updated),
        changed: true,
        auditAction: 'communication.mark_read',
      } satisfies MutationResult;
    });

    this.recordAudit(organizationId, conversationId, actor.userId, result);
    return { conversation: result.conversation };
  }

  private async resolveWithOptimisticConcurrency(
    tx: Prisma.TransactionClient,
    organizationId: string,
    conversationId: string,
    row: CommunicationConversationListRow,
    actorUserId: string,
  ): Promise<MutationResult> {
    let current = row;

    for (let attempt = 0; attempt <= MAX_OPTIMISTIC_MUTATION_RETRIES; attempt++) {
      if (!isResolveEligibleStatus(current.status)) {
        throw CommunicationWriteError.invalidTransition(
          current.status,
          CommunicationConversationStatus.RESOLVED,
        );
      }

      const previousStatus = current.status;
      assertOperatorStatusTransition(previousStatus, CommunicationConversationStatus.RESOLVED);

      const updatedCount = await tx.communicationConversation.updateMany({
        where: {
          id: conversationId,
          organizationId,
          status: previousStatus,
          updatedAt: current.updatedAt,
        },
        data: { status: CommunicationConversationStatus.RESOLVED },
      });

      if (updatedCount.count > 0) {
        await this.appendOperatorEvent(tx, {
          organizationId,
          conversationId,
          channel: current.channel,
          eventType: CommunicationEventType.CONVERSATION_RESOLVED,
          actorUserId,
          idempotencyKey: this.lifecycleEventKey('resolve', conversationId, current.updatedAt),
          metadata: {
            previousStatus,
            newStatus: CommunicationConversationStatus.RESOLVED,
          },
        });

        const updated = await this.requireConversationRow(tx, organizationId, conversationId);
        return {
          conversation: mapConversationDetail(updated),
          changed: true,
          auditAction: 'communication.resolve',
          previousStatus,
          newStatus: CommunicationConversationStatus.RESOLVED,
          assigneeUserId: updated.assignedUserId,
        };
      }

      current = await this.requireConversationRow(tx, organizationId, conversationId);

      if (current.status === CommunicationConversationStatus.RESOLVED) {
        return this.noOpResult(current);
      }
    }

    if (!isResolveEligibleStatus(current.status)) {
      throw CommunicationWriteError.invalidTransition(
        current.status,
        CommunicationConversationStatus.RESOLVED,
      );
    }

    throw CommunicationWriteError.staleState();
  }

  private assertAssignmentAllowedOnStatus(status: CommunicationConversationStatus): void {
    if (TERMINAL_ASSIGNMENT_STATUSES.includes(status)) {
      throw CommunicationWriteError.invalidTransition(
        status,
        CommunicationConversationStatus.HUMAN_ACTIVE,
      );
    }
  }

  private lifecycleEventKey(
    action: string,
    conversationId: string,
    updatedAt: Date,
  ): string {
    return `comm:${action}:${conversationId}:${updatedAt.toISOString()}`;
  }

  private async requireConversationRow(
    tx: Prisma.TransactionClient,
    organizationId: string,
    conversationId: string,
  ): Promise<CommunicationConversationListRow> {
    const row = await this.readRepository.findConversationById(
      organizationId,
      conversationId,
      tx,
    );
    if (!row) throw CommunicationWriteError.notFound();
    return row;
  }

  private async actorCanManage(organizationId: string, userId: string): Promise<boolean> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId, status: 'ACTIVE' },
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
      },
    });
    if (!membership) return false;
    const access = computeEffectiveAccess({
      membership,
      resourceContext: { organizationId },
    });
    return isCommunicationPermissionGranted(access, 'manage');
  }

  private noOpResult(row: CommunicationConversationListRow): MutationResult {
    return {
      conversation: mapConversationDetail(row),
      changed: false,
    };
  }

  private async assertActiveOrgMember(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const member = await tx.organizationMembership.findFirst({
      where: { organizationId, userId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!member) {
      throw CommunicationWriteError.assigneeInvalid();
    }

    const user = await tx.user.findFirst({
      where: { id: userId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!user) {
      throw CommunicationWriteError.assigneeInvalid();
    }
  }

  private async appendOperatorEvent(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      conversationId: string;
      channel: CommunicationConversationListRow['channel'];
      eventType: CommunicationEventType;
      actorUserId: string;
      idempotencyKey: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.events.appendEventIdempotently(
      {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        channel: input.channel,
        eventType: input.eventType,
        occurredAt: new Date(),
        direction: CommunicationDirection.INTERNAL,
        actorType: CommunicationActorType.USER,
        actorId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
      tx,
    );
  }

  /** Best-effort administrative trace — not atomic with the DB transaction (AuditService contract). */
  private recordAudit(
    organizationId: string,
    conversationId: string,
    actorUserId: string,
    result: MutationResult,
  ): void {
    if (!result.changed || !result.auditAction) return;

    void this.audit.record({
      actorUserId,
      actorOrganizationId: organizationId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.INTEGRATION,
      entityId: conversationId,
      description: result.auditAction,
      metaJson: {
        conversationId,
        previousStatus: result.previousStatus,
        newStatus: result.newStatus,
        assigneeUserId: result.assigneeUserId,
      },
    });
  }
}
