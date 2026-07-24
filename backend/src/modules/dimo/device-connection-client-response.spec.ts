import { sanitizeDeviceConnectionForClient } from './device-connection-client-response';
import { mockWebhookConfiguration } from './device-connection-webhook-configuration/device-connection-webhook-configuration.test-helpers';

describe('sanitizeDeviceConnectionForClient', () => {
  const baseSummary = {
    lteR1Capable: true,
    dimoLinked: true,
    lastDeviceUnpluggedAt: null,
    lastDevicePluggedInAt: '2026-07-20T10:00:00.000Z',
    currentDeviceConnectionStatus: 'plugged' as const,
    openUnpluggedEpisode: false,
    openUnpluggedSince: null,
    openUnpluggedDurationMs: null,
    severity: 'info' as const,
    rentalRelevant: false,
    activeBookingId: null,
    webhookConfigured: 'active' as const,
    webhookConfiguration: mockWebhookConfiguration({
      unplugTriggerState: {
        state: 'CONFIGURED',
        reasonCode: null,
        triggerId: 'trigger-secret-id',
        eventType: 'OBD_DEVICE_UNPLUGGED',
        active: true,
        callbackUrl: 'https://app.synqdrive.eu/webhooks/dimo?secret=abc',
        failureCount: 0,
      },
    }),
    lastWebhookReceivedAt: '2026-07-20T10:00:00.000Z',
    unpluggedCount24h: 0,
    unpluggedCount7d: 0,
    pluggedCount24h: 1,
    pluggedCount7d: 1,
    recentEvents: [],
    rawEvents: [{ provider: 'secret-payload' }],
  };

  it('removes raw provider payloads', () => {
    const result = sanitizeDeviceConnectionForClient(baseSummary);
    expect((result as { rawEvents?: unknown }).rawEvents).toBeUndefined();
  });

  it('redacts callback URLs and trigger ids from webhook configuration', () => {
    const result = sanitizeDeviceConnectionForClient(baseSummary);
    expect(result.webhookConfiguration.unplugTriggerState).not.toHaveProperty('callbackUrl');
    expect(result.webhookConfiguration.unplugTriggerState).not.toHaveProperty('triggerId');
    expect(result.webhookConfiguration.unplugTriggerState.callbackConfigured).toBe(true);
  });

  it('preserves operational fields needed by the vehicle detail card', () => {
    const result = sanitizeDeviceConnectionForClient(baseSummary);
    expect(result.lteR1Capable).toBe(true);
    expect(result.currentDeviceConnectionStatus).toBe('plugged');
    expect(result.webhookConfiguration.recoveryPolicy).toBeDefined();
  });
});
