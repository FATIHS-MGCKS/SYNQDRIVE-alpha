import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { ChatService } from './chat.service';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
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

  async updateConfig(orgId: string, data: {
    aiMode?: string;
    aiCanCreateTasks?: boolean;
    aiCanCreateSupport?: boolean;
    aiCanUseBookings?: boolean;
    aiCanContactVendors?: boolean;
    aiEscalationEnabled?: boolean;
    isActive?: boolean;
  }) {
    const update: any = {};
    if (data.aiMode !== undefined) update.aiMode = data.aiMode;
    if (data.aiCanCreateTasks !== undefined) update.aiCanCreateTasks = data.aiCanCreateTasks;
    if (data.aiCanCreateSupport !== undefined) update.aiCanCreateSupport = data.aiCanCreateSupport;
    if (data.aiCanUseBookings !== undefined) update.aiCanUseBookings = data.aiCanUseBookings;
    if (data.aiCanContactVendors !== undefined) update.aiCanContactVendors = data.aiCanContactVendors;
    if (data.aiEscalationEnabled !== undefined) update.aiEscalationEnabled = data.aiEscalationEnabled;
    if (data.isActive !== undefined) update.isActive = data.isActive;

    const config = await this.prisma.orgWhatsAppConfig.upsert({
      where: { organizationId: orgId },
      update,
      create: { organizationId: orgId, ...update },
    });
    return this.mapConfig(config);
  }

  async connect(orgId: string, body: { phoneNumber: string; businessName?: string; connectedByName?: string }) {
    const config = await this.prisma.orgWhatsAppConfig.upsert({
      where: { organizationId: orgId },
      update: {
        isConnected: true,
        isActive: true,
        phoneNumber: body.phoneNumber,
        businessName: body.businessName || null,
        connectedAt: new Date(),
        connectedByName: body.connectedByName || null,
      },
      create: {
        organizationId: orgId,
        isConnected: true,
        isActive: true,
        phoneNumber: body.phoneNumber,
        businessName: body.businessName || null,
        connectedAt: new Date(),
        connectedByName: body.connectedByName || null,
      },
    });

    await this.chatService.ensureAgent(orgId);
    return this.mapConfig(config);
  }

  async disconnect(orgId: string) {
    const config = await this.prisma.orgWhatsAppConfig.upsert({
      where: { organizationId: orgId },
      update: {
        isConnected: false,
        isActive: false,
        phoneNumber: null,
        businessName: null,
        connectedAt: null,
        connectedByName: null,
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
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      lastMessagePreview: c.lastMessagePreview,
      unreadCount: c.unreadCount,
      status: c.status,
      assignedTo: c.assignedTo,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async getMessages(orgId: string, conversationId: string) {
    const convo = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, organizationId: orgId },
    });
    if (!convo) return [];

    const messages = await this.prisma.whatsAppMessage.findMany({
      where: { conversationId, organizationId: orgId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    });

    return messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      senderType: m.senderType,
      senderName: m.senderName,
      content: m.content,
      aiGenerated: m.aiGenerated,
      aiSuggested: m.aiSuggested,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async sendMessage(orgId: string, conversationId: string, content: string, senderName?: string) {
    const convo = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, organizationId: orgId },
    });
    if (!convo) throw new Error('Conversation not found');

    const msg = await this.prisma.whatsAppMessage.create({
      data: {
        organizationId: orgId,
        conversationId,
        direction: 'outgoing',
        senderType: 'human',
        senderName: senderName || null,
        content,
        status: 'sent',
      },
    });

    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), lastMessagePreview: content.slice(0, 120) },
    });

    return {
      id: msg.id,
      direction: msg.direction,
      senderType: msg.senderType,
      senderName: msg.senderName,
      content: msg.content,
      aiGenerated: false,
      aiSuggested: false,
      status: msg.status,
      createdAt: msg.createdAt.toISOString(),
    };
  }

  async getAiSuggestion(orgId: string, conversationId: string) {
    const config = await this.prisma.orgWhatsAppConfig.findUnique({
      where: { organizationId: orgId },
    });
    if (!config || config.aiMode === 'OFF') return { suggestion: null, reason: 'AI is disabled' };

    const messages = await this.prisma.whatsAppMessage.findMany({
      where: { conversationId, organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (messages.length === 0) return { suggestion: null, reason: 'No messages in conversation' };

    const recent = [...messages].reverse();
    const lastIncoming = recent.filter((m) => m.direction === 'incoming').pop();
    if (!lastIncoming) return { suggestion: null, reason: 'No incoming message to respond to' };

    const contextLines = recent.map((m) => {
      const who = m.direction === 'incoming' ? 'Customer' : 'Team';
      return `${who}: ${m.content}`;
    });

    const convo = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      select: { contactName: true, contactPhone: true },
    });

    const prompt = [
      'You are a professional WhatsApp business assistant for a vehicle rental company.',
      `Customer: ${convo?.contactName || convo?.contactPhone || 'Unknown'}`,
      'Recent conversation:',
      ...contextLines,
      '',
      'Write a concise, professional, friendly reply to the customer\'s latest message.',
      'Reply in the same language the customer used. Keep it short (1-3 sentences).',
      'Do not include greetings if the conversation is already ongoing.',
    ].join('\n');

    try {
      const response = await this.chatService.sendMessage(orgId, prompt);
      return { suggestion: response.content, reason: null };
    } catch (err: any) {
      this.logger.error(`[WhatsApp] AI suggestion failed: ${err.message}`);
      return { suggestion: null, reason: 'AI service unavailable' };
    }
  }

  async sendAiReply(orgId: string, conversationId: string, content: string) {
    const convo = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, organizationId: orgId },
    });
    if (!convo) throw new Error('Conversation not found');

    const msg = await this.prisma.whatsAppMessage.create({
      data: {
        organizationId: orgId,
        conversationId,
        direction: 'outgoing',
        senderType: 'ai',
        senderName: 'SynqDrive AI',
        content,
        aiGenerated: true,
        status: 'sent',
      },
    });

    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), lastMessagePreview: content.slice(0, 120) },
    });

    return {
      id: msg.id,
      direction: msg.direction,
      senderType: msg.senderType,
      senderName: msg.senderName,
      content: msg.content,
      aiGenerated: true,
      aiSuggested: false,
      status: msg.status,
      createdAt: msg.createdAt.toISOString(),
    };
  }

  async simulateIncoming(orgId: string, body: { contactPhone: string; contactName?: string; content: string }) {
    let convo = await this.prisma.whatsAppConversation.findFirst({
      where: { organizationId: orgId, contactPhone: body.contactPhone },
    });
    if (!convo) {
      convo = await this.prisma.whatsAppConversation.create({
        data: {
          organizationId: orgId,
          contactPhone: body.contactPhone,
          contactName: body.contactName || null,
          status: 'open',
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
        status: 'delivered',
      },
    });

    await this.prisma.whatsAppConversation.update({
      where: { id: convo.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: body.content.slice(0, 120),
        unreadCount: { increment: 1 },
        contactName: body.contactName || convo.contactName,
      },
    });

    const config = await this.prisma.orgWhatsAppConfig.findUnique({
      where: { organizationId: orgId },
    });
    if (config?.isActive && config.aiMode === 'AUTO_SIMPLE' || config?.aiMode === 'FULL') {
      this.handleAutoReply(orgId, convo.id).catch((err) =>
        this.logger.warn(`[WhatsApp] Auto-reply failed: ${err.message}`),
      );
    }

    return {
      conversationId: convo.id,
      message: {
        id: msg.id,
        direction: msg.direction,
        senderType: msg.senderType,
        senderName: msg.senderName,
        content: msg.content,
        aiGenerated: false,
        aiSuggested: false,
        status: msg.status,
        createdAt: msg.createdAt.toISOString(),
      },
    };
  }

  private async handleAutoReply(orgId: string, conversationId: string) {
    const suggestion = await this.getAiSuggestion(orgId, conversationId);
    if (suggestion.suggestion) {
      await this.sendAiReply(orgId, conversationId, suggestion.suggestion);
    }
  }

  async getStats(orgId: string) {
    const config = await this.prisma.orgWhatsAppConfig.findUnique({
      where: { organizationId: orgId },
    });
    const totalConversations = await this.prisma.whatsAppConversation.count({
      where: { organizationId: orgId },
    });
    const openConversations = await this.prisma.whatsAppConversation.count({
      where: { organizationId: orgId, status: 'open' },
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
      aiMode: config?.aiMode ?? 'OFF',
    };
  }

  private mapConfig(c: any) {
    return {
      id: c.id,
      organizationId: c.organizationId,
      isConnected: c.isConnected,
      isActive: c.isActive,
      phoneNumber: c.phoneNumber,
      businessName: c.businessName,
      aiMode: c.aiMode,
      aiCanCreateTasks: c.aiCanCreateTasks,
      aiCanCreateSupport: c.aiCanCreateSupport,
      aiCanUseBookings: c.aiCanUseBookings,
      aiCanContactVendors: c.aiCanContactVendors,
      aiEscalationEnabled: c.aiEscalationEnabled,
      connectedAt: c.connectedAt?.toISOString() ?? null,
      connectedByName: c.connectedByName,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
