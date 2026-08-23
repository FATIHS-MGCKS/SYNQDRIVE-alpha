import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import communicationProjectionConfig from '@config/communication-projection.config';
import { StationsModule } from '@modules/stations/stations.module';
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
import { CommunicationReplyController } from './reply/communication-reply.controller';
import { CommunicationReplyService } from './reply/communication-reply.service';
import { CommunicationReplyChannelCapabilityService } from './reply/communication-reply-channel-capability.service';
import { WhatsAppCommunicationOutboundAdapter } from './reply/adapters/whatsapp-communication-outbound.adapter';
import { SmsCommunicationOutboundAdapter } from './reply/adapters/sms-communication-outbound.adapter';
import { CommunicationContentBackfillService } from './content/communication-content-backfill.service';
import { CommunicationContentRepository } from './content/communication-content.repository';
import { CommunicationContentService } from './content/communication-content.service';

/**
 * Canonical Communication Center persistence + normalization foundation (C1–C7.2).
 */
@Module({
  imports: [
    PrismaModule,
    StationsModule,
    forwardRef(() => WhatsAppModule),
    ConfigModule.forFeature(communicationProjectionConfig),
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
    CommunicationReplyChannelCapabilityService,
    WhatsAppCommunicationOutboundAdapter,
    SmsCommunicationOutboundAdapter,
  ],
  controllers: [CommunicationReadController, CommunicationWriteController, CommunicationReplyController],
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
  ],
})
export class CommunicationModule {}
