import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import aiConfig from '@config/ai.config';
import documentExtractionConfig from '@config/document-extraction.config';
import { LlmGatewayService } from './llm/llm-gateway.service';
import { LLM_PROVIDER } from './llm/llm-provider.token';
import type { LlmProvider } from './llm/llm.types';
import { MistralLlmService } from './providers/mistral/mistral-llm.service';
import { DocumentAiExtractionService } from './documents/document-ai-extraction.service';

@Module({
  imports: [ConfigModule.forFeature(aiConfig), ConfigModule.forFeature(documentExtractionConfig)],
  providers: [
    MistralLlmService,
    {
      provide: LLM_PROVIDER,
      useFactory: (
        config: ConfigType<typeof aiConfig>,
        mistral: MistralLlmService,
      ): LlmProvider => {
        switch (config.provider) {
          case 'mistral':
            return mistral;
          default:
            throw new Error(`Unsupported AI_PROVIDER: ${config.provider}`);
        }
      },
      inject: [aiConfig.KEY, MistralLlmService],
    },
    LlmGatewayService,
    DocumentAiExtractionService,
  ],
  exports: [LlmGatewayService, MistralLlmService, LLM_PROVIDER, DocumentAiExtractionService],
})
export class AiModule {}
