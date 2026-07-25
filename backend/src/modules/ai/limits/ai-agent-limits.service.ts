import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import aiConfig from '@config/ai.config';
import { AiAgentConcurrencyService } from './ai-agent-concurrency.service';
import { AiAgentRateLimitService } from './ai-agent-rate-limit.service';
import { AiAgentTokenBudgetService } from './ai-agent-token-budget.service';
import { AiAgentLimitException } from './ai-agent-limit.errors';
import type { AiChatRequestSlot, AssertAiChatLimitsInput } from './ai-agent-limit.types';

@Injectable()
export class AiAgentLimitsService {
  private readonly logger = new Logger(AiAgentLimitsService.name);

  constructor(
    @Inject(aiConfig.KEY)
    private readonly aiConfiguration: ConfigType<typeof aiConfig>,
    private readonly rateLimit: AiAgentRateLimitService,
    private readonly concurrency: AiAgentConcurrencyService,
    private readonly tokenBudget: AiAgentTokenBudgetService,
  ) {}

  async acquireChatRequest(input: AssertAiChatLimitsInput & {
    clientIp?: string | null;
  }): Promise<AiChatRequestSlot> {
    const rateViolation = await this.rateLimit.assertWithinLimits({
      organizationId: input.organizationId,
      userId: input.userId,
      clientIp: input.clientIp,
    });
    if (rateViolation) {
      throw new AiAgentLimitException(rateViolation);
    }

    const slot = await this.concurrency.acquireSlots({
      organizationId: input.organizationId,
      userId: input.userId,
    });
    if (!slot) {
      throw AiAgentLimitException.fromKind('concurrency_limit', 30, 'organization');
    }
    return slot;
  }

  async releaseChatRequest(slot: AiChatRequestSlot | null | undefined): Promise<void> {
    await this.concurrency.releaseSlots(slot);
  }

  async assertLlmBudget(input: {
    organizationId: string;
    userId: string;
    estimatedTokens: number;
  }): Promise<void> {
    const violation = await this.tokenBudget.assertWithinBudget({
      organizationId: input.organizationId,
      userId: input.userId,
      estimatedTokens: input.estimatedTokens,
    });
    if (violation) {
      throw new AiAgentLimitException(violation);
    }
  }

  async recordLlmUsage(input: {
    organizationId: string;
    userId: string;
    usage?: import('../llm/llm.types').LlmUsage;
  }): Promise<void> {
    await this.tokenBudget.recordUsage(input);
  }

  getMaxConversationHistory(): number {
    return this.aiConfiguration.agentMaxConversationHistory;
  }

  getMaxToolInvocationsPerChatRequest(): number {
    return this.aiConfiguration.agentMaxToolInvocationsPerChatRequest;
  }

  getRequestTimeoutMs(): number {
    return this.aiConfiguration.agentRequestTimeoutMs;
  }

  getMaxLlmRetries(): number {
    return this.aiConfiguration.agentMaxLlmRetries;
  }

  getMaxTokensPerLlmCall(): number {
    return this.aiConfiguration.agentMaxTokensPerLlmCall;
  }

  async withRequestTimeout<T>(
    correlationId: string,
    promise: Promise<T>,
  ): Promise<T> {
    const timeoutMs = this.getRequestTimeoutMs();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('AI_CHAT_REQUEST_TIMEOUT'));
      }, timeoutMs);
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  resolveLimitError(err: unknown, locale: 'de' | 'en' | 'unknown'): AiAgentLimitException | null {
    if (err instanceof AiAgentLimitException) {
      return err;
    }
    if (err instanceof Error) {
      if (err.message === 'AI_CHAT_REQUEST_TIMEOUT') {
        return AiAgentLimitException.fromKind('request_timeout', 30);
      }
      if (err.message === 'AI_LLM_CIRCUIT_OPEN') {
        return AiAgentLimitException.fromKind('circuit_breaker_open', 60);
      }
    }
    return null;
  }
}
