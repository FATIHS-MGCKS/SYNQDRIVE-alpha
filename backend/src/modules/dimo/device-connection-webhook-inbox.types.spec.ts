import { DimoDeviceConnectionEventType } from '@prisma/client';
import {
  computeProviderEventId,
  computeWebhookPayloadHash,
  isTerminalInboxStatus,
} from './device-connection-webhook-inbox.types';
import { DeviceConnectionWebhookProcessingStatus } from '@prisma/client';

describe('device-connection-webhook-inbox.types', () => {
  it('computes stable payload hash', () => {
    const hashA = computeWebhookPayloadHash({ signal: 'obdIsPluggedIn', value: false });
    const hashB = computeWebhookPayloadHash({ signal: 'obdIsPluggedIn', value: false });
    const hashC = computeWebhookPayloadHash({ signal: 'obdIsPluggedIn', value: true });
    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(hashC);
    expect(hashA).toHaveLength(64);
  });

  it('computes provider event id from dedup bucket', () => {
    const observedAt = new Date('2026-06-28T12:00:00.000Z');
    const id = computeProviderEventId({
      provider: 'DIMO',
      tokenId: 777,
      eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      observedAt,
    });
    expect(id).toContain('DIMO:token:777');
    expect(id).toContain('OBD_DEVICE_UNPLUGGED');
  });

  it('identifies terminal inbox statuses', () => {
    expect(isTerminalInboxStatus(DeviceConnectionWebhookProcessingStatus.PROCESSED)).toBe(true);
    expect(isTerminalInboxStatus(DeviceConnectionWebhookProcessingStatus.IGNORED_BY_POLICY)).toBe(
      true,
    );
    expect(isTerminalInboxStatus(DeviceConnectionWebhookProcessingStatus.RETRYABLE_FAILED)).toBe(
      false,
    );
  });
});
