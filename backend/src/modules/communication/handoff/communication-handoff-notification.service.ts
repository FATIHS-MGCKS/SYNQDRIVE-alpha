import { Injectable, Logger } from '@nestjs/common';
import { CommunicationChannel } from '@prisma/client';
import { NotificationProducerRouter } from '@modules/notifications/adapters/notification-producer.router';
import { CommunicationHandoffNotificationAdapter } from '@modules/notifications/adapters/communication-handoff-notification.adapter';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { mapContactDisplay } from '../ai-activity/communication-ai-activity.mapper';

export interface CommunicationHandoffNotificationInput {
  organizationId: string;
  conversationId: string;
  communicationEventId: string;
  channel: CommunicationChannel;
  occurredAt: Date;
  handoffReasonCode?: string | null;
}

@Injectable()
export class CommunicationHandoffNotificationService {
  private readonly logger = new Logger(CommunicationHandoffNotificationService.name);

  constructor(
    private readonly router: NotificationProducerRouter,
    private readonly adapter: CommunicationHandoffNotificationAdapter,
    private readonly readRepository: CommunicationReadRepository,
  ) {}

  async notifyHandoffRequired(input: CommunicationHandoffNotificationInput): Promise<void> {
    if (!input.communicationEventId) return;

    try {
      const conversation = await this.readRepository.findConversationById(
        input.organizationId,
        input.conversationId,
      );
      if (!conversation) return;

      await this.router.ingestFromAdapter(
        this.adapter,
        {
          conversationId: input.conversationId,
          communicationEventId: input.communicationEventId,
          channel: input.channel,
          stationId: conversation.stationId,
          contactDisplay: mapContactDisplay(conversation),
          handoffReasonCode: input.handoffReasonCode ?? null,
        },
        {
          organizationId: input.organizationId,
          sourceRef: input.communicationEventId,
          occurredAt: input.occurredAt,
          runId: input.communicationEventId,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Communication handoff notification ingest failed for ${input.conversationId}: ${(error as Error).message}`,
      );
    }
  }
}
