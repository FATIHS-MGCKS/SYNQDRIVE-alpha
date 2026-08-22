import { describe, expect, it } from 'vitest';
import {
  resolveSmsSettingsStatus,
  resolveVoiceSettingsStatus,
  resolveWhatsAppSettingsStatus,
} from './communication-settings-status';
import type { SmsConfig, VoiceAssistantData, WhatsAppConfig } from '../../../lib/api';

const baseSms = (overrides: Partial<SmsConfig> = {}): SmsConfig => ({
  organizationId: 'org-1',
  hasConfigRow: true,
  isConnected: false,
  isActive: false,
  credentialsConfigured: false,
  webhookSigningConfigured: false,
  senderProfileConfigured: false,
  webhookEndpointConfigured: false,
  lastWebhookAt: null,
  updatedAt: '2026-08-22T10:00:00.000Z',
  ...overrides,
});

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

  it('resolves SMS not configured when no config row exists', () => {
    expect(resolveSmsSettingsStatus(baseSms({ hasConfigRow: false }))).toBe('NOT_CONFIGURED');
    expect(resolveSmsSettingsStatus(null)).toBe('NOT_CONFIGURED');
  });

  it('resolves SMS not configured when row exists but credentials missing', () => {
    expect(
      resolveSmsSettingsStatus(
        baseSms({ hasConfigRow: true, credentialsConfigured: false }),
      ),
    ).toBe('NOT_CONFIGURED');
  });

  it('resolves SMS configured for partial runtime setup', () => {
    expect(
      resolveSmsSettingsStatus(
        baseSms({
          credentialsConfigured: true,
          webhookSigningConfigured: true,
        }),
      ),
    ).toBe('CONFIGURED');
  });

  it('resolves SMS connected when runtime readiness and active flags match', () => {
    expect(
      resolveSmsSettingsStatus(
        baseSms({
          credentialsConfigured: true,
          webhookSigningConfigured: true,
          webhookEndpointConfigured: true,
          senderProfileConfigured: true,
          isConnected: true,
          isActive: true,
        }),
      ),
    ).toBe('CONNECTED');
  });

  it('resolves SMS degraded when connected but runtime incomplete', () => {
    expect(
      resolveSmsSettingsStatus(
        baseSms({
          credentialsConfigured: true,
          isConnected: true,
          isActive: true,
        }),
      ),
    ).toBe('DEGRADED');
  });
});
