import {
  TRIP_TRACKING_TRIGGERS,
} from './trip-detection.types';
import { buildTripTrackingJobOptions } from './trip-tracking-queue.util';
import { POSSIBLE_START_TRIP_TRACKING_RETRY_POLICY } from './trip-tracking-retry.policy';

describe('trip-tracking-queue.util', () => {
  it('applies bounded fast retry only to POSSIBLE_START', () => {
    const ps = buildTripTrackingJobOptions(TRIP_TRACKING_TRIGGERS.POSSIBLE_START);
    expect(ps.attempts).toBe(POSSIBLE_START_TRIP_TRACKING_RETRY_POLICY.attempts);
    expect(ps.backoff).toEqual({
      type: 'exponential',
      delay: 5_000,
    });
    expect(ps.removeOnComplete).toBe(true);
    expect(ps.removeOnFail).toBe(5);
  });

  it('leaves non-POSSIBLE_START phases without BullMQ retry config', () => {
    for (const trigger of [
      TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
      TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK,
      TRIP_TRACKING_TRIGGERS.END_VALIDATION,
      TRIP_TRACKING_TRIGGERS.FINALIZE,
    ]) {
      const opts = buildTripTrackingJobOptions(trigger);
      expect(opts.attempts).toBeUndefined();
      expect(opts.backoff).toBeUndefined();
    }
  });
});
