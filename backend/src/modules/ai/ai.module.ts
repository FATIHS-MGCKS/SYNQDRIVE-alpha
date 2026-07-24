import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import aiConfig from '@config/ai.config';
import documentExtractionConfig from '@config/document-extraction.config';
import { DataAuthorizationsModule } from '@modules/data-authorizations/data-authorizations.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { LlmGatewayService } from './llm/llm-gateway.service';
import { LLM_PROVIDER } from './llm/llm-provider.token';
import type { LlmProvider } from './llm/llm.types';
import { MistralSdkClientProvider } from './providers/mistral/mistral-sdk-client.provider';
import { MistralLlmService } from './providers/mistral/mistral-llm.service';
import { MistralOcrService } from './providers/mistral/mistral-ocr.service';
import { DocumentAiExtractionService } from './documents/document-ai-extraction.service';
import { DocumentClassificationService } from './documents/document-classification.service';
import { DocumentChunkingService } from './documents/document-chunking.service';
import { DocumentExtractionMergeService } from './documents/document-extraction-merge.service';
import { VehicleSpecAiService } from './vehicle-specs/vehicle-spec-ai.service';
import { TireSpecAiService } from './vehicle-specs/tire-spec-ai.service';
import { AiTireSpecJobService } from './vehicle-specs/ai-tire-spec-job.service';
import { VehicleSpecsController } from './vehicle-specs/vehicle-specs.controller';
import { ChatService } from './chat/chat.service';
import { ChatController } from './chat/chat.controller';
import { AiHealthController } from './ai-health.controller';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => DataAuthorizationsModule),
    ConfigModule.forFeature(aiConfig),
    ConfigModule.forFeature(documentExtractionConfig),
  ],
  controllers: [VehicleSpecsController, ChatController, AiHealthController],
  providers: [
    MistralSdkClientProvider,
    MistralLlmService,
    MistralOcrService,
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
    DocumentChunkingService,
    DocumentExtractionMergeService,
    DocumentAiExtractionService,
    DocumentClassificationService,
    VehicleSpecAiService,
    TireSpecAiService,
    AiTireSpecJobService,
    ChatService,
  ],
  exports: [
    LlmGatewayService,
    MistralSdkClientProvider,
    MistralLlmService,
    MistralOcrService,
    LLM_PROVIDER,
    DocumentAiExtractionService,
    DocumentClassificationService,
    VehicleSpecAiService,
    TireSpecAiService,
    AiTireSpecJobService,
    ChatService,
  ],
})
export class AiModule {}
