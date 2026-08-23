import type { CreateTaskPayload } from '../../lib/api';
import type { ManualTaskFormState } from '../../rental/lib/task-create-form.utils';
import type { CommunicationVoiceCallDetail } from './types';
import type { CommunicationConversationDetail } from './types';

export interface CommunicationVoiceTaskPrefillInput {
  callDetail: CommunicationVoiceCallDetail;
  conversation: Pick<
    CommunicationConversationDetail,
    'id' | 'customer' | 'booking' | 'vehicle' | 'station'
  >;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export interface CommunicationVoiceTaskPrefillResult {
  initialForm: Partial<ManualTaskFormState>;
  payloadExtras: Pick<CreateTaskPayload, 'type' | 'priority' | 'metadata' | 'sourceKey'>;
  prefillKey: string;
}

function formatStartedLabel(startedAt: string, localeTag: string): string {
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(localeTag, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function buildCommunicationVoiceTaskPrefill(
  input: CommunicationVoiceTaskPrefillInput,
  localeTag = 'en-US',
): CommunicationVoiceTaskPrefillResult {
  const { callDetail, conversation, t } = input;
  const startedLabel = formatStartedLabel(callDetail.startedAt, localeTag);
  const title = t('communication.voice.taskPrefill.title', {
    date: startedLabel || callDetail.startedAt.slice(0, 10),
  });

  const descriptionParts = [
    callDetail.summaryAvailable && callDetail.summary
      ? `${t('communication.voice.taskPrefill.summaryLabel')}: ${callDetail.summary}`
      : null,
    callDetail.escalationReason
      ? `${t('communication.voice.taskPrefill.escalationLabel')}: ${callDetail.escalationReason}`
      : null,
    `${t('communication.voice.taskPrefill.communicationLabel')}: ${conversation.id}`,
  ].filter(Boolean);

  return {
    prefillKey: `${conversation.id}:${callDetail.callId}`,
    initialForm: {
      title,
      description: descriptionParts.join('\n\n'),
      type: 'CUSTOMER_FOLLOWUP',
      priority: callDetail.escalated ? 'High' : 'Medium',
      customerId: conversation.customer?.id ?? '',
      bookingId: conversation.booking?.id ?? '',
      vehicleId: conversation.vehicle?.id ?? '',
      stationId: conversation.station?.id ?? '',
    },
    payloadExtras: {
      type: 'CUSTOMER_FOLLOWUP',
      priority: callDetail.escalated ? 'HIGH' : 'NORMAL',
      sourceKey: 'COMMUNICATION_VOICE',
      metadata: {
        voiceConversationId: callDetail.callId,
        communicationConversationId: conversation.id,
        outcome: callDetail.outcome,
      },
    },
  };
}
