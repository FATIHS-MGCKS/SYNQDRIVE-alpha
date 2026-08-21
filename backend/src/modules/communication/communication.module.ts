import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { CommunicationConversationRepository } from './communication-conversation.repository';
import { CommunicationEventRepository } from './communication-event.repository';
import { CommunicationPersistenceService } from './communication-persistence.service';
import { CommunicationTenantContextValidation } from './communication-tenant-context.validation';

/**
 * Canonical Communication Center persistence foundation (C1).
 * Repositories + internal service only — no HTTP controller, no provider projection.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    CommunicationTenantContextValidation,
    CommunicationConversationRepository,
    CommunicationEventRepository,
    CommunicationPersistenceService,
  ],
  exports: [
    CommunicationTenantContextValidation,
    CommunicationConversationRepository,
    CommunicationEventRepository,
    CommunicationPersistenceService,
  ],
})
export class CommunicationModule {}
