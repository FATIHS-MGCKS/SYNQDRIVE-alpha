import 'reflect-metadata';
import { TireRecalculationProcessor } from '@workers/processors/tire-recalculation.processor';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

describe('TireRecalculationProcessor', () => {
  it('is registered on the async tire recalculation queue', () => {
    const metadata = Reflect.getMetadata('bullmq:processor_metadata', TireRecalculationProcessor);
    expect(metadata?.name ?? metadata?.queueName).toBe(QUEUE_NAMES.TIRE_RECALCULATION);
  });

  it('uses bounded concurrency and extended lock duration', () => {
    const workerOpts = Reflect.getMetadata('bullmq:worker_metadata', TireRecalculationProcessor);
    expect(workerOpts?.concurrency).toBe(2);
    expect(workerOpts?.lockDuration).toBe(120_000);
  });
});
