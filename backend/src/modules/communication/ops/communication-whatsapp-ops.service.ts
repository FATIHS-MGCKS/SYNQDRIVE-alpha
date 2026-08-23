import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommunicationChannel, WhatsAppTemplateProviderStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { WhatsAppService } from '@modules/whatsapp/whatsapp.service';
import { WhatsAppMessagePolicyService } from '@modules/whatsapp/whatsapp-message-policy.service';
import type { WhatsAppQuickActionId } from '@modules/whatsapp/whatsapp-conversation-context.types';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationReplyError } from '../reply/communication-reply.errors';
import type { CommunicationReplyActor } from '../reply/communication-reply.service';
import { CommunicationQuickActionExecutorService } from './communication-quick-action.executor';
import { CommunicationQuickActionResolverService } from './communication-quick-action.resolver';
import type {
  CommunicationQuickActionAvailability,
  CommunicationQuickActionResult,
} from './communication-quick-action.types';

export type CommunicationComposerReplyMode =
  | 'FREEFORM_TEXT_ALLOWED'
  | 'TEMPLATE_REQUIRED'
  | 'CHANNEL_NOT_REPLYABLE';

@Injectable()
export class CommunicationWhatsAppOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readRepository: CommunicationReadRepository,
    private readonly scope: CommunicationWriteScopeService,
    private readonly whatsapp: WhatsAppService,
    private readonly policy: WhatsAppMessagePolicyService,
    private readonly quickActionExecutor: CommunicationQuickActionExecutorService,
    private readonly quickActionResolver: CommunicationQuickActionResolverService,
  ) {}

  async getComposerCapability(
    organizationId: string,
    conversationId: string,
    actor: CommunicationReplyActor,
  ): Promise<{ replyMode: CommunicationComposerReplyMode }> {
    const row = await this.requireWhatsAppConversationRow(organizationId, conversationId);
    await this.scope.assertConversationMutable(actor.userId, organizationId, row);

    const nativeId = await this.requireNativeConversationId(organizationId, conversationId);
    const native = await this.requireNativeWhatsAppConversation(organizationId, nativeId);
    const config = await this.prisma.orgWhatsAppConfig.findUnique({
      where: { organizationId },
    });
    if (!config?.isActive) {
      return { replyMode: 'CHANNEL_NOT_REPLYABLE' };
    }

    const freeText = this.policy.canSendFreeText(organizationId, config, native);
    return {
      replyMode: freeText.allowed ? 'FREEFORM_TEXT_ALLOWED' : 'TEMPLATE_REQUIRED',
    };
  }

  async getAiSuggestion(
    organizationId: string,
    conversationId: string,
    actor: CommunicationReplyActor,
  ) {
    const row = await this.requireWhatsAppConversationRow(organizationId, conversationId);
    await this.scope.assertConversationMutable(actor.userId, organizationId, row);

    try {
      const nativeId = await this.requireNativeConversationId(organizationId, conversationId);
      const result = await this.whatsapp.getAiSuggestion(
        organizationId,
        nativeId,
      );
      return {
        suggestedReply: result.suggestedReply ?? result.suggestion ?? null,
        intent: result.intent,
        confidence: result.confidence,
        suggestionId: result.suggestionId ?? null,
        canSendAutomatically: Boolean(result.canSendAutomatically),
      };
    } catch {
      throw CommunicationReplyError.aiSuggestionFailed();
    }
  }

  async getQuickActions(
    organizationId: string,
    conversationId: string,
    actorUserId: string,
  ): Promise<{ actions: CommunicationQuickActionAvailability[] }> {
    await this.requireWhatsAppConversationRow(organizationId, conversationId);
    const nativeId = await this.requireNativeConversationId(organizationId, conversationId);
    const actions = await this.quickActionResolver.listAvailableActions(
      organizationId,
      nativeId,
      actorUserId,
    );
    return { actions };
  }

  async executeQuickAction(
    organizationId: string,
    conversationId: string,
    actionId: WhatsAppQuickActionId,
    actor: CommunicationReplyActor,
    body: Record<string, unknown> = {},
  ): Promise<CommunicationQuickActionResult> {
    const row = await this.requireWhatsAppConversationRow(organizationId, conversationId);
    await this.scope.assertConversationMutable(actor.userId, organizationId, row);

    const nativeId = await this.requireNativeConversationId(organizationId, conversationId);
    return this.quickActionExecutor.execute(
      organizationId,
      conversationId,
      nativeId,
      actionId,
      actor,
      body,
    );
  }

  async listSendableTemplates(organizationId: string, conversationId: string) {
    const row = await this.requireWhatsAppConversationRow(organizationId, conversationId);
    void row;

    const statuses =
      process.env.NODE_ENV === 'production'
        ? [WhatsAppTemplateProviderStatus.APPROVED]
        : [WhatsAppTemplateProviderStatus.APPROVED, WhatsAppTemplateProviderStatus.DRAFT];

    const templates = await this.prisma.whatsAppTemplate.findMany({
      where: {
        organizationId,
        providerStatus: { in: statuses },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        language: true,
        category: true,
        bodyTemplate: true,
        variableSchema: true,
        providerStatus: true,
      },
    });

    return {
      items: templates.map((template) => ({
        id: template.id,
        name: template.name,
        language: template.language,
        category: template.category,
        bodyTemplate: template.bodyTemplate,
        variableSchema: template.variableSchema,
        providerStatus: template.providerStatus,
      })),
    };
  }

  private async requireWhatsAppConversationRow(organizationId: string, conversationId: string) {
    const row = await this.readRepository.findConversationById(organizationId, conversationId);
    if (!row) {
      throw CommunicationReplyError.notFound();
    }
    if (row.channel !== CommunicationChannel.WHATSAPP) {
      throw new BadRequestException('WhatsApp operations are only available for WhatsApp conversations');
    }
    return row;
  }

  private async requireNativeConversationId(organizationId: string, conversationId: string): Promise<string> {
    const canonical = await this.prisma.communicationConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { nativeConversationId: true },
    });
    if (!canonical?.nativeConversationId) {
      throw CommunicationReplyError.notFound();
    }
    return canonical.nativeConversationId;
  }

  private async requireNativeWhatsAppConversation(organizationId: string, nativeConversationId: string) {
    const native = await this.prisma.whatsAppConversation.findFirst({
      where: { id: nativeConversationId, organizationId },
    });
    if (!native) {
      throw new NotFoundException('WhatsApp conversation not found');
    }
    return native;
  }
}
