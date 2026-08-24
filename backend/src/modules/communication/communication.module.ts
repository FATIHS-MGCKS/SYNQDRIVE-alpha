import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import communicationProjectionConfig from '@config/communication-projection.config';
import communicationRetentionConfig from '@config/communication-retention.config';
import communicationOperationalHealthConfig from '@config/communication-operational-health.config';
import voiceRetentionConfig from '@config/voice-retention.config';
import { DocumentsModule } from '@modules/documents/documents.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { VoiceAssistantModule } from '@modules/voice-assistant/voice-assistant.module';
import { StationsModule } from '@modules/stations/stations.module';
import { BookingsModule } from '@modules/bookings/bookings.module';
import { TasksModule } from '@modules/tasks/tasks.module';
import { WhatsAppModule } from '@modules/whatsapp/whatsapp.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { MetaWhatsAppCommunicationAdapter } from './adapters/whatsapp/meta-whatsapp-communication.adapter';
import { WhatsAppCommunicationProjectionIntegration } from './adapters/whatsapp/whatsapp-communication-projection.integration';
import { ElevenLabsVoiceCommunicationAdapter } from './adapters/voice/elevenlabs-voice-communication.adapter';
import { TwilioVoiceCommunicationAdapter } from './adapters/voice/twilio-voice-communication.adapter';
import { VoiceCommunicationProjectionIntegration } from './adapters/voice/voice-communication-projection.integration';
import { SentDmSmsCommunicationAdapter } from './adapters/sms/sentdm-sms-communication.adapter';
import { SmsCommunicationProjectionIntegration } from './adapters/sms/sms-communication-projection.integration';
import { CommunicationConversationRepository } from './communication-conversation.repository';
import { CommunicationEventRepository } from './communication-event.repository';
import { CommunicationPersistenceService } from './communication-persistence.service';
import { CommunicationProjectionFeatureService } from './communication-projection-feature.service';
import { CommunicationProjectionService } from './communication-projection.service';
import { CommunicationTenantContextValidation } from './communication-tenant-context.validation';
import { CommunicationContextApplierService } from './context/communication-context-applier.service';
import { CommunicationContextLinkService } from './context/communication-context-link.service';
import { CommunicationContextBackfillService, CommunicationContextEnrichmentService } from './context/communication-context-enrichment.service';
import { CommunicationContextResolverService } from './context/communication-context-resolver.service';
import { CommunicationContextDuplicateAuditService } from './context/communication-context-duplicate-audit.service';
import { CommunicationNativeContextLoader } from './context/communication-native-context.loader';
import { CommunicationReadController } from './read/communication-read.controller';
import { CommunicationReadRepository } from './read/communication-read.repository';
import { CommunicationReadService } from './read/communication-read.service';
import { CommunicationWriteController } from './write/communication-write.controller';
import { CommunicationWriteScopeService } from './write/communication-write-scope.service';
import { CommunicationWriteService } from './write/communication-write.service';
import { CommunicationHumanTakeoverService } from './write/communication-human-takeover.service';
import { CommunicationReplyController } from './reply/communication-reply.controller';
import { CommunicationReplyService } from './reply/communication-reply.service';
import { CommunicationReplyChannelCapabilityService } from './reply/communication-reply-channel-capability.service';
import { CommunicationAttachmentService } from './media/communication-attachment.service';
import { CommunicationAttachmentController } from './media/communication-attachment.controller';
import { WhatsAppCommunicationOutboundAdapter } from './reply/adapters/whatsapp-communication-outbound.adapter';
import { SmsCommunicationOutboundAdapter } from './reply/adapters/sms-communication-outbound.adapter';
import { CommunicationContentBackfillService } from './content/communication-content-backfill.service';
import { CommunicationContentRepository } from './content/communication-content.repository';
import { CommunicationContentService } from './content/communication-content.service';
import { CommunicationAiActivityRepository } from './ai-activity/communication-ai-activity.repository';
import { CommunicationAiActivityService } from './ai-activity/communication-ai-activity.service';
import { CommunicationAiActivityController } from './ai-activity/communication-ai-activity.controller';
import { CommunicationHandoffNotificationService } from './handoff/communication-handoff-notification.service';
import { CommunicationWhatsAppOpsService } from './ops/communication-whatsapp-ops.service';
import { CommunicationWhatsAppOpsController } from './ops/communication-whatsapp-ops.controller';
import { CommunicationVoiceOpsService } from './ops/communication-voice-ops.service';
import { CommunicationVoiceOpsController } from './ops/communication-voice-ops.controller';
import { CommunicationQuickActionExecutorService } from './ops/communication-quick-action.executor';
import { CommunicationQuickActionResolverService } from './ops/communication-quick-action.resolver';
import { CommunicationRetentionService } from './retention/communication-retention.service';
import { CommunicationRetentionScheduler } from './retention/communication-retention.scheduler';
import { CommunicationRetentionMetrics } from './retention/communication-retention.metrics';
import { CommunicationOperationalHealthRepository } from './observability/communication-operational-health.repository';
import { CommunicationOperationalHealthService } from './observability/communication-operational-health.service';
import { CommunicationOperationalHealthController } from './observability/communication-operational-health.controller';
import { CommunicationMetricsRefreshService } from './observability/communication-metrics-refresh.service';

