import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { SharedGuardsModule } from '@shared/auth/shared-guards.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { VoiceProviderWebhookEventRepository } from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';
import { VoiceBillingModule } from '@modules/voice-billing/voice-billing.module';
import { ElevenLabsWebhookController } from './elevenlabs-webhook.controller';
import { VoiceWebhookReplayController } from './voice-webhook-replay.controller';
import { VoiceWebhookIngestService, VoiceWebhookQueueProducer } from './voice-webhook-ingest.service';
import { VoiceWebhookCorrelationService } from './voice-webhook-correlation.service';
import { VoiceConversationLifecycleService } from './voice-conversation-lifecycle.service';
import {
  VoiceWebhookProcessingService,
  VoiceWebhookReplayService,
} from './voice-webhook-processing.service';
import { VoiceInternalEventIngestService } from './voice-internal-event-ingest.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    SharedGuardsModule,
    VoiceBillingModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.VOICE_WEBHOOK_PROCESS }),
  ],
  controllers: [ElevenLabsWebhookController, VoiceWebhookReplayController],
  providers: [
    VoiceProviderWebhookEventRepository,
    VoiceWebhookCorrelationService,
    VoiceConversationLifecycleService,
    VoiceWebhookQueueProducer,
    VoiceWebhookIngestService,
    VoiceWebhookProcessingService,
    VoiceWebhookReplayService,
    VoiceInternalEventIngestService,
  ],
  exports: [
    VoiceWebhookIngestService,
    VoiceWebhookProcessingService,
    VoiceWebhookReplayService,
    VoiceInternalEventIngestService,
  ],
})
export class VoiceWebhookIngestionModule {}
