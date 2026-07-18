import { describe, expect, it } from 'vitest';
import { parsePrivacyRetentionConfig, privacyPayloadFromConfig } from './voice-privacy.ops';
import type { VoiceAssistantData } from '../../../lib/api';

describe('voice-privacy.ops', () => {
  const assistant = {
    businessHours: {
      privacyRetention: {
        recordAudio: true,
        consentNoticeText: 'AI notice',
        retentionTranscriptDays: 14,
        retentionSummaryDays: 60,
        retentionProviderPayloadDays: 3,
      },
    },
  } as VoiceAssistantData;

  it('parses privacy retention from businessHours', () => {
    const config = parsePrivacyRetentionConfig(assistant);
    expect(config.recordAudio).toBe(true);
    expect(config.consentNoticeText).toBe('AI notice');
    expect(config.retentionTranscriptDays).toBe(14);
  });

  it('merges privacy into businessHours payload', () => {
    const payload = privacyPayloadFromConfig(assistant, {
      recordAudio: false,
      consentNoticeText: 'Updated',
      retentionTranscriptDays: 30,
      retentionSummaryDays: 90,
      retentionProviderPayloadDays: 7,
    });
    const hours = payload.businessHours as Record<string, unknown>;
    const privacy = hours.privacyRetention as Record<string, unknown>;
    expect(privacy.recordAudio).toBe(false);
    expect(privacy.consentNoticeText).toBe('Updated');
  });
});
