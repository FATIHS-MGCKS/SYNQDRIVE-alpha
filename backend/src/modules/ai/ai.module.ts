import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import aiConfig from '@config/ai.config';
import documentExtractionConfig from '@config/document-extraction.config';
import { PrismaModule } from '@shared/database/prisma.module';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { DataAuthorizationsModule } from '@modules/data-authorizations/data-authorizations.module';
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
import { AiVehicleResolutionService } from './vehicle-resolution/ai-vehicle-resolution.service';
import { AiDataAuthorizationProbeAdapter } from './tools/ai-data-authorization.probe';
import { AiPrismaVehicleScopeResolver } from './tools/ai-prisma-vehicle-scope.resolver';
import { RentalHealthModule } from '@modules/rental-health/rental-health.module';
import { TasksModule } from '@modules/tasks/tasks.module';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { AiGetVehicleLocationTool } from './tools/get-vehicle-location/ai-get-vehicle-location.tool';
import { AiGetVehicleTelemetryStatusTool } from './tools/get-vehicle-telemetry-status/ai-get-vehicle-telemetry-status.tool';
import { AiGetVehicleHealthSummaryTool } from './tools/get-vehicle-health-summary/ai-get-vehicle-health-summary.tool';
import { AiHealthController } from './ai-health.controller';

@Module({
  imports: [
    PrismaModule,
    VehiclesModule,
    DataAuthorizationsModule,
    forwardRef(() => RentalHealthModule),
    TasksModule,
    forwardRef(() => VehicleIntelligenceModule),
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
    AiVehicleResolutionService,
    AiPrismaVehicleScopeResolver,
    AiDataAuthorizationProbeAdapter,
    AiGetVehicleLocationTool,
    AiGetVehicleTelemetryStatusTool,
    AiGetVehicleHealthSummaryTool,
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
    AiVehicleResolutionService,
    AiGetVehicleLocationTool,
    AiGetVehicleTelemetryStatusTool,
    AiGetVehicleHealthSummaryTool,
    ChatService,
  ],
})
export class AiModule {}
