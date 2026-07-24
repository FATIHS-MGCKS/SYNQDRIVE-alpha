import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { LlmGatewayService } from '../llm/llm-gateway.service';
import {
  buildEnrichedChatMessage,
  FLEET_CHAT_SYSTEM_PROMPT,
  FleetVehicleInfo,
  formatChatScopeLog,
  resolveChatVehicleTokenIds,
  tryResolveVehicle,
} from './fleet-chat-context.util';
import { ExternalAccessEnforcementService } from '@modules/data-authorizations/external-access-enforcement/external-access-enforcement.service';
import { minimizeRecordFields } from '@modules/data-authorizations/external-access-enforcement/external-access-data-minimizer';

export interface ChatMessageResult {
  id?: string;
  role: string;
  content: string;
  createdAt: Date;
}

interface LlmChatResult {
  success: boolean;
  response?: string;
  error?: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmGatewayService,
    @Optional() private readonly externalAccess?: ExternalAccessEnforcementService,
  ) {}

  isConfigured(): boolean {
    return this.llm.isConfigured();
  }

  /**
   * Ensures org metadata exists for chat. `dimoAgentId` field is kept for API
   * compatibility — it stores the active LLM provider id (e.g. mistral).
   * OrganizationChatAgent table cleanup is a separate future migration.
   */
  async ensureAgent(orgId: string): Promise<{ agentName: string; dimoAgentId: string }> {
    const existing = await this.prisma.organizationChatAgent.findUnique({
      where: { organizationId: orgId },
    });
    if (existing) {
      return { agentName: existing.agentName, dimoAgentId: existing.dimoAgentId };
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { shortCode: true, companyName: true },
    });
    if (!org) throw new Error('Organization not found');

    const shortCode = org.shortCode || this.deriveShortCode(org.companyName);

    if (!org.shortCode) {
      await this.prisma.organization
        .update({
          where: { id: orgId },
          data: { shortCode },
        })
        .catch(() => {
          this.logger.warn(`[Chat] Could not auto-assign shortCode "${shortCode}" (may conflict)`);
        });
    }

    const agentName = `${shortCode}_chatagent`;
    const providerId = this.llm.isConfigured() ? this.llm.activeProviderId : 'unconfigured';
    this.logger.log(`[Chat] Registering fleet chat agent "${agentName}" for org ${orgId} (${providerId})`);

    const record = await this.prisma.organizationChatAgent.create({
      data: {
        organizationId: orgId,
        agentName,
        dimoAgentId: providerId,
      },
    });

    return { agentName: record.agentName, dimoAgentId: record.dimoAgentId };
  }

  async sendMessage(orgId: string, content: string): Promise<ChatMessageResult> {
    const { error } = await this.ensureAgentSafe(orgId);
    if (error) return this.persistAssistant(orgId, error);

    await this.saveUserMessage(orgId, content);
    const aiDenied = await this.assertAiAllowed(orgId);
    if (aiDenied) return this.persistAssistant(orgId, aiDenied);

    const { enrichedMessage, tokenIds } = await this.buildContext(orgId, content);

    const result = await this.callLlm(enrichedMessage);
    if (!result.success) {
      return this.persistAssistant(orgId, formatChatError(result));
    }

    return this.persistAssistant(orgId, result.response || 'No response received.');
  }

  async streamMessage(
    orgId: string,
    content: string,
    emit: (event: string, data: unknown) => void,
    isClosed: () => boolean,
  ): Promise<void> {
    const { error } = await this.ensureAgentSafe(orgId);
    if (error) {
      const saved = await this.persistAssistant(orgId, error);
      if (!isClosed()) emit('result', this.toResultDto(saved));
      return;
    }
    if (!isClosed()) emit('status', { agentReady: true });

    await this.saveUserMessage(orgId, content);
    const aiDenied = await this.assertAiAllowed(orgId);
    if (aiDenied) {
      const saved = await this.persistAssistant(orgId, aiDenied);
      if (!isClosed()) emit('result', this.toResultDto(saved));
      return;
    }

    const { enrichedMessage, tokenIds } = await this.buildContext(orgId, content);

    const result = await this.callLlm(enrichedMessage, (chunk) => {
      if (!isClosed()) emit('progress', chunk);
    });

    const text = result.success
      ? result.response || 'No response received.'
      : formatChatError(result);

    const saved = await this.persistAssistant(orgId, text);
    if (!isClosed()) emit('result', this.toResultDto(saved));
  }

  async getHistory(orgId: string, limit = 100, before?: string) {
    const where: Record<string, unknown> = { organizationId: orgId };
    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const messages = await this.prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, role: true, content: true, createdAt: true },
    });

    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async clearHistory(orgId: string) {
    await this.prisma.chatMessage.deleteMany({ where: { organizationId: orgId } });
    return { cleared: true };
  }

  async getAgentInfo(orgId: string) {
    const agent = await this.prisma.organizationChatAgent.findUnique({
      where: { organizationId: orgId },
      select: { agentName: true, dimoAgentId: true, createdAt: true },
    });
    const messageCount = await this.prisma.chatMessage.count({ where: { organizationId: orgId } });
    return { agent, messageCount };
  }

  private async ensureAgentSafe(
    orgId: string,
  ): Promise<{ error?: string }> {
    if (!this.isConfigured()) {
      return {
        error:
          'The AI assistant is not configured on this server (MISTRAL_API_KEY missing). Please contact your administrator.',
      };
    }
    try {
      await this.ensureAgent(orgId);
      return {};
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Chat] ensureAgent failed for org ${orgId}: ${message}`);
      return {
        error: "I'm sorry, I couldn't connect to the AI assistant right now. Please try again in a moment.",
      };
    }
  }

  private async assertAiAllowed(orgId: string): Promise<string | null> {
    if (!this.externalAccess) return null;
    const auth = await this.externalAccess.checkUseForAi({
      organizationId: orgId,
      channelKey: 'fleet_chat',
      correlationId: `fleet-chat-ai:${orgId}:${Date.now()}`,
    });
    if (auth.mayProceed) return null;
    this.logger.warn(`[Chat] AI access denied org=${orgId} reason=${auth.reasonCode}`);
    return 'AI fleet assistant access is not authorized for this organization.';
  }

  private async buildContext(
    orgId: string,
    content: string,
  ): Promise<{ enrichedMessage: string; tokenIds?: number[] }> {
    const fleet = await this.getOrgFleetInfo(orgId);
    const minimizationSpec = this.externalAccess?.resolveChannelSpec('fleet_chat')?.minimization;
    const scopedFleet = minimizationSpec
      ? fleet.map((vehicle) => ({
          ...vehicle,
          ...minimizeRecordFields(vehicle as unknown as Record<string, unknown>, minimizationSpec),
        }))
      : fleet;
    const resolvedVehicle = tryResolveVehicle(content, scopedFleet);
    const tokenIds = resolveChatVehicleTokenIds(resolvedVehicle?.tokenId);
    const enrichedMessage = buildEnrichedChatMessage(content, scopedFleet, resolvedVehicle);
    this.logger.log(`[Chat] ${formatChatScopeLog(orgId, tokenIds)}`);
    return { enrichedMessage, tokenIds };
  }

  private async callLlm(
    enrichedMessage: string,
    onChunk?: (event: { type: string; content: string }) => void,
  ): Promise<LlmChatResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'AI provider not configured' };
    }

    const messages = [
      { role: 'system' as const, content: FLEET_CHAT_SYSTEM_PROMPT },
      { role: 'user' as const, content: enrichedMessage },
    ];

    try {
      if (onChunk && this.llm.isStreamingEnabled()) {
        let content = '';
        await this.llm.stream({
          purpose: 'chat',
          messages,
          onEvent: async (evt) => {
            if (evt.type === 'delta' && evt.delta) {
              onChunk({ type: 'token', content: evt.delta });
            }
            if (evt.type === 'delta' && evt.content && !evt.delta) {
              onChunk({ type: 'token', content: evt.content });
            }
            if (evt.type === 'done') {
              content = evt.content ?? content;
            }
            if (evt.type === 'error') {
              throw new Error(evt.error ?? 'Stream failed');
            }
          },
        });
        return { success: true, response: content };
      }

      const result = await this.llm.complete({ purpose: 'chat', messages });
      return { success: true, response: result.content };
    } catch (err: unknown) {
      return { success: false, error: sanitizeChatError(err) };
    }
  }

  private async saveUserMessage(orgId: string, content: string): Promise<void> {
    await this.prisma.chatMessage
      .create({ data: { organizationId: orgId, role: 'user', content } })
      .catch(() => {});
  }

  private async persistAssistant(orgId: string, content: string): Promise<ChatMessageResult> {
    const saved = await this.prisma.chatMessage
      .create({
        data: { organizationId: orgId, role: 'assistant', content },
        select: { id: true, createdAt: true },
      })
      .catch(() => ({ id: undefined as string | undefined, createdAt: new Date() }));
    return { id: saved.id, role: 'assistant', content, createdAt: saved.createdAt };
  }

  private toResultDto(msg: ChatMessageResult) {
    return {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    };
  }

  private async getOrgFleetInfo(orgId: string): Promise<FleetVehicleInfo[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        licensePlate: true,
        vehicleName: true,
        make: true,
        model: true,
        year: true,
        vin: true,
        fuelType: true,
        dimoVehicle: { select: { tokenId: true } },
      },
    });
    return vehicles.map((v) => ({
      vehicleId: v.id,
      licensePlate: v.licensePlate,
      vehicleName: v.vehicleName,
      make: v.make,
      model: v.model,
      year: v.year,
      vin: v.vin,
      fuelType: v.fuelType,
      tokenId: v.dimoVehicle?.tokenId ?? null,
    }));
  }

  private deriveShortCode(companyName: string): string {
    const cleaned = companyName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .toLowerCase();
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'org';
    if (words.length === 1) return words[0].slice(0, 6);
    return words.map((w) => w[0]).join('').slice(0, 6);
  }
}

function formatChatError(result: LlmChatResult): string {
  if (!result.error) {
    return "I'm sorry, I couldn't process your request right now. Please try again.";
  }
  if (/not configured/i.test(result.error)) {
    return 'The AI assistant is not configured on this server. Please contact your administrator.';
  }
  return `I'm sorry, I couldn't complete your request. ${result.error.slice(0, 200)}`;
}

function sanitizeChatError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9]+/gi, 'sk-[redacted]')
    .slice(0, 300);
}
