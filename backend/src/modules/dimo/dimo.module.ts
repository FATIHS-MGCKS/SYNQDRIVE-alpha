import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import dimoConfig from '@config/dimo.config';
import deviceConnectionWebhookInboxConfig from '@config/device-connection-webhook-inbox.config';
import connectivityRecoveryConfig from '@config/connectivity-recovery.config';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { SharedGuardsModule } from '@shared/auth/shared-guards.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
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
import { DeviceConnectionWebhookInboxRepository } from './device-connection-webhook-inbox.repository';
import { DeviceConnectionWebhookProcessingService } from './device-connection-webhook-processing.service';
import { DeviceConnectionWebhookQueueProducer } from './device-connection-webhook-queue.producer';
import { DeviceConnectionWebhookInboxSchedulerService } from './device-connection-webhook-inbox-scheduler.service';
import { DeviceConnectionWebhookReplayService } from './device-connection-webhook-replay.service';
import { DeviceConnectionWebhookInboxController } from './device-connection-webhook-inbox.controller';
import { RpmWebhookCandidateService } from './rpm-webhook-candidate.service';
import { RpmWebhookQueryService } from './rpm-webhook-query.service';
import { DeviceConnectionEpisodeService } from './device-connection-episode.service';
import { DeviceConnectionEpisodeResolutionService } from './device-connection-episode-resolution/device-connection-episode-resolution.service';
import { VehicleConnectivityRuntimeProjectionService } from './device-connection-episode-resolution/vehicle-connectivity-runtime-projection.service';
import { DeviceConnectionEpisodeResolutionOutboxService } from './device-connection-episode-resolution/device-connection-episode-resolution-outbox.service';
import { DeviceConnectionEpisodeResolutionOutboxRepository } from './device-connection-episode-resolution/device-connection-episode-resolution-outbox.repository';
import { DeviceConnectionEpisodeResolutionOutboxProcessorService } from './device-connection-episode-resolution/device-connection-episode-resolution-outbox-processor.service';
import deviceConnectionEpisodeResolutionOutboxConfig from '@config/device-connection-episode-resolution-outbox.config';
import { ConnectivityAlertService } from './connectivity-alert/connectivity-alert.service';
import { ConnectivityObservabilityService } from './connectivity/connectivity-observability.service';
import { ConnectivityRecoveryPolicyService } from './connectivity/connectivity-recovery.policy';
import { DeviceConnectionQueryService } from './device-connection-query.service';
import { DeviceConnectionEpisodeReconciliationService } from './device-connection-episode-reconciliation/device-connection-episode-reconciliation.service';
import { DeviceConnectionEpisodeReconciliationHistoricalLoader } from './device-connection-episode-reconciliation/device-connection-episode-reconciliation-historical.loader';
import { DeviceConnectionEpisodeReconciliationApplyService } from './device-connection-episode-reconciliation/device-connection-episode-reconciliation-apply.service';
import { DeviceConnectionWebhookConfigurationService } from './device-connection-webhook-configuration/device-connection-webhook-configuration.service';
import { DimoTriggerRegistryService } from './device-connection-webhook-configuration/dimo-trigger-registry.service';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { DataAuthorizationsModule } from '../data-authorizations/data-authorizations.module';

@Module({
  imports: [
    ConfigModule.forFeature(dimoConfig),
    ConfigModule.forFeature(deviceConnectionWebhookInboxConfig),
    ConfigModule.forFeature(deviceConnectionEpisodeResolutionOutboxConfig),
    ConfigModule.forFeature(connectivityRecoveryConfig),
    BullModule.registerQueue({ name: QUEUE_NAMES.CONNECTIVITY_WEBHOOK_PROCESS }),
    ActivityLogModule,
    SharedGuardsModule,
    forwardRef(() => NotificationsModule),
    forwardRef(() => VehicleIntelligenceModule),
    DataAuthorizationsModule,
  ],
  controllers: [DimoController, DimoWebhookController, DeviceConnectionWebhookInboxController],
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
    DeviceConnectionWebhookInboxRepository,
    DeviceConnectionWebhookProcessingService,
    DeviceConnectionWebhookQueueProducer,
    DeviceConnectionWebhookInboxSchedulerService,
    DeviceConnectionWebhookReplayService,
    DimoTriggerRegistryService,
    DeviceConnectionWebhookConfigurationService,
    DeviceConnectionEpisodeService,
    DeviceConnectionEpisodeReconciliationService,
    DeviceConnectionEpisodeReconciliationHistoricalLoader,
    DeviceConnectionEpisodeReconciliationApplyService,
    ConnectivityObservabilityService,
    ConnectivityRecoveryPolicyService,
    DeviceConnectionEpisodeResolutionService,
    DeviceConnectionEpisodeResolutionOutboxService,
    DeviceConnectionEpisodeResolutionOutboxRepository,
    DeviceConnectionEpisodeResolutionOutboxProcessorService,
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
    DeviceConnectionEpisodeResolutionOutboxProcessorService,
    ConnectivityRecoveryPolicyService,
    ConnectivityAlertService,
    VehicleConnectivityRuntimeProjectionService,
    RpmWebhookQueryService,
    DeviceConnectionWebhookProcessingService,
    DeviceConnectionWebhookReplayService,
    DeviceConnectionWebhookInboxSchedulerService,
    DeviceConnectionWebhookConfigurationService,
    DimoTriggerRegistryService,
  ],
})
export class DimoModule {}
