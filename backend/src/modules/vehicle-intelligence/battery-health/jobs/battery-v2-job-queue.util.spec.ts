import { buildBatteryV2JobId, buildBatteryV2JobOptions } from './battery-v2-job-queue.util';
import { getBatteryV2JobRetryPolicy } from './battery-v2-job.retry-policy';

describe('battery-v2-job-queue.util', () => {
  it('builds stable job id from idempotency key', () => {
    expect(buildBatteryV2JobId('obs:vehicle:123')).toBe('battery-v2:obs:vehicle:123');
  });

  it('maps retry policy into BullMQ options per job type', () => {
    const policy = getBatteryV2JobRetryPolicy('HV_CAPABILITY_REFRESH');
    const options = buildBatteryV2JobOptions('HV_CAPABILITY_REFRESH');
    expect(options.attempts).toBe(policy.attempts);
    expect(options.backoff).toEqual({
      type: policy.backoffType,
      delay: policy.backoffDelayMs,
    });
  });
});
