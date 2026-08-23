import { Injectable, Logger } from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationReplySendState,
  Prisma,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  mapCommunicationEvent,
  mapConversationDetail,
  type CommunicationConversationListRow,
} from '../read/communication-read.mapper';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import {
  assertOperatorStatusTransition,
  isClaimEligibleStatus,
  isHumanTakeoverEligibleStatus,
  isTerminalStatus,
} from '../write/communication-conversation-state-machine';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { CommunicationHumanTakeoverService } from '../write/communication-human-takeover.service';
import {
  COMMUNICATION_REPLY_PROCESSING_LEASE_MS,
  COMMUNICATION_REPLY_TEXT_MAX_LENGTH,
} from './communication-reply.constants';
import { CommunicationReplyError } from './communication-reply.errors';
import type { CommunicationReplyResponseDto } from './dto/communication-reply-response.dto';
import { SmsCommunicationOutboundAdapter } from './adapters/sms-communication-outbound.adapter';
import { WhatsAppCommunicationOutboundAdapter } from './adapters/whatsapp-communication-outbound.adapter';
import type { CommunicationOutboundChannelPort } from './ports/communication-outbound-channel.port';
import { CommunicationReplyChannelCapabilityService } from './communication-reply-channel-capability.service';
import {
  classifyNativeWhatsAppFailureReason,
  classifyReplyError,
  mapOutcomeClassToCommandState,
  throwReplyErrorForFailureCode,
  CommunicationReplyOutcomeClass,
} from './communication-reply-outcome';

export interface CommunicationReplyActor {
  userId: string;
  displayName?: string | null;
}

type PrepareAction = 'execute' | 'replay' | 'resume';

interface PreparedReply {
  commandId: string;
  row: CommunicationConversationListRow;
  text: string;
  action: PrepareAction;
}

