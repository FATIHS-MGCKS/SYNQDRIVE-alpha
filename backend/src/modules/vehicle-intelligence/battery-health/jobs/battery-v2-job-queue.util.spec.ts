import { createHash } from 'crypto';
import { buildBatteryV2JobId, buildBatteryV2JobOptions } from './battery-v2-job-queue.util';
import { getBatteryV2JobRetryPolicy } from './battery-v2-job.retry-policy';

describe('battery-v2-job-queue.util', () => {
  it('builds stable BullMQ-safe job id (no colons) from idempotency key', () => {
    const key = 'battery-obs:org:vehicle:lowVoltageBatteryCurrentVoltage:DIMO:1234567890:12.4';
    const jobId = buildBatteryV2JobId(key);
    expect(jobId).toBe(buildBatteryV2JobId(key));
    expect(jobId).not.toContain(':');
    const hash = createHash('sha256').update(key).digest('hex').slice(0, 40);
    expect(jobId).toBe(`battery-v2-${hash}`);
  });

  it('hashes long idempotency keys deterministically', () => {
    const longKey = 'battery-obs:' + 'x'.repeat(200);
    const jobId = buildBatteryV2JobId(longKey);
    expect(jobId.length).toBeLessThanOrEqual(128);
    expect(jobId).toBe(buildBatteryV2JobId(longKey));
    expect(jobId).not.toContain(':');
    const hash = createHash('sha256').update(longKey).digest('hex').slice(0, 40);
    expect(jobId).toBe(`battery-v2-${hash}`);
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
