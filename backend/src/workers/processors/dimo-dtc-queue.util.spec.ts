import {
  buildDtcPollVehicleJobId,
} from './dimo-dtc-queue.util';
import { isBullMqCompatibleJobId } from '@shared/queue/bullmq-job-id.sanitizer';

describe('dimo-dtc-queue.util', () => {
  const vehicleId = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';
  const pollBucket = 482_901;

  it('buildDtcPollVehicleJobId is colon-free and BullMQ-compatible', () => {
    const jobId = buildDtcPollVehicleJobId(vehicleId, pollBucket);
    expect(jobId).not.toContain(':');
    expect(isBullMqCompatibleJobId(jobId)).toBe(true);
  });

  it('is deterministic for the same vehicle and bucket', () => {
    expect(buildDtcPollVehicleJobId(vehicleId, pollBucket)).toBe(
      buildDtcPollVehicleJobId(vehicleId, pollBucket),
    );
  });

  it('differs across vehicles and buckets', () => {
    const a = buildDtcPollVehicleJobId(vehicleId, pollBucket);
    const b = buildDtcPollVehicleJobId(vehicleId, pollBucket + 1);
    const c = buildDtcPollVehicleJobId('other-vehicle-id', pollBucket);
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
