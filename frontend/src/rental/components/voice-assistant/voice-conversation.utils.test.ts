import { describe, expect, it } from 'vitest';
import type { VoiceAssistantData, VoiceConversationEntry } from '../../../lib/api';
import {
  buildConversationTimeline,
  conversationIntent,
  isFinalizedConversation,
  isLegacyDiagnosticConversation,
  maskCallerNumber,
  resolveFollowUpKind,
  resolvePrivacyStatus,
} from './voice-conversation.utils';

const sample = (overrides: Partial<VoiceConversationEntry> = {}): VoiceConversationEntry => ({
  id: 'c-1',
  startedAt: '2026-07-18T10:00:00.000Z',
  endedAt: '2026-07-18T10:05:00.000Z',
  direction: 'inbound',
  callerNumber: '+491701234567',
  durationSeconds: 300,
  status: 'completed',
  outcome: 'RESOLVED',
  summary: 'Pickup time for booking. Customer asked about documents.',
  transcript: 'Agent: Hello',
  hasTranscript: true,
  escalated: false,
  escalationReason: null,
  linkedBookingId: 'booking-1',
  linkedCustomerId: null,
  linkedVehicleId: null,
  taskId: null,
  metadata: null,
  actionsPerformed: ['bookingSearch'],
  errorMessage: null,
  ...overrides,
});

describe('voice-conversation.utils', () => {
  it('masks caller numbers without exposing full digits', () => {
    expect(maskCallerNumber('+491701234567')).toBe('+*** *** 4567');
    expect(maskCallerNumber(null)).toBeNull();
  });

  it('treats active pending conversations as not finalized', () => {
    expect(isFinalizedConversation(sample())).toBe(true);
    expect(
      isFinalizedConversation(sample({ status: 'active', outcome: 'PENDING' })),
    ).toBe(false);
  });

  it('excludes legacy diagnostic conversations from finalized analytics', () => {
    expect(
      isLegacyDiagnosticConversation(
        sample({
          metadata: { telephonyMode: 'LEGACY_TWIML_SAY', diagnostic: true },
        }),
      ),
    ).toBe(true);
    expect(
      isFinalizedConversation(
        sample({
          metadata: { telephonyMode: 'LEGACY_TWIML_SAY', diagnostic: true },
        }),
      ),
    ).toBe(false);
  });

  it('derives intent from summary first sentence', () => {
    expect(conversationIntent(sample())).toBe('Pickup time for booking');
  });

  it('resolves privacy status from transcript availability', () => {
    expect(resolvePrivacyStatus(sample())).toBe('full');
    expect(resolvePrivacyStatus(sample({ hasTranscript: false, transcript: null }))).toBe(
      'summary_only',
    );
  });

  it('detects follow-up kinds', () => {
    expect(resolveFollowUpKind(sample({ taskId: 'task-1' }))).toBe('task');
    expect(
      resolveFollowUpKind(
        sample({ outcome: 'ESCALATED', escalated: true, escalationReason: 'callback' }),
      ),
    ).toBe('callback');
  });

  it('builds a chronological timeline', () => {
    const timeline = buildConversationTimeline(
      sample({
        escalated: true,
        outcome: 'ESCALATED',
        escalationReason: 'Low confidence',
        errorMessage: 'Webhook delayed',
      }),
    );
    expect(timeline.map(event => event.kind)).toEqual([
      'started',
      'escalated',
      'tool',
      'error',
      'ended',
    ]);
  });

  it('respects recording policy for audio availability', () => {
    const assistant = {
      businessHours: {
        privacyRetention: { recordAudio: true },
      },
    } as VoiceAssistantData;
    expect(resolvePrivacyStatus(sample(), assistant)).toBe('full');
  });
});
