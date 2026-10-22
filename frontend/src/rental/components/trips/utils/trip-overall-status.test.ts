import { describe, expect, it } from 'vitest';
import { deriveTripOverallRating } from './trip-overall-status';
import type { TripTimelineTrip } from '../trips.types';

function trip(overrides: Partial<TripTimelineTrip> = {}): TripTimelineTrip {
  return {
    id: 'trip-1',
    tripStatus: 'COMPLETED',
    behaviorEnrichmentStatus: 'NOT_RUN',
    behaviorReady: false,
    detailsLimited: true,
    ...overrides,
  } as TripTimelineTrip;
}

describe('deriveTripOverallRating — assessability gate', () => {
  it('does not label a trip unauffällig when behavior data is not assessable', () => {
    expect(deriveTripOverallRating(trip(), [])).toBe('nicht_bewertbar');
  });
});
