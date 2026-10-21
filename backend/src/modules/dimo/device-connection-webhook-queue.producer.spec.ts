import { QUEUE_NAMES } from '@workers/queues/queue-names';
import {
  DEVICE_CONNECTION_WEBHOOK_JOB_NAME,
  DeviceConnectionWebhookQueueProducer,
} from './device-connection-webhook-queue.producer';

describe('DeviceConnectionWebhookQueueProducer contract', () => {
  it('uses the shared connectivity webhook queue name', () => {
    expect(QUEUE_NAMES.CONNECTIVITY_WEBHOOK_PROCESS).toBe('connectivity.webhook.process');
  });

  it('builds stable job ids for inbox processing', () => {
    const producer = new DeviceConnectionWebhookQueueProducer({} as never);
    expect(producer.buildJobId('inbox-abc')).toBe('connectivity-webhook__inbox-abc');
    expect(producer.buildJobId('inbox-abc', true)).toMatch(
      /^connectivity-webhook-replay__inbox-abc__\d+$/,
    );
  });

  it('builds BullMQ-safe job ids without colon characters', () => {
    const producer = new DeviceConnectionWebhookQueueProducer({} as never);
    expect(producer.buildJobId('inbox-abc')).not.toContain(':');
    expect(producer.buildJobId('inbox-abc', true)).not.toContain(':');
  });

  it('enqueues process jobs with canonical job name', async () => {
    const add = jest.fn().mockResolvedValue({ id: 'job-1' });
    const getJob = jest.fn().mockResolvedValue(null);
    const queue = { add, getJob };
    const producer = new DeviceConnectionWebhookQueueProducer(queue as never);

    await producer.enqueue('inbox-1');

    expect(add).toHaveBeenCalledWith(
      DEVICE_CONNECTION_WEBHOOK_JOB_NAME,
      { inboxId: 'inbox-1', replay: false },
      expect.objectContaining({ jobId: 'connectivity-webhook__inbox-1' }),
    );
  });
});
