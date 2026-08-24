import { createHash } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { CommunicationChannel } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  CommunicationReplyService,
  type CommunicationReplyActor,
} from '@modules/communication/reply/communication-reply.service';
import type { CommunicationReplyResponseDto } from '@modules/communication/reply/dto/communication-reply-response.dto';
import { CommunicationWhatsAppOpsService } from '@modules/communication/ops/communication-whatsapp-ops.service';
import { CommunicationQuickActionExecutorService } from '@modules/communication/ops/communication-quick-action.executor';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppConversationContextService } from './whatsapp-conversation-context.service';
import type { WhatsAppQuickActionId } from './whatsapp-conversation-context.types';

/**
 * Non-authoritative HTTP compatibility adapters for legacy WhatsApp operational routes.
 * Canonical Communication Center uses `api.communication.*` / communication module controllers.
 */
@Injectable()
export class WhatsAppLegacyHttpCompatibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
    private readonly contextService: WhatsAppConversationContextService,
    private readonly replyService: CommunicationReplyService,
    private readonly whatsappOps: CommunicationWhatsAppOpsService,
    private readonly quickActions: CommunicationQuickActionExecutorService,
  ) {}

  getConversations(orgId: string) {
    return this.whatsapp.getConversations(orgId);
  }

  getMessages(orgId: string, nativeConversationId: string) {
    return this.whatsapp.getMessages(orgId, nativeConversationId);
  }

  getConversationContext(orgId: string, nativeConversationId: string) {
    return this.contextService.getContext(orgId, nativeConversationId);
  }

  async sendMessage(
    orgId: string,
    nativeConversationId: string,
    content: string,
    actor: CommunicationReplyActor,
    senderName?: string,
  ) {
    const canonicalId = await this.resolveCanonicalConversationId(orgId, nativeConversationId);
    const idempotencyKey = this.buildLegacySendIdempotencyKey(orgId, nativeConversationId, content);
    const result = await this.replyService.replyConversation(orgId, canonicalId, actor, {
      text: content,
      idempotencyKey,
    });
    return this.mapReplyToLegacyMessage(result, content, senderName);
  }

  async getAiSuggestion(
    orgId: string,
    nativeConversationId: string,
    actor: CommunicationReplyActor,
  ) {
    const canonicalId = await this.resolveCanonicalConversationId(orgId, nativeConversationId);
    return this.whatsappOps.getAiSuggestion(orgId, canonicalId, actor);
  }

  async requestHumanReview(
    orgId: string,
    nativeConversationId: string,
    actor: CommunicationReplyActor,
    reason?: string,
  ) {
    const canonicalId = await this.resolveCanonicalConversationId(orgId, nativeConversationId);
    const result = await this.quickActions.execute(
      orgId,
      canonicalId,
      nativeConversationId,
      'human_review',
      actor,
      {
        reason:
          reason?.trim()
          || 'Manual human review requested from legacy WhatsApp HTTP compatibility route',
      },
    );
    return {
      ok: true,
      conversationId: nativeConversationId,
      status: result.conversation?.status ?? 'PENDING_HUMAN',
    };
  }

  async executeQuickAction(
    orgId: string,
    nativeConversationId: string,
    actionId: WhatsAppQuickActionId,
    actor: CommunicationReplyActor,
    body: Record<string, unknown>,
  ) {
    const canonicalId = await this.resolveCanonicalConversationId(orgId, nativeConversationId);
    return this.quickActions.execute(
      orgId,
      canonicalId,
      nativeConversationId,
      actionId,
      actor,
      body,
    );
  }

  private async resolveCanonicalConversationId(
    organizationId: string,
    nativeConversationId: string,
  ): Promise<string> {
    const row = await this.prisma.communicationConversation.findFirst({
      where: {
        organizationId,
        nativeConversationId,
        channel: CommunicationChannel.WHATSAPP,
      },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Conversation not found');
    }
    return row.id;
  }

  private buildLegacySendIdempotencyKey(
    orgId: string,
    nativeConversationId: string,
    content: string,
  ): string {
    const hash = createHash('sha256')
      .update(`${orgId}:${nativeConversationId}:${content}`)
      .digest('hex')
      .slice(0, 40);
    return `legacy-wa-http:${hash}`;
  }

  private mapReplyToLegacyMessage(
    result: CommunicationReplyResponseDto,
    content: string,
    senderName?: string,
  ) {
    const event = result.event;
    const metadata =
      event?.metadata && typeof event.metadata === 'object'
        ? (event.metadata as Record<string, unknown>)
        : null;
    const providerMessageId =
      typeof metadata?.providerMessageId === 'string' ? metadata.providerMessageId : null;

    return {
      id: event?.id ?? result.commandId,
      direction: 'outgoing',
      senderType: 'human',
      senderName: senderName ?? null,
      content,
      aiGenerated: false,
      aiSuggested: false,
      status: result.sendState === 'FAILED' ? 'FAILED' : 'SENT',
      messageType: 'text',
      templateName: null,
      providerMessageId,
      failureReason: result.sendState === 'FAILED' ? 'SEND_FAILED' : null,
      createdAt: event?.occurredAt ?? new Date().toISOString(),
    };
  }
}
