import { Injectable } from '@nestjs/common';
import { CommunicationChannel } from '@prisma/client';
import { NotificationSeverity } from '../notification.enums';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { validateRegistryCandidate } from '../registry/notification-event-registry.validator';
import type {
  CommunicationHandoffAdapterSource,
  NotificationAdapterContext,
  NotificationProducerAdapter,
} from './notification-adapter.types';

function channelLabel(channel: CommunicationChannel): string {
  switch (channel) {
    case CommunicationChannel.WHATSAPP:
      return 'WhatsApp';
    case CommunicationChannel.VOICE:
      return 'Voice';
    case CommunicationChannel.SMS:
      return 'SMS';
    default:
      return channel;
  }
}

@Injectable()
export class CommunicationHandoffNotificationAdapter
  implements NotificationProducerAdapter<CommunicationHandoffAdapterSource>
{
  readonly adapterId = 'communication-handoff';
  readonly supportedEventTypes = ['COMMUNICATION_HANDOFF_REQUIRED'] as const;
  readonly shadowModeOnly = false;

  canHandle(source: CommunicationHandoffAdapterSource): boolean {
    return Boolean(source.conversationId && source.communicationEventId);
  }

  toCandidate(source: CommunicationHandoffAdapterSource, context: NotificationAdapterContext) {
    const candidate = buildCandidateFromRegistry({
      organizationId: context.organizationId,
      eventType: 'COMMUNICATION_HANDOFF_REQUIRED',
      entityId: source.conversationId,
      sourceRef: source.communicationEventId,
      occurredAt: context.occurredAt,
      severity: NotificationSeverity.WARNING,
      conditionCodeVariant: source.communicationEventId,
      templateParams: {
        contactDisplay: source.contactDisplay,
        channelLabel: channelLabel(source.channel),
        handoffReasonCode: source.handoffReasonCode ?? '',
        conversationId: source.conversationId,
        stationId: source.stationId ?? '',
        channel: source.channel,
      },
      actionTargetContext: {
        conversationId: source.conversationId,
        ...(source.stationId ? { stationId: source.stationId } : {}),
        channel: source.channel,
      },
      metadata: {
        adapterId: this.adapterId,
        communicationEventId: source.communicationEventId,
      },
    });

    return validateRegistryCandidate(candidate);
  }
}
