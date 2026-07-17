import 'reflect-metadata';
import { BrakeRecalculationProcessor } from '@workers/processors/brake-recalculation.processor';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

describe('BrakeRecalculationProcessor', () => {
  it('is registered on the async brake recalculation queue', () => {
    const metadata = Reflect.getMetadata('bullmq:processor_metadata', BrakeRecalculationProcessor);
    expect(metadata?.name ?? metadata?.queueName).toBe(QUEUE_NAMES.BRAKE_RECALCULATION);
  });

  it('uses bounded concurrency and extended lock duration', () => {
    const workerOpts = Reflect.getMetadata('bullmq:worker_metadata', BrakeRecalculationProcessor);
    expect(workerOpts?.concurrency).toBe(2);
    expect(workerOpts?.lockDuration).toBe(120_000);
  });
});
