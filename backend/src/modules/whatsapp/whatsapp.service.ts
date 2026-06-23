import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WhatsAppAiMode,
  WhatsAppConversationStatus,
  WhatsAppMessageDeliveryStatus,
  WhatsAppProviderStatus,
  WhatsAppAiDecision,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { WhatsAppAiRouterService } from './whatsapp-ai-router.service';
import { WhatsAppProviderService } from './providers/whatsapp-provider.service';
import { WhatsAppConsentService } from './whatsapp-consent.service';
import { WhatsAppMessagePolicyService } from './whatsapp-message-policy.service';
import { WhatsAppConversationMatcherService } from './whatsapp-conversation-matcher.service';
import { normalizePhoneNumber } from './utils/whatsapp-phone.util';
import {
  WhatsAppProviderNotConfiguredException,
  WhatsAppSimulationDisabledException,
} from './utils/whatsapp-errors';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: WhatsAppAiRouterService,
    private readonly configService: ConfigService,
    private readonly provider: WhatsAppProviderService,
    private readonly consent: WhatsAppConsentService,
    private readonly policy: WhatsAppMessagePolicyService,
    private readonly matcher: WhatsAppConversationMatcherService,
    private readonly audit: AuditService,
  ) {}

  async getConfig(orgId: string) {
    let config = await this.prisma.orgWhatsAppConfig.findUnique({
      where: { organizationId: orgId },
    });
    if (!config) {
      config = await this.prisma.orgWhatsAppConfig.create({
        data: { organizationId: orgId },
      });
    }
    return this.mapConfig(config);
  }

  async updateConfig(
    orgId: string,
    data: {
      aiMode?: string;
      aiCanCreateTasks?: boolean;
      aiCanCreateSupport?: boolean;
      aiCanUseBookings?: boolean;
      aiCanContactVendors?: boolean;
      aiEscalationEnabled?: boolean;
      isActive?: boolean;
      phoneNumberId?: string;
      wabaId?: string;
      webhookVerifyToken?: string;
      accessTokenConfigured?: boolean;
      appSecretConfigured?: boolean;
      serviceWindowOpen?: boolean;
    },
  ) {
    const update: Record<string, unknown> = {};
    const fields = [
      'aiMode',
      'aiCanCreateTasks',
      'aiCanCreateSupport',
      'aiCanUseBookings',
      'aiCanContactVendors',
      'aiEscalationEnabled',
      'isActive',
      'phoneNumberId',
      'wabaId',
      'webhookVerifyToken',
      'accessTokenConfigured',
      'appSecretConfigured',
      'serviceWindowOpen',
    ] as const;

    for (const key of fields) {
      if (data[key] !== undefined) update[key] = data[key];
    }

    if (data.phoneNumberId && data.accessTokenConfigured) {
      update.providerStatus = WhatsAppProviderStatus.CONFIGURED;
    }

    const config = await this.prisma.orgWhatsAppConfig.upsert({
      where: { organizationId: orgId },
      update,
      create: { organizationId: orgId, ...update },
    });
    return this.mapConfig(config);
  }

  async connect(
    orgId: string,
    body: {
      phoneNumber: string;
      businessName?: string;
      connectedByName?: string;
      phoneNumberId?: string;
      wabaId?: string;
    },
  ) {
    const config = await this.prisma.orgWhatsAppConfig.upsert({
      where: { organizationId: orgId },
      update: {
        isConnected: true,
        isActive: true,
        phoneNumber: body.phoneNumber,
        phoneNumberId: body.phoneNumberId ?? undefined,
        wabaId: body.wabaId ?? undefined,
        businessName: body.businessName || null,
        connectedAt: new Date(),
        connectedByName: body.connectedByName || null,
        providerStatus: body.phoneNumberId
          ? WhatsAppProviderStatus.CONFIGURED
          : WhatsAppProviderStatus.NOT_CONFIGURED,
      },
      create: {
        organizationId: orgId,
        isConnected: true,
        isActive: true,
        phoneNumber: body.phoneNumber,
        phoneNumberId: body.phoneNumberId ?? null,
        wabaId: body.wabaId ?? null,
        businessName: body.businessName || null,
        connectedAt: new Date(),
        connectedByName: body.connectedByName || null,
        providerStatus: body.phoneNumberId
          ? WhatsAppProviderStatus.CONFIGURED
          : WhatsAppProviderStatus.NOT_CONFIGURED,
      },
    });

    return this.mapConfig(config);
  }

  async disconnect(orgId: string) {
    const config = await this.prisma.orgWhatsAppConfig.upsert({
      where: { organizationId: orgId },
      update: {
        isConnected: false,
        isActive: false,
        phoneNumber: null,
        phoneNumberId: null,
        wabaId: null,
        businessName: null,
        connectedAt: null,
        connectedByName: null,
        providerStatus: WhatsAppProviderStatus.NOT_CONFIGURED,
      },
      create: { organizationId: orgId },
    });
    return this.mapConfig(config);
  }

  async getConversations(orgId: string) {
    const convos = await this.prisma.whatsAppConversation.findMany({
      where: { organizationId: orgId },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });
    return convos.map((c) => ({
      id: c.id,
      contactPhone: c.contactPhone,
      contactName: c.contactName,
      customerId: c.customerId,
      bookingId: c.bookingId,
      vehicleId: c.vehicleId,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: c.lastMessagePreview,
      unreadCount: c.unreadCount,
      status: c.status,
      assignedTo: c.assignedTo,
      intent: c.lastDetectedIntent,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async getMessages(orgId: string, conversationId: string) {
    const convo = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, organizationId: orgId },
    });
    if (!convo) throw new NotFoundException('Conversation not found');

    const messages = await this.prisma.whatsAppMessage.findMany({
      where: { conversationId, organizationId: orgId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    });

    return messages.map((m) => this.mapMessage(m));
  }

  async sendMessage(orgId: string, conversationId: string, content: string, senderName?: string) {
    const config = await this.requireConfig(orgId);
    const convo = await this.requireConversation(orgId, conversationId);

    const freeText = this.policy.canSendFreeText(orgId, config, convo);
    if (!freeText.allowed) {
      const { WhatsAppFreeTextBlockedException } = await import('./utils/whatsapp-errors');
      throw new WhatsAppFreeTextBlockedException(freeText.reason!);
    }

    await this.consent.assertCanSend(orgId, convo.contactPhone, 'support');

    const msg = await this.prisma.whatsAppMessage.create({
      data: {
        organizationId: orgId,
        conversationId,
        direction: 'outgoing',
        senderType: 'human',
        senderName: senderName || null,
        content,
        messageType: 'text',
        status: WhatsAppMessageDeliveryStatus.QUEUED,
      },
    });

    let finalStatus: WhatsAppMessageDeliveryStatus = WhatsAppMessageDeliveryStatus.FAILED;
    let providerMessageId: string | null = null;
    let failureReason: string | null = null;

    if (!this.provider.isConfigured(config)) {
      failureReason = 'WHATSAPP_PROVIDER_NOT_CONFIGURED';
      await this.prisma.whatsAppMessage.update({
        where: { id: msg.id },
        data: { status: WhatsAppMessageDeliveryStatus.FAILED, failureReason },
      });
      throw new WhatsAppProviderNotConfiguredException();
    }

    const result = await this.provider.sendTextMessage(config, convo.contactPhone, content, {
      organizationId: orgId,
      conversationId,
      messageId: msg.id,
    });

    finalStatus =
      result.status === 'FAILED'
        ? WhatsAppMessageDeliveryStatus.FAILED
        : WhatsAppMessageDeliveryStatus.SENT;
    providerMessageId = result.providerMessageId || null;
    failureReason = result.failureReason ?? null;

    const updated = await this.prisma.whatsAppMessage.update({
      where: { id: msg.id },
      data: {
        status: finalStatus,
        providerMessageId,
        failureReason,
      },
    });

    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), lastMessagePreview: content.slice(0, 120) },
    });

    void this.audit.record({
      actorOrganizationId: orgId,
      action: ActivityAction.CREATE,
      entity: ActivityEntity.INTEGRATION,
      entityId: msg.id,
      description: 'Outbound WhatsApp message sent by human operator',
    });

    return this.mapMessage(updated);
  }

  async getAiSuggestion(orgId: string, conversationId: string) {
    const config = await this.requireConfig(orgId);
    if (config.aiMode === WhatsAppAiMode.OFF) {
      return {
        suggestedReply: null,
        intent: 'UNKNOWN',
        confidence: 0,
        riskFlags: [],
        usedTools: [],
        decision: 'HUMAN_REQUIRED',
        humanReason: 'AI is disabled',
        canSendAutomatically: false,
        reason: 'AI is disabled',
      };
    }

    const messages = await this.prisma.whatsAppMessage.findMany({
      where: { conversationId, organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (messages.length === 0) {
      return {
        suggestedReply: null,
        intent: 'UNKNOWN',
        confidence: 0,
        riskFlags: [],
        usedTools: [],
        decision: 'HUMAN_REQUIRED',
        humanReason: 'No messages in conversation',
        canSendAutomatically: false,
        reason: 'No messages in conversation',
      };
    }

    const lastIncoming = messages.find((m) => m.direction === 'incoming');
    if (!lastIncoming) {
      return {
        suggestedReply: null,
        intent: 'UNKNOWN',
        confidence: 0,
        riskFlags: [],
        usedTools: [],
        decision: 'HUMAN_REQUIRED',
        humanReason: 'No incoming message to respond to',
        canSendAutomatically: false,
        reason: 'No incoming message to respond to',
      };
    }

    const result = await this.aiRouter.route({
      orgId,
      conversationId,
      messageContent: lastIncoming.content,
      triggerMessageId: lastIncoming.id,
    });

    return {
      suggestedReply: result.suggestedReply,
      intent: result.intent,
      confidence: result.confidence,
      riskFlags: result.riskFlags,
      usedTools: result.usedTools,
      decision: result.decision,
      humanReason: result.humanReason,
      canSendAutomatically: result.canSendAutomatically,
      suggestionId: result.suggestionId,
      reason: result.reason,
      sourceContextIds: result.sourceContextIds,
      // backward compatibility for older clients
      suggestion: result.suggestedReply,
    };
  }

  async sendAiReply(orgId: string, conversationId: string, content: string, suggestionId?: string) {
    const config = await this.requireConfig(orgId);
    const convo = await this.requireConversation(orgId, conversationId);

    const latestSuggestion = suggestionId
      ? await this.prisma.whatsAppAiSuggestion.findFirst({
          where: { id: suggestionId, organizationId: orgId, conversationId },
        })
      : await this.prisma.whatsAppAiSuggestion.findFirst({
          where: { organizationId: orgId, conversationId },
          orderBy: { createdAt: 'desc' },
        });

    const riskFlags = (latestSuggestion?.riskFlags as string[] | undefined) ?? [];
    const confidence = latestSuggestion?.confidence ?? 0.5;

    this.policy.assertAutoReplyAllowed(config, convo, {
      intent: latestSuggestion?.intent,
      sensitiveFlags: riskFlags as any,
      confidence,
    });

    if (latestSuggestion?.decision !== WhatsAppAiDecision.AUTO_ALLOWED) {
      const autoCheck = this.policy.canAutoReply(config, convo, {
        intent: latestSuggestion?.intent,
        sensitiveFlags: riskFlags as any,
        confidence,
      });
      if (!autoCheck.allowed && !autoCheck.storeSuggestionOnly) {
        const { WhatsAppPolicyBlockedException } = await import('./utils/whatsapp-errors');
        throw new WhatsAppPolicyBlockedException(
          autoCheck.reason ?? 'AI auto-reply not permitted for this suggestion',
          riskFlags as any,
        );
      }
      if (config.aiMode === WhatsAppAiMode.SUGGEST_ONLY) {
        const { WhatsAppPolicyBlockedException } = await import('./utils/whatsapp-errors');
        throw new WhatsAppPolicyBlockedException('AI is suggest-only — manual send required');
      }
    }

    const sent = await this.sendMessage(orgId, conversationId, content, 'SynqDrive AI');

    if (latestSuggestion) {
      await this.prisma.whatsAppAiSuggestion.update({
        where: { id: latestSuggestion.id },
        data: { sentMessageId: sent.id },
      });
      await this.prisma.whatsAppMessage.update({
        where: { id: sent.id },
        data: { aiGenerated: true, aiSuggested: true },
      });
    }

    return sent;
  }

  async requestHumanReview(orgId: string, conversationId: string, reason: string, userId?: string) {
    return this.aiRouter.requestHumanReview(orgId, conversationId, reason, userId, true);
  }

  async simulateIncoming(
    orgId: string,
    body: { contactPhone: string; contactName?: string; content: string },
  ) {
    if (!this.isSimulationAllowed()) {
      throw new WhatsAppSimulationDisabledException();
    }

    const phoneNormalized = normalizePhoneNumber(body.contactPhone);
    if (!phoneNormalized) throw new NotFoundException('Invalid phone number');

    const match = await this.matcher.matchContext(orgId, body.contactPhone, body.contactName);

    let convo = await this.prisma.whatsAppConversation.findUnique({
      where: {
        organizationId_contactPhoneNormalized: {
          organizationId: orgId,
          contactPhoneNormalized: phoneNormalized,
        },
      },
    });

    if (!convo) {
      convo = await this.prisma.whatsAppConversation.create({
        data: {
          organizationId: orgId,
          contactPhone: body.contactPhone,
          contactPhoneNormalized: phoneNormalized,
          contactName: match.contactName,
          customerId: match.customerId,
          bookingId: match.bookingId,
          vehicleId: match.vehicleId,
          status: match.status,
        },
      });
    }

    const msg = await this.prisma.whatsAppMessage.create({
      data: {
        organizationId: orgId,
        conversationId: convo.id,
        direction: 'incoming',
        senderType: 'customer',
        senderName: body.contactName || null,
        content: body.content,
        messageType: 'text',
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
        providerMessageId: `sim:${orgId}:${Date.now()}`,
      },
    });

    await this.prisma.whatsAppConversation.update({
      where: { id: convo.id },
      data: {
        lastMessageAt: new Date(),
        lastCustomerMessageAt: new Date(),
        lastMessagePreview: body.content.slice(0, 120),
        unreadCount: { increment: 1 },
        contactName: body.contactName || convo.contactName,
      },
    });

    await this.consent.processInboundConsentKeywords(
      orgId,
      body.contactPhone,
      body.content,
      match.customerId,
    );

    void this.audit.record({
      actorOrganizationId: orgId,
      action: ActivityAction.CREATE,
      entity: ActivityEntity.INTEGRATION,
      description: 'SIMULATED_INCOMING_MESSAGE',
      metaJson: { sandbox: true, conversationId: convo.id },
    });

    const config = await this.prisma.orgWhatsAppConfig.findUnique({
      where: { organizationId: orgId },
    });

    if (
      config?.isActive &&
      (config.aiMode === WhatsAppAiMode.AUTO_SIMPLE || config.aiMode === WhatsAppAiMode.FULL)
    ) {
      this.processInboundAutoReply(orgId, convo.id).catch((err: Error) =>
        this.logger.warn(`[WhatsApp] Auto-reply failed: ${err.message}`),
      );
    }

    return {
      sandbox: true,
      conversationId: convo.id,
      message: this.mapMessage(msg),
    };
  }

  /** Called after real webhook inbound messages (and dev simulation) when AI auto modes are on. */
  async processInboundAutoReply(orgId: string, conversationId: string): Promise<void> {
    await this.handleAutoReply(orgId, conversationId);
  }

  private async handleAutoReply(orgId: string, conversationId: string) {
    const config = await this.requireConfig(orgId);
    const convo = await this.requireConversation(orgId, conversationId);

    const messages = await this.prisma.whatsAppMessage.findMany({
      where: { conversationId, organizationId: orgId, direction: 'incoming' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    const lastIncoming = messages[0];
    if (!lastIncoming) return;

    const routed = await this.aiRouter.route({
      orgId,
      conversationId,
      messageContent: lastIncoming.content,
      triggerMessageId: lastIncoming.id,
    });

    if (!routed.suggestedReply || !routed.canSendAutomatically) return;

    const decision = this.policy.canAutoReply(config, convo, {
      intent: routed.intent,
      confidence: routed.confidence,
      sensitiveFlags: routed.riskFlags,
    });
    if (!decision.allowed || decision.storeSuggestionOnly) return;

    await this.sendAiReply(orgId, conversationId, routed.suggestedReply, routed.suggestionId ?? undefined);
  }

  async getStats(orgId: string) {
    const config = await this.prisma.orgWhatsAppConfig.findUnique({
      where: { organizationId: orgId },
    });
    const totalConversations = await this.prisma.whatsAppConversation.count({
      where: { organizationId: orgId },
    });
    const openConversations = await this.prisma.whatsAppConversation.count({
      where: { organizationId: orgId, status: WhatsAppConversationStatus.OPEN },
    });
    const totalMessages = await this.prisma.whatsAppMessage.count({
      where: { organizationId: orgId },
    });
    const aiMessages = await this.prisma.whatsAppMessage.count({
      where: { organizationId: orgId, aiGenerated: true },
    });
    const unreadTotal = await this.prisma.whatsAppConversation.aggregate({
      where: { organizationId: orgId },
      _sum: { unreadCount: true },
    });

    return {
      totalConversations,
      openConversations,
      totalMessages,
      aiMessages,
      unreadTotal: unreadTotal._sum.unreadCount || 0,
      isConnected: config?.isConnected ?? false,
      isActive: config?.isActive ?? false,
      providerStatus: config?.providerStatus ?? 'NOT_CONFIGURED',
      aiMode: config?.aiMode ?? 'OFF',
      lastWebhookAt: config?.lastWebhookAt?.toISOString() ?? null,
    };
  }

  /** Dev-only inbound simulation — gated by whatsapp.simulateEnabled (never on in production). */
  private isSimulationAllowed(): boolean {
    return this.configService.get<boolean>('whatsapp.simulateEnabled', false);
  }

  private async requireConfig(orgId: string) {
    const config = await this.prisma.orgWhatsAppConfig.findUnique({
      where: { organizationId: orgId },
    });
    if (!config) throw new NotFoundException('WhatsApp config not found');
    return config;
  }

  private async requireConversation(orgId: string, conversationId: string) {
    const convo = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, organizationId: orgId },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    return convo;
  }

  private mapConfig(c: {
    id: string;
    organizationId: string;
    isConnected: boolean;
    isActive: boolean;
    phoneNumber: string | null;
    phoneNumberId: string | null;
    wabaId: string | null;
    businessName: string | null;
    providerStatus: string;
    aiMode: string;
    aiCanCreateTasks: boolean;
    aiCanCreateSupport: boolean;
    aiCanUseBookings: boolean;
    aiCanContactVendors: boolean;
    aiEscalationEnabled: boolean;
    connectedAt: Date | null;
    connectedByName: string | null;
    lastWebhookAt: Date | null;
    accessTokenConfigured: boolean;
    appSecretConfigured: boolean;
    serviceWindowOpen: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: c.id,
      organizationId: c.organizationId,
      isConnected: c.isConnected,
      isActive: c.isActive,
      phoneNumber: c.phoneNumber,
      phoneNumberId: c.phoneNumberId,
      wabaId: c.wabaId,
      businessName: c.businessName,
      providerStatus: c.providerStatus,
      providerConfigured: c.accessTokenConfigured && Boolean(c.phoneNumberId),
      accessTokenConfigured: c.accessTokenConfigured,
      appSecretConfigured: c.appSecretConfigured,
      serviceWindowOpen: c.serviceWindowOpen,
      aiMode: c.aiMode,
      aiCanCreateTasks: c.aiCanCreateTasks,
      aiCanCreateSupport: c.aiCanCreateSupport,
      aiCanUseBookings: c.aiCanUseBookings,
      aiCanContactVendors: c.aiCanContactVendors,
      aiEscalationEnabled: c.aiEscalationEnabled,
      connectedAt: c.connectedAt?.toISOString() ?? null,
      connectedByName: c.connectedByName,
      lastWebhookAt: c.lastWebhookAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }

  private mapMessage(m: {
    id: string;
    direction: string;
    senderType: string;
    senderName: string | null;
    content: string;
    aiGenerated: boolean;
    aiSuggested: boolean;
    status: string;
    messageType: string;
    templateName: string | null;
    providerMessageId: string | null;
    failureReason: string | null;
    createdAt: Date;
  }) {
    return {
      id: m.id,
      direction: m.direction,
      senderType: m.senderType,
      senderName: m.senderName,
      content: m.content,
      aiGenerated: m.aiGenerated,
      aiSuggested: m.aiSuggested,
      status: m.status,
      messageType: m.messageType,
      templateName: m.templateName,
      providerMessageId: m.providerMessageId,
      failureReason: m.failureReason,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
