import type { VoiceAssistantData, VoiceAssistantUpdatePayload } from '../../../lib/api';

export interface VoicePrivacyRetentionConfig {
  recordAudio: boolean;
  consentNoticeText: string;
  retentionTranscriptDays: number;
  retentionSummaryDays: number;
  retentionProviderPayloadDays: number;
}

const DEFAULT_PRIVACY: VoicePrivacyRetentionConfig = {
  recordAudio: false,
  consentNoticeText: '',
  retentionTranscriptDays: 30,
  retentionSummaryDays: 90,
  retentionProviderPayloadDays: 7,
};

function readPrivacyRaw(assistant: Pick<VoiceAssistantData, 'businessHours'>): Record<string, unknown> | null {
  const hours = assistant.businessHours;
  if (!hours || typeof hours !== 'object' || Array.isArray(hours)) return null;
  const privacy = (hours as Record<string, unknown>).privacyRetention;
  if (!privacy || typeof privacy !== 'object' || Array.isArray(privacy)) return null;
  return privacy as Record<string, unknown>;
}

export function parsePrivacyRetentionConfig(
  assistant: Pick<VoiceAssistantData, 'businessHours'>,
): VoicePrivacyRetentionConfig {
  const raw = readPrivacyRaw(assistant);
  if (!raw) return { ...DEFAULT_PRIVACY };

  return {
    recordAudio: raw.recordAudio === true,
    consentNoticeText: typeof raw.consentNoticeText === 'string' ? raw.consentNoticeText : '',
    retentionTranscriptDays:
      typeof raw.retentionTranscriptDays === 'number'
        ? raw.retentionTranscriptDays
        : typeof raw.retentionDays === 'number'
          ? raw.retentionDays
          : DEFAULT_PRIVACY.retentionTranscriptDays,
    retentionSummaryDays:
      typeof raw.retentionSummaryDays === 'number'
        ? raw.retentionSummaryDays
        : typeof raw.retentionDays === 'number'
          ? raw.retentionDays
          : DEFAULT_PRIVACY.retentionSummaryDays,
    retentionProviderPayloadDays:
      typeof raw.retentionProviderPayloadDays === 'number'
        ? raw.retentionProviderPayloadDays
        : DEFAULT_PRIVACY.retentionProviderPayloadDays,
  };
}

export function privacyPayloadFromConfig(
  assistant: VoiceAssistantData,
  config: VoicePrivacyRetentionConfig,
): VoiceAssistantUpdatePayload {
  const existingHours =
    assistant.businessHours && typeof assistant.businessHours === 'object' && !Array.isArray(assistant.businessHours)
      ? { ...(assistant.businessHours as Record<string, unknown>) }
      : {};

  return {
    businessHours: {
      ...existingHours,
      privacyRetention: {
        recordAudio: config.recordAudio,
        consentNoticeText: config.consentNoticeText.trim() || null,
        retentionTranscriptDays: config.retentionTranscriptDays,
        retentionSummaryDays: config.retentionSummaryDays,
        retentionProviderPayloadDays: config.retentionProviderPayloadDays,
      },
    },
  };
}
