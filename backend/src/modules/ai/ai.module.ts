import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import aiConfig from '@config/ai.config';
import { LlmGatewayService } from './llm/llm-gateway.service';
import { LLM_PROVIDER } from './llm/llm-provider.token';
import type { LlmProvider } from './llm/llm.types';
import { MistralLlmService } from './providers/mistral/mistral-llm.service';

@Module({
  imports: [ConfigModule.forFeature(aiConfig)],
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
  ],
  exports: [LlmGatewayService, MistralLlmService, LLM_PROVIDER],
})
export class AiModule {}
