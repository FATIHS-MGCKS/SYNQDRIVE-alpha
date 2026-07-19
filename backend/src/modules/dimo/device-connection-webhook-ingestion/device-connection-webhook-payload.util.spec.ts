import {
  extractDimoDeviceConnectionProviderEventId,
  hashDeviceConnectionWebhookPayload,
  redactDeviceConnectionWebhookPayload,
} from './device-connection-webhook-payload.util';
import { DimoDeviceConnectionEventType } from '@prisma/client';

describe('device-connection-webhook-payload.util', () => {
  it('hashes payload deterministically', () => {
    const a = hashDeviceConnectionWebhookPayload(Buffer.from('{"a":1}'));
    const b = hashDeviceConnectionWebhookPayload(Buffer.from('{"a":1}'));
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('redacts secret-like keys', () => {
    const redacted = redactDeviceConnectionWebhookPayload({
      signal: 'obdIsPluggedIn',
      api_key: 'secret-value',
      nested: { token: 'abc' },
    });
    expect(redacted.api_key).toBe('[REDACTED]');
    expect((redacted.nested as Record<string, unknown>).token).toBe('[REDACTED]');
    expect(redacted.signal).toBe('obdIsPluggedIn');
  });

  it('uses CloudEvent id as provider event id', () => {
    const id = extractDimoDeviceConnectionProviderEventId(
      { id: 'cloud-123', type: 'dimo.trigger', data: {} },
      {
        tokenId: 1,
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        observedAt: new Date('2026-01-01T00:00:00Z'),
        rawPayloadHash: 'abc',
      },
    );
    expect(id).toBe('cloud-123');
  });

  it('synthesizes stable provider event id when none present', () => {
    const body = { type: 'dimo.trigger', data: { signal: { name: 'obdIsPluggedIn' } } };
    const hash = hashDeviceConnectionWebhookPayload(Buffer.from(JSON.stringify(body)));
    const a = extractDimoDeviceConnectionProviderEventId(body, {
      tokenId: 42,
      eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      observedAt: new Date('2026-01-01T00:00:00Z'),
      rawPayloadHash: hash,
    });
    const b = extractDimoDeviceConnectionProviderEventId(body, {
      tokenId: 42,
      eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      observedAt: new Date('2026-01-01T00:00:00Z'),
      rawPayloadHash: hash,
    });
    expect(a).toBe(b);
    expect(a.startsWith('synthetic:')).toBe(true);
  });
});
