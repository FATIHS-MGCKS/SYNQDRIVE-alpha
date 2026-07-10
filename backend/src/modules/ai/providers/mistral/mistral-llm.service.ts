import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { Mistral } from '@mistralai/mistralai';
import type { ChatCompletionRequest, ChatCompletionStreamRequest } from '@mistralai/mistralai/models/components';
import aiConfig from '@config/ai.config';
import { MistralSdkClientProvider } from './mistral-sdk-client.provider';
import type {
  LlmCompleteInput,
  LlmCompleteResult,
  LlmJsonInput,
  LlmJsonResult,
  LlmMessage,
  LlmModelPurpose,
  LlmProvider,
  LlmStreamEvent,
  LlmStreamInput,
  LlmUsage,
} from '../../llm/llm.types';

@Injectable()
export class MistralLlmService implements LlmProvider {
  readonly providerId = 'mistral';

  private readonly logger = new Logger(MistralLlmService.name);

  constructor(
    @Inject(aiConfig.KEY)
    private readonly config: ConfigType<typeof aiConfig>,
    private readonly clientProvider: MistralSdkClientProvider,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.config.mistralApiKey?.trim());
  }

  resolveModel(purpose?: LlmModelPurpose, explicitModel?: string): string {
    if (explicitModel?.trim()) return explicitModel.trim();
    switch (purpose) {
      case 'router':
        return this.config.mistralRouterModel;
      case 'json':
        return this.config.mistralJsonModel;
      case 'reasoning':
        return this.config.mistralReasoningModel;
      case 'chat':
      default:
        return this.config.mistralChatModel;
    }
  }

  async complete(input: LlmCompleteInput): Promise<LlmCompleteResult> {
    const client = this.getClient();
    const model = this.resolveModel(input.purpose, input.model);
    const request = this.buildChatRequest(input, model);

    const response = await client.chat.complete(request);
    const choice = response.choices?.[0];
    const content = this.extractMessageContent(choice?.message?.content);

    return {
      content,
      model: response.model ?? model,
      finishReason: choice?.finishReason ?? undefined,
      usage: this.mapUsage(response.usage),
    };
  }

  async stream(input: LlmStreamInput): Promise<void> {
    const client = this.getClient();
    const model = this.resolveModel(input.purpose, input.model);
    const request = this.buildStreamRequest(input, model);

    await input.onEvent({ type: 'start', model });

    let accumulated = '';
    try {
      const eventStream = await client.chat.stream(request);
      for await (const event of eventStream) {
        const delta = this.extractDeltaContent(event.data?.choices?.[0]?.delta?.content);
        if (!delta) continue;
        accumulated += delta;
        await input.onEvent({
          type: 'delta',
          delta,
          content: accumulated,
          model: event.data?.model ?? model,
        });
      }

      await input.onEvent({
        type: 'done',
        content: accumulated,
        model,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Mistral stream failed';
      this.logger.warn(`[Mistral] stream error: ${message}`);
      await input.onEvent({ type: 'error', error: message, model });
      throw err;
    }
  }

  async completeJson<T = unknown>(input: LlmJsonInput): Promise<LlmJsonResult<T>> {
    const client = this.getClient();
    const model = this.resolveModel(input.purpose ?? 'json', input.model);
    const request = this.buildChatRequest(input, model, {
      schema: input.schema,
      schemaName: input.schemaName,
      jsonMode: !input.schema,
    });

    const response = await client.chat.complete(request);
    const choice = response.choices?.[0];
    const rawContent = this.extractMessageContent(choice?.message?.content);

    let data: T;
    try {
      data = JSON.parse(rawContent) as T;
    } catch {
      throw new ServiceUnavailableException('Mistral returned invalid JSON for structured output.');
    }

    return {
      data,
      model: response.model ?? model,
      rawContent,
      usage: this.mapUsage(response.usage),
    };
  }

  private getClient(): Mistral {
    return this.clientProvider.getClient();
  }

  private buildChatRequest(
    input: LlmCompleteInput,
    model: string,
    options?: { schema?: Record<string, unknown>; schemaName?: string; jsonMode?: boolean },
  ): ChatCompletionRequest {
    return {
      model,
      messages: this.mapMessages(input.messages),
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      responseFormat: this.buildResponseFormat(options),
    };
  }

  private buildStreamRequest(input: LlmStreamInput, model: string): ChatCompletionStreamRequest {
    return {
      model,
      messages: this.mapMessages(input.messages),
      temperature: input.temperature,
      maxTokens: input.maxTokens,
    };
  }

  private buildResponseFormat(options?: {
    schema?: Record<string, unknown>;
    schemaName?: string;
    jsonMode?: boolean;
  }): ChatCompletionRequest['responseFormat'] | undefined {
    if (options?.schema) {
      return {
        type: 'json_schema',
        jsonSchema: {
          name: options.schemaName ?? 'response',
          schemaDefinition: options.schema,
          strict: true,
        },
      };
    }
    if (options?.jsonMode) {
      return { type: 'json_object' };
    }
    return undefined;
  }

  private mapMessages(messages: LlmMessage[]): ChatCompletionRequest['messages'] {
    return messages.map((message) => {
      if (message.role === 'tool') {
        return {
          role: 'tool' as const,
          content: message.content,
          name: message.name,
        };
      }
      return {
        role: message.role,
        content: message.content,
      };
    });
  }

  private extractMessageContent(
    content: string | Array<{ type?: string; text?: string }> | null | undefined,
  ): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('');
  }

  private extractDeltaContent(
    content: string | Array<{ type?: string; text?: string }> | null | undefined,
  ): string {
    return this.extractMessageContent(content);
  }

  private mapUsage(usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  }): LlmUsage | undefined {
    if (!usage) return undefined;
    return {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
    };
  }
}
