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
import { RpmWebhookCandidateService } from './rpm-webhook-candidate.service';
import { DeviceConnectionQueryService } from './device-connection-query.service';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';

@Module({
  imports: [ConfigModule.forFeature(dimoConfig), forwardRef(() => VehicleIntelligenceModule)],
  controllers: [DimoController, DimoWebhookController],
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
    RpmWebhookCandidateService,
  ],
  exports: [
    DimoAuthService,
    DimoTelemetryService,
    DimoVehicleSyncService,
    DimoApiSyncService,
    DimoSegmentsService,
    DimoTriggersService,
    DeviceConnectionQueryService,
  ],
})
export class DimoModule {}
