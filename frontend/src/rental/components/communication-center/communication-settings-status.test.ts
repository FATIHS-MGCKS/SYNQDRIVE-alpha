import { describe, expect, it } from 'vitest';
import {
  resolveSmsSettingsStatus,
  resolveVoiceSettingsStatus,
  resolveWhatsAppSettingsStatus,
} from './communication-settings-status';
import type { SmsConfig, VoiceAssistantData, WhatsAppConfig } from '../../../lib/api';

describe('communication-settings-status', () => {
  it('resolves WhatsApp connected state from provider flags', () => {
    const status = resolveWhatsAppSettingsStatus({
      isConnected: true,
      isActive: true,
      providerConfigured: true,
    } as WhatsAppConfig);
    expect(status).toBe('CONNECTED');
  });

  it('resolves Voice configured state without implying connected', () => {
    const status = resolveVoiceSettingsStatus({
      status: 'INACTIVE',
      connectionStatus: 'DISCONNECTED',
      telephonyEnabled: true,
    } as VoiceAssistantData);
    expect(status).toBe('CONFIGURED');
  });

  it('resolves SMS not configured when credentials are missing', () => {
    const status = resolveSmsSettingsStatus({
      isConnected: false,
      isActive: false,
      credentialsConfigured: false,
      webhookConfigured: false,
      senderProfileConfigured: false,
      webhookEndpointConfigured: false,
    } as SmsConfig);
    expect(status).toBe('NOT_CONFIGURED');
  });
});
