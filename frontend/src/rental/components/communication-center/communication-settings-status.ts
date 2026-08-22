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

function isSmsRuntimeReady(config: SmsConfig): boolean {
  return (
    config.credentialsConfigured &&
    config.webhookSigningConfigured &&
    config.webhookEndpointConfigured &&
    config.senderProfileConfigured
  );
}

/**
 * SMS status authority (C5/C5.2 OrgSmsConfig flags only — no provider calls):
 * - NO ROW (hasConfigRow=false): NOT_CONFIGURED
 * - ROW without apiKeyConfigured: NOT_CONFIGURED
 * - CONNECTED: isConnected && isActive && full runtime readiness
 * - DEGRADED: connected/active flags inconsistent with required runtime pieces
 * - CONFIGURED: credential and/or partial runtime setup without full connection
 */
export function resolveSmsSettingsStatus(
  config: SmsConfig | null | undefined,
): CommunicationSettingsStatusKind {
  if (!config || !config.hasConfigRow) return 'NOT_CONFIGURED';
  if (!config.credentialsConfigured) return 'NOT_CONFIGURED';

  const runtimeReady = isSmsRuntimeReady(config);

  if (config.isConnected && config.isActive && runtimeReady) {
    return 'CONNECTED';
  }

  if (config.isConnected && (!config.isActive || !runtimeReady)) {
    return 'DEGRADED';
  }

  if (!config.isActive && config.isConnected) {
    return 'DISABLED';
  }

  if (runtimeReady || config.credentialsConfigured) {
    return 'CONFIGURED';
  }

  return 'NOT_CONFIGURED';
}
