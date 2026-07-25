import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import aiConfig from '@config/ai.config';
import { LlmGatewayService } from '../llm/llm-gateway.service';
import type { LlmCompleteInput, LlmCompleteResult } from '../llm/llm.types';
import type { AiExecutionContext } from '../execution/ai-execution-context.types';
import { AiLlmCircuitBreakerService } from './ai-llm-circuit-breaker.service';
import { AiAgentLimitsService } from './ai-agent-limits.service';
import { AiAgentLimitException } from './ai-agent-limit.errors';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

@Injectable()
export class AiAgentLlmExecutorService {
  private readonly logger = new Logger(AiAgentLlmExecutorService.name);

  constructor(
    @Inject(aiConfig.KEY)
    private readonly aiConfiguration: ConfigType<typeof aiConfig>,
    private readonly llm: LlmGatewayService,
    private readonly circuitBreaker: AiLlmCircuitBreakerService,
    private readonly limits: AiAgentLimitsService,
  ) {}

  async completeForChat(
    context: AiExecutionContext,
    input: LlmCompleteInput,
  ): Promise<LlmCompleteResult> {
    const estimatedTokens = this.limits.getMaxTokensPerLlmCall();
    await this.limits.assertLlmBudget({
      organizationId: context.organizationId,
      userId: context.userId,
      estimatedTokens,
    });

    this.circuitBreaker.assertCanInvokeLlm();

    const maxTokens = Math.min(
      input.maxTokens ?? this.limits.getMaxTokensPerLlmCall(),
      this.limits.getMaxTokensPerLlmCall(),
    );

    const maxRetries = this.limits.getMaxLlmRetries();
    const backoffMs = this.aiConfiguration.agentLlmRetryBackoffMs;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const result = await this.llm.complete({
          ...input,
          maxTokens,
        });
        this.circuitBreaker.recordSuccess();
        await this.limits.recordLlmUsage({
          organizationId: context.organizationId,
          userId: context.userId,
          usage: result.usage,
        });
        return result;
      } catch (error: unknown) {
        lastError = error;
        this.circuitBreaker.recordFailure();
        if (attempt < maxRetries) {
          await sleep(backoffMs * (attempt + 1));
        }
      }
    }

    if (lastError instanceof Error && /rate limit|429|overloaded/i.test(lastError.message)) {
      throw AiAgentLimitException.fromKind('provider_overloaded', 60);
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  getActiveProviderId(): string {
    return this.llm.activeProviderId;
  }
}
