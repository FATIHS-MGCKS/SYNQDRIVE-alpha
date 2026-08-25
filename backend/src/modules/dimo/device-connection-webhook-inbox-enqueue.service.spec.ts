import deviceConnectionWebhookInboxConfig from '@config/device-connection-webhook-inbox.config';
import { DeviceConnectionWebhookInboxEnqueueService } from './device-connection-webhook-inbox-enqueue.service';

const config = deviceConnectionWebhookInboxConfig();

describe('DeviceConnectionWebhookInboxEnqueueService', () => {
  it('marks RETRYABLE_FAILED when enqueue throws', async () => {
    const markRetryableFailed = jest.fn().mockResolvedValue({});
    const queue = { enqueue: jest.fn().mockRejectedValue(new Error('redis down')) };

    const service = new DeviceConnectionWebhookInboxEnqueueService(
      config as never,
      { markRetryableFailed } as never,
      queue as never,
    );

    const outcome = await service.enqueueOrMarkRetryableFailed('inbox-1', 'scheduler');
    expect(outcome).toBe('failed');
    expect(markRetryableFailed).toHaveBeenCalledWith(
      'inbox-1',
      expect.objectContaining({
        errorCode: 'enqueue_failed',
        errorMessage: 'redis down',
        nextRetryAt: expect.any(Date),
      }),
    );
  });

  it('returns queued on success', async () => {
    const queue = { enqueue: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    const service = new DeviceConnectionWebhookInboxEnqueueService(
      config as never,
      { markRetryableFailed: jest.fn() } as never,
      queue as never,
    );

    expect(await service.enqueueOrMarkRetryableFailed('inbox-2', 'intake')).toBe('queued');
  });
});