/**
 * Canonical Communication Center persistence + normalization foundation (C1–C7.2).
 */
@Module({
  imports: [
    PrismaModule,
    StationsModule,
    DocumentsModule,
    NotificationsModule,
    BookingsModule,
    TasksModule,
    forwardRef(() => VoiceAssistantModule),
    forwardRef(() => WhatsAppModule),
    ConfigModule.forFeature(communicationProjectionConfig),
    ConfigModule.forFeature(communicationRetentionConfig),
    ConfigModule.forFeature(communicationOperationalHealthConfig),
    ConfigModule.forFeature(voiceRetentionConfig),
  ],
  providers: [
    CommunicationTenantContextValidation,
    CommunicationConversationRepository,
    CommunicationEventRepository,
    CommunicationPersistenceService,
    CommunicationProjectionService,
    CommunicationProjectionFeatureService,
    CommunicationNativeContextLoader,
    CommunicationContextResolverService,
    CommunicationContextApplierService,
    CommunicationContextLinkService,
    CommunicationContextEnrichmentService,
    CommunicationContextBackfillService,
    CommunicationContextDuplicateAuditService,
    CommunicationContentRepository,
    CommunicationContentService,
    CommunicationContentBackfillService,
    MetaWhatsAppCommunicationAdapter,
    WhatsAppCommunicationProjectionIntegration,
    TwilioVoiceCommunicationAdapter,
    ElevenLabsVoiceCommunicationAdapter,
    VoiceCommunicationProjectionIntegration,
    SentDmSmsCommunicationAdapter,
    SmsCommunicationProjectionIntegration,
    CommunicationReadRepository,
    CommunicationReadService,
    CommunicationWriteScopeService,
    CommunicationWriteService,
    CommunicationHumanTakeoverService,
    CommunicationReplyService,
    CommunicationReplyChannelCapabilityService,
    CommunicationAttachmentService,
    WhatsAppCommunicationOutboundAdapter,
    SmsCommunicationOutboundAdapter,
    CommunicationAiActivityRepository,
    CommunicationAiActivityService,
    CommunicationHandoffNotificationService,
    CommunicationWhatsAppOpsService,
    CommunicationVoiceOpsService,
    CommunicationQuickActionExecutorService,
    CommunicationQuickActionResolverService,
    CommunicationRetentionService,
    CommunicationRetentionScheduler,
    CommunicationRetentionMetrics,
    CommunicationOperationalHealthRepository,
    CommunicationOperationalHealthService,
    CommunicationMetricsRefreshService,
  ],
  controllers: [
    CommunicationReadController,
    CommunicationWriteController,
    CommunicationReplyController,
    CommunicationAttachmentController,
    CommunicationAiActivityController,
    CommunicationWhatsAppOpsController,
    CommunicationVoiceOpsController,
    CommunicationOperationalHealthController,
  ],
  exports: [
    CommunicationTenantContextValidation,
    CommunicationConversationRepository,
    CommunicationEventRepository,
    CommunicationPersistenceService,
    CommunicationProjectionService,
    CommunicationProjectionFeatureService,
    CommunicationContextResolverService,
    CommunicationContextEnrichmentService,
    CommunicationContextBackfillService,
    CommunicationContextDuplicateAuditService,
    CommunicationContentRepository,
    CommunicationContentService,
    CommunicationContentBackfillService,
    MetaWhatsAppCommunicationAdapter,
    WhatsAppCommunicationProjectionIntegration,
    TwilioVoiceCommunicationAdapter,
    ElevenLabsVoiceCommunicationAdapter,
    VoiceCommunicationProjectionIntegration,
    SentDmSmsCommunicationAdapter,
    SmsCommunicationProjectionIntegration,
    CommunicationReadRepository,
    CommunicationReadService,
    CommunicationWriteScopeService,
    CommunicationWriteService,
    CommunicationReplyService,
    CommunicationAttachmentService,
    CommunicationConversationRepository,
    CommunicationAiActivityService,
    CommunicationHandoffNotificationService,
    CommunicationRetentionService,
    CommunicationOperationalHealthService,
  ],
})
export class CommunicationModule {}
