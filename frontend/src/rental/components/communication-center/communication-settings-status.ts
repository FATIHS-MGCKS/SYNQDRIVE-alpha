import type { SmsConfig, VoiceAssistantData, WhatsAppConfig } from '../../../lib/api';

export type CommunicationSettingsStatusKind =
  | 'CONNECTED'
  | 'CONFIGURED'
  | 'NOT_CONFIGURED'
  | 'DEGRADED'
  | 'DISABLED';

export function resolveWhatsAppSettingsStatus(
  config: WhatsAppConfig | null | undefined,
): CommunicationSettingsStatusKind {
  if (!config) return 'NOT_CONFIGURED';
  if (config.providerStatus === 'ERROR') return 'DEGRADED';
  if (!config.isActive && config.isConnected) return 'DISABLED';
  if (config.isConnected && config.providerConfigured) return 'CONNECTED';
  if (config.providerConfigured || config.accessTokenConfigured) return 'CONFIGURED';
  return 'NOT_CONFIGURED';
}

export function resolveVoiceSettingsStatus(
  assistant: VoiceAssistantData | null | undefined,
): CommunicationSettingsStatusKind {
  if (!assistant) return 'NOT_CONFIGURED';
  if (assistant.connectionStatus === 'ERROR' || assistant.connectionStatus === 'DEGRADED') {
    return 'DEGRADED';
  }
  if (assistant.connectionStatus === 'CONNECTED' && assistant.status === 'ACTIVE') {
    return 'CONNECTED';
  }
  if (
    assistant.telephonyEnabled ||
    assistant.elevenLabsAgentId ||
    assistant.phoneNumber ||
    assistant.voiceId
  ) {
    return 'CONFIGURED';
  }
  return 'NOT_CONFIGURED';
}

export function resolveSmsSettingsStatus(
  config: SmsConfig | null | undefined,
): CommunicationSettingsStatusKind {
  if (!config) return 'NOT_CONFIGURED';
  if (!config.isActive && config.isConnected) return 'DISABLED';
  if (config.isConnected && config.credentialsConfigured) return 'CONNECTED';
  if (
    config.credentialsConfigured ||
    config.senderProfileConfigured ||
    config.webhookConfigured
  ) {
    return 'CONFIGURED';
  }
  return 'NOT_CONFIGURED';
}
