import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import dimoConfig from '@config/dimo.config';
import { DimoController } from './dimo.controller';
import { DimoWebhookController } from './dimo-webhook.controller';
import { DimoAuthService } from './dimo-auth.service';
import { DimoTelemetryService } from './dimo-telemetry.service';
import { DimoVehicleSyncService } from './dimo-vehicle-sync.service';
import { DimoApiSyncService } from './dimo-api-sync.service';
import { DimoSegmentsService } from './dimo-segments.service';
import { DimoTriggersService } from './dimo-triggers.service';
import { DimoTriggersBootstrapService } from './dimo-triggers-bootstrap.service';
import { DimoAgentsService } from './dimo-agents.service';
import { DimoDocumentAgentService } from './dimo-document-agent.service';
import { AiTireSpecJobService } from './ai-tire-spec-job.service';
import { DimoAgentsController } from './dimo-agents.controller';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';

@Module({
  imports: [ConfigModule.forFeature(dimoConfig), forwardRef(() => VehicleIntelligenceModule)],
  controllers: [DimoController, DimoWebhookController, DimoAgentsController, ChatController],
  providers: [
    DimoAuthService,
    DimoTelemetryService,
    DimoVehicleSyncService,
    DimoApiSyncService,
    DimoSegmentsService,
    DimoTriggersService,
    DimoTriggersBootstrapService,
    DimoAgentsService,
    DimoDocumentAgentService,
    AiTireSpecJobService,
    ChatService,
  ],
  exports: [
    DimoAuthService,
    DimoTelemetryService,
    DimoVehicleSyncService,
    DimoApiSyncService,
    DimoSegmentsService,
    DimoTriggersService,
    DimoAgentsService,
    DimoDocumentAgentService,
    AiTireSpecJobService,
    ChatService,
  ],
})
export class DimoModule {}
