import { describe, expect, it } from 'vitest';
import { buildCommunicationVoiceTaskPrefill } from './communication-voice-task-prefill';

describe('buildCommunicationVoiceTaskPrefill', () => {
  const t = (key: string, params?: Record<string, string | number>) => {
    if (key === 'communication.voice.taskPrefill.title') {
      return `Voice follow-up — ${params?.date ?? ''}`;
    }
    if (key === 'communication.voice.taskPrefill.summaryLabel') return 'Summary';
    if (key === 'communication.voice.taskPrefill.escalationLabel') return 'Escalation';
    if (key === 'communication.voice.taskPrefill.communicationLabel') return 'Communication';
    return key;
  };

  it('builds localized editable task prefill without transcript dump', () => {
    const result = buildCommunicationVoiceTaskPrefill(
      {
        callDetail: {
          callId: 'voice-1',
          conversationId: 'conv-1',
          direction: 'INBOUND',
          status: 'COMPLETED',
          outcome: 'ESCALATED',
          startedAt: '2026-08-23T10:00:00.000Z',
          summary: 'Customer asked for callback.',
          summaryAvailable: true,
          escalated: true,
          escalationReason: 'CALLBACK_REQUESTED',
          hasTranscript: true,
          transcriptAvailability: 'AVAILABLE',
        },
        conversation: {
          id: 'conv-1',
          customer: { id: 'cust-1', displayName: 'Max' },
          booking: { id: 'book-1', reference: 'BK-1' },
          vehicle: { id: 'veh-1', displayLabel: 'AB-123' },
          station: { id: 'station-1', name: 'Airport' },
        },
        t,
      },
      'en-US',
    );

    expect(result.initialForm.title).toContain('Voice follow-up');
    expect(result.initialForm.description).toContain('Customer asked for callback.');
    expect(result.initialForm.description).toContain('conv-1');
    expect(result.initialForm.description).not.toContain('transcript');
    expect(result.initialForm.priority).toBe('High');
    expect(result.initialForm.customerId).toBe('cust-1');
    expect(result.payloadExtras.metadata).toMatchObject({
      voiceConversationId: 'voice-1',
      communicationConversationId: 'conv-1',
    });
  });
});
