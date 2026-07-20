import {
  DeviceConnectionWebhookProcessingStatus,
  DimoDeviceConnectionEventType,
} from '@prisma/client';
import { DeviceConnectionWebhookInboxService } from './device-connection-webhook-inbox.service';
import { DeviceConnectionWebhookService } from './device-connection-webhook.service';
import { computeProviderEventId } from './device-connection-webhook-inbox.types';

const OBSERVED_AT = new Date('2026-06-28T12:00:00.000Z');

function mockPrismaInbox() {
  const rows = new Map<string, Record<string, unknown>>();
  let idCounter = 0;

  const findUnique = jest.fn(async ({ where }: { where: { provider_providerEventId?: { provider: string; providerEventId: string } } }) => {
    const key = `${where.provider_providerEventId!.provider}:${where.provider_providerEventId!.providerEventId}`;
    for (const row of rows.values()) {
      if (`${row.provider}:${row.providerEventId}` === key) return row;
    }
    return null;
  });

  const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const id = `inbox-${++idCounter}`;
    const row = { id, domainEventId: null, policyIgnoreReason: null, lastErrorCode: null, ...data };
    rows.set(id, row);
    return row;
  });

  return { rows, findUnique, create };
}

describe('DeviceConnectionWebhookInboxService — async intake', () => {
  it('persists RECEIVED and enqueues new events', async () => {
    const prisma = mockPrismaInbox();
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = new DeviceConnectionWebhookInboxService(
      { deviceConnectionWebhookInbox: { findUnique: prisma.findUnique, create: prisma.create } } as never,
      queue as never,
    );

    const result = await service.intakeDeviceConnectionWebhook({
      tokenId: 1001,
      pluggedIn: false,
      observedAt: OBSERVED_AT,
      rawPayload: { value: false },
    });

    expect(result.outcome).toBe('queued');
    expect(result.processingStatus).toBe(DeviceConnectionWebhookProcessingStatus.RECEIVED);
    expect(queue.enqueue).toHaveBeenCalledWith('inbox-1');
  });

  it('re-enqueues non-terminal duplicate deliveries', async () => {
    const providerEventId = computeProviderEventId({
      provider: 'DIMO',
      tokenId: 1001,
      eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      observedAt: OBSERVED_AT,
    });
    const existingRow = {
      id: 'inbox-1',
      providerEventId,
      provider: 'DIMO',
      eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      processingStatus: DeviceConnectionWebhookProcessingStatus.RETRYABLE_FAILED,
      tokenId: 1001,
      payloadHash: 'hash',
      rawPayloadJson: {},
    };

    const findUnique = jest.fn().mockResolvedValue(existingRow);
    const create = jest.fn();
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = new DeviceConnectionWebhookInboxService(
      { deviceConnectionWebhookInbox: { findUnique, create } } as never,
      queue as never,
    );

    const result = await service.intakeDeviceConnectionWebhook({
      tokenId: 1001,
      pluggedIn: false,
      observedAt: OBSERVED_AT,
      rawPayload: { value: false },
    });

    expect(result.outcome).toBe('queued');
    expect(create).not.toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledWith('inbox-1');
  });

  it('returns terminal state without re-enqueue for PROCESSED rows', async () => {
    const prisma = mockPrismaInbox();
    const providerEventId = computeProviderEventId({
      provider: 'DIMO',
      tokenId: 1001,
      eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
      observedAt: OBSERVED_AT,
    });
    await prisma.create({
      data: {
        providerEventId,
        provider: 'DIMO',
        eventType: DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED,
        processingStatus: DeviceConnectionWebhookProcessingStatus.PROCESSED,
        domainEventId: 'evt-1',
        tokenId: 1001,
        payloadHash: 'hash',
        rawPayloadJson: {},
      },
    });

    const queue = { enqueue: jest.fn() };
    const service = new DeviceConnectionWebhookInboxService(
      { deviceConnectionWebhookInbox: { findUnique: prisma.findUnique, create: prisma.create } } as never,
      queue as never,
    );

    const result = await service.intakeDeviceConnectionWebhook({
      tokenId: 1001,
      pluggedIn: false,
      observedAt: OBSERVED_AT,
      rawPayload: {},
    });

    expect(result.outcome).toBe('already_processed');
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
