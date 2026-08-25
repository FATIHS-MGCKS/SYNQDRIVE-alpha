import { CONNECTIVITY_LIFECYCLE_RUNTIME_RECONCILE_AFTER_ISO } from '@config/device-connection-webhook-inbox.config';
import deviceConnectionWebhookInboxConfig from '@config/device-connection-webhook-inbox.config';
import { DeviceConnectionWebhookInboxSchedulerService } from './device-connection-webhook-inbox-scheduler.service';

const CUTOVER = new Date(CONNECTIVITY_LIFECYCLE_RUNTIME_RECONCILE_AFTER_ISO);
const config = {
  ...deviceConnectionWebhookInboxConfig(),
  lifecycleReconcileAfter: CUTOVER,
};

const JULY20 = new Date('2026-07-20T11:05:03.768Z');
const JULY28_INBOX = new Date('2026-07-28T07:56:52.211Z');
const POST_CUTOVER = new Date('2026-08-26T10:00:00.000Z');

function buildService(deps: {
  findStaleInFlightBatch?: jest.Mock;
  findRetryableBatch?: jest.Mock;
  enqueueOrMarkRetryableFailed?: jest.Mock;
  findManyEvents?: jest.Mock;
  countEvents?: jest.Mock;
  countInbox?: jest.Mock;
  reconcile?: jest.Mock;
}) {
  return new DeviceConnectionWebhookInboxSchedulerService(
    config as never,
    {
      findStaleInFlightBatch:
        deps.findStaleInFlightBatch ?? jest.fn().mockResolvedValue([]),
      findRetryableBatch: deps.findRetryableBatch ?? jest.fn().mockResolvedValue([]),
    } as never,
    {
      enqueueOrMarkRetryableFailed:
        deps.enqueueOrMarkRetryableFailed ?? jest.fn().mockResolvedValue('queued'),
    } as never,
    {
      dimoDeviceConnectionEvent: {
        findMany: deps.findManyEvents ?? jest.fn().mockResolvedValue([]),
        count: deps.countEvents ?? jest.fn().mockResolvedValue(0),
      },
      deviceConnectionWebhookInbox: {
        count: deps.countInbox ?? jest.fn().mockResolvedValue(0),
      },
    } as never,
    {
      reconcilePersistedEventLifecycle:
        deps.reconcile ?? jest.fn().mockResolvedValue({ outcome: 'reconciled' }),
    } as never,
  );
}

describe('DeviceConnectionWebhookInboxSchedulerService — runtime cutover', () => {
  it('N1: does not reconcile pre-cutover canonical events', async () => {
    const reconcile = jest.fn();
    const findManyEvents = jest.fn().mockResolvedValue([]);

    const service = buildService({ reconcile, findManyEvents });
    await service.pollRetryableInbox();

    expect(findManyEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          processedAt: null,
          receivedAt: { gte: CUTOVER },
        },
      }),
    );
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('N2: reconciles post-cutover canonical events', async () => {
    const reconcile = jest.fn().mockResolvedValue({ outcome: 'reconciled' });
    const findManyEvents = jest
      .fn()
      .mockResolvedValue([{ id: 'evt-new', receivedAt: POST_CUTOVER }]);

    const service = buildService({ reconcile, findManyEvents });
    await service.pollRetryableInbox();

    expect(reconcile).toHaveBeenCalledWith('evt-new');
  });

  it('N3: does not auto-enqueue pre-cutover stale inbox rows', async () => {
    const findStaleInFlightBatch = jest.fn().mockResolvedValue([]);
    const enqueue = jest.fn();

    const service = buildService({ findStaleInFlightBatch, enqueueOrMarkRetryableFailed: enqueue });
    await service.pollRetryableInbox();

    expect(findStaleInFlightBatch).toHaveBeenCalledWith(
      expect.any(Date),
      config.pollBatchSize,
      CUTOVER,
    );
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('N4: enqueues post-cutover stale inbox rows', async () => {
    const findStaleInFlightBatch = jest
      .fn()
      .mockResolvedValue([{ id: 'inbox-new' }]);
    const enqueue = jest.fn().mockResolvedValue('queued');

    const service = buildService({ findStaleInFlightBatch, enqueueOrMarkRetryableFailed: enqueue });
    await service.pollRetryableInbox();

    expect(enqueue).toHaveBeenCalledWith('inbox-new', 'scheduler', false);
  });

  it('N5: scheduler enqueue failure marks RETRYABLE_FAILED via enqueue service', async () => {
    const markRetryableFailed = jest.fn();
    const enqueue = jest.fn().mockResolvedValue('failed');
    const findStaleInFlightBatch = jest.fn().mockResolvedValue([{ id: 'inbox-fail' }]);

    const service = new DeviceConnectionWebhookInboxSchedulerService(
      config as never,
      {
        findStaleInFlightBatch,
        findRetryableBatch: jest.fn().mockResolvedValue([]),
        markRetryableFailed,
      } as never,
      { enqueueOrMarkRetryableFailed: enqueue } as never,
      {
        dimoDeviceConnectionEvent: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
        deviceConnectionWebhookInbox: { count: jest.fn().mockResolvedValue(0) },
      } as never,
      { reconcilePersistedEventLifecycle: jest.fn() } as never,
    );

    await service.pollRetryableInbox();
    expect(enqueue).toHaveBeenCalledWith('inbox-fail', 'scheduler', false);
  });

  it('N6: batch isolation — middle enqueue failure does not block siblings', async () => {
    const enqueue = jest
      .fn()
      .mockResolvedValueOnce('queued')
      .mockResolvedValueOnce('failed')
      .mockResolvedValueOnce('queued');

    const service = buildService({ enqueueOrMarkRetryableFailed: enqueue });
    await service.scheduleInboxIds(['inbox-1', 'inbox-2', 'inbox-3']);

    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(enqueue).toHaveBeenNthCalledWith(1, 'inbox-1', 'scheduler', false);
    expect(enqueue).toHaveBeenNthCalledWith(2, 'inbox-2', 'scheduler', false);
    expect(enqueue).toHaveBeenNthCalledWith(3, 'inbox-3', 'scheduler', false);
  });

  it('N7: July historical orphan fixture — no episode reconciliation', async () => {
    const reconcile = jest.fn();
    const countEvents = jest.fn().mockResolvedValue(3);
    const countInbox = jest.fn().mockResolvedValue(2);
    const findManyEvents = jest.fn().mockResolvedValue([]);

    const service = buildService({ reconcile, countEvents, countInbox, findManyEvents });
    await service.pollRetryableInbox();

    expect(findManyEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          receivedAt: { gte: CUTOVER },
        }),
      }),
    );
    expect(reconcile).not.toHaveBeenCalled();
    expect(countEvents).toHaveBeenCalledWith({
      where: { processedAt: null, receivedAt: { lt: CUTOVER } },
    });
    expect(countInbox).toHaveBeenCalled();
    expect(JULY20.getTime()).toBeLessThan(CUTOVER.getTime());
    expect(JULY28_INBOX.getTime()).toBeLessThan(CUTOVER.getTime());
  });
});
