import { createHash } from 'crypto';
import {
  buildBatteryV2JobId,
  buildBatteryV2JobOptions,
  assertBatteryV2BullMqJobId,
  isBatteryV2BullMqJobId,
  isDeterministicBatteryV2JobId,
} from './battery-v2-job-queue.util';
import { getBatteryV2JobRetryPolicy } from './battery-v2-job.retry-policy';
import { isBullMqCompatibleJobId } from '@shared/queue/bullmq-job-id.sanitizer';

describe('battery-v2-job-queue.util', () => {
  it('builds stable colon-safe job id from idempotency key', () => {
    const jobId = buildBatteryV2JobId('obs:vehicle:123');
    expect(jobId).toBe('battery-v2_obs_3avehicle_3a123');
    expect(jobId).not.toContain(':');
    expect(isBullMqCompatibleJobId(jobId)).toBe(true);
    expect(isBatteryV2BullMqJobId(jobId)).toBe(true);
    expect(isDeterministicBatteryV2JobId('obs:vehicle:123', jobId)).toBe(true);
  });

  it('hashes long idempotency keys deterministically', () => {
    const longKey = 'battery-obs:' + 'x'.repeat(200);
    const jobId = buildBatteryV2JobId(longKey);
    expect(jobId.length).toBeLessThanOrEqual(128);
    expect(jobId).toBe(buildBatteryV2JobId(longKey));
    const hash = createHash('sha256')
      .update(`battery-v2\x1f${longKey}`, 'utf8')
      .digest('hex')
      .slice(0, 40);
    expect(jobId).toBe(`battery-v2_${hash}`);
  });

  it('rejects legacy colon-bearing ids at the BullMQ boundary', () => {
    expect(() => assertBatteryV2BullMqJobId('battery-v2:broken:key')).toThrow(
      /buildBatteryV2JobId/,
    );
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
