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
import { mapConversationDetail } from '../read/communication-read.mapper';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import type {
  CommunicationConversationDetailDto,
} from '../read/dto/communication-read-response.dto';
import type { CommunicationMutationResponseDto } from './dto/communication-write-response.dto';
import {
  assertOperatorStatusTransition,
  isClaimEligibleStatus,
  isResolveEligibleStatus,
  resolveReopenTargetStatus,
  resolveUnassignTargetStatus,
} from './communication-conversation-state-machine';
import { CommunicationWriteError } from './communication-write.errors';
import { CommunicationWriteScopeService } from './communication-write-scope.service';

export interface CommunicationWriteActor {
  userId: string;
}

interface MutationResult {
  conversation: CommunicationConversationDetailDto;
  changed: boolean;
  auditAction?: string;
  previousStatus?: CommunicationConversationStatus;
  newStatus?: CommunicationConversationStatus;
  assigneeUserId?: string | null;
}

@Injectable()
export class CommunicationWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readRepository: CommunicationReadRepository,
    private readonly events: CommunicationEventRepository,
    private readonly scope: CommunicationWriteScopeService,
    private readonly audit: AuditService,
  ) {}

  async claimConversation(
    organizationId: string,
    conversationId: string,
    actor: CommunicationWriteActor,
  ): Promise<CommunicationMutationResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const row = await this.readRepository.findConversationById(organizationId, conversationId);
      if (!row) throw CommunicationWriteError.notFound();
      await this.scope.assertConversationMutable(actor.userId, organizationId, row);

      if (
        row.assignedUserId
        && row.assignedUserId !== actor.userId
        && !(await this.actorCanManage(organizationId, actor.userId))
      ) {
        throw CommunicationWriteError.alreadyClaimed();
      }

      if (
        row.assignedUserId === actor.userId
        && row.status === CommunicationConversationStatus.HUMAN_ACTIVE
      ) {
        return this.noOpResult(row);
      }

      if (!isClaimEligibleStatus(row.status)) {
        throw CommunicationWriteError.invalidTransition(
          row.status,
          CommunicationConversationStatus.HUMAN_ACTIVE,
        );
      }

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
        const current = await this.readRepository.findConversationById(organizationId, conversationId);
        if (!current) throw CommunicationWriteError.notFound();
        if (
          current.assignedUserId === actor.userId
          && current.status === CommunicationConversationStatus.HUMAN_ACTIVE
        ) {
          return this.noOpResult(current);
        }
        throw CommunicationWriteError.alreadyClaimed();
      }

      assertOperatorStatusTransition(
        row.status,
        CommunicationConversationStatus.HUMAN_ACTIVE,
      );

      await this.appendOperatorEvent(tx, {
        organizationId,
        conversationId,
        channel: row.channel,
        eventType: CommunicationEventType.HUMAN_ASSIGNED,
        actorUserId: actor.userId,
        idempotencyKey: `comm:claim:${conversationId}:${actor.userId}:${row.status}`,
        metadata: {
          previousStatus: row.status,
          newStatus: CommunicationConversationStatus.HUMAN_ACTIVE,
        },
      });

      const updated = await this.readRepository.findConversationById(organizationId, conversationId);
      if (!updated) throw CommunicationWriteError.notFound();

      return {
        conversation: mapConversationDetail(updated),
        changed: true,
        auditAction: 'communication.claim',
        previousStatus: row.status,
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

    if (assignedUserId !== actor.userId && !(await this.actorCanManage(organizationId, actor.userId))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Assigning to another user requires communication.manage',
      });
    }

    await this.assertActiveOrgMember(organizationId, assignedUserId);

    const result = await this.prisma.$transaction(async (tx) => {
      const row = await this.readRepository.findConversationById(organizationId, conversationId);
      if (!row) throw CommunicationWriteError.notFound();
      await this.scope.assertConversationMutable(actor.userId, organizationId, row);

      if (
        row.assignedUserId
        && row.assignedUserId !== assignedUserId
        && row.assignedUserId !== actor.userId
        && !(await this.actorCanManage(organizationId, actor.userId))
      ) {
        throw CommunicationWriteError.alreadyClaimed();
      }

      if (row.assignedUserId === assignedUserId) {
        return this.noOpResult(row);
      }

      const targetStatus =
        row.status === CommunicationConversationStatus.HUMAN_REQUIRED
        || row.status === CommunicationConversationStatus.RESOLVED
        || row.status === CommunicationConversationStatus.FAILED
          ? CommunicationConversationStatus.HUMAN_ACTIVE
          : row.status;

      if (targetStatus !== row.status) {
        assertOperatorStatusTransition(row.status, targetStatus);
      }

      await tx.communicationConversation.update({
        where: { id: row.id },
        data: {
          assignedUserId,
          status: targetStatus,
        },
      });

      await this.appendOperatorEvent(tx, {
        organizationId,
        conversationId,
        channel: row.channel,
        eventType: CommunicationEventType.HUMAN_ASSIGNED,
        actorUserId: actor.userId,
        idempotencyKey: `comm:assign:${conversationId}:${row.assignedUserId ?? 'none'}:${assignedUserId}`,
        metadata: {
          previousStatus: row.status,
          newStatus: targetStatus,
          assigneeUserId: assignedUserId,
        },
      });

      const updated = await this.readRepository.findConversationById(organizationId, conversationId);
      if (!updated) throw CommunicationWriteError.notFound();

      return {
        conversation: mapConversationDetail(updated),
        changed: true,
        auditAction: 'communication.assign',
        previousStatus: row.status,
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
    const result = await this.prisma.$transaction(async (tx) => {
      const row = await this.readRepository.findConversationById(organizationId, conversationId);
      if (!row) throw CommunicationWriteError.notFound();
      await this.scope.assertConversationMutable(actor.userId, organizationId, row);

      if (!row.assignedUserId) {
        return this.noOpResult(row);
      }

      if (row.assignedUserId !== actor.userId && !(await this.actorCanManage(organizationId, actor.userId))) {
        throw CommunicationWriteError.forbidden();
      }

      const targetStatus = resolveUnassignTargetStatus();
      if (row.status !== targetStatus) {
        assertOperatorStatusTransition(row.status, targetStatus);
      }

      await tx.communicationConversation.update({
        where: { id: row.id },
        data: {
          assignedUserId: null,
          status: targetStatus,
        },
      });

      await this.appendOperatorEvent(tx, {
        organizationId,
        conversationId,
        channel: row.channel,
        eventType: CommunicationEventType.HUMAN_REQUIRED,
        actorUserId: actor.userId,
        idempotencyKey: `comm:unassign:${conversationId}:${row.assignedUserId}`,
        metadata: {
          previousStatus: row.status,
          newStatus: targetStatus,
        },
      });

      const updated = await this.readRepository.findConversationById(organizationId, conversationId);
      if (!updated) throw CommunicationWriteError.notFound();

      return {
        conversation: mapConversationDetail(updated),
        changed: true,
        auditAction: 'communication.unassign',
        previousStatus: row.status,
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
      const row = await this.readRepository.findConversationById(organizationId, conversationId);
      if (!row) throw CommunicationWriteError.notFound();
      await this.scope.assertConversationMutable(actor.userId, organizationId, row);

      if (row.status === CommunicationConversationStatus.RESOLVED) {
        return this.noOpResult(row);
      }

      if (!isResolveEligibleStatus(row.status)) {
        throw CommunicationWriteError.invalidTransition(
          row.status,
          CommunicationConversationStatus.RESOLVED,
        );
      }

      assertOperatorStatusTransition(row.status, CommunicationConversationStatus.RESOLVED);

      await tx.communicationConversation.update({
        where: { id: row.id },
        data: { status: CommunicationConversationStatus.RESOLVED },
      });

      await this.appendOperatorEvent(tx, {
        organizationId,
        conversationId,
        channel: row.channel,
        eventType: CommunicationEventType.CONVERSATION_RESOLVED,
        actorUserId: actor.userId,
        idempotencyKey: `comm:resolve:${conversationId}:${row.status}`,
        metadata: {
          previousStatus: row.status,
          newStatus: CommunicationConversationStatus.RESOLVED,
        },
      });

      const updated = await this.readRepository.findConversationById(organizationId, conversationId);
      if (!updated) throw CommunicationWriteError.notFound();

      return {
        conversation: mapConversationDetail(updated),
        changed: true,
        auditAction: 'communication.resolve',
        previousStatus: row.status,
        newStatus: CommunicationConversationStatus.RESOLVED,
        assigneeUserId: row.assignedUserId,
      } satisfies MutationResult;
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
      const row = await this.readRepository.findConversationById(organizationId, conversationId);
      if (!row) throw CommunicationWriteError.notFound();
      await this.scope.assertConversationMutable(actor.userId, organizationId, row);

      const targetStatus = resolveReopenTargetStatus(row.assignedUserId, row.status);

      if (
        row.status !== CommunicationConversationStatus.RESOLVED
        && row.status !== CommunicationConversationStatus.FAILED
      ) {
        throw CommunicationWriteError.invalidTransition(row.status, targetStatus);
      }

      if (
        row.status === targetStatus
        && row.status !== CommunicationConversationStatus.RESOLVED
        && row.status !== CommunicationConversationStatus.FAILED
      ) {
        return this.noOpResult(row);
      }

      assertOperatorStatusTransition(row.status, targetStatus);

      await tx.communicationConversation.update({
        where: { id: row.id },
        data: { status: targetStatus },
      });

      await this.appendOperatorEvent(tx, {
        organizationId,
        conversationId,
        channel: row.channel,
        eventType: CommunicationEventType.CONVERSATION_REOPENED,
        actorUserId: actor.userId,
        idempotencyKey: `comm:reopen:${conversationId}:${row.status}`,
        metadata: {
          previousStatus: row.status,
          newStatus: targetStatus,
        },
      });

      const updated = await this.readRepository.findConversationById(organizationId, conversationId);
      if (!updated) throw CommunicationWriteError.notFound();

      return {
        conversation: mapConversationDetail(updated),
        changed: true,
        auditAction: 'communication.reopen',
        previousStatus: row.status,
        newStatus: targetStatus,
        assigneeUserId: row.assignedUserId,
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
      const row = await tx.communicationConversation.findFirst({
        where: { id: conversationId, organizationId },
      });
      if (!row) throw CommunicationWriteError.notFound();

      const listRow = await this.readRepository.findConversationById(organizationId, conversationId);
      if (!listRow) throw CommunicationWriteError.notFound();
      await this.scope.assertConversationMutable(actor.userId, organizationId, listRow);

      if (row.unreadCount <= 0) {
        return this.noOpResult(listRow);
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
        const current = await this.readRepository.findConversationById(organizationId, conversationId);
        if (!current) throw CommunicationWriteError.notFound();
        return {
          conversation: mapConversationDetail(current),
          changed: false,
        } satisfies MutationResult;
      }

      const updated = await this.readRepository.findConversationById(organizationId, conversationId);
      if (!updated) throw CommunicationWriteError.notFound();

      return {
        conversation: mapConversationDetail(updated),
        changed: true,
        auditAction: 'communication.mark_read',
      } satisfies MutationResult;
    });

    this.recordAudit(organizationId, conversationId, actor.userId, result);
    return { conversation: result.conversation };
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

  private noOpResult(row: NonNullable<Awaited<ReturnType<CommunicationReadRepository['findConversationById']>>>): MutationResult {
    return {
      conversation: mapConversationDetail(row),
      changed: false,
    };
  }

  private async assertActiveOrgMember(organizationId: string, userId: string): Promise<void> {
    const member = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!member) {
      throw CommunicationWriteError.assigneeInvalid();
    }

    const user = await this.prisma.user.findFirst({
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
      channel: Prisma.CommunicationConversationGetPayload<{ select: { channel: true } }>['channel'];
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
