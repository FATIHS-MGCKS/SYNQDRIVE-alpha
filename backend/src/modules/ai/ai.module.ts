import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import aiConfig from '@config/ai.config';
import documentExtractionConfig from '@config/document-extraction.config';
import { PrismaModule } from '@shared/database/prisma.module';
import { LlmGatewayService } from './llm/llm-gateway.service';
import { LLM_PROVIDER } from './llm/llm-provider.token';
import type { LlmProvider } from './llm/llm.types';
import { MistralLlmService } from './providers/mistral/mistral-llm.service';
import { DocumentAiExtractionService } from './documents/document-ai-extraction.service';
import { VehicleSpecAiService } from './vehicle-specs/vehicle-spec-ai.service';
import { TireSpecAiService } from './vehicle-specs/tire-spec-ai.service';
import { AiTireSpecJobService } from './vehicle-specs/ai-tire-spec-job.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule.forFeature(aiConfig),
    ConfigModule.forFeature(documentExtractionConfig),
  ],
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
    VehicleSpecAiService,
    TireSpecAiService,
    AiTireSpecJobService,
  ],
  exports: [
    LlmGatewayService,
    MistralLlmService,
    LLM_PROVIDER,
    DocumentAiExtractionService,
    VehicleSpecAiService,
    TireSpecAiService,
    AiTireSpecJobService,
  ],
})
export class AiModule {}
