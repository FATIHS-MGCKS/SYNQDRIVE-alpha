import { Injectable, Logger, Optional } from '@nestjs/common';
import { CommunicationChannel } from '@prisma/client';
import { NotificationProducerRouter } from '@modules/notifications/adapters/notification-producer.router';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { recordCommunicationHandoff } from '../observability/communication-prometheus.metrics';
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
    @Optional() private readonly tripMetrics?: TripMetricsService,
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
      if (this.tripMetrics) {
        recordCommunicationHandoff(this.tripMetrics, {
          channel: input.channel,
          result: 'success',
        });
      }
    } catch (error) {
      if (this.tripMetrics) {
        recordCommunicationHandoff(this.tripMetrics, {
          channel: input.channel,
          result: 'failed',
        });
      }
      this.logger.warn(
        `communication_handoff_notification_ingest_failed conversationId=${input.conversationId}`,
      );
    }
  }
}
