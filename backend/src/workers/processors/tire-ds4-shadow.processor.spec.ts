import 'reflect-metadata';
import { TireDs4ShadowProcessor } from './tire-ds4-shadow.processor';
import { QUEUE_NAMES } from '../queues/queue-names';

describe('TireDs4ShadowProcessor', () => {
  it('is registered on the tire DS4 shadow queue', () => {
    const metadata = Reflect.getMetadata('bullmq:processor_metadata', TireDs4ShadowProcessor);
    expect(metadata?.name ?? metadata?.queueName).toBe(QUEUE_NAMES.TIRE_DS4_SHADOW);
  });
});