@Injectable()
export class CommunicationReplyService {
  private readonly logger = new Logger(CommunicationReplyService.name);
  private readonly channelAdapters: Map<CommunicationChannel, CommunicationOutboundChannelPort>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly readRepository: CommunicationReadRepository,
    private readonly scope: CommunicationWriteScopeService,
    private readonly audit: AuditService,
    private readonly channelCapability: CommunicationReplyChannelCapabilityService,
    private readonly humanTakeover: CommunicationHumanTakeoverService,
    whatsappAdapter: WhatsAppCommunicationOutboundAdapter,
    smsAdapter: SmsCommunicationOutboundAdapter,
  ) {
    this.channelAdapters = new Map<CommunicationChannel, CommunicationOutboundChannelPort>([
      [CommunicationChannel.WHATSAPP, whatsappAdapter],
      [CommunicationChannel.SMS, smsAdapter],
    ]);
  }

  async replyConversation(
    organizationId: string,
    conversationId: string,
    actor: CommunicationReplyActor,
    input: { text: string; idempotencyKey: string },
  ): Promise<CommunicationReplyResponseDto> {
    const text = this.normalizeText(input.text);
    this.assertTextLength(text);

    const prepared = await this.prepareReplyCommand(
      organizationId,
      conversationId,
      actor,
      text,
      input.idempotencyKey,
    );

    if (prepared.action === 'replay') {
      return this.handleReplayOutcome(organizationId, conversationId, prepared.commandId);
    }

    const leaseAcquired = await this.acquireProcessingLease(prepared.commandId);
    if (!leaseAcquired) {
      throw CommunicationReplyError.sendUnknown();
    }

    const reconciled = await this.tryReconcileFromNativeMessage(
      organizationId,
      conversationId,
      prepared.commandId,
    );
    if (reconciled) {
      return reconciled;
    }

    const nativeConversationId = await this.requireNativeConversationId(
      organizationId,
      conversationId,
    );

    const adapter = this.resolveAdapter(prepared.row.channel);
    let sendResult;
    try {
      sendResult = await adapter.sendTextReply({
        organizationId,
        conversation: prepared.row,
        nativeConversationId,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        text,
        clientIdempotencyKey: input.idempotencyKey,
        commandId: prepared.commandId,
      });
    } catch (error) {
      await this.applyCommandOutcome(prepared.commandId, error);
      throw error;
    }

    const response = await this.finalizeAcceptedReply(
      organizationId,
      conversationId,
      prepared.commandId,
      sendResult,
    );

    this.recordAudit(organizationId, conversationId, actor.userId, prepared.row.channel, sendResult.sendState);
    return response;
  }

  private normalizeText(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) {
      throw CommunicationReplyError.messageEmpty();
    }
    return trimmed;
  }

  private assertTextLength(text: string): void {
    if (text.length > COMMUNICATION_REPLY_TEXT_MAX_LENGTH) {
      throw CommunicationReplyError.messageTooLong(COMMUNICATION_REPLY_TEXT_MAX_LENGTH);
    }
  }

  private resolveAdapter(channel: CommunicationChannel): CommunicationOutboundChannelPort {
    const adapter = this.channelAdapters.get(channel);
    if (!adapter) {
      throw CommunicationReplyError.channelNotReplyable();
    }
    return adapter;
  }

  private async prepareReplyCommand(
    organizationId: string,
    conversationId: string,
    actor: CommunicationReplyActor,
    text: string,
    clientIdempotencyKey: string,
  ): Promise<PreparedReply> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.communicationReplyCommand.findUnique({
          where: {
            communication_reply_commands_org_conversation_key: {
              organizationId,
              conversationId,
              clientIdempotencyKey,
            },
          },
        });

        if (existing) {
          if (existing.text !== text) {
            throw CommunicationReplyError.idempotencyConflict();
          }
          const row = await this.requireConversationRow(tx, organizationId, conversationId);
          if (existing.sendState === CommunicationReplySendState.PENDING) {
            if (this.isLeaseActive(existing.processingLeaseExpiresAt)) {
              throw CommunicationReplyError.sendUnknown();
            }
            return { commandId: existing.id, row, text, action: 'resume' };
          }
          return { commandId: existing.id, row, text, action: 'replay' };
        }

        const row = await this.requireConversationRow(tx, organizationId, conversationId);
        await this.scope.assertConversationMutable(actor.userId, organizationId, row);
        this.assertReplyableStatus(row.status);
        await this.channelCapability.assertChannelCanReply(organizationId, row.channel);
        await this.prepareOwnership(tx, organizationId, conversationId, row, actor.userId);

        const refreshed = await this.requireConversationRow(tx, organizationId, conversationId);

        const command = await tx.communicationReplyCommand.create({
          data: {
            organizationId,
            conversationId,
            clientIdempotencyKey,
            text,
            channel: refreshed.channel,
            actorUserId: actor.userId,
            sendState: CommunicationReplySendState.PENDING,
          },
        });

        return {
          commandId: command.id,
          row: refreshed,
          text,
          action: 'execute',
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        const existing = await this.prisma.communicationReplyCommand.findUnique({
          where: {
            communication_reply_commands_org_conversation_key: {
              organizationId,
              conversationId,
              clientIdempotencyKey,
            },
          },
        });
        if (!existing) throw error;
        if (existing.text !== text) {
          throw CommunicationReplyError.idempotencyConflict();
        }
        const row = await this.requireConversationRow(
          this.prisma,
          organizationId,
          conversationId,
        );
        if (existing.sendState === CommunicationReplySendState.PENDING) {
          if (this.isLeaseActive(existing.processingLeaseExpiresAt)) {
            throw CommunicationReplyError.sendUnknown();
          }
          return { commandId: existing.id, row, text, action: 'resume' };
        }
        return { commandId: existing.id, row, text, action: 'replay' };
      }
      throw error;
    }
  }

  private isLeaseActive(leaseExpiresAt: Date | null | undefined): boolean {
    return Boolean(leaseExpiresAt && leaseExpiresAt.getTime() > Date.now());
  }

  private async acquireProcessingLease(commandId: string): Promise<boolean> {
    const leaseUntil = new Date(Date.now() + COMMUNICATION_REPLY_PROCESSING_LEASE_MS);
    const result = await this.prisma.communicationReplyCommand.updateMany({
      where: {
        id: commandId,
        sendState: CommunicationReplySendState.PENDING,
        OR: [
          { processingLeaseExpiresAt: null },
          { processingLeaseExpiresAt: { lt: new Date() } },
        ],
      },
      data: { processingLeaseExpiresAt: leaseUntil },
    });
    return result.count > 0;
  }

  private async handleReplayOutcome(
    organizationId: string,
    conversationId: string,
    commandId: string,
  ): Promise<CommunicationReplyResponseDto> {
    const command = await this.prisma.communicationReplyCommand.findFirst({
      where: { id: commandId, organizationId, conversationId },
    });
    if (!command) throw CommunicationReplyError.notFound();

    switch (command.sendState) {
      case CommunicationReplySendState.ACCEPTED:
        return this.buildResponseFromCommand(organizationId, conversationId, commandId);
      case CommunicationReplySendState.UNKNOWN:
        throw CommunicationReplyError.sendUnknown();
      case CommunicationReplySendState.FAILED:
        throwReplyErrorForFailureCode(command.failureCode);
        break;
      case CommunicationReplySendState.PENDING:
        if (this.isLeaseActive(command.processingLeaseExpiresAt)) {
          throw CommunicationReplyError.sendUnknown();
        }
        throw CommunicationReplyError.sendUnknown();
      default:
        throw CommunicationReplyError.sendUnknown();
    }
  }

  private async tryReconcileFromNativeMessage(
    organizationId: string,
    conversationId: string,
    commandId: string,
  ): Promise<CommunicationReplyResponseDto | null> {
    const command = await this.prisma.communicationReplyCommand.findFirst({
      where: { id: commandId, organizationId, conversationId },
    });
    if (!command?.nativeMessageId) return null;

    const nativeConversationId = await this.requireNativeConversationId(organizationId, conversationId);
    const nativeMessage = await this.prisma.whatsAppMessage.findFirst({
      where: {
        id: command.nativeMessageId,
        organizationId,
        conversationId: nativeConversationId,
      },
    });

    if (!nativeMessage) return null;

    if (nativeMessage.status === 'SENT') {
      const canonicalEventId = await this.resolveCanonicalEventId(organizationId, nativeMessage.id);
      await this.prisma.communicationReplyCommand.update({
        where: { id: commandId },
        data: {
          sendState: CommunicationReplySendState.ACCEPTED,
          canonicalEventId,
          processingLeaseExpiresAt: null,
        },
      });
      await this.applyPostSendStatusTransition(organizationId, conversationId);
      return this.buildResponseFromCommand(organizationId, conversationId, commandId);
    }

    if (nativeMessage.status === 'FAILED') {
      const outcome = classifyNativeWhatsAppFailureReason(nativeMessage.failureReason);
      if (outcome === CommunicationReplyOutcomeClass.UNKNOWN) {
        await this.prisma.communicationReplyCommand.update({
          where: { id: commandId },
          data: { sendState: CommunicationReplySendState.UNKNOWN, processingLeaseExpiresAt: null },
        });
        throw CommunicationReplyError.sendUnknown();
      }
      await this.prisma.communicationReplyCommand.update({
        where: { id: commandId },
        data: {
          sendState: CommunicationReplySendState.FAILED,
          failureCode: nativeMessage.failureReason ?? 'SEND_FAILED',
          processingLeaseExpiresAt: null,
        },
      });
      throwReplyErrorForFailureCode(nativeMessage.failureReason);
    }

    if (nativeMessage.providerDispatchStartedAt || nativeMessage.providerMessageId) {
      await this.prisma.communicationReplyCommand.update({
        where: { id: commandId },
        data: { sendState: CommunicationReplySendState.UNKNOWN, processingLeaseExpiresAt: null },
      });
      throw CommunicationReplyError.sendUnknown();
    }

    return null;
  }

  private assertReplyableStatus(status: CommunicationConversationStatus): void {
    if (isTerminalStatus(status)) {
      throw CommunicationReplyError.invalidTransition('Conversation must be reopened before replying');
    }
  }

  private async prepareOwnership(
    tx: Prisma.TransactionClient,
    organizationId: string,
    conversationId: string,
    row: CommunicationConversationListRow,
    actorUserId: string,
  ): Promise<void> {
    if (row.assignedUserId && row.assignedUserId !== actorUserId) {
      throw CommunicationReplyError.alreadyClaimed();
    }

    if (
      isClaimEligibleStatus(row.status)
      && !row.assignedUserId
    ) {
      const claimResult = await tx.communicationConversation.updateMany({
        where: {
          id: conversationId,
          organizationId,
          assignedUserId: null,
          status: CommunicationConversationStatus.HUMAN_REQUIRED,
          updatedAt: row.updatedAt,
        },
        data: {
          assignedUserId: actorUserId,
          status: CommunicationConversationStatus.HUMAN_ACTIVE,
        },
      });
      if (claimResult.count === 0) {
        const current = await this.requireConversationRow(tx, organizationId, conversationId);
        if (current.assignedUserId && current.assignedUserId !== actorUserId) {
          throw CommunicationReplyError.alreadyClaimed();
        }
        throw CommunicationReplyError.staleState();
      }
      return;
    }

    if (
      row.status === CommunicationConversationStatus.AI_ACTIVE
      || row.status === CommunicationConversationStatus.WAITING_CUSTOMER
    ) {
      if (row.assignedUserId && row.assignedUserId !== actorUserId) {
        throw CommunicationReplyError.alreadyClaimed();
      }
      await this.humanTakeover.performHumanTakeover(tx, {
        organizationId,
        conversationId,
        actorUserId,
        row,
        lifecycleEventKey: (action, convId, updatedAt) =>
          `comm:${action}:${convId}:${updatedAt.toISOString()}`,
      });
    }
  }

  private async requireNativeConversationId(
    organizationId: string,
    conversationId: string,
  ): Promise<string> {
    const canonical = await this.prisma.communicationConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { nativeConversationId: true },
    });
    if (!canonical?.nativeConversationId) {
      throw CommunicationReplyError.notFound();
    }
    return canonical.nativeConversationId;
  }

  private async applyCommandOutcome(commandId: string, error: unknown): Promise<void> {
    const outcome = classifyReplyError(error);
    const sendState = mapOutcomeClassToCommandState(outcome);
    const failureCode =
      (error as { response?: { code?: string } })?.response?.code
      ?? (outcome === CommunicationReplyOutcomeClass.UNKNOWN ? 'SEND_UNKNOWN' : 'SEND_FAILED');

    await this.prisma.communicationReplyCommand.update({
      where: { id: commandId },
      data: {
        sendState,
        failureCode,
        processingLeaseExpiresAt: null,
      },
    }).catch(() => {
      this.logger.warn(`Failed to update reply command ${commandId} outcome`);
    });
  }

  private async finalizeAcceptedReply(
    organizationId: string,
    conversationId: string,
    commandId: string,
    sendResult: {
      sendState: CommunicationReplySendState;
      nativeMessageId?: string | null;
      canonicalEventId?: string | null;
      failureCode?: string | null;
    },
  ): Promise<CommunicationReplyResponseDto> {
    if (sendResult.sendState === CommunicationReplySendState.FAILED) {
      await this.prisma.communicationReplyCommand.update({
        where: { id: commandId },
        data: {
          sendState: CommunicationReplySendState.FAILED,
          nativeMessageId: sendResult.nativeMessageId ?? null,
          failureCode: sendResult.failureCode ?? 'SEND_FAILED',
          processingLeaseExpiresAt: null,
        },
      });
      throwReplyErrorForFailureCode(sendResult.failureCode);
    }

    if (sendResult.sendState === CommunicationReplySendState.UNKNOWN) {
      await this.prisma.communicationReplyCommand.update({
        where: { id: commandId },
        data: {
          sendState: CommunicationReplySendState.UNKNOWN,
          nativeMessageId: sendResult.nativeMessageId ?? null,
          processingLeaseExpiresAt: null,
        },
      });
      throw CommunicationReplyError.sendUnknown();
    }

    await this.prisma.$transaction(async (tx) => {
      const row = await this.requireConversationRow(tx, organizationId, conversationId);
      if (row.status === CommunicationConversationStatus.HUMAN_ACTIVE) {
        const target = CommunicationConversationStatus.WAITING_CUSTOMER;
        assertOperatorStatusTransition(row.status, target);
        await tx.communicationConversation.updateMany({
          where: {
            id: conversationId,
            organizationId,
            status: row.status,
            updatedAt: row.updatedAt,
          },
          data: { status: target },
        });
      }

      await tx.communicationReplyCommand.update({
        where: { id: commandId },
        data: {
          sendState:
            sendResult.sendState === CommunicationReplySendState.PENDING
              ? CommunicationReplySendState.PENDING
              : CommunicationReplySendState.ACCEPTED,
          nativeMessageId: sendResult.nativeMessageId ?? null,
          canonicalEventId: sendResult.canonicalEventId ?? null,
          processingLeaseExpiresAt: null,
        },
      });
    });

    return this.buildResponseFromCommand(organizationId, conversationId, commandId);
  }

  private async applyPostSendStatusTransition(
    organizationId: string,
    conversationId: string,
  ): Promise<void> {
    const row = await this.readRepository.findConversationById(organizationId, conversationId);
    if (!row || row.status !== CommunicationConversationStatus.HUMAN_ACTIVE) return;

    const target = CommunicationConversationStatus.WAITING_CUSTOMER;
    assertOperatorStatusTransition(row.status, target);
    await this.prisma.communicationConversation.updateMany({
      where: {
        id: conversationId,
        organizationId,
        status: row.status,
        updatedAt: row.updatedAt,
      },
      data: { status: target },
    });
  }

  private async resolveCanonicalEventId(
    organizationId: string,
    nativeMessageId: string,
  ): Promise<string | null> {
    const event = await this.prisma.communicationEvent.findFirst({
      where: {
        organizationId,
        providerEventId: `wa-sent:${nativeMessageId}`,
        eventType: 'MESSAGE_SENT',
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    return event?.id ?? null;
  }

  private async buildResponseFromCommand(
    organizationId: string,
    conversationId: string,
    commandId: string,
  ): Promise<CommunicationReplyResponseDto> {
    const [command, row] = await Promise.all([
      this.prisma.communicationReplyCommand.findFirst({
        where: { id: commandId, organizationId, conversationId },
      }),
      this.readRepository.findConversationById(organizationId, conversationId),
    ]);

    if (!command || !row) {
      throw CommunicationReplyError.notFound();
    }

    let canonicalEventId = command.canonicalEventId;
    if (!canonicalEventId && command.nativeMessageId) {
      canonicalEventId = await this.resolveCanonicalEventId(organizationId, command.nativeMessageId);
      if (canonicalEventId) {
        await this.prisma.communicationReplyCommand.update({
          where: { id: command.id },
          data: { canonicalEventId },
        });
      }
    }

    let event = null;
    if (canonicalEventId) {
      const eventRow = await this.prisma.communicationEvent.findFirst({
        where: { id: canonicalEventId, organizationId },
        select: {
          id: true,
          eventType: true,
          direction: true,
          actorType: true,
          occurredAt: true,
          providerIdentity: true,
          metadata: true,
          messageContent: {
            select: {
              id: true,
              contentType: true,
              text: true,
              truncated: true,
              hasAttachments: true,
              attachmentCount: true,
            },
          },
        },
      });
      if (eventRow) {
        event = mapCommunicationEvent(eventRow);
      }
    }

    const sendState =
      command.sendState === CommunicationReplySendState.ACCEPTED
        ? 'ACCEPTED'
        : command.sendState === CommunicationReplySendState.PENDING
          ? 'PENDING'
          : command.sendState === CommunicationReplySendState.UNKNOWN
            ? 'UNKNOWN'
            : 'FAILED';

    return {
      conversation: mapConversationDetail(row),
      sendState,
      event,
      commandId: command.id,
    };
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
    if (!row) throw CommunicationReplyError.notFound();
    return row;
  }

  private recordAudit(
    organizationId: string,
    conversationId: string,
    actorUserId: string,
    channel: CommunicationChannel,
    sendState: CommunicationReplySendState,
  ): void {
    if (sendState !== CommunicationReplySendState.ACCEPTED) return;

    void this.audit.record({
      actorUserId,
      actorOrganizationId: organizationId,
      action: ActivityAction.CREATE,
      entity: ActivityEntity.INTEGRATION,
      entityId: conversationId,
      description: 'communication.reply',
      metaJson: {
        conversationId,
        channel,
        outcome: 'ACCEPTED',
      },
    });
  }
}
