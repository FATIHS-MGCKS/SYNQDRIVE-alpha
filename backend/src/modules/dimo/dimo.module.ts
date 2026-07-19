import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import dimoConfig from '@config/dimo.config';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { DimoController } from './dimo.controller';
import { DimoWebhookController } from './dimo-webhook.controller';
import { DimoAuthService } from './dimo-auth.service';
import { DimoTelemetryService } from './dimo-telemetry.service';
import { DimoVehicleSyncService } from './dimo-vehicle-sync.service';
import { DimoApiSyncService } from './dimo-api-sync.service';
import { DimoSegmentsService } from './dimo-segments.service';
import { DimoRechargeSegmentsClient } from './recharge-segments/dimo-recharge-segments.client';
import { DimoTriggersService } from './dimo-triggers.service';
import { DimoTriggersBootstrapService } from './dimo-triggers-bootstrap.service';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';
import { DeviceConnectionWebhookInboxService } from './device-connection-webhook-inbox.service';
import { RpmWebhookCandidateService } from './rpm-webhook-candidate.service';
import { RpmWebhookQueryService } from './rpm-webhook-query.service';
import { DeviceConnectionEpisodeService } from './device-connection-episode.service';
import { DeviceConnectionEpisodeResolutionService } from './device-connection-episode-resolution/device-connection-episode-resolution.service';
import {
  buildSnapshotReferenceId,
  extractObdPlugSignalFromSnapshot,
} from './device-connection-episode-resolution/device-connection-episode-resolution.snapshot-evaluator';
import { VehicleConnectivityRuntimeProjectionService } from './device-connection-episode-resolution/vehicle-connectivity-runtime-projection.service';
import { DeviceConnectionEpisodeResolutionOutboxService } from './device-connection-episode-resolution/device-connection-episode-resolution-outbox.service';
import { ConnectivityAlertService } from './connectivity-alert/connectivity-alert.service';
import { ConnectivityObservabilityService } from './connectivity/connectivity-observability.service';
import { DeviceConnectionQueryService } from './device-connection-query.service';
import { DeviceConnectionEpisodeReconciliationService } from './device-connection-episode-reconciliation/device-connection-episode-reconciliation.service';
import { DeviceConnectionEpisodeReconciliationApplyService } from './device-connection-episode-reconciliation/device-connection-episode-reconciliation-apply.service';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';

@Module({
  imports: [
    ConfigModule.forFeature(dimoConfig),
    NotificationsModule,
    forwardRef(() => VehicleIntelligenceModule),
  ],
  controllers: [DimoController, DimoWebhookController],
  providers: [
    DimoAuthService,
    DimoTelemetryService,
    DimoVehicleSyncService,
    DimoApiSyncService,
    DimoSegmentsService,
    DimoRechargeSegmentsClient,
    DimoTriggersService,
    DimoTriggersBootstrapService,
    DeviceConnectionWebhookService,
    DeviceConnectionWebhookInboxService,
    DeviceConnectionEpisodeService,
    DeviceConnectionEpisodeReconciliationService,
    DeviceConnectionEpisodeReconciliationApplyService,
    ConnectivityObservabilityService,
    DeviceConnectionEpisodeResolutionService,
    DeviceConnectionEpisodeResolutionOutboxService,
    ConnectivityAlertService,
    VehicleConnectivityRuntimeProjectionService,
    DeviceConnectionQueryService,
    RpmWebhookCandidateService,
    RpmWebhookQueryService,
  ],
  exports: [
    DimoAuthService,
    DimoTelemetryService,
    DimoVehicleSyncService,
    DimoApiSyncService,
    DimoSegmentsService,
    DimoRechargeSegmentsClient,
    DimoTriggersService,
    DeviceConnectionQueryService,
    DeviceConnectionEpisodeService,
    DeviceConnectionEpisodeResolutionService,
    ConnectivityAlertService,
    VehicleConnectivityRuntimeProjectionService,
    RpmWebhookQueryService,
  ],
})
export class DimoModule {}
