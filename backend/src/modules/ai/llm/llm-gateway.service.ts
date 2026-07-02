import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import aiConfig from '@config/ai.config';
import { LLM_PROVIDER } from './llm-provider.token';
import type {
  LlmCompleteInput,
  LlmCompleteResult,
  LlmJsonInput,
  LlmJsonResult,
  LlmProvider,
  LlmStreamInput,
} from './llm.types';

/**
 * Provider-neutral AI gateway — single entry point for LLM calls.
 * Business validation, tenant scoping, and external action approval stay in feature services.
 */
@Injectable()
export class LlmGatewayService {
  private readonly logger = new Logger(LlmGatewayService.name);

  constructor(
    @Inject(aiConfig.KEY)
    private readonly config: ConfigType<typeof aiConfig>,
    @Inject(LLM_PROVIDER)
    private readonly provider: LlmProvider,
  ) {}

  get activeProviderId(): string {
    return this.provider.providerId;
  }

  get configuredProvider(): string {
    return this.config.provider;
  }

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  isStreamingEnabled(): boolean {
    return this.config.streamingEnabled;
  }

  externalActionsRequireApproval(): boolean {
    return this.config.externalActionsRequireApproval;
  }

  async complete(input: LlmCompleteInput): Promise<LlmCompleteResult> {
    this.ensureConfigured();
    return this.provider.complete(input);
  }

  async stream(input: LlmStreamInput): Promise<void> {
    this.ensureConfigured();
    if (!this.config.streamingEnabled) {
      const result = await this.provider.complete(input);
      await input.onEvent({ type: 'start', model: result.model });
      await input.onEvent({ type: 'delta', delta: result.content, content: result.content, model: result.model });
      await input.onEvent({
        type: 'done',
        content: result.content,
        model: result.model,
        finishReason: result.finishReason,
        usage: result.usage,
      });
      return;
    }
    return this.provider.stream(input);
  }

  async completeJson<T = unknown>(input: LlmJsonInput): Promise<LlmJsonResult<T>> {
    this.ensureConfigured();
    return this.provider.completeJson<T>(input);
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) {
      this.logger.warn(
        `LLM provider "${this.config.provider}" is not configured — set provider credentials (e.g. MISTRAL_API_KEY).`,
      );
      throw new ServiceUnavailableException(
        `AI provider "${this.config.provider}" is not configured.`,
      );
    }
  }
}
