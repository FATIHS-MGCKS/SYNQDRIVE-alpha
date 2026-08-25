import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import deviceConnectionWebhookInboxConfig from '@config/device-connection-webhook-inbox.config';
import connectivityRecoveryConfig from '@config/connectivity-recovery.config';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { ConnectivityLifecycleRuntimePolicyService } from './connectivity/connectivity-lifecycle-runtime-policy.service';
import { ConnectivityRecoveryPolicyService } from './connectivity/connectivity-recovery.policy';
import { DeviceConnectionEpisodeService } from './device-connection-episode.service';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';
import { DeviceConnectionWebhookInboxRepository } from './device-connection-webhook-inbox.repository';
import { DeviceConnectionWebhookInboxEnqueueService } from './device-connection-webhook-inbox-enqueue.service';
import { DeviceConnectionWebhookProcessingService } from './device-connection-webhook-processing.service';
import { DeviceConnectionWebhookQueueProducer } from './device-connection-webhook-queue.producer';
import { DeviceConnectionWebhookInboxSchedulerService } from './device-connection-webhook-inbox-scheduler.service';

/**
 * Minimal genuine Nest module graph for connectivity lifecycle DI regression.
 * Mirrors the DimoModule connectivity/webhook providers required for production boot.
 */
@Module({
  imports: [
    ConfigModule.forFeature(deviceConnectionWebhookInboxConfig),
    ConfigModule.forFeature(connectivityRecoveryConfig),
    BullModule.registerQueue({ name: QUEUE_NAMES.CONNECTIVITY_WEBHOOK_PROCESS }),
  ],
  providers: [
    ConnectivityLifecycleRuntimePolicyService,
    ConnectivityRecoveryPolicyService,
    DeviceConnectionEpisodeService,
    DeviceConnectionWebhookService,
    DeviceConnectionWebhookInboxRepository,
    DeviceConnectionWebhookInboxEnqueueService,
    DeviceConnectionWebhookProcessingService,
    DeviceConnectionWebhookQueueProducer,
    DeviceConnectionWebhookInboxSchedulerService,
  ],
  exports: [
    ConnectivityLifecycleRuntimePolicyService,
    DeviceConnectionWebhookService,
    DeviceConnectionWebhookProcessingService,
    DeviceConnectionWebhookInboxSchedulerService,
  ],
})
export class DimoConnectivityLifecycleDiModule {}
