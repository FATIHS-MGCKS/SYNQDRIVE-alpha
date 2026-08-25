import deviceConnectionWebhookInboxConfig from '@config/device-connection-webhook-inbox.config';
import { DeviceConnectionWebhookInboxSchedulerService } from './device-connection-webhook-inbox-scheduler.service';

const config = deviceConnectionWebhookInboxConfig();

describe('DeviceConnectionWebhookInboxSchedulerService', () => {
  it('reconciles unprocessed canonical events during poll tick', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'evt-1' }, { id: 'evt-2' }]);
    const reconcile = jest
      .fn()
      .mockResolvedValueOnce({ outcome: 'reconciled', eventId: 'evt-1' })
      .mockResolvedValueOnce({ outcome: 'reconciled', eventId: 'evt-2' });

    const service = new DeviceConnectionWebhookInboxSchedulerService(
      config as never,
      {
        findStaleInFlightBatch: jest.fn().mockResolvedValue([]),
        findRetryableBatch: jest.fn().mockResolvedValue([]),
      } as never,
      { enqueue: jest.fn() } as never,
      { dimoDeviceConnectionEvent: { findMany } } as never,
      { reconcilePersistedEventLifecycle: reconcile } as never,
    );

    await service.pollRetryableInbox();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { processedAt: null }, take: config.pollBatchSize }),
    );
    expect(reconcile).toHaveBeenCalledTimes(2);
  });
});
