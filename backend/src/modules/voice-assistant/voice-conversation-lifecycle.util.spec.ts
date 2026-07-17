import {
  VoiceConversationOutcome,
  VoiceConversationStatus,
} from '@prisma/client';
import {
  assertValidStatusOutcomePair,
  buildLegacyTwimlMetadata,
  isAnalyticsAnsweredConversation,
  isForbiddenStatusOutcomePair,
  isLegacyTwimlConversation,
  resolveElevenLabsSyncOutcome,
  resolveLegacyTwimlTerminalOutcome,
} from './voice-conversation-lifecycle.util';

describe('voice-conversation-lifecycle.util', () => {
  it('marks legacy Twilio Say metadata without ElevenLabs AI provider', () => {
    const metadata = buildLegacyTwimlMetadata();
    expect(isLegacyTwimlConversation(metadata)).toBe(true);
    expect(metadata).toMatchObject({
      telephonyMode: 'LEGACY_TWIML_SAY',
      aiProvider: null,
      productiveAiCall: false,
      diagnostic: true,
    });
  });

  it('rejects ACTIVE + RESOLVED pairs', () => {
    expect(
      isForbiddenStatusOutcomePair(
        VoiceConversationStatus.ACTIVE,
        VoiceConversationOutcome.RESOLVED,
      ),
    ).toBe(true);
    expect(() =>
      assertValidStatusOutcomePair(
        VoiceConversationStatus.ACTIVE,
        VoiceConversationOutcome.RESOLVED,
      ),
    ).toThrow();
  });

  it('does not count legacy placeholder calls as answered analytics', () => {
    expect(
      isAnalyticsAnsweredConversation({
        outcome: VoiceConversationOutcome.RESOLVED,
        status: VoiceConversationStatus.COMPLETED,
        durationSeconds: 42,
        metadata: buildLegacyTwimlMetadata(),
        transcript: null,
      }),
    ).toBe(false);
  });

  it('counts ElevenLabs conversations with transcript as answered', () => {
    expect(
      isAnalyticsAnsweredConversation({
        outcome: VoiceConversationOutcome.RESOLVED,
        status: VoiceConversationStatus.COMPLETED,
        durationSeconds: 42,
        metadata: { productiveAiCall: true },
        transcript: 'Caller booked a vehicle.',
      }),
    ).toBe(true);
  });

  it('maps legacy completed Twilio calls to non-resolved outcomes', () => {
    expect(resolveLegacyTwimlTerminalOutcome('completed')).toBe(
      VoiceConversationOutcome.ABANDONED,
    );
  });

  it('requires transcript before marking ElevenLabs sync as resolved', () => {
    expect(
      resolveElevenLabsSyncOutcome({ remoteStatus: 'done', transcript: null }),
    ).toBe(VoiceConversationOutcome.ABANDONED);
    expect(
      resolveElevenLabsSyncOutcome({
        remoteStatus: 'done',
        transcript: 'hello',
      }),
    ).toBe(VoiceConversationOutcome.RESOLVED);
  });
});
