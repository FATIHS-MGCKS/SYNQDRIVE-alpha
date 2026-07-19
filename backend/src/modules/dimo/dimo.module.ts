import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import dimoConfig from '@config/dimo.config';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { SharedGuardsModule } from '@shared/auth/shared-guards.module';
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
import { DeviceConnectionQueryService } from './device-connection-query.service';
import { DeviceConnectionEpisodeReconciliationService } from './device-connection-episode-reconciliation/device-connection-episode-reconciliation.service';
import { DeviceConnectionWebhookInboxRepository } from './device-connection-webhook-ingestion/device-connection-webhook-inbox.repository';
import {
  DeviceConnectionWebhookIngestService,
  DeviceConnectionWebhookQueueProducer,
} from './device-connection-webhook-ingestion/device-connection-webhook-ingest.service';
import {
  DeviceConnectionWebhookProcessingService,
  DeviceConnectionWebhookReplayService,
} from './device-connection-webhook-ingestion/device-connection-webhook-processing.service';
import { DeviceConnectionWebhookReplayController } from './device-connection-webhook-ingestion/device-connection-webhook-replay.controller';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';

@Module({
  imports: [
    ConfigModule.forFeature(dimoConfig),
    SharedGuardsModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.DEVICE_CONNECTION_WEBHOOK_PROCESS }),
    forwardRef(() => VehicleIntelligenceModule),
  ],
  controllers: [DimoController, DimoWebhookController, DeviceConnectionWebhookReplayController],
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
    DeviceConnectionWebhookInboxRepository,
    DeviceConnectionWebhookQueueProducer,
    DeviceConnectionWebhookIngestService,
    DeviceConnectionWebhookProcessingService,
    DeviceConnectionWebhookReplayService,
    DimoTriggerRegistryService,
    DeviceConnectionWebhookConfigurationService,
    DeviceConnectionEpisodeService,
    DeviceConnectionEpisodeReconciliationService,
    DeviceConnectionEpisodeResolutionService,
    DeviceConnectionEpisodeResolutionOutboxService,
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
    DeviceConnectionWebhookIngestService,
    DeviceConnectionWebhookProcessingService,
    DeviceConnectionWebhookReplayService,
    DeviceConnectionWebhookConfigurationService,
    DimoTriggerRegistryService,
    RpmWebhookQueryService,
  ],
})
export class DimoModule {}
