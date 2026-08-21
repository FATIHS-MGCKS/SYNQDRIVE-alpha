import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { CommunicationConversationRepository } from './communication-conversation.repository';
import { CommunicationEventRepository } from './communication-event.repository';
import type {
  AppendCommunicationEventInput,
  EnsureCommunicationConversationInput,
  UpdateCommunicationConversationProjectionInput,
} from './communication.types';

/**
 * Internal persistence foundation for future C3+ projection phases.
 * No HTTP surface; no provider wiring in C1.
 */
@Injectable()
export class CommunicationPersistenceService {
  constructor(
    private readonly conversations: CommunicationConversationRepository,
    private readonly events: CommunicationEventRepository,
  ) {}

  ensureConversationEnvelope(input: EnsureCommunicationConversationInput) {
    return this.conversations.ensureConversationEnvelope(input);
  }

  findConversationByNativeReference(
    organizationId: string,
    channel: EnsureCommunicationConversationInput['channel'],
    nativeConversationId: string,
  ) {
    return this.conversations.findByNativeReference(
      organizationId,
      channel,
      nativeConversationId,
    );
  }

  findConversationById(organizationId: string, id: string) {
    return this.conversations.findById(organizationId, id);
  }

  updateConversationProjection(
    organizationId: string,
    id: string,
    patch: UpdateCommunicationConversationProjectionInput,
  ) {
    return this.conversations.updateConversationProjection(organizationId, id, patch);
  }

  async appendEventIdempotently(input: AppendCommunicationEventInput) {
    await this.assertConversationTenantMatch(input.organizationId, input.conversationId);
    return this.events.appendEventIdempotently(input);
  }

  private async assertConversationTenantMatch(
    organizationId: string,
    conversationId: string,
  ): Promise<void> {
    const conversation = await this.conversations.findById(organizationId, conversationId);
    if (!conversation) {
      throw new ForbiddenException('Communication conversation not found in organization');
    }
    if (conversation.organizationId !== organizationId) {
      throw new ForbiddenException('Cross-organization communication access denied');
    }
  }
}
