import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { CommunicationConversationRepository } from './communication-conversation.repository';
import { CommunicationEventRepository } from './communication-event.repository';
import { CommunicationPersistenceService } from './communication-persistence.service';
import { CommunicationProjectionService } from './communication-projection.service';
import { CommunicationTenantContextValidation } from './communication-tenant-context.validation';

/**
 * Canonical Communication Center persistence + normalization foundation (C1/C2).
 * Repositories + internal services only — no HTTP controller, no provider projection wiring.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    CommunicationTenantContextValidation,
    CommunicationConversationRepository,
    CommunicationEventRepository,
    CommunicationPersistenceService,
    CommunicationProjectionService,
  ],
  exports: [
    CommunicationTenantContextValidation,
    CommunicationConversationRepository,
    CommunicationEventRepository,
    CommunicationPersistenceService,
    CommunicationProjectionService,
  ],
})
export class CommunicationModule {}
