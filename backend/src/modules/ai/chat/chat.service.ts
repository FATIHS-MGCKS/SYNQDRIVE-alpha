import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { LlmGatewayService } from '../llm/llm-gateway.service';
import { FleetChatOrchestratorService } from './fleet-chat-orchestrator.service';
import { ChatExecutionContextResolver } from './chat-execution-context.resolver';
import { AiRequestAuditService } from '../audit/ai-request-audit.service';
import type { ChatSessionIdentity } from './chat-session.types';
import {
  type ChatFleetStructuredPayload,
  type ChatMessageResultDto,
  type ChatStreamErrorDto,
  parseStoredStructuredPayload,
  toClientStructuredPayload,
} from './chat-fleet-structured.dto';
import type { FleetChatResponseType } from './fleet-chat-evidence-response/fleet-chat-evidence-response.enums';

export interface ChatMessageResult {
  id?: string;
  role: string;
  content: string;
  createdAt: Date;
  structured?: ChatFleetStructuredPayload;
}

const PROGRESS_LABELS: Record<string, { de: string; en: string }> = {
  thinking: { de: 'Anfrage wird analysiert…', en: 'Analyzing request…' },
  routing: { de: 'Absicht wird erkannt…', en: 'Detecting intent…' },
  tools: { de: 'Flottendaten werden geladen…', en: 'Loading fleet data…' },
  composing: { de: 'Antwort wird zusammengestellt…', en: 'Composing response…' },
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmGatewayService,
    private readonly orchestrator: FleetChatOrchestratorService,
    private readonly contextResolver: ChatExecutionContextResolver,
    private readonly requestAudit: AiRequestAuditService,
  ) {}

  isConfigured(): boolean {
    return this.llm.isConfigured();
  }

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

  async sendMessage(
    orgId: string,
    content: string,
    session?: ChatSessionIdentity,
  ): Promise<ChatMessageResult> {
    const { error } = await this.ensureAgentSafe(orgId);
    if (error) return this.persistAssistant(orgId, error);

    await this.saveUserMessage(orgId, content);
    const outcome = await this.runFleetOrchestrator(orgId, content, session);
    return this.persistAssistant(orgId, outcome.text, outcome.structured);
  }

  async streamMessage(
    orgId: string,
    content: string,
    emit: (event: string, data: unknown) => void,
    isClosed: () => boolean,
    session?: ChatSessionIdentity,
  ): Promise<void> {
    const { error } = await this.ensureAgentSafe(orgId);
    if (error) {
      const saved = await this.persistAssistant(orgId, error);
      if (!isClosed()) emit('result', this.toResultDto(saved));
      return;
    }
    if (!isClosed()) emit('status', { agentReady: true });

    await this.saveUserMessage(orgId, content);

    const locale = session?.locale ?? 'de';
    const emitProgress = (type: keyof typeof PROGRESS_LABELS) => {
      if (!isClosed()) {
        const labels = PROGRESS_LABELS[type];
        emit('progress', {
          type,
          content: locale === 'en' ? labels.en : labels.de,
        });
      }
    };

    emitProgress('thinking');
    emitProgress('routing');

    const outcome = await this.runFleetOrchestrator(orgId, content, session, emitProgress);
    emitProgress('composing');

    const saved = await this.persistAssistant(orgId, outcome.text, outcome.structured);
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
      select: {
        id: true,
        role: true,
        content: true,
        structuredPayload: true,
        createdAt: true,
      },
    });

    return messages.map((m) => {
      const structured = parseStoredStructuredPayload(m.structuredPayload);
      const dto: ChatMessageResultDto = {
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        ...(structured ? { structured } : {}),
      };
      return dto;
    });
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

  private async runFleetOrchestrator(
    orgId: string,
    content: string,
    session?: ChatSessionIdentity,
    onProgress?: (type: keyof typeof PROGRESS_LABELS) => void,
  ): Promise<{ text: string; structured?: ChatFleetStructuredPayload }> {
    if (!this.isConfigured()) {
      return {
        text: 'The AI assistant is not configured on this server. Please contact your administrator.',
      };
    }

    const identity: ChatSessionIdentity = session ?? {
      userId: 'system',
      platformRole: null,
      locale: 'de',
    };

    const context = await this.contextResolver.resolve(orgId, identity);
    if (!context) {
      return {
        text: "I'm sorry, I couldn't verify your access to this organization. Please try again.",
      };
    }

    onProgress?.('tools');

    try {
      const result = await this.orchestrator.orchestrate(context, { message: content });
      this.requestAudit.recordFleetRequest(context, result);
      const structured = result.structuredResponse
        ? toClientStructuredPayload(
            result.structuredResponse,
            result.toolRecords,
            result.route.language === 'en' ? 'en' : 'de',
          )
        : this.buildFallbackStructured(result.responseText, 'TEMPORARY_UNAVAILABLE', result.partial);
      return { text: result.responseText, structured };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Chat] orchestrator failed for org ${orgId}: ${message}`);
      const fallbackText =
        "I'm sorry, I couldn't process your request right now. Please try again.";
      const structured = this.buildFallbackStructured(fallbackText, 'TEMPORARY_UNAVAILABLE', true);
      return { text: fallbackText, structured };
    }
  }

  private buildFallbackStructured(
    text: string,
    responseType: FleetChatResponseType,
    partial: boolean,
  ): ChatFleetStructuredPayload {
    return {
      responseType,
      vehicle: null,
      dataFreshness: {
        freshness: 'unknown',
        observedAt: null,
        isLastKnown: false,
        label: null,
      },
      sources: [],
      warnings: [],
      partial,
      generatedAt: new Date().toISOString(),
      usedDeterministicFallback: true,
    };
  }

  private async ensureAgentSafe(orgId: string): Promise<{ error?: string }> {
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

  private async saveUserMessage(orgId: string, content: string): Promise<void> {
    await this.prisma.chatMessage
      .create({ data: { organizationId: orgId, role: 'user', content } })
      .catch(() => {});
  }

  private async persistAssistant(
    orgId: string,
    content: string,
    structured?: ChatFleetStructuredPayload,
  ): Promise<ChatMessageResult> {
    const saved = await this.prisma.chatMessage
      .create({
        data: {
          organizationId: orgId,
          role: 'assistant',
          content,
          ...(structured ? { structuredPayload: structured as object } : {}),
        },
        select: { id: true, createdAt: true },
      })
      .catch(() => ({ id: undefined as string | undefined, createdAt: new Date() }));
    return {
      id: saved.id,
      role: 'assistant',
      content,
      createdAt: saved.createdAt,
      structured,
    };
  }

  private toResultDto(msg: ChatMessageResult): ChatMessageResultDto {
    return {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
      ...(msg.structured ? { structured: msg.structured } : {}),
    };
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

export function buildChatStreamError(
  message: string,
  correlationId?: string,
): ChatStreamErrorDto {
  return {
    message,
    ...(correlationId ? { technicalDetails: { correlationId } } : {}),
  };
}
