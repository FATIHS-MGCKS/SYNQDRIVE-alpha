import { describe, expect, it } from 'vitest';
import { resolveTripDisplayEndTime } from './trip-end-time-display.util';

describe('trip-end-time-display.util', () => {
  it('uses provisional observation for ONGOING without treating it as canonical', () => {
    const end = resolveTripDisplayEndTime({
      tripStatus: 'ONGOING',
      endTime: '2026-09-06T12:00:00.000Z',
      canonicalEndTime: null,
      provisionalLastObservedAt: '2026-09-06T12:00:00.000Z',
      endTimeSemantics: 'PROVISIONAL_WORKER_OBSERVATION',
    });
    expect(end).toBe('2026-09-06T12:00:00.000Z');
  });

  it('uses canonical end for COMPLETED trips', () => {
    const end = resolveTripDisplayEndTime({
      tripStatus: 'COMPLETED',
      endTime: '2026-09-06T12:30:00.000Z',
      canonicalEndTime: '2026-09-06T12:30:00.000Z',
      provisionalLastObservedAt: null,
      endTimeSemantics: 'CANONICAL_EVENT_BOUNDARY',
    });
    expect(end).toBe('2026-09-06T12:30:00.000Z');
  });
});
