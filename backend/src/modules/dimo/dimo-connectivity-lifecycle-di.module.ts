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
import { DeviceConnectionPhysicalStateModule } from './device-connection-physical-state/device-connection-physical-state.module';

/**
 * Canonical Nest submodule for connectivity lifecycle webhook processing.
 * Imported by DimoModule — single provider graph for production and DI regression tests.
 */
@Module({
  imports: [
    ConfigModule.forFeature(deviceConnectionWebhookInboxConfig),
    ConfigModule.forFeature(connectivityRecoveryConfig),
    BullModule.registerQueue({ name: QUEUE_NAMES.CONNECTIVITY_WEBHOOK_PROCESS }),
    DeviceConnectionPhysicalStateModule,
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
    ConnectivityRecoveryPolicyService,
    DeviceConnectionWebhookService,
    DeviceConnectionWebhookInboxRepository,
    DeviceConnectionWebhookInboxEnqueueService,
    DeviceConnectionWebhookProcessingService,
    DeviceConnectionWebhookQueueProducer,
    DeviceConnectionWebhookInboxSchedulerService,
    DeviceConnectionEpisodeService,
  ],
})
export class DimoConnectivityLifecycleDiModule {}
