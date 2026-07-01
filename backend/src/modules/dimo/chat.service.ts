import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoAgentsService, SendMessageResult } from './dimo-agents.service';
import { formatDimoAgentChatError } from './dimo-agent-error-classification.util';
import {
  formatAgentScopeLog,
  resolveChatVehicleTokenIds,
} from './dimo-agent-vehicle-scope.util';

export interface ChatMessageResult {
  id?: string;
  role: string;
  content: string;
  createdAt: Date;
}

interface FleetVehicleInfo {
  vehicleId: string;
  licensePlate: string | null;
  vehicleName: string | null;
  make: string;
  model: string;
  year: number;
  vin: string;
  fuelType: string;
  tokenId: number | null;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: DimoAgentsService,
  ) {}

  async ensureAgent(orgId: string): Promise<{ agentName: string; dimoAgentId: string }> {
    const existing = await this.prisma.organizationChatAgent.findUnique({
      where: { organizationId: orgId },
    });
    if (existing) return { agentName: existing.agentName, dimoAgentId: existing.dimoAgentId };

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { shortCode: true, companyName: true },
    });
    if (!org) throw new Error('Organization not found');

    const shortCode = org.shortCode || this.deriveShortCode(org.companyName);

    if (!org.shortCode) {
      await this.prisma.organization.update({
        where: { id: orgId },
        data: { shortCode },
      }).catch(() => {
        this.logger.warn(`[Chat] Could not auto-assign shortCode "${shortCode}" (may conflict)`);
      });
    }

    const agentName = `${shortCode}_chatagent`;
    this.logger.log(`[Chat] Creating DIMO agent "${agentName}" for org ${orgId}`);

    const result = await this.agentsService.getOrCreateAgent({
      useCase: 'fleet_chat',
      orgId,
    });
    if (!result.success || !result.agentId) {
      throw new Error(result.error || 'Failed to create DIMO agent');
    }

    const record = await this.prisma.organizationChatAgent.create({
      data: {
        organizationId: orgId,
        agentName,
        dimoAgentId: result.agentId,
      },
    });

    return { agentName: record.agentName, dimoAgentId: record.dimoAgentId };
  }

  /**
   * Non-streaming send (used by WhatsApp AI suggestions and as a programmatic
   * fallback). Internally uses the DIMO SSE stream endpoint to avoid the 504
   * gateway timeouts that the synchronous /message endpoint returns for any
   * request that requires real agent work (tool calls / telemetry lookups).
   */
  async sendMessage(orgId: string, content: string, locale?: string): Promise<ChatMessageResult> {
    const { agent, error } = await this.ensureAgentSafe(orgId);
    if (!agent) return this.persistAssistant(orgId, error as string);

    await this.saveUserMessage(orgId, content);
    const { enrichedMessage, tokenIds } = await this.buildContext(orgId, content);

    const result = await this.sendWithRetry(orgId, agent, enrichedMessage, tokenIds);

    if (!result.success) {
      return this.persistAssistant(orgId, formatDimoAgentChatError({ ...result, locale }));
    }

    return this.persistAssistant(orgId, result.response || 'No response received.');
  }

  /**
   * Streaming send for the AI Assistant UI. Emits SSE events:
   *  - `status`   { agentReady }        — agent confirmed/created
   *  - `progress` { type, content }     — live "thinking"/tool-call activity
   *  - `result`   ChatMessageResult     — final persisted assistant message
   *  - `error`    { message }           — only for truly unexpected failures
   * Friendly/degraded outcomes are returned via `result` (already persisted),
   * mirroring the non-streaming contract.
   */
  async streamMessage(
    orgId: string,
    content: string,
    emit: (event: string, data: unknown) => void,
    isClosed: () => boolean,
    locale?: string,
  ): Promise<void> {
    const { agent, error } = await this.ensureAgentSafe(orgId);
    if (!agent) {
      const saved = await this.persistAssistant(orgId, error as string);
      if (!isClosed()) emit('result', this.toResultDto(saved));
      return;
    }
    if (!isClosed()) emit('status', { agentReady: true });

    await this.saveUserMessage(orgId, content);
    const { enrichedMessage, tokenIds } = await this.buildContext(orgId, content);

    const result = await this.sendWithRetry(orgId, agent, enrichedMessage, tokenIds, (chunk) => {
      if (!isClosed()) emit('progress', chunk);
    });

    const text = result.success
      ? result.response || 'No response received.'
      : formatDimoAgentChatError({ ...result, locale });

    const saved = await this.persistAssistant(orgId, text);
    if (!isClosed()) emit('result', this.toResultDto(saved));
  }

  // ── shared orchestration helpers ────────────────────────────────────────

  /** Ensure an agent exists; on failure returns a friendly error string. */
  private async ensureAgentSafe(
    orgId: string,
  ): Promise<{ agent?: { agentName: string; dimoAgentId: string }; error?: string }> {
    try {
      const agent = await this.ensureAgent(orgId);
      return { agent };
    } catch (err: any) {
      this.logger.error(`[Chat] ensureAgent failed for org ${orgId}: ${err.message}`);
      return { error: "I'm sorry, I couldn't connect to the AI agent right now. Please try again in a moment." };
    }
  }

  /** Build the fleet-enriched message + optional vehicle scope for the agent. */
  private async buildContext(
    orgId: string,
    content: string,
  ): Promise<{ enrichedMessage: string; tokenIds?: number[]; hasVehicleScope: boolean }> {
    const fleet = await this.getOrgFleetInfo(orgId);
    const resolvedVehicle = this.tryResolveVehicle(content, fleet);
    const tokenIds = resolveChatVehicleTokenIds(resolvedVehicle?.tokenId);
    const enrichedMessage = this.buildEnrichedMessage(content, fleet, resolvedVehicle);
    this.logger.log(
      `[Chat] ${formatAgentScopeLog({ useCase: 'fleet_chat', orgId }, tokenIds)}`,
    );
    return { enrichedMessage, tokenIds, hasVehicleScope: Boolean(tokenIds?.length) };
  }

  private async saveUserMessage(orgId: string, content: string): Promise<void> {
    await this.prisma.chatMessage
      .create({ data: { organizationId: orgId, role: 'user', content } })
      .catch(() => {});
  }

  /**
   * Send via the DIMO SSE stream endpoint with one automatic agent-recreation
   * retry if the agent expired (404/410). `onChunk` forwards live activity.
   */
  private async sendWithRetry(
    orgId: string,
    agent: { agentName: string; dimoAgentId: string },
    enrichedMessage: string,
    tokenIds: number[] | undefined,
    onChunk?: (event: { type: string; content: string }) => void,
  ): Promise<SendMessageResult> {
    const streamContext = { useCase: 'fleet_chat' as const, orgId };
    let result = await this.agentsService.sendMessageStream(
      agent.dimoAgentId,
      enrichedMessage,
      tokenIds,
      onChunk,
      streamContext,
    );

    if (!result.success && (result.statusCode === 404 || result.statusCode === 410)) {
      this.logger.warn(`[Chat] Agent ${agent.dimoAgentId} expired, recreating...`);
      await this.agentsService.invalidateAgentCache({ useCase: 'fleet_chat', orgId });
      await this.prisma.organizationChatAgent.delete({ where: { organizationId: orgId } }).catch(() => {});
      try {
        const newAgent = await this.ensureAgent(orgId);
        result = await this.agentsService.sendMessageStream(
          newAgent.dimoAgentId,
          enrichedMessage,
          tokenIds,
          onChunk,
          streamContext,
        );
      } catch (retryErr: any) {
        this.logger.error(`[Chat] Agent re-creation failed: ${retryErr.message}`);
        result = { success: false, error: 'Agent temporarily unavailable. Please try again.' };
      }
    }

    return result;
  }

  /** Persist an assistant message and return the canonical result shape. */
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
    return { id: msg.id, role: msg.role, content: msg.content, createdAt: msg.createdAt.toISOString() };
  }

  async getHistory(orgId: string, limit = 100, before?: string) {
    const where: any = { organizationId: orgId };
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

  private buildEnrichedMessage(
    userMessage: string,
    fleet: FleetVehicleInfo[],
    resolvedVehicle?: FleetVehicleInfo | null,
  ): string {
    if (fleet.length === 0) return userMessage;

    const vehicleLines = fleet.map((v, i) => {
      const parts = [`#${i + 1}: ${v.make} ${v.model} ${v.year}`];
      if (v.licensePlate) parts.push(`plate="${v.licensePlate}"`);
      if (v.vehicleName) parts.push(`name="${v.vehicleName}"`);
      if (v.vin) parts.push(`VIN=${v.vin}`);
      if (v.tokenId) parts.push(`tokenId=${v.tokenId}`);
      parts.push(`fuel=${v.fuelType}`);
      return parts.join(', ');
    });

    const resolved = resolvedVehicle ?? this.tryResolveVehicle(userMessage, fleet);
    let resolutionHint = '';
    if (resolved) {
      const platePart = resolved.licensePlate ? ` (plate: ${resolved.licensePlate})` : '';
      const tokenPart = resolved.tokenId ? `, tokenId=${resolved.tokenId}` : '';
      resolutionHint = `\n[System: The user is likely referring to vehicle "${resolved.make} ${resolved.model} ${resolved.year}"${platePart}${tokenPart}. Use this vehicle for data lookups.]`;
      if (!resolved.tokenId) {
        resolutionHint +=
          '\n[System: This vehicle has no DIMO tokenId — do not claim live DIMO telemetry for it.]';
      }
    }

    return `[Fleet context — ${fleet.length} registered vehicles:\n${vehicleLines.join('\n')}\nUse this fleet data to identify vehicles when users refer to them by license plate, name, make/model, or VIN. Only pass vehicle-scoped DIMO lookups when a specific vehicle with tokenId is resolved.]${resolutionHint}\n\nUser message: ${userMessage}`;
  }

  private tryResolveVehicle(message: string, fleet: FleetVehicleInfo[]): FleetVehicleInfo | null {
    const normalized = this.normalizePlate(message);
    const msgLower = message.toLowerCase();

    for (const v of fleet) {
      if (v.licensePlate && this.normalizePlate(v.licensePlate) === normalized) {
        return v;
      }
    }

    for (const v of fleet) {
      if (v.licensePlate) {
        const storedNorm = this.normalizePlate(v.licensePlate);
        if (storedNorm && normalized.includes(storedNorm)) return v;
        if (storedNorm && storedNorm.includes(normalized) && normalized.length >= 4) return v;
      }
    }

    for (const v of fleet) {
      if (v.vehicleName && msgLower.includes(v.vehicleName.toLowerCase())) return v;
    }

    const makeModelMatches = fleet.filter((v) => {
      const make = v.make.toLowerCase();
      const model = v.model.toLowerCase();
      return msgLower.includes(make) && msgLower.includes(model);
    });
    if (makeModelMatches.length === 1) return makeModelMatches[0];
    if (makeModelMatches.length > 1) {
      const withYear = makeModelMatches.filter((v) => msgLower.includes(String(v.year)));
      if (withYear.length === 1) return withYear[0];
    }

    for (const v of fleet) {
      if (v.vin && msgLower.includes(v.vin.toLowerCase())) return v;
    }

    const tokenMatch = message.match(/token\s*(?:id)?\s*[:#=]?\s*(\d+)/i);
    if (tokenMatch) {
      const tid = parseInt(tokenMatch[1], 10);
      const match = fleet.find((v) => v.tokenId === tid);
      if (match) return match;
    }

    return null;
  }

  private normalizePlate(input: string): string {
    return input
      .toUpperCase()
      .replace(/[-–—]/g, ' ')
      .replace(/[^A-Z0-9 ]/g, '')
      .replace(/\s+/g, '')
      .trim();
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
