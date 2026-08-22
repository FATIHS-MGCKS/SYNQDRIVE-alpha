import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import communicationProjectionConfig from '@config/communication-projection.config';
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
import { CommunicationNativeContextLoader } from './context/communication-native-context.loader';

/**
 * Canonical Communication Center persistence + normalization foundation (C1/C2/C3).
 * Repositories + internal services only — no HTTP controller.
 */
@Module({
  imports: [PrismaModule, ConfigModule.forFeature(communicationProjectionConfig)],
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
    MetaWhatsAppCommunicationAdapter,
    WhatsAppCommunicationProjectionIntegration,
    TwilioVoiceCommunicationAdapter,
    ElevenLabsVoiceCommunicationAdapter,
    VoiceCommunicationProjectionIntegration,
    SentDmSmsCommunicationAdapter,
    SmsCommunicationProjectionIntegration,
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
    MetaWhatsAppCommunicationAdapter,
    WhatsAppCommunicationProjectionIntegration,
    TwilioVoiceCommunicationAdapter,
    ElevenLabsVoiceCommunicationAdapter,
    VoiceCommunicationProjectionIntegration,
    SentDmSmsCommunicationAdapter,
    SmsCommunicationProjectionIntegration,
  ],
})
export class CommunicationModule {}
