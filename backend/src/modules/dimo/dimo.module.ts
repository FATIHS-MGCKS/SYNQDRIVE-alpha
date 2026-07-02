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
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';
import { DeviceConnectionQueryService } from './device-connection-query.service';
import { DimoAgentsService } from './dimo-agents.service';
import { DimoDocumentAgentService } from './dimo-document-agent.service';
import { DimoAgentsController } from './dimo-agents.controller';
import { AiModule } from '../ai/ai.module';
import { DimoAgentsAdminController } from './dimo-agents-admin.controller';
import { DimoAgentsHealthController } from './dimo-agents-health.controller';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';

@Module({
  imports: [ConfigModule.forFeature(dimoConfig), AiModule, forwardRef(() => VehicleIntelligenceModule)],
  controllers: [DimoController, DimoWebhookController, DimoAgentsController, DimoAgentsAdminController, DimoAgentsHealthController, ChatController],
  providers: [
    DimoAuthService,
    DimoTelemetryService,
    DimoVehicleSyncService,
    DimoApiSyncService,
    DimoSegmentsService,
    DimoTriggersService,
    DimoTriggersBootstrapService,
    DeviceConnectionWebhookService,
    DeviceConnectionQueryService,
    DimoAgentsService,
    DimoDocumentAgentService,
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
    ChatService,
    DeviceConnectionQueryService,
  ],
})
export class DimoModule {}
