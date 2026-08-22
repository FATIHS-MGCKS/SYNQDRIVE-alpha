import { describe, expect, it } from 'vitest';
import { mapSmsConfigPublic } from './communication-settings-sms-mapper';

describe('mapSmsConfigPublic', () => {
  it('maps allowlisted fields and strips secret-shaped properties', () => {
    const mapped = mapSmsConfigPublic({
      organizationId: 'org-1',
      hasConfigRow: true,
      isConnected: true,
      isActive: true,
      credentialsConfigured: true,
      webhookSigningConfigured: true,
      senderProfileConfigured: true,
      webhookEndpointConfigured: true,
      lastWebhookAt: null,
      updatedAt: '2026-08-22T10:00:00.000Z',
      apiKey: 'SECRET_API_KEY',
      webhookSigningSecret: 'SECRET_WEBHOOK',
      accessToken: 'SECRET_ACCESS',
    });

    expect(mapped).toEqual({
      organizationId: 'org-1',
      hasConfigRow: true,
      isConnected: true,
      isActive: true,
      credentialsConfigured: true,
      webhookSigningConfigured: true,
      senderProfileConfigured: true,
      webhookEndpointConfigured: true,
      lastWebhookAt: null,
      updatedAt: '2026-08-22T10:00:00.000Z',
    });
    expect(mapped).not.toHaveProperty('apiKey');
    expect(mapped).not.toHaveProperty('webhookSigningSecret');
    expect(mapped).not.toHaveProperty('accessToken');
  });

  it('returns synthetic-safe defaults for missing row payloads', () => {
    expect(mapSmsConfigPublic({ organizationId: 'org-2' })).toEqual({
      organizationId: 'org-2',
      hasConfigRow: false,
      isConnected: false,
      isActive: false,
      credentialsConfigured: false,
      webhookSigningConfigured: false,
      senderProfileConfigured: false,
      webhookEndpointConfigured: false,
      lastWebhookAt: null,
      updatedAt: null,
    });
  });
});
