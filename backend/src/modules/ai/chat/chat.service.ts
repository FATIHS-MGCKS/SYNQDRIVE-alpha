import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import aiConfig from '@config/ai.config';
import { PrismaService } from '@shared/database/prisma.service';
import { LlmGatewayService } from '../llm/llm-gateway.service';
import { FleetChatOrchestratorService } from './fleet-chat-orchestrator.service';
import { ChatExecutionContextResolver } from './chat-execution-context.resolver';
import { AiRequestAuditService } from '../audit/ai-request-audit.service';
import { AiAgentLimitsService } from '../limits/ai-agent-limits.service';
import { AiAgentToolCacheService } from '../limits/ai-agent-tool-cache.service';
import { AiAgentLimitException } from '../limits/ai-agent-limit.errors';
import type { AiChatRequestSlot } from '../limits/ai-agent-limit.types';
import type { ChatSessionIdentity } from './chat-session.types';
import {
  type ChatFleetStructuredPayload,
  type ChatMessageResultDto,
  type ChatStreamErrorDto,
  parseStoredStructuredPayload,
  toClientStructuredPayload,
} from './chat-fleet-structured.dto';
import type { FleetChatResponseType } from './fleet-chat-evidence-response/fleet-chat-evidence-response.enums';
import { FLEET_CHAT_SYSTEM_PROMPT } from '../vehicle-resolution/ai-vehicle-resolution.llm';
import { isFleetChatDomainGroundingEnabled } from './fleet-chat-rollout.util';

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
    private readonly agentLimits: AiAgentLimitsService,
    private readonly toolCache: AiAgentToolCacheService,
    @Inject(aiConfig.KEY)
    private readonly aiConfiguration: ConfigType<typeof aiConfig>,
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
    clientIp?: string | null,
  ): Promise<ChatMessageResult> {
    let slot: AiChatRequestSlot | null = null;
    let correlationId = 'unknown';
    try {
      const identity = session ?? {
        userId: 'system',
        platformRole: null,
        locale: 'de',
      };
      const context = await this.contextResolver.resolve(orgId, identity);
      if (context) {
        correlationId = context.correlationId;
        slot = await this.agentLimits.acquireChatRequest({
          organizationId: orgId,
          userId: context.userId,
          correlationId: context.correlationId,
          clientIp,
        });
      }

      const { error } = await this.ensureAgentSafe(orgId);
      if (error) return this.persistAssistant(orgId, error);

      await this.saveUserMessage(orgId, content);
      const outcome = await this.agentLimits.withRequestTimeout(
        correlationId,
        this.runFleetOrchestrator(orgId, content, session),
      );
      return this.persistAssistant(orgId, outcome.text, outcome.structured);
    } catch (err: unknown) {
      const limitError = this.agentLimits.resolveLimitError(
        err,
        session?.locale === 'en' ? 'en' : 'de',
      );
      if (limitError) {
        return this.persistAssistant(
          orgId,
          limitError.resolveText(session?.locale === 'en' ? 'en' : 'de'),
          this.buildLimitStructured(limitError),
        );
      }
      throw err;
    } finally {
      await this.agentLimits.releaseChatRequest(slot);
      this.toolCache.clearRequest(correlationId);
    }
  }

  async streamMessage(
    orgId: string,
    content: string,
    emit: (event: string, data: unknown) => void,
    isClosed: () => boolean,
    session?: ChatSessionIdentity,
    clientIp?: string | null,
  ): Promise<void> {
    const locale = session?.locale === 'en' ? 'en' : 'de';
    let slot: AiChatRequestSlot | null = null;
    let correlationId = 'unknown';

    try {
      const identity = session ?? {
        userId: 'system',
        platformRole: null,
        locale: 'de',
      };
      const context = await this.contextResolver.resolve(orgId, identity);
      if (context) {
        correlationId = context.correlationId;
        slot = await this.agentLimits.acquireChatRequest({
          organizationId: orgId,
          userId: context.userId,
          correlationId: context.correlationId,
          clientIp,
        });
      }

      const { error } = await this.ensureAgentSafe(orgId);
      if (error) {
        const saved = await this.persistAssistant(orgId, error);
        if (!isClosed()) emit('result', this.toResultDto(saved));
        return;
      }
      if (!isClosed()) emit('status', { agentReady: true });

      await this.saveUserMessage(orgId, content);

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

      const outcome = await this.agentLimits.withRequestTimeout(
        correlationId,
        this.runFleetOrchestrator(orgId, content, session, emitProgress),
      );
      emitProgress('composing');

      const saved = await this.persistAssistant(orgId, outcome.text, outcome.structured);
      if (!isClosed()) emit('result', this.toResultDto(saved));
    } catch (err: unknown) {
      const limitError = this.agentLimits.resolveLimitError(err, locale);
      if (limitError) {
        const saved = await this.persistAssistant(
          orgId,
          limitError.resolveText(locale),
          this.buildLimitStructured(limitError),
        );
        if (!isClosed()) {
          emit(
            'error',
            buildChatStreamError(limitError.resolveText(locale), correlationId),
          );
          emit('result', this.toResultDto(saved));
        }
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Chat] streamMessage failed for org ${orgId}: ${message}`);
      if (!isClosed()) {
        emit(
          'error',
          buildChatStreamError(
            locale === 'en'
              ? "I'm sorry, something unexpected happened while processing your request. Please try again in a moment."
              : 'Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut.',
            correlationId,
          ),
        );
      }
    } finally {
      await this.agentLimits.releaseChatRequest(slot);
      this.toolCache.clearRequest(correlationId);
    }
  }

  async getHistory(orgId: string, limit = 100, before?: string) {
    const maxHistory = this.agentLimits.getMaxConversationHistory();
    const effectiveLimit = Math.min(limit, maxHistory);
    const where: Record<string, unknown> = { organizationId: orgId };
    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const messages = await this.prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: effectiveLimit,
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

    if (!isFleetChatDomainGroundingEnabled(orgId, this.aiConfiguration)) {
      return this.runLegacyDirectLlm(orgId, content, identity, onProgress);
    }

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
      const limitError = this.agentLimits.resolveLimitError(
        err,
        context?.locale === 'en' ? 'en' : 'de',
      );
      if (limitError) {
        throw limitError;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Chat] orchestrator failed for org ${orgId}: ${message}`);
      const fallbackText =
        "I'm sorry, I couldn't process your request right now. Please try again.";
      const structured = this.buildFallbackStructured(fallbackText, 'TEMPORARY_UNAVAILABLE', true);
      return { text: fallbackText, structured };
    }
  }

  /**
   * Controlled fallback when domain grounding is disabled — direct Mistral chat with history,
   * no domain tools or evidence composer (pre-orchestrator behaviour).
   */
  private async runLegacyDirectLlm(
    orgId: string,
    content: string,
    identity: ChatSessionIdentity,
    onProgress?: (type: keyof typeof PROGRESS_LABELS) => void,
  ): Promise<{ text: string; structured?: ChatFleetStructuredPayload }> {
    onProgress?.('composing');
    const locale = identity.locale === 'en' ? 'en' : 'de';
    const history = await this.getHistory(orgId, this.agentLimits.getMaxConversationHistory());
    const conversational = history
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      }));

    const localeHint =
      locale === 'en'
        ? 'Respond in English unless the user writes in another language.'
        : 'Antworte auf Deutsch, sofern der Nutzer nicht in einer anderen Sprache schreibt.';

    const result = await this.llm.complete({
      purpose: 'chat',
      messages: [
        { role: 'system', content: `${FLEET_CHAT_SYSTEM_PROMPT}\n${localeHint}` },
        ...conversational,
      ],
      maxTokens: this.aiConfiguration.agentMaxTokensPerLlmCall,
    });

    const text = result.content.trim() || (
      locale === 'en'
        ? "I'm sorry, I couldn't generate a response. Please try again."
        : 'Es konnte keine Antwort erstellt werden. Bitte versuchen Sie es erneut.'
    );

    return {
      text,
      structured: {
        ...this.buildFallbackStructured(text, 'DIRECT_ANSWER', false),
        usedDeterministicFallback: false,
        warnings: ['legacy_direct_llm'],
      },
    };
  }

  private buildLimitStructured(limitError: AiAgentLimitException): ChatFleetStructuredPayload {
    return {
      ...this.buildFallbackStructured(
        limitError.resolveText('de'),
        'TEMPORARY_UNAVAILABLE',
        true,
      ),
      warnings: [limitError.kind],
    };
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
