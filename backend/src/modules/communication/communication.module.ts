import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import communicationProjectionConfig from '@config/communication-projection.config';
import { PrismaModule } from '@shared/database/prisma.module';
import { MetaWhatsAppCommunicationAdapter } from './adapters/whatsapp/meta-whatsapp-communication.adapter';
import { WhatsAppCommunicationProjectionIntegration } from './adapters/whatsapp/whatsapp-communication-projection.integration';
import { CommunicationConversationRepository } from './communication-conversation.repository';
import { CommunicationEventRepository } from './communication-event.repository';
import { CommunicationPersistenceService } from './communication-persistence.service';
import { CommunicationProjectionFeatureService } from './communication-projection-feature.service';
import { CommunicationProjectionService } from './communication-projection.service';
import { CommunicationTenantContextValidation } from './communication-tenant-context.validation';

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
    MetaWhatsAppCommunicationAdapter,
    WhatsAppCommunicationProjectionIntegration,
  ],
  exports: [
    CommunicationTenantContextValidation,
    CommunicationConversationRepository,
    CommunicationEventRepository,
    CommunicationPersistenceService,
    CommunicationProjectionService,
    CommunicationProjectionFeatureService,
    MetaWhatsAppCommunicationAdapter,
    WhatsAppCommunicationProjectionIntegration,
  ],
})
export class CommunicationModule {}
